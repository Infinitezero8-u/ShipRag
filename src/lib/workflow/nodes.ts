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

  // 单点查询: "XX港/湾是什么/在哪/在哪个国家" → LIST
  if (/(港|湾|锚地|泊位|码头).{0,10}(是什么|在哪里|在哪|在哪个国家|介绍)/.test(q))
    return { classifyResult: 'LIST', classifyRaw: 'KEYWORD_PORT_FACT', nodeTimings: { classify: Date.now() - t0 } };

  // LIST — 明确要遍历数据库列出条目
  const portListPat = /列出.*(所有|全部).*(港口|港)/;
  const countryListPat = /(日本|中国|美国|韩国|英国|法国|德国|新加坡).*(?:的.*)?(港口|港)/;
  // Skill: 空间查询 (距离XX最近的N个 → LIST)
  const spatialCheck = shouldUseSpatial(q);
  if (portListPat.test(q) || countryListPat.test(q))
    return { classifyResult: 'LIST', classifyRaw: 'KEYWORD_LIST', nodeTimings: { classify: Date.now() - t0 } };
  // 航线/距离计算: "从X到Y距离" "从X经Y到Z"
  if (/从.{1,6}(出发|到|经)/.test(q) && /港口|港|距离|公里|航线/.test(q))
    return { classifyResult: 'LIST', classifyRaw: 'KEYWORD_ROUTE', nodeTimings: { classify: Date.now() - t0 } };
  if (spatialCheck.use)
    return { classifyResult: 'LIST', classifyRaw: 'KEYWORD_SPATIAL', nodeTimings: { classify: Date.now() - t0 } };

  // SQL — 统计/计数/最值/排序 (覆盖 port + bridge + 通用)
  const countPat = /一共|总共|总计|合计|统计|多少个|有几个|数量|计数/;
  const extremePat = /最大|最小|最多|最少|第一|TOP|最早|最老|最长|最短|最高|最低/;
  const topNPat = /前\d+|TOP\s*\d/i;
  const sqlDomainPat = /港口|港|桥梁|桥|bridge|State|长度|建造年份|Built|carries|承载|建于|哪一年/;
  if ((countPat.test(q) || extremePat.test(q) || topNPat.test(q)) && sqlDomainPat.test(q))
    return { classifyResult: 'SQL', classifyRaw: 'KEYWORD_SQL', nodeTimings: { classify: Date.now() - t0 } };
  // 桥梁属性追问 (建造年份/承载道路等) 有历史上下文 → SQL
  if (/桥|bridge|建造年份|Built|承载|carries|建于|哪一年|年份/.test(q) && state.history?.length)
    return { classifyResult: 'SQL', classifyRaw: 'KEYWORD_BRIDGE_CTX', nodeTimings: { classify: Date.now() - t0 } };

  // RAG — 船舶/海域/AIS/事故/法规 (域名触发，不走 LLM 兜底误判)
  if (/船舶|船|AIS|海域|海区|萨罗尼科斯湾|专属经济区|EEZ|sea.area|事故|安全隐患|引航梯|SOLAS|IMO|MARPOL/i.test(q))
    return { classifyResult: 'RAG', classifyRaw: 'KEYWORD_RAG', nodeTimings: { classify: Date.now() - t0 } };

  // Skill: 语义扩展检测 — 口语匹配→强制RAG (绕过CHAT误分类)
  if (shouldUseSemanticExpansion(q)) {
    return { classifyResult: 'RAG', classifyRaw: 'KEYWORD_SEMANTIC', nodeTimings: { classify: Date.now() - t0 } };
  }

  // 代词/指代检测 → 有上下文时用 LLM 解析指代
  const hasPronoun = /^(它|他|她|这|那|这些|那些|其中|前者|后者|上面|刚才|全部)/.test(q.trim());
  if (hasPronoun && state.history?.length) {
    const ctx = state.history.slice(-4).map(m => `${m.role==='user'?'用户':'助手'}: ${m.content}`).join('\n');
    const llm = new ChatOllama({ model: ollama.fallbackModel, temperature: 0 });
    const resp = await llm.invoke(
      `根据对话历史，将用户追问改写为独立完整问题。只输出改写后的问题，不输出其他内容。

对话历史:
${ctx}

用户追问: ${q}

改写后的问题:`);
    const rewritten = (resp.content as string).trim();
    if (rewritten.length > 2 && rewritten !== q) {
      // 用改写后的问题重新分类
      const rewrittenState = { ...state, query: rewritten } as any;
      const result = await classifyNode(rewrittenState);
      return { ...result, optimizedQuery: rewritten, classifyRaw: `PRONOUN→${result.classifyRaw}` as any };
    }
  }

  // LLM 兜底
  try {
    const llm = new ChatOllama({ model: ollama.fallbackModel, temperature: 0 });
    const ctxInfo = state.history?.length ? `对话历史:\n${state.history.slice(-4).map(m=>`${m.role==='user'?'用户':'助手'}:${m.content}`).join('\n')}\n` : '';
    const resp = await llm.invoke(
      `${ctxInfo}分析意图,仅输出标签:
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

    // RRF 融合 — K值降低以增强分数区分度 (60→20)
    const K = 20; const scoreMap = new Map<string, { item: any; score: number; methods: string[] }>();
    const addRRF = (results: any[], method: string) => {
      results.forEach((r, idx) => {
        const e = scoreMap.get(r.id) || { item: r, score: 0, methods: [] };
        e.score += 1 / (K + idx + 1); e.methods.push(method);
        e.item.similarity = Math.max(e.item.similarity || 0, r.similarity || 0);
        scoreMap.set(r.id, e);
      });
    };
    addRRF(vecResults, 'vector'); addRRF(kwResults, 'keyword');

    // RRF排序，但保留原始向量相似度（而非用RRF分数覆盖）
    const fused = Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score).slice(0, topK * 3)
      .map(e => ({ ...e.item, retrievalMethod: e.methods.join('+') }));

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
      // 问候语 → 简洁友好回复
      if (/^(你好|早上好|下午好|晚上好|hello|hi|你是谁|帮助|help)/i.test(query?.trim() || '')) {
        return { finalAnswer: '你好！我是ShipRag，海事航运智能知识助手。可以问我港口数据、船舶航迹、海事法规、安全事故等问题。', nodeTimings: { llmGenerate: Date.now() - t0 } };
      }
      // 无资料时不编造，声明知识库范围
      if (!rerankedResults || rerankedResults.length === 0) {
        return { finalAnswer: '我是ShipRag海事航运知识助手，知识库覆盖全球港口(4987个)、美国桥梁(62万条)、船舶AIS综览(7.3万条)、安全事故(8千条)、专属经济区及海事法规等。您的问题不在我的知识范围内，请尝试询问海事航运相关问题。', nodeTimings: { llmGenerate: Date.now() - t0 } };
      }
      const ctx = (rerankedResults || []).slice(0, 3).map((r: any, i: number) =>
        `【资料${i + 1}】${r.content?.substring(0, 500)}`).join('\n\n');
      const prompt = `你是ShipRag海事航运智能知识助手。仅当参考资料恰好相关时才引用:

参考资料:
${ctx}

用户: ${query}
回答:`;
      const resp = await llm.invoke(prompt);
      return { finalAnswer: resp.content as string, nodeTimings: { llmGenerate: Date.now() - t0 } };
    }

    // 按来源文档合并短片段，避免碎片化上下文（平均80字/段的碎片→连贯快）
    const ctx = rerankedResults.length > 0
      ? (() => {
          const bySource = new Map<string, { titles: string[]; contents: string[] }>();
          rerankedResults.forEach(r => {
            const key = r.source || 'unknown';
            if (!bySource.has(key)) bySource.set(key, { titles: [], contents: [] });
            const g = bySource.get(key)!;
            g.titles.push(r.title || '');
            g.contents.push(r.content || '');
          });
          return Array.from(bySource.entries()).map(([source, g], i) => {
            const merged = g.contents.join('\n');
            return `【资料${i + 1}】(来源:${source}) ${merged.substring(0, 2000)}`;
          }).join('\n\n');
        })()
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
  const t0 = Date.now();
  // 优先用改写后的查询（代词指代已解析）
  const effectiveQ = state.optimizedQuery || state.query;
  const { classifyResult } = state;
  const isPortQ = /港口|港|海湾|湾|锚地|泊位|码头|port|bay|harbor/i.test(effectiveQ);
  const isCount = /一共|总共|总计|合计|多少.*(个|条|行)|数量/.test(effectiveQ);

  const schema = `数据库表:
port_data (port_code, name_cn, ctry_name_cn, ctry_code, lat, lon, port_type, port_size) — 全球4987个港口
knowledge_items (id, title, content, modality, source) — 知识库。其中:
  - modality='bridge' 共62万条美国桥梁: content含'State: XX'州代码、'Built XXXX'建造年份、'length XXm'长度、carries/at位置
  - modality='ais_synopsis' 7.3万条船舶AIS综览: content含坐标、航向heading、速度speed、STOP_END/GAP_END等标注
  - modality='safety_incident' 8千条安全事故: content含SOLAS、引航梯、事故类型
  - modality='eez' 2千条专属经济区: content含国家、面积、海域范围
  - modality='sea_area' 全球海区数据
  - modality='pdf' 法规PDF段落: title含法规文件名
  - modality='ship_image' 船舶图片`;

  // 州名→代码映射 (美国50州)
  const STATE_MAP: Record<string, string> = {
    'alabama':'01','阿拉巴马':'01','alaska':'02','阿拉斯加':'02','arizona':'04','亚利桑那':'04',
    'arkansas':'05','阿肯色':'05','california':'06','加利福尼亚':'06','加州':'06',
    'colorado':'08','科罗拉多':'08','connecticut':'09','康涅狄格':'09','delaware':'10','特拉华':'10',
    'florida':'12','佛罗里达':'12','georgia':'13','佐治亚':'13','hawaii':'15','夏威夷':'15',
    'idaho':'16','爱达荷':'16','illinois':'17','伊利诺伊':'17','indiana':'18','印第安纳':'18',
    'iowa':'19','爱荷华':'19','kansas':'20','堪萨斯':'20','kentucky':'21','肯塔基':'21',
    'louisiana':'22','路易斯安那':'22','maine':'23','缅因':'23','maryland':'24','马里兰':'24',
    'massachusetts':'25','马萨诸塞':'25','michigan':'26','密歇根':'26','minnesota':'27','明尼苏达':'27',
    'mississippi':'28','密西西比':'28','missouri':'29','密苏里':'29','montana':'30','蒙大拿':'30',
    'nebraska':'31','内布拉斯加':'31','nevada':'32','内华达':'32','new hampshire':'33','新罕布什尔':'33',
    'new jersey':'34','新泽西':'34','new mexico':'35','新墨西哥':'35','new york':'36','纽约':'36',
    'north carolina':'37','北卡罗来纳':'37','north dakota':'38','北达科他':'38','ohio':'39','俄亥俄':'39',
    'oklahoma':'40','俄克拉荷马':'40','oregon':'41','俄勒冈':'41','pennsylvania':'42','宾夕法尼亚':'42',
    'rhode island':'44','罗德岛':'44','south carolina':'45','南卡罗来纳':'45','south dakota':'46','南达科他':'46',
    'tennessee':'47','田纳西':'47','texas':'48','德克萨斯':'48','德州':'48','utah':'49','犹他':'49',
    'vermont':'50','佛蒙特':'50','virginia':'51','弗吉尼亚':'51','washington':'53','华盛顿':'53',
    'west virginia':'54','西弗吉尼亚':'54','wisconsin':'55','威斯康星':'55','wyoming':'56','怀俄明':'56',
  };
  // 索引州名关键词匹配（找到所有匹配项，支持多州对比）
  let bridgeMatch: [string, string] | null = null;
  const multiStateCodes: string[] = [];

  const regexMatch = effectiveQ.match(/State[:\s]*(\d{2})/gi);
  if (regexMatch) {
    const codes = [...new Set(regexMatch.map(m => m.match(/\d{2}/)![0]))];
    if (codes.length >= 2) codes.forEach(c => multiStateCodes.push(c));
    else if (codes.length === 1) bridgeMatch = [codes[0], codes[0]];
  }
  if (!bridgeMatch && multiStateCodes.length === 0) {
    const loQ = effectiveQ.toLowerCase();
    const found: string[] = [];
    for (const [name, code] of Object.entries(STATE_MAP)) {
      if (loQ.includes(name)) found.push(code);
    }
    const uniq = [...new Set(found)];
    if (uniq.length === 1) bridgeMatch = [uniq[0], uniq[0]];
    else if (uniq.length >= 2) multiStateCodes.push(...uniq);
  }

  // 多州对比 → 分别查询
  if (multiStateCodes.length >= 2 || (bridgeMatch && multiStateCodes.length >= 1)) {
    if (bridgeMatch) multiStateCodes.unshift(bridgeMatch[0]);
    const all = [...new Set(multiStateCodes)].slice(0, 10);
    console.log('[SQL bridge multi]', all.join(' vs '));
    // 多州对比: 标记 + 州码列表，sqlExecuteNode 分别执行 COUNT
    const sql = `MULTI_COUNT:${all.join(',')}`;
    return { generatedSQL: sql, nodeTimings: { sqlGenerate: Date.now() - t0 } };
  }

  // 关键词驱动: 桥梁查询走确定性路径 (绕过LLM SQL解析问题)
  if (bridgeMatch) {
    const stateCode = bridgeMatch[1];
    const yearMatch = effectiveQ.match(/(最早|最老|建造年份|Built|oldest)/i);
    const lenMatch = effectiveQ.match(/(最长|最短|长度|longest|shortest)/i);
    const topN = parseInt((effectiveQ.match(/前(\d+)/) || [])[1] || '5', 10);
    const sql = `SELECT * FROM knowledge_items WHERE content ILIKE '%State: ${stateCode}%' LIMIT 500`;
    const sortHint = lenMatch ? 'length_desc' : yearMatch ? (/(最老|最早)/i.test(effectiveQ) ? 'year_asc' : 'year_desc') : '';
    console.log('[SQL bridge]', sql.substring(0, 100), '| sort:', sortHint);
    return { generatedSQL: sql, nodeTimings: { sqlGenerate: Date.now() - t0 } };
  }

  // 航线/多港查询 → 提取港口名生成 IN 子句 (必须在国家匹配之前)
  const portNamePat = /(上海|釜山|东京|洛杉矶|纽约|鹿特丹|新加坡|香港|深圳|宁波|青岛|天津|大连|厦门|广州|仁川|光阳|丽水|蔚山|福山|横滨|神户|名古屋|大阪|旧金山|西雅图|长滩|奥克兰)/g;
  const routePorts = [...new Set(effectiveQ.match(portNamePat) || [])];
  if (routePorts.length >= 2 && isPortQ && classifyResult === 'LIST') {
    const placeholders = routePorts.map(p => `'${p}'`).join(',');
    const sql = `SELECT port_code, name_cn, ctry_name_cn, lat, lon FROM port_data WHERE name_cn IN (${placeholders})`;
    console.log('[SQL route]', sql.substring(0, 150));
    return { generatedSQL: sql, nodeTimings: { sqlGenerate: Date.now() - t0 } };
  }

  // 国家港口列表 → 确定性SQL (绕过LLM)
  const countryMatch = effectiveQ.match(/(日本|中国|美国|韩国|英国|法国|德国|新加坡)/);
  if (countryMatch && isPortQ && routePorts.length < 2) {
    const sql = `SELECT port_code, name_cn, ctry_name_cn, lat, lon FROM port_data WHERE ctry_name_cn = '${countryMatch[0]}'${isCount ? '' : ' ORDER BY name_cn'} LIMIT 500`;
    console.log('[SQL country]', sql.substring(0, 100));
    return { generatedSQL: sql, nodeTimings: { sqlGenerate: Date.now() - t0 } };
  }

  // 桥梁追问 → 从历史/改写中提取State代码生成确定性SQL
  if (!isPortQ && (classifyResult === 'SQL') && state.history?.length) {
    const histText = state.history.map(m => m.content).join(' ') + ' ' + effectiveQ;
    const stMatch = histText.match(/State[:\s]*(\d{2})/i);
    if (stMatch) {
      const sc = stMatch[1];
      const sql = `SELECT * FROM knowledge_items WHERE content ILIKE '%State: ${sc}%' LIMIT 500`;
      console.log('[SQL bridge ctx]', sql.substring(0, 100));
      return { generatedSQL: sql, nodeTimings: { sqlGenerate: Date.now() - t0 } };
    }
  }

  try {
    const llm = new ChatOllama({ model: ollama.fallbackModel, temperature: 0 });
    const hint = isPortQ
      ? `⚠️查港口! 用port_data表。国家名用ctry_name_cn='日本'这种格式。${classifyResult==='LIST'?'列表查询,LIMIT 500。':'计数查询,SELECT COUNT(*)。'}`
      : `查knowledge_items表。${classifyResult==='LIST'?'列表查询LIMIT 500。':'数据库查询 —— 如果是统计类问题用SELECT COUNT(*)，如果需要排序/过滤用SELECT+ILIKE+ORDER BY+LIMIT。'}注意: modality列区分数据类型, content列存正文需用ILIKE '%关键词%'模糊匹配。桥梁查State用content ILIKE '%State: XX%', 建造年份用content ILIKE '%Built XXXX%', 长度用content ILIKE '%length XX%'。`;

    const resp = await llm.invoke(`${schema}\n\n${hint}\n\n问题:${query}\n只输出SQL:`);
    let sql = (resp.content as string).replace(/```sql\n?/gi, '').replace(/```\n?/g, '').trim();

    // Skill: 空间查询 — "距离XX最近的港口"生成排序SQL
    const spatialCheck = shouldUseSpatial(effectiveQ);
    if (spatialCheck.use && spatialCheck.portName) {
      // Spatial skill: 获取所有带坐标的港口(Haversine排序在sqlPolish中完成)
      sql = 'SELECT port_code, name_cn, ctry_name_cn, lat, lon FROM port_data WHERE lat IS NOT NULL';
      console.log('[Skill:spatial] Haversine query for:', spatialCheck.portName);
    }

    // 兜底: 根据关键词强制修正表名。提取地名做 ILIKE 搜索
    if (isPortQ && !sql.toLowerCase().includes('port_data')) {
      // 从查询中提取疑似地名：在"是什么"/"在哪"/"位于"之前的连续中文字符
      let placeName = effectiveQ.replace(/是什么|在哪个国家|在哪里|在哪|位于.*|哪个国家|靠近|有没有|多少|怎么|如何|为什么|哪些.*|，|,/g, '').trim().replace(/[港湾锚地泊位码头]$/, "").substring(0, 6);
      if (!placeName || placeName.length < 2) placeName = effectiveQ.substring(0, 6);
      if (isCount) {
        sql = `SELECT COUNT(*) FROM port_data WHERE name_cn ILIKE '%${placeName}%'`;
      } else {
        sql = `SELECT port_code, name_cn, ctry_name_cn, lat, lon FROM port_data WHERE name_cn ILIKE '%${placeName}%' LIMIT 20`;
      }
    }
    if (!sql.toLowerCase().startsWith('select')) {
      sql = isPortQ ? 'SELECT port_code, name_cn, ctry_name_cn FROM port_data LIMIT 500' : 'SELECT * FROM knowledge_items LIMIT 10';
    }

    console.log('[SQL]', sql.substring(0, 200));
    return { generatedSQL: sql, nodeTimings: { sqlGenerate: Date.now() - t0 } };
  } catch {
    if (isPortQ) {
      let placeName = effectiveQ.replace(/是什么|在哪个国家|在哪里|在哪|位于.*|哪个国家|靠近|有没有|多少|怎么|如何|为什么|哪些.*|，|,/g, '').trim().replace(/[港湾锚地泊位码头]$/, "").substring(0, 6);
      const sql = `SELECT port_code, name_cn, ctry_name_cn, lat, lon FROM port_data WHERE name_cn ILIKE '%${placeName}%' LIMIT 20`;
      return { generatedSQL: sql, nodeTimings: { sqlGenerate: Date.now() - t0 } };
    }
    return { generatedSQL: '', nodeTimings: { sqlGenerate: Date.now() - t0 } };
  }
}

// ═══════════════════════════════════════════════════════════
// 10. SQL执行 — 解析WHERE条件
// ═══════════════════════════════════════════════════════════
export async function sqlExecuteNode(state: RAGState): Promise<Partial<RAGState>> {
  const t0 = Date.now();
  if (!state.generatedSQL) return { sqlData: [], nodeTimings: { sqlExecute: 0 } };

  let sql = state.generatedSQL;
  const isPortQ = /港口|港|海湾|湾|锚地|泊位|码头|port|bay|harbor/i.test(state.optimizedQuery || state.query || '');
  if (isPortQ && !sql.toLowerCase().includes('port_data')) {
    sql = isPortQ && sql.toLowerCase().includes('count')
      ? 'SELECT COUNT(*) FROM port_data'
      : 'SELECT port_code, name_cn, ctry_name_cn, lat, lon FROM port_data LIMIT 500';
  }

  try {
    const supabase = getSupabaseClient();

    // 特殊: MULTI_COUNT 标记 → 多州独立计数
    if (sql.startsWith('MULTI_COUNT:')) {
      const codes = sql.replace('MULTI_COUNT:', '').split(',');
      const results: Array<{ state: string; count: number }> = [];
      for (const c of codes) {
        const { count } = await supabase.from('knowledge_items')
          .select('*', { count: 'exact', head: true })
          .ilike('content', `%State: ${c}%`);
        results.push({ state: c, count: count || 0 });
      }
      return { sqlData: results as any, nodeTimings: { sqlExecute: Date.now() - t0 } };
    }

    const m = sql.toLowerCase().match(/from\s+(\w+)/i);
    const valid = ['knowledge_items', 'port_data', 'regulations', 'file_uploads'];
    const table = valid.includes(m?.[1] || '') ? m![1] : 'knowledge_items';

    // 路径 A: 简单 COUNT(*) + = 条件 → Supabase JS 客户端
    if (sql.toLowerCase().includes('count(*)')) {
      let q = supabase.from(table).select('*', { count: 'exact', head: true });
      for (const m of sql.matchAll(/(\w+)\s*=\s*'([^']+)'/gi)) q = q.eq(m[1], m[2]);
      const { count } = await q;
      return { sqlData: [{ count: count || 0 }], nodeTimings: { sqlExecute: Date.now() - t0 } };
    }

    // 路径 A2: IN (...)→ Supabase .in()
    const inMatch = sql.match(/(\w+)\s+in\s+\(([^)]+)\)/i);
    if (inMatch) {
      const col = inMatch[1];
      const vals = [...inMatch[2].matchAll(/'([^']+)'/g)].map(m => m[1]);
      if (vals.length > 0) {
        const limitMatch = sql.match(/limit\s+(\d+)/i);
        let q = supabase.from(table).select('*');
        if (limitMatch) q = q.limit(parseInt(limitMatch[1]));
        else q = q.limit(500);
        q = q.in(col, vals);
        const { data: inData } = await q;
        console.log('[SQL exec in]', table, 'in(', vals.length, ') rows:', inData?.length || 0);
        return { sqlData: inData || [], nodeTimings: { sqlExecute: Date.now() - t0 } };
      }
    }

    // 路径 B: 简单 SELECT + = 条件（无 ILIKE/ORDER BY）→ Supabase JS 客户端
    const eqMatches = [...sql.matchAll(/(\w+)\s*=\s*'([^']+)'/gi)];
    const hasComplex = /ilike|order\s+by|like\s+'%/i.test(sql);
    if (eqMatches.length > 0 && !hasComplex) {
      let query = supabase.from(table).select('*').limit(500);
      for (const m of eqMatches) query = query.eq(m[1], m[2]);
      const { data } = await query;
      return { sqlData: data || [], nodeTimings: { sqlExecute: Date.now() - t0 } };
    }

    // 路径 C: 复杂 SQL (ILIKE/ORDER BY/LIMIT/AND/OR) → Supabase
    const ilikeMatches = [...sql.matchAll(/(\w+)\s+ilike\s+'%([^']+)%'/gi)];
    let query = supabase.from(table).select('*').limit(500);
    for (const m of eqMatches) query = query.eq(m[1], m[2]);
    if (ilikeMatches.length > 1 && /\bOR\b/i.test(sql)) {
      // OR 条件用 .or() 语法: content.ilike.%X%,content.ilike.%Y%
      query = query.or(ilikeMatches.map(m => `${m[1]}.ilike.%${m[2]}%`).join(','));
    } else {
      for (const m of ilikeMatches) query = query.ilike(m[1], `%${m[2]}%`);
    }

    // 解析 LIMIT
    const limitMatch = sql.match(/limit\s+(\d+)/i);
    if (limitMatch) query = query.limit(parseInt(limitMatch[1]));

    // 解析 ORDER BY (只支持简单的 ASC/DESC)
    const orderMatch = sql.match(/order\s+by\s+(\w+)(?:\s+(asc|desc))?/i);
    if (orderMatch) {
      query = query.order(orderMatch[1], { ascending: !orderMatch[2] || orderMatch[2].toLowerCase() !== 'desc' });
    }

    const { data } = await query;
    console.log('[SQL exec supabase]', table, 'rows:', data?.length || 0);
    return { sqlData: data || [], nodeTimings: { sqlExecute: Date.now() - t0 } };
  } catch (e: any) {
    console.error('[SQL exec]', e.message);
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
  const isPortQ = /港口|港|海湾|湾|锚地|泊位|码头|port|bay|harbor/i.test(state.optimizedQuery || state.query || '');
  const isCountQ = /一共|统计|多少.*(个|条)|数量/.test(state.optimizedQuery || state.query || '') && !/距离|公里|航线|路线/.test(state.optimizedQuery || state.query || '');

  // MULTI_COUNT → 州计数对比结果
  if (data[0]?.state !== undefined && data[0]?.count !== undefined) {
    const lines = (data as any[]).map((r: any) => `State ${r.state}: ${r.count.toLocaleString()} 座桥`);
    const total = (data as any[]).reduce((s: number, r: any) => s + (r.count || 0), 0);
    return { polishedSQLResult: `桥梁数量对比（共${total.toLocaleString()}座）:\n\n${lines.join('\n')}`, nodeTimings: { sqlPolish: Date.now() - t0 } };
  }

  // 计数查询 → 总是走空间逻辑不短路 (空间+计数复合)
  const hasSpatial = shouldUseSpatial(state.query || '').use;
  // 单条港口/地名结果 → 短路跳过，走后面的格式化
  const isSinglePortResult = !!(data.length === 1 && data[0]?.port_code && data[0]?.name_cn);
  if (!hasSpatial && !isSinglePortResult && (isCountQ || data[0]?.count !== undefined || data.length === 1)) {
    const cnt = data.length === 1 && data[0]?.count !== undefined ? data[0].count : data.length;
    return { polishedSQLResult: `查询结果: ${cnt} 条记录`, nodeTimings: { sqlPolish: Date.now() - t0 } };
  }

  // 航线/多港距离 → 优先于港口列表 (计算分段Haversine)
  if (data.length >= 2 && data.length <= 10 && data[0]?.lat !== undefined && /距离|航线|出发|经/.test(state.query || '')) {
    const q = state.query || '';
    const namePat = /(上海|釜山|东京|洛杉矶|纽约|鹿特丹|新加坡|香港|深圳|宁波|青岛|天津|大连|厦门|广州|仁川|光阳|丽水|蔚山|福山|横滨|神户|名古屋|大阪|旧金山|西雅图|长滩|奥克兰)/g;
    const portNames = [...new Set(q.match(namePat) || [])];
    const portMap = new Map((data as any[]).map(p => [p.name_cn, p]));
    const ordered = portNames.map(n => portMap.get(n)).filter(Boolean);
    if (ordered.length >= 2) {
      const h = (lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371, dLat = (lat2-lat1)*Math.PI/180, dLon = (lon2-lon1)*Math.PI/180;
        const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      };
      const legs: string[] = []; let total = 0;
      for (let i = 0; i < ordered.length - 1; i++) {
        const a = ordered[i], b = ordered[i+1];
        const dist = h(a.lat||0, a.lon||0, b.lat||0, b.lon||0);
        legs.push(`${a.name_cn}(${a.port_code}) → ${b.name_cn}(${b.port_code}): ${dist.toFixed(0)}km (${(dist*0.539957).toFixed(0)}nm)`);
        total += dist;
      }
      legs.push(`\n🚢 总航程: ${total.toFixed(0)}km / ${(total*0.539957).toFixed(0)}海里`);
      return { polishedSQLResult: `航线距离:\n\n${legs.join('\n')}`, nodeTimings: { sqlPolish: Date.now() - t0 } };
    }
  }

  // 港口列表 → 格式化Top20 (+空间距离Skill)
  if (isPortQ) {
    // 单条结果 → 显示详细信息
    if (data.length === 1 && data[0]?.port_code && data[0]?.name_cn) {
      const p = data[0];
      const info = [
        `📍 ${p.name_cn} (${p.port_code})`,
        `   国家: ${p.ctry_name_cn || '未知'}`,
        p.lat != null ? `   坐标: ${p.lat}°N, ${p.lon}°E` : '',
        p.port_type ? `   类型: ${p.port_type}` : '',
      ].filter(Boolean).join('\n');
      return { polishedSQLResult: info, nodeTimings: { sqlPolish: Date.now() - t0 } };
    }
    // Skill: 空间距离计算 (如果SQL中包含lat/lon字段)
    const spatialCheck = shouldUseSpatial(state.query || '');
    const refName = spatialCheck.portName;

    let items: string[];
    if (refName && data.length > 0 && data[0].lat !== undefined) {
      // 单独查询参考港坐标 — 精确匹配 → 模糊匹配
      let refLat = 0, refLon = 0;
      try {
        const supabase = getSupabaseClient();
        // 精确匹配
        let { data: refRow } = await supabase.from('port_data')
          .select('lat, lon').or(`name_cn.eq.${refName},port_code.eq.${refName}`).limit(1).single();
        // 模糊回退: ILIKE 前缀（"东京" → 匹配"东京"/"东京港"）
        if (!refRow?.lat) {
          ({ data: refRow } = await supabase.from('port_data')
            .select('lat, lon').ilike('name_cn', `%${refName}%`).limit(1).single());
        }
        if (refRow?.lat != null) { refLat = refRow.lat; refLon = refRow.lon; }
      } catch {}
      // 精确+模糊均失败 → 不做空间排序，回退到普通列表（避免用随机港口计算距离）
      if (refLat === 0 && refLon === 0) {
        items = data.slice(0, 20).map((r: any) =>
          `${r.port_code || ''} — ${r.name_cn || ''}，${r.ctry_name_cn || ''}`
        ).filter((l: string) => l.length > 3);
        const header = `共查询到 ${data.length} 条记录（⚠️ 未找到参考港口 "${refName}"，无法计算距离），显示前${Math.min(20, items.length)}条:\n\n`;
        return {
          polishedSQLResult: header + (items.length > 0 ? items.join('\n') : JSON.stringify(data.slice(0, 5))),
          nodeTimings: { sqlPolish: Date.now() - t0 },
        };
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

  // 多州计数结果 (MULTI_COUNT)
  if (data[0]?.state !== undefined && data[0]?.count !== undefined) {
    const lines = (data as any[]).map((r: any) => `State ${r.state}: ${r.count.toLocaleString()} 座桥`);
    const total = (data as any[]).reduce((s, r) => s + r.count, 0);
    return { polishedSQLResult: `桥梁数量对比（共${total.toLocaleString()}座）:\n\n${lines.join('\n')}`, nodeTimings: { sqlPolish: Date.now() - t0 } };
  }

  // 桥梁数据 → 解析字段 + 客户端排序
  if (data[0]?.content && /State:|Built|carries/i.test(data[0].content)) {
    const q = state.optimizedQuery || state.query || '';
    const sortByLen = /(最长|长度|longest)/i.test(q);
    const sortByYear = /(最早|最老|建造年份|Built|oldest)/i.test(q);
    const ascOrder = /(最短|最早|最老|shortest|oldest)/i.test(q);
    // parse "最长的3座" "前5座" "3座" "TOP 10"
    const topN = parseInt((q.match(/(?:前|最长的|最老的|最早的|TOP\s*)\s*(\d+)/i)||[])[1] || (q.match(/(\d+)\s*座/))?.[1] || '5', 10);
    // 长度阈值: "超过200米" ">100m" "不足50米"
    const lenMin = parseFloat((q.match(/(?:超过|大于|>)\s*(\d+(?:\.\d+)?)\s*(?:米|m)/i)||[])[1]||'0');
    const lenMax = parseFloat((q.match(/(?:不足|小于|<|不超过)\s*(\d+(?:\.\d+)?)\s*(?:米|m)/i)||[])[1]||'0');
    // 纯计数: 有阈值词 + 数量词，排除 "长度多少" (问具体数值)
    const countOnly = /(有多少座|一共|总数|统计|哪个.*更)\s*(?:桥梁|桥)?/i.test(q) && !/(?:具体|分别|哪几|列出)/i.test(q);

    const parsed = (data as any[]).map((r: any) => {
      const c = r.content || '';
      return {
        text: `桥 ${r.title?.trim()} — 承载${(c.match(/carries\s+'([^']+)'/i)||[])[1]||''}，建于${(c.match(/Built\s+(\d+)/i)||[])[1]||''}年，长${(c.match(/length\s+([\d.]+)m/i)||[])[1]||''}m (State ${(c.match(/State:\s*(\d+)/)||[])[1]||''})`,
        length: parseFloat((c.match(/length\s+([\d.]+)m/i)||[])[1]||'0'),
        year: parseInt((c.match(/Built\s+(\d+)/i)||[])[1]||'0'),
        state: (c.match(/State:\s*(\d+)/)||[])[1]||'',
      };
    }).filter(b => !b.text.includes('undefined'));

    // 长度阈值过滤
    let filtered = parsed;
    if (lenMin > 0) filtered = filtered.filter(b => b.length > lenMin);
    if (lenMax > 0) filtered = filtered.filter(b => b.length < lenMax);

    // 排序
    if (sortByLen) filtered.sort((a, b) => ascOrder ? a.length - b.length : b.length - a.length);

    // 多州对比
    const states = [...new Set(parsed.map(b => b.state))].filter(Boolean);
    if (states.length >= 2) {
      const byState: Record<string, { total: number }> = {};
      states.forEach(s => { byState[s] = { total: parsed.filter(b => b.state === s).length }; });
      const lines = Object.entries(byState).map(([s, v]) => `State ${s}: ${v.total} 座桥`);
      return { polishedSQLResult: `跨州桥梁对比:\n\n${lines.join("\n")}`, nodeTimings: { sqlPolish: Date.now() - t0 } };
    }
    if (sortByYear) filtered.sort((a, b) => ascOrder ? a.year - b.year : b.year - a.year);

    // 纯计数→返回统计
    if (countOnly) {
      const thresh = lenMin > 0 ? `长度>${lenMin}m` : lenMax > 0 ? `长度<${lenMax}m` : '';
      return { polishedSQLResult: `共查询到 ${data.length} 座桥（State ${(data[0]?.content||'').match(/State:\s*(\d+)/)?.[1]||'?'}）${thresh ? `，${thresh}的共 ${filtered.length} 座` : ''}`, nodeTimings: { sqlPolish: Date.now() - t0 } };
    }

    const items = filtered.slice(0, Math.min(topN, 20)).map(b => b.text);
    if (items.length > 0) {
      const thresh = lenMin > 0 || lenMax > 0 ? `，满足阈值的有${filtered.length}座` : '';
      return { polishedSQLResult: `共${parsed.length}座桥${thresh}，显示前${items.length}座:\n\n${items.join('\n')}`, nodeTimings: { sqlPolish: Date.now() - t0 } };
    }
  }

  // 单条港口/地名 → 显示详细信息
  if (isSinglePortResult) {
    const p = data[0];
    const info = [
      `📍 ${p.name_cn} (${p.port_code})`,
      `   国家: ${p.ctry_name_cn || '未知'}`,
      p.lat != null ? `   坐标: ${p.lat}°N, ${p.lon}°E` : '',
      p.port_type ? `   类型: ${p.port_type}` : '',
    ].filter(Boolean).join('\n');
    return { polishedSQLResult: info, nodeTimings: { sqlPolish: Date.now() - t0 } };
  }

  // 其他 → 直接用content文本格式化 (跳过LLM，避免JSON序列化元数据)
  const sample = data.slice(0, 5).map((r: any, i: number) =>
    `${i + 1}. ${(r.title || '').substring(0, 40)}: ${(r.content || '').substring(0, 120)}`
  ).join('\n');
  return {
    polishedSQLResult: `查询到${data.length}条记录，显示前5条:\n\n${sample}`,
    nodeTimings: { sqlPolish: Date.now() - t0 },
  };
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
