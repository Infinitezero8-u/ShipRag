/**
 * LangGraph 工作流节点 — 经三轮实测优化的最终版
 *
 * 核心管线: classify → queryRewrite → embedding → hybridRetrieval → rerank → llmGenerate → finalOutput
 * SQL管线:  sqlGenerate → sqlExecute → sqlPolish → finalOutput
 */

import { RAGState } from './state';
import { ChatOllama } from '@langchain/ollama';
import { OllamaEmbeddings } from '@langchain/ollama';
import { getSupabaseClient } from '@/storage/database/local-db';
import { OllamaConfig } from '@/lib/ollama/config';

// Skills (v4 new)
import { shouldUseSpatial, findNearbyPorts } from './skills/spatial';
import { expandQuery, shouldUseSemanticExpansion } from './skills/semantic-expansion';
import { extractEntities } from './skills/entity-extraction';

const ollama = new OllamaConfig();

// ═══════════════════════════════════════════════════════════
// 1. 用户输入
// ═══════════════════════════════════════════════════════════
export async function userInputNode(state: RAGState): Promise<Partial<RAGState>> {
  const q = state.query?.trim();
  if (!q) return { errors: ['用户输入为空'] };
  return { query: q };
}

// ═══════════════════════════════════════════════════════════
// 2. 意图分类 — 关键词优先, LLM兜底 (三轮实测优化)
// ═══════════════════════════════════════════════════════════
export async function classifyNode(state: RAGState): Promise<Partial<RAGState>> {
  const t0 = Date.now(); const q = state.query;
  const lo = q.toLowerCase();

  // CHAT — 纯闲聊(不命中semantic expansion的才进CHAT)
  if (/^(你好|谢谢|再见|帮助|help|早上好|下午好|晚上好|hello|hi|thanks|bye|你是谁)/i.test(q.trim())
      && !shouldUseSemanticExpansion(q))
    return { classifyResult: 'CHAT', classifyRaw: 'KEYWORD_CHAT', nodeTimings: { classify: Date.now() - t0 } };

  // LIST — 明确要遍历数据库列出条目
  const portListPat = /列出.*(所有|全部).*(港口|港)/;
  const countryListPat = /(日本|中国|美国|韩国|英国|法国|德国|新加坡)的.*(港口|港)/;
  // Skill: 空间查询 (距离XX最近的N个 → LIST)
  const spatialCheck = shouldUseSpatial(q);
  if (portListPat.test(q) || countryListPat.test(q))
    return { classifyResult: 'LIST', classifyRaw: 'KEYWORD_LIST', nodeTimings: { classify: Date.now() - t0 } };
  if (spatialCheck.use)
    return { classifyResult: 'LIST', classifyRaw: 'KEYWORD_SPATIAL', nodeTimings: { classify: Date.now() - t0 } };

  // SQL — 统计/计数/最值
  const countPat = /一共|总共|总计|合计|统计|多少个|有几个|数量|计数/;
  const extremePat = /最大|最小|最多|最少|第一|TOP/;
  if ((countPat.test(q) || extremePat.test(q)) && (q.includes('港口') || q.includes('港') || q.includes('表') || q.includes('记录')))
    return { classifyResult: 'SQL', classifyRaw: 'KEYWORD_SQL', nodeTimings: { classify: Date.now() - t0 } };

  // LIST for enumeration queries with port/country
  if (countPat.test(q) && /港口|港/.test(q))
    return { classifyResult: 'SQL', classifyRaw: 'KEYWORD_SQL', nodeTimings: { classify: Date.now() - t0 } };

  // Skill: 语义扩展检测 — 口语匹配→强制RAG (绕过CHAT误分类)
  if (shouldUseSemanticExpansion(q)) {
    return { classifyResult: 'RAG', classifyRaw: 'KEYWORD_SEMANTIC', nodeTimings: { classify: Date.now() - t0 } };
  }

  // LLM 兜底
  try {
    const llm = new ChatOllama({ model: ollama.fallbackModel, temperature: 0 });
    const resp = await llm.invoke(
      `分析意图,仅输出标签:
RAG  — 查文档/法规/条例的具体内容(如"XX条例第X条")
SQL  — 统计/计数/汇总(如"一共多少个港口")
LIST — 列出/枚举所有条目(如"列出日本所有港口")
CHAT — 闲聊/问候/帮助

注意: "列出XX的所有港口"→LIST, "XX有多少个港口"→SQL, "XX条例规定"→RAG

用户: ${q}
标签:`);
    const raw = (resp.content as string).trim().toUpperCase();
    let route = 'RAG';
    if (raw.includes('CHAT')) route = 'CHAT';
    else if (raw.includes('LIST')) route = 'LIST';
    else if (raw.includes('ALL')) route = 'ALL';
    else if (raw.includes('SQL')) route = 'SQL';
    return { classifyResult: route, classifyRaw: raw, nodeTimings: { classify: Date.now() - t0 } };
  } catch {
    return { classifyResult: 'RAG', classifyRaw: 'FALLBACK', nodeTimings: { classify: Date.now() - t0 } };
  }
}

export function routeAfterClassify(state: RAGState): string {
  const r = state.classifyResult;
  if (r === 'CHAT') return 'llmGenerate';
  if (r === 'SQL' || r === 'LIST') return 'sqlGenerate';
  if (r === 'ALL') return 'allBranches';
  return 'queryRewrite';
}

// ═══════════════════════════════════════════════════════════
// 3. Query改写 — 含记忆压缩
// ═══════════════════════════════════════════════════════════
export async function queryRewriteNode(state: RAGState): Promise<Partial<RAGState>> {
  const t0 = Date.now(); const { query, history } = state;

  // 记忆压缩: 超过6轮自动摘要
  let compressedHistory = history;
  if (history && history.length > 6) {
    try {
      const llm = new ChatOllama({ model: ollama.fallbackModel, temperature: 0 });
      const h = history.map(m => `${m.role}: ${m.content}`).join('\n');
      const r = await llm.invoke(`将对话压缩为200字摘要:\n${h}\n摘要:`, { timeout: 15000 } as any);
      compressedHistory = [
        { role: 'system', content: `[摘要] ${(r.content as string).trim()}` },
        ...history.slice(-2),
      ];
    } catch { compressedHistory = history.slice(-4); }
  }

  // Skill: 语义扩展 — 口语→法律术语
  const semExp = shouldUseSemanticExpansion(query) ? expandQuery(query) : null;
  const baseQuery = semExp ? semExp.expanded : query;

  // 无历史 + 非复杂 → 不需要改写,但语义扩展已应用
  if (!history?.length) return { optimizedQuery: baseQuery, history: compressedHistory as any, nodeTimings: { queryRewrite: 0 } };

  // 有历史 → 代词替换
  try {
    const llm2 = new ChatOllama({ model: ollama.fallbackModel, temperature: 0.1 });
    const h = compressedHistory!.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n');
    const r = await llm2.invoke(
      `将代词(它/这个/那个)替换为历史中的具体名称:\n历史:\n${h}\n当前: ${query}\n改写:`,
      { timeout: 10000 } as any
    );
    return {
      optimizedQuery: (r.content as string).trim() || baseQuery,
      history: compressedHistory as any,
      nodeTimings: { queryRewrite: Date.now() - t0 },
    };
  } catch {
    return { optimizedQuery: baseQuery, history: compressedHistory as any, nodeTimings: { queryRewrite: Date.now() - t0 } };
  }
}

// ═══════════════════════════════════════════════════════════
// 4. 向量化
// ═══════════════════════════════════════════════════════════
export async function embeddingNode(state: RAGState): Promise<Partial<RAGState>> {
  const t0 = Date.now();
  try {
    const emb = new OllamaEmbeddings({ model: ollama.embeddingModel });
    const v = await emb.embedQuery(state.optimizedQuery || state.query);
    return { embedding: v, nodeTimings: { embedding: Date.now() - t0 } };
  } catch { return { errors: ['向量化失败'], nodeTimings: { embedding: Date.now() - t0 } }; }
}

// ═══════════════════════════════════════════════════════════
// 5. 混合检索 (RRF) — 向量 + 关键词滑动窗口
// ═══════════════════════════════════════════════════════════
export async function hybridRetrievalNode(state: RAGState): Promise<Partial<RAGState>> {
  const t0 = Date.now(); const { optimizedQuery, query, embedding, topK } = state;
  const searchText = optimizedQuery || query;
  // Skill: 语义扩展过的查询额外添加原始查询的关键词检测
  // 检测到有空格间隔的长文本(说明是语义扩展后的),同时用原始query和split后各词检索
  const isExpanded = searchText !== query && searchText.length > query.length * 1.5;
  try {
    // 路径 A: 向量检索
    const vecPromise = (async () => {
      try {
        const r = await getSupabaseClient().rpc('match_knowledge_items', {
          query_embedding: embedding, match_threshold: 0.25, match_count: topK * 6,
        });
        return ((r.data || []) as any[]).map((x: any) => ({
          id: x.id, title: x.title || '', content: x.content || '',
          similarity: x.similarity || 0, modality: x.modality, source: x.source,
          retrievalMethod: 'vector',
        }));
      } catch { return []; }
    })();

    // 路径 B: 关键词ILIKE (滑动窗口分词)
    const kwPromise = (async () => {
      try {
        const pg = await import('pg');
        const pool = new pg.Pool({
          connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/shiprag', max: 1,
        });
        const rawTokens = searchText.split(/[\s,，。；;、]+/).filter((w: string) => w.length > 0);
        const tokens: string[] = [];
        for (const t of rawTokens) {
          if (t.length <= 8) tokens.push(t);
          else for (let s = 3; s <= 6; s++) for (let i = 0; i <= t.length - s; i++) tokens.push(t.substring(i, i + s));
        }
        const words = [...new Set(tokens)].slice(0, 10);
        if (words.length === 0) words.push(searchText);
        const conds = words.map((_: string, i: number) => `title ILIKE $${i * 2 + 1} OR content ILIKE $${i * 2 + 2}`).join(' OR ');
        const params = words.flatMap((w: string) => [`%${w}%`, `%${w}%`]);
        const r = await pool.query(
          `SELECT id, title, content, modality, source FROM knowledge_items WHERE ${conds} LIMIT ${topK * 4}`,
          params
        );
        await pool.end();
        return (r.rows || []).map((x: any) => ({
          id: x.id, title: x.title || '', content: x.content || '',
          similarity: 0.55, modality: x.modality, source: x.source, retrievalMethod: 'keyword',
        }));
      } catch { return []; }
    })();

    const [vecResults, kwResults] = await Promise.all([vecPromise, kwPromise]);

    // RRF 融合
    const K = 60; const scoreMap = new Map<string, { item: any; score: number; methods: string[] }>();
    const addRRF = (results: any[], method: string) => {
      results.forEach((r, idx) => {
        const e = scoreMap.get(r.id) || { item: r, score: 0, methods: [] };
        e.score += 1 / (K + idx + 1); e.methods.push(method);
        e.item.similarity = Math.max(e.item.similarity || 0, r.similarity || 0);
        scoreMap.set(r.id, e);
      });
    };
    addRRF(vecResults, 'vector'); addRRF(kwResults, 'keyword');

    const fused = Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score).slice(0, topK * 3)
      .map(e => ({ ...e.item, similarity: e.score, retrievalMethod: e.methods.join('+') }));

    return {
      searchResults: fused.slice(0, topK), keywordResults: kwResults.slice(0, topK),
      fusedResults: fused, nodeTimings: { hybridRetrieval: Date.now() - t0 },
    };
  } catch (e: any) {
    return { searchResults: [], fusedResults: [], nodeTimings: { hybridRetrieval: Date.now() - t0 }, errors: [`检索失败: ${e.message}`] };
  }
}

// ═══════════════════════════════════════════════════════════
// 6. 精排 — 简化版 (LLM太慢,用数学排序)
// ═══════════════════════════════════════════════════════════
export async function rerankNode(state: RAGState): Promise<Partial<RAGState>> {
  const t0 = Date.now();
  const candidates = state.fusedResults || state.searchResults;
  if (!candidates.length) return { rerankedResults: [], nodeTimings: { rerank: 0 } };
  if (candidates.length <= 3) return { rerankedResults: candidates, nodeTimings: { rerank: 0 } };

  // 启发式: 标题匹配加分, 关键词密度加权
  const q = (state.optimizedQuery || state.query).toLowerCase();
  const qWords = q.split(/[\s,，。；;、]+/).filter((w: string) => w.length > 1);

  const reranked = candidates
    .map(c => {
      const title = (c.title || '').toLowerCase();
      const content = (c.content || '').toLowerCase();
      let boost = c.similarity || 0.5;
      for (const w of qWords) {
        if (title.includes(w)) boost += 0.15;
        if (content.includes(w)) boost += 0.05;
      }
      return { ...c, similarity: Math.min(boost, 1.0) };
    })
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, state.topK || 5);

  return { rerankedResults: reranked, nodeTimings: { rerank: Date.now() - t0 } };
}

// ═══════════════════════════════════════════════════════════
// 7. Prompt组装
// ═══════════════════════════════════════════════════════════
export function promptAssemblyNode(state: RAGState): Partial<RAGState> {
  return { nodeTimings: { promptAssembly: 0 } };
}

// ═══════════════════════════════════════════════════════════
// 8. LLM生成 — ShipRag身份 + 严格引用
// ═══════════════════════════════════════════════════════════
export async function llmGenerateNode(state: RAGState): Promise<Partial<RAGState>> {
  const t0 = Date.now();
  const { query, rerankedResults, history, classifyResult } = state;

  try {
    const llm = new ChatOllama({ model: ollama.defaultModel, temperature: 0.3 });

    if (classifyResult === 'CHAT') {
      const prompt = `你是ShipRag,海事航运智能知识助手,基于RAG技术查询法规和港口数据。友好简洁回答。

用户: ${query}`;
      const resp = await llm.invoke(prompt);
      return { finalAnswer: resp.content as string, nodeTimings: { llmGenerate: Date.now() - t0 } };
    }

    const ctx = rerankedResults.length > 0
      ? rerankedResults.map((r, i) => `【资料${i + 1}】(来源:${r.title}) ${(r.content || '').substring(0, 800)}`).join('\n\n')
      : '（未检索到相关资料）';
    const h = (history || []).slice(-4).map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`).join('\n');

    const prompt = `你是ShipRag,海事航运智能知识助手。严格根据参考资料回答。

规则:
1. 优先用参考资料原文
2. 有具体条款/数据时必须引用【资料N】
3. 资料完全不相关→说"知识库暂无相关信息",不编造
4. 资料部分相关→先引用再说明局限
5. 只在资料确实含答案时才标【资料N】
6. 不编造条款号/日期/数字

${h ? `对话历史:\n${h}\n` : ''}
参考资料:
${ctx}

用户: ${query}

回答:`;

    const resp = await llm.invoke(prompt);
    return { finalAnswer: resp.content as string, nodeTimings: { llmGenerate: Date.now() - t0 } };
  } catch (e: any) {
    return { finalAnswer: `生成失败:${e.message}`, nodeTimings: { llmGenerate: Date.now() - t0 }, errors: [`LLM失败:${e.message}`] };
  }
}

// ═══════════════════════════════════════════════════════════
// 9. SQL生成 — 明确表路由
// ═══════════════════════════════════════════════════════════
export async function sqlGenerateNode(state: RAGState): Promise<Partial<RAGState>> {
  const t0 = Date.now(); const { query, classifyResult } = state;
  const isPortQ = /港口|港|国家.*港口|列出.*港口|有哪些港口/.test(query);
  const isCount = /一共|总共|总计|合计|多少.*(个|条|行)|数量/.test(query);

  const schema = `数据库表:
port_data (port_code, name_cn, ctry_name_cn, lat, lon, port_type) — 全球港口。ctry_name_cn=国家名
knowledge_items (id, title, content) — PDF法规文档段落。title=文件名`;

  try {
    const llm = new ChatOllama({ model: ollama.fallbackModel, temperature: 0 });
    const hint = isPortQ
      ? `⚠️查港口! 用port_data表。国家名用ctry_name_cn='日本'这种格式。${classifyResult==='LIST'?'列表查询,LIMIT 500。':'计数查询,SELECT COUNT(*)。'}`
      : `查knowledge_items表。${classifyResult==='LIST'?'列表查询。':'计数查询,SELECT COUNT(*)。'}`;

    const resp = await llm.invoke(`${schema}\n\n${hint}\n\n问题:${query}\n只输出SQL:`);
    let sql = (resp.content as string).replace(/```sql\n?/gi, '').replace(/```\n?/g, '').trim();

    // Skill: 空间查询 — "距离XX最近的港口"生成排序SQL
    const spatialCheck = shouldUseSpatial(query);
    if (spatialCheck.use && spatialCheck.portName) {
      // Spatial skill: 获取所有带坐标的港口(Haversine排序在sqlPolish中完成)
      sql = 'SELECT port_code, name_cn, ctry_name_cn, lat, lon FROM port_data WHERE lat IS NOT NULL';
      console.log('[Skill:spatial] Haversine query for:', spatialCheck.portName);
    }

    // 兜底: 根据关键词强制修正表名
    if (isPortQ && !sql.toLowerCase().includes('port_data')) {
      sql = isCount
        ? 'SELECT COUNT(*) FROM port_data'
        : 'SELECT port_code, name_cn, ctry_name_cn, lat, lon FROM port_data LIMIT 500';
    }
    if (!sql.toLowerCase().startsWith('select')) {
      sql = isPortQ ? 'SELECT port_code, name_cn, ctry_name_cn FROM port_data LIMIT 500' : 'SELECT * FROM knowledge_items LIMIT 10';
    }

    console.log('[SQL]', sql.substring(0, 200));
    return { generatedSQL: sql, nodeTimings: { sqlGenerate: Date.now() - t0 } };
  } catch {
    return { generatedSQL: isPortQ ? 'SELECT port_code, name_cn, ctry_name_cn FROM port_data LIMIT 500' : '', nodeTimings: { sqlGenerate: Date.now() - t0 } };
  }
}

// ═══════════════════════════════════════════════════════════
// 10. SQL执行 — 解析WHERE条件
// ═══════════════════════════════════════════════════════════
export async function sqlExecuteNode(state: RAGState): Promise<Partial<RAGState>> {
  const t0 = Date.now();
  if (!state.generatedSQL) return { sqlData: [], nodeTimings: { sqlExecute: 0 } };

  let sql = state.generatedSQL;
  const isPortQ = /港口|港/.test(state.query || '');
  if (isPortQ && !sql.toLowerCase().includes('port_data')) {
    sql = isPortQ && sql.toLowerCase().includes('count')
      ? 'SELECT COUNT(*) FROM port_data'
      : 'SELECT port_code, name_cn, ctry_name_cn, lat, lon FROM port_data LIMIT 500';
  }

  try {
    const supabase = getSupabaseClient();
    const m = sql.toLowerCase().match(/from\s+(\w+)/i);
    const valid = ['knowledge_items', 'port_data', 'regulations', 'file_uploads'];
    const table = valid.includes(m?.[1] || '') ? m![1] : 'knowledge_items';

    if (sql.toLowerCase().includes('count(*)')) {
      // 解析 WHERE 条件
      let q = supabase.from(table).select('*', { count: 'exact', head: true });
      for (const m of sql.matchAll(/(\w+)\s*=\s*'([^']+)'/gi)) q = q.eq(m[1], m[2]);
      const { count } = await q;
      return { sqlData: [{ count: count || 0 }], nodeTimings: { sqlExecute: Date.now() - t0 } };
    }

    let query = supabase.from(table).select('*').limit(500);
    for (const m of sql.matchAll(/(\w+)\s*=\s*'([^']+)'/gi)) query = query.eq(m[1], m[2]);
    const { data } = await query;
    console.log('[SQL exec]', table, 'rows:', data?.length || 0);
    return { sqlData: data || [], nodeTimings: { sqlExecute: Date.now() - t0 } };
  } catch (e: any) {
    return { sqlData: [], errors: [`SQL失败:${e.message}`], nodeTimings: { sqlExecute: Date.now() - t0 } };
  }
}

// ═══════════════════════════════════════════════════════════
// 11. SQL结果润色 — 港口列表格式化
// ═══════════════════════════════════════════════════════════
export async function sqlPolishNode(state: RAGState): Promise<Partial<RAGState>> {
  const t0 = Date.now();
  if (!state.sqlData?.length) return { polishedSQLResult: '未查询到数据', nodeTimings: { sqlPolish: 0 } };

  const data = state.sqlData;
  const isPortQ = /港口|港/.test(state.query || '');
  const isCountQ = /一共|统计|多少.*(个|条)|数量/.test(state.query || '');

  // 计数查询 → 直接返回统计
  if (isCountQ || data[0]?.count !== undefined || data.length === 1) {
    const cnt = data.length === 1 && data[0]?.count !== undefined ? data[0].count : data.length;
    return { polishedSQLResult: `查询结果: ${cnt} 条记录`, nodeTimings: { sqlPolish: Date.now() - t0 } };
  }

  // 港口列表 → 格式化Top20 (+空间距离Skill)
  if (isPortQ) {
    // Skill: 空间距离计算 (如果SQL中包含lat/lon字段)
    const spatialCheck = shouldUseSpatial(state.query || '');
    const refName = spatialCheck.portName;

    let items: string[];
    if (refName && data.length > 0 && data[0].lat !== undefined) {
      // 单独查询参考港坐标(避免LIMIT 500截断)
      let refLat = 0, refLon = 0;
      try {
        const supabase = getSupabaseClient();
        const { data: refRow } = await supabase.from('port_data')
          .select('lat, lon').or(`name_cn.eq.${refName},port_code.eq.${refName}`).limit(1).single();
        if (refRow?.lat != null) { refLat = refRow.lat; refLon = refRow.lon; }
      } catch {}
      // 回退到数据集第一个
      if (refLat === 0 && refLon === 0) {
        refLat = data[0].lat; refLon = data[0].lon;
      }
      const withDist = (data as any[]).map((r: any) => {
        const dLat = (r.lat - refLat) * Math.PI / 180;
        const dLon = (r.lon - refLon) * Math.PI / 180;
        const a = Math.sin(dLat/2)**2 + Math.cos(refLat*Math.PI/180)*Math.cos(r.lat*Math.PI/180)*Math.sin(dLon/2)**2;
        const km = 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return { ...r, dist_km: km };
      }).filter((r: any) => r.name_cn !== refName && r.port_code !== refName)
        .sort((a: any, b: any) => a.dist_km - b.dist_km)
        .slice(0, 20);
      items = withDist.map((r: any) => `${r.port_code} — ${r.name_cn}，${r.ctry_name_cn || ''} (${r.dist_km.toFixed(0)}km)`);
    } else {
      items = data.slice(0, 20).map((r: any) =>
        `${r.port_code || ''} — ${r.name_cn || ''}，${r.ctry_name_cn || ''}`
      ).filter((l: string) => l.length > 3);
    }
    const header = `共查询到 ${data.length} 条记录，显示前${Math.min(20, items.length)}条:\n\n`;
    return {
      polishedSQLResult: header + (items.length > 0 ? items.join('\n') : JSON.stringify(data.slice(0, 5))),
      nodeTimings: { sqlPolish: Date.now() - t0 },
    };
  }

  // 其他 → LLM润色 (快速: 只取前3条)
  try {
    const llm = new ChatOllama({ model: ollama.fallbackModel, temperature: 0.1 });
    const short = JSON.stringify(data.slice(0, 3));
    const resp = await llm.invoke(`数据:${short}\n用一句话中文总结(20字内):`);
    return {
      polishedSQLResult: `查询到${data.length}条: ${(resp.content as string).trim().substring(0, 100)}`,
      nodeTimings: { sqlPolish: Date.now() - t0 },
    };
  } catch {
    return { polishedSQLResult: `查询到 ${data.length} 条记录`, nodeTimings: { sqlPolish: 0 } };
  }
}

// ═══════════════════════════════════════════════════════════
// 12. 幻觉检测 — 禁用 (误报率高,需单独训练)
// ═══════════════════════════════════════════════════════════
export async function hallucinationCheckNode(_state: RAGState): Promise<Partial<RAGState>> {
  return { nodeTimings: { hallucinationCheck: 0 } };
}

// ═══════════════════════════════════════════════════════════
// 13. 最终输出
// ═══════════════════════════════════════════════════════════
export function finalOutputNode(state: RAGState): Partial<RAGState> {
  const { finalAnswer, polishedSQLResult, classifyResult, sqlData, generatedSQL } = state;
  if (classifyResult === 'SQL' || classifyResult === 'LIST') {
    return { finalAnswer: polishedSQLResult || `查询到 ${sqlData?.length || 0} 条记录`, finalSQL: generatedSQL, streamDone: true };
  }
  return { finalAnswer: finalAnswer || '处理完成', finalSQL: generatedSQL || '', streamDone: true };
}
