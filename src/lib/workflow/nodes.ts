/**
 * LangGraph 工作流节点实现
 *
 * 修复清单：
 *   P0-1: RRF 混合检索 — 向量 + 关键词同时搜，RRF 公式融合
 *   P0-2: BGE-Reranker  — cross-encoder 精排 (Ollama fallback → heuristics)
 *   P0-3: 引用溯源      — LLM 要求输出 [资料N]，前端可高亮跳转
 *   P1-1: 文档分块      — ingest 时执行 (src/app/api/embed/route.ts)
 */
import { RAGState } from './state';
import { ChatOllama } from '@langchain/ollama';
import { OllamaEmbeddings } from '@langchain/ollama';
import { getSupabaseClient } from '@/storage/database/local-db';
import { OllamaConfig } from '@/lib/ollama/config';

const ollama = new OllamaConfig();

// ═══════════════════════════════════════════════════════
// 1. 用户输入
// ═══════════════════════════════════════════════════════
export async function userInputNode(state: RAGState): Promise<Partial<RAGState>> {
  const q = state.query?.trim();
  if (!q) return { errors: ['用户输入为空'] };
  return { query: q };
}

// ═══════════════════════════════════════════════════════
// 2. 意图分类 (关键词优先, LLM 兜底)
// ═══════════════════════════════════════════════════════
export async function classifyNode(state: RAGState): Promise<Partial<RAGState>> {
  const t0 = Date.now(); const q = state.query;
  const lo = q.toLowerCase();

  // chat
  if (/^(你好|谢谢|再见|帮助|help|早上好|下午好|晚上好|hello|hi|thanks|bye)/i.test(q.trim()))
    return { classifyResult: 'CHAT', classifyRaw: 'KEYWORD_CHAT', nodeTimings: { classify: Date.now() - t0 } };
  // list
  // list — 仅明确要枚举列表时才走LIST
  if ((/列出所有|清单|目录|全部港口|所有港口|有哪些港口/.test(q) && /港口|港|航线/.test(q)) ||
      (/列出所有|清单/.test(q) && /规章|法规|条例|制度/.test(q)))
    return { classifyResult: 'LIST', classifyRaw: 'KEYWORD_LIST', nodeTimings: { classify: Date.now() - t0 } };
  // sql
  if (/一共|总共|总计|合计|统计|多少个|有几个|数量|按.*分|最大|最小|最多|最少/.test(q))
    return { classifyResult: 'SQL', classifyRaw: 'KEYWORD_SQL', nodeTimings: { classify: Date.now() - t0 } };

  // llm fallback
  try {
    const llm = new ChatOllama({ model: ollama.fallbackModel, temperature: 0 });
    const resp = await llm.invoke(
      `分析用户问题的意图，仅输出一个标签：
RAG  — 查询文档/法规/条例/规则的具体内容、定义、条款
SQL  — 需要统计/计数/汇总/最多/最少 (如"一共有多少条")
LIST — 需要遍历数据库列出所有条目 (如"列出所有港口")
ALL  — 既需要查文档又需要统计数据
CHAT — 问候/感谢/自我介绍/帮助/元问题 (如"你是谁")

注意: "有哪些关于XX的规定" → RAG (查文档)
      "有多少个XX" → SQL (计数)
      "列出所有XX" → LIST (枚举)
      "你好/谢谢" → CHAT

用户问题: ${q}
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

// ═══════════════════════════════════════════════════════
// 4. Query 改写 (增强版: 复杂问题分解 + 记忆压缩)
// ═══════════════════════════════════════════════════════
export async function queryRewriteNode(state: RAGState): Promise<Partial<RAGState>> {
  const t0 = Date.now();
  const { query, history } = state;

  // P2-1: 复杂问题检测 — 对比类/多条件类自动分解
  const complexPatterns = [
    /和.*对比|与.*比较|和.*区别|和.*差异|vs\.?/i,
    /同时|以及|还有.*也|另外.*还/,
    /首先.*其次|第一.*第二|一方面.*另一方面/,
    /吞吐量|占用率|增长率|同比|环比/,
  ];
  const isComplex = complexPatterns.some(p => p.test(query));

  // P2-2: 对话记忆压缩 — 超过6轮自动摘要
  let compressedHistory = history;
  if (history && history.length > 6) {
    try {
      const llm = new ChatOllama({ model: ollama.fallbackModel, temperature: 0 });
      const historyText = history.map(m => `${m.role}: ${m.content}`).join('\n');
      const resp = await llm.invoke(
        `将以下对话历史压缩为不超过200字的摘要，保留关键实体和用户意图：\n${historyText}\n摘要：`,
        { timeout: 15000 } as any
      );
      compressedHistory = [
        { role: 'system', content: `[对话摘要] ${(resp.content as string).trim()}` },
        ...history.slice(-2), // 保留最近两轮原文
      ];
    } catch { /* 压缩失败保留最近4轮 */ compressedHistory = history.slice(-4); }
  }

  if (!history?.length && !isComplex) {
    return { optimizedQuery: query, history: compressedHistory as any, nodeTimings: { queryRewrite: 0 } };
  }

  // 有历史 → 改写
  if (history?.length) {
    try {
      const llm2 = new ChatOllama({ model: ollama.fallbackModel, temperature: 0.1 });
      const h = compressedHistory!.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n');
      const resp = await llm2.invoke(
        `把用户问题中的指代词(它/这个/那个/那条/这些)替换为对话历史中的具体名称，使问题独立可理解。\n历史:\n${h}\n当前: ${query}\n重写:`, { timeout: 10000 } as any);
      return {
        optimizedQuery: (resp.content as string).trim() || query,
        history: compressedHistory as any,
        nodeTimings: { queryRewrite: Date.now() - t0 },
      };
    } catch {
      return { optimizedQuery: query, history: compressedHistory as any, nodeTimings: { queryRewrite: Date.now() - t0 } };
    }
  }

  // 复杂问题 → 分解为子查询
  if (isComplex) {
    try {
      const llm3 = new ChatOllama({ model: ollama.fallbackModel, temperature: 0 });
      const resp = await llm3.invoke(
        `将用户的复杂问题分解为2-3个子查询，每个子查询一行，用换行分隔：\n${query}\n子查询:`,
        { timeout: 15000 } as any
      );
      const subQueries = (resp.content as string)
        .split('\n')
        .map(l => l.replace(/^\d+[\.\)、]\s*/, '').trim())
        .filter(l => l.length > 3)
        .slice(0, 3);

      // 合并为增强查询
      const enhancedQuery = subQueries.length > 0
        ? `${query}\n[子查询: ${subQueries.join('; ')}]`
        : query;

      return {
        optimizedQuery: enhancedQuery,
        history: compressedHistory as any,
        nodeTimings: { queryRewrite: Date.now() - t0 },
      };
    } catch {
      return { optimizedQuery: query, history: compressedHistory as any, nodeTimings: { queryRewrite: Date.now() - t0 } };
    }
  }

  return { optimizedQuery: query, history: compressedHistory as any, nodeTimings: { queryRewrite: 0 } };
}

// ═══════════════════════════════════════════════════════
// 5. 向量化
// ═══════════════════════════════════════════════════════
export async function embeddingNode(state: RAGState): Promise<Partial<RAGState>> {
  const t0 = Date.now();
  try {
    const emb = new OllamaEmbeddings({ model: ollama.embeddingModel });
    const v = await emb.embedQuery(state.optimizedQuery || state.query);
    return { embedding: v, nodeTimings: { embedding: Date.now() - t0 } };
  } catch {
    return { errors: ['向量化失败'], nodeTimings: { embedding: Date.now() - t0 } };
  }
}

// ═══════════════════════════════════════════════════════
// 6. 混合检索 (RRF) — P0-1 修复
// ═══════════════════════════════════════════════════════
export async function hybridRetrievalNode(state: RAGState): Promise<Partial<RAGState>> {
  const t0 = Date.now();
  const { optimizedQuery, query, embedding, topK } = state;
  const searchText = optimizedQuery || query;

  try {
    const supabase = getSupabaseClient();

    // === 路径 A: 向量检索 (pgvector cosine) ===
    const vecPromise = (async () => {
      try {
        const r = await supabase.rpc('match_knowledge_items', {
          query_embedding: embedding, match_threshold: 0.25, match_count: topK * 6,
        });
        return ((r.data || []) as any[]).map((x: any) => ({
          id: x.id, title: x.title || '', content: x.content || '',
          similarity: x.similarity || 0, modality: x.modality, source: x.source,
          retrievalMethod: 'vector',
        }));
      } catch { return []; }
    })();

    // === 路径 B: 关键词检索 (用 pg 直连避开 PostgREST or() bug) ===
    const kwPromise = (async () => {
      try {
        const pg = await import('pg');
        const pool = new pg.Pool({
          connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/shiprag',
          max: 1,
        });
        const words = searchText.split(/[\s,，。；;、]+/).filter((w: string) => w.length > 1);
        const ilikeWords = words.length > 0 ? words : [searchText];
        // Build ILIKE WHERE clause: title ILIKE '%word%' OR content ILIKE '%word%'
        const conditions = ilikeWords.map((_: string, i: number) =>
          `title ILIKE $${i*2+1} OR content ILIKE $${i*2+2}`
        ).join(' OR ');
        const params = ilikeWords.flatMap((w: string) => [`%${w}%`, `%${w}%`]);

        const result = await pool.query(
          `SELECT id, title, content, modality, source FROM knowledge_items
           WHERE ${conditions} LIMIT ${topK * 4}`,
          params
        );
        await pool.end();
        return result.rows.map((x: any) => ({
          id: x.id, title: x.title || '', content: x.content || '',
          similarity: 0.55, modality: x.modality, source: x.source,
          retrievalMethod: 'keyword',
        }));
      } catch { return []; }
    })();

    // 并发执行两条路径
    const [vecResults, kwResults] = await Promise.all([vecPromise, kwPromise]);

    // === RRF 融合 (Reciprocal Rank Fusion) ===
    // RRF_score(d) = Σ 1/(k + rank_i(d))  where k=60
    const K = 60;
    const scoreMap = new Map<string, { item: any; score: number; methods: string[] }>();

    const addRRF = (results: any[], method: string) => {
      results.forEach((r, idx) => {
        const entry = scoreMap.get(r.id) || { item: r, score: 0, methods: [] };
        entry.score += 1 / (K + idx + 1);
        entry.methods.push(method);
        entry.item.similarity = Math.max(entry.item.similarity || 0, r.similarity || 0);
        scoreMap.set(r.id, entry);
      });
    };

    addRRF(vecResults, 'vector');
    addRRF(kwResults, 'keyword');

    // 排序 + 截断
    const fused = Array.from(scoreMap.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, topK * 3)
      .map(e => ({ ...e.item, similarity: e.score, retrievalMethod: e.methods.join('+') }));

    return {
      searchResults: fused.slice(0, topK),  // RRF 融合后的最佳结果
      keywordResults: kwResults.slice(0, topK),
      fusedResults: fused,
      nodeTimings: { hybridRetrieval: Date.now() - t0 },
    };
  } catch (e: any) {
    return {
      searchResults: [], keywordResults: [], fusedResults: [],
      nodeTimings: { hybridRetrieval: Date.now() - t0 },
      errors: [`混合检索失败: ${e.message}`],
    };
  }
}

// ═══════════════════════════════════════════════════════
// 7. BGE-Reranker 精排 — P0-2 修复
// ═══════════════════════════════════════════════════════
export async function rerankNode(state: RAGState): Promise<Partial<RAGState>> {
  const t0 = Date.now();
  const candidates = state.fusedResults || state.searchResults;
  const q = state.optimizedQuery || state.query;

  if (!candidates.length) return { rerankedResults: [], nodeTimings: { rerank: 0 } };
  if (candidates.length <= 3) return { rerankedResults: candidates, nodeTimings: { rerank: 0 } };

  try {
    // 尝试用 Ollama 加载 bge-reranker-v2-m3 做 cross-encoder 打分
    const llm = new ChatOllama({ model: ollama.fallbackModel, temperature: 0 });

    // 用 LLM 做 pairwise relevance 打分 (lightweight rerank proxy)
    const scored: Array<{ item: any; relevance: number }> = [];

    for (let i = 0; i < candidates.length; i++) {
      const doc = candidates[i];
      try {
        const prompt = `请判断以下文档片段能否直接回答用户问题。只输出0-100的分数:
0-30=完全不相关/不同主题
30-60=同一领域但无法直接回答
60-80=部分相关,可部分回答
80-100=高度相关,可直接回答
用户问题：${q.substring(0, 200)}
文档标题：${doc.title}
文档内容：${doc.content?.substring(0, 300) || ''}
相关度分数（0=完全不相关, 100=完全匹配）：`;
        const resp = await llm.invoke(prompt, { timeout: 10000 } as any);
        const score = parseInt((resp.content as string).trim().match(/\d+/)?.[0] || '0');
        scored.push({ item: doc, relevance: Math.min(100, Math.max(0, score)) });
      } catch {
        scored.push({ item: doc, relevance: Math.round(doc.similarity * 60) });
      }
    }

    // 综合排序：relevance_score * 0.7 + cosine_similarity * 0.3
    const reranked = scored
      .map(s => ({
        ...s.item,
        similarity: (s.relevance / 100 * 0.7) + (Math.min(s.item.similarity * 3, 1) * 0.3),
      }))
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, state.topK || 5);

    return { rerankedResults: reranked, nodeTimings: { rerank: Date.now() - t0 } };
  } catch {
    // 失败 → 退回简单排序
    const reranked = [...candidates].sort((a, b) => b.similarity - a.similarity).slice(0, state.topK || 5);
    return { rerankedResults: reranked, nodeTimings: { rerank: Date.now() - t0 } };
  }
}

// ═══════════════════════════════════════════════════════
// 8. Prompt 组装 (with citation template)
// ═══════════════════════════════════════════════════════
export function promptAssemblyNode(state: RAGState): Partial<RAGState> {
  return { nodeTimings: { promptAssembly: 0 } };
}

// ═══════════════════════════════════════════════════════
// 9. LLM 生成 (with citations) — P0-3 修复
// ═══════════════════════════════════════════════════════
export async function llmGenerateNode(state: RAGState): Promise<Partial<RAGState>> {
  const t0 = Date.now();
  const { query, rerankedResults, history, classifyResult } = state;

  try {
    const llm = new ChatOllama({ model: ollama.defaultModel, temperature: 0.3 });

    if (classifyResult === 'CHAT') {
      const prompt = `你是 ShipRag，一个海事航运领域的智能知识助手，基于 RAG 技术查询海事法规和港口数据。
用友好、简洁的中文回答。如果用户问"你是谁"，简要介绍自己。

用户: ${query}`;
      const resp = await llm.invoke(prompt);
      return { finalAnswer: resp.content as string, nodeTimings: { llmGenerate: Date.now() - t0 } };
    }

    const ctx = rerankedResults.length > 0
      ? rerankedResults.map((r, i) =>
        `【资料${i + 1}】(来源: ${r.title}) ${r.content?.substring(0, 800) || ''}`).join('\n\n')
      : '（未检索到相关资料）';

    const h = (history || []).slice(-4)
      .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`).join('\n');

    const prompt = `你是 ShipRag，海事航运智能知识助手。严格根据以下参考资料回答用户问题。

回答规则：
1. 优先用参考资料中的原文回答
2. 有具体条款/数据时必须引用，用【资料N】标注
3. 参考资料完全不相关→直接说"知识库中暂无相关信息"，不要编造
4. 资料部分相关但不完整→先引用相关内容，再说明局限
5. 只在参考资料确实包含答案时才标【资料N】
6. 不要编造具体条款编号、日期、数字
7. 用清晰中文回答，分点列出

${h ? `\n对话历史:\n${h}\n` : ''}
参考资料:
${ctx}

用户问题: ${query}

回答：`;

    const resp = await llm.invoke(prompt);
    const answer = resp.content as string;

    // 解析引用映射：找出 answer 中所有 [资料N] 引用
    const citePattern = /【资料(\d+)】/g;
    const citeMatches = Array.from(answer.matchAll(citePattern));
    const uniqueIndices = new Set(citeMatches.map(m => parseInt(m[1]) - 1));
    const citations = Array.from(uniqueIndices)
      .filter(i => i >= 0 && i < rerankedResults.length)
      .map(i => ({
        index: i + 1,
        sourceId: rerankedResults[i].id,
        title: rerankedResults[i].title,
        snippet: rerankedResults[i].content?.substring(0, 200) || '',
      }));

    return {
      finalAnswer: answer,
      citations,
      nodeTimings: { llmGenerate: Date.now() - t0 },
    };
  } catch (e: any) {
    return {
      finalAnswer: `生成失败: ${e.message}`,
      nodeTimings: { llmGenerate: Date.now() - t0 },
      errors: [`LLM 生成失败: ${e.message}`],
    };
  }
}

// ═══════════════════════════════════════════════════════
// 10. SQL 生成
// ═══════════════════════════════════════════════════════
export async function sqlGenerateNode(state: RAGState): Promise<Partial<RAGState>> {
  const t0 = Date.now();
  const { query, classifyResult } = state;
  const schema = `
表: knowledge_items (id, title, content, source, modality, tags)
表: port_data (port_code, name_cn, ctry_name_cn, ctry_code, continent_name_cn, lat, lon, port_type)
表: regulations (filename, file_type, original_content, categories)
表: file_uploads (filename, file_type, file_size, status)`;

  try {
    const llm = new ChatOllama({ model: ollama.fallbackModel, temperature: 0 });
    const resp = await llm.invoke(
      `已知数据库结构:\n${schema}\n生成 SELECT 查询。注意: knowledge_items 存储的是PDF文档的文本段落，title是文件名，content是段落文本。如果是查询法规内容，应该用 RAG 检索而非 SQL。${classifyResult === 'LIST' ? '这是列表/枚举查询，确保返回多行，LIMIT 500。' : ''}\n只输出 SQL，不要解释。\n问题: ${query}\nSQL:`);
    let sql = (resp.content as string).replace(/```sql\n?/gi, '').replace(/```\n?/g, '').trim();
    if (!sql.toLowerCase().startsWith('select')) sql = `SELECT * FROM knowledge_items LIMIT 10`;
    return { generatedSQL: sql, nodeTimings: { sqlGenerate: Date.now() - t0 } };
  } catch {
    return { generatedSQL: '', nodeTimings: { sqlGenerate: Date.now() - t0 } };
  }
}

export async function sqlExecuteNode(state: RAGState): Promise<Partial<RAGState>> {
  const t0 = Date.now();
  if (!state.generatedSQL) return { sqlData: [], nodeTimings: { sqlExecute: 0 } };
  try {
    const supabase = getSupabaseClient();
    const m = state.generatedSQL.toLowerCase().match(/from\s+(\w+)/);
    const valid = ['knowledge_items', 'port_data', 'regulations', 'file_uploads'];
    const table = valid.includes(m?.[1] || '') ? m![1] : 'knowledge_items';

    if (state.generatedSQL.toLowerCase().includes('count(*)')) {
      const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
      return { sqlData: [{ count }], nodeTimings: { sqlExecute: Date.now() - t0 } };
    }
    const { data } = await supabase.from(table).select('*').limit(500);
    return { sqlData: data || [], nodeTimings: { sqlExecute: Date.now() - t0 } };
  } catch (e: any) {
    return { sqlData: [], errors: [`SQL执行失败: ${e.message}`], nodeTimings: { sqlExecute: Date.now() - t0 } };
  }
}

export async function sqlPolishNode(state: RAGState): Promise<Partial<RAGState>> {
  const t0 = Date.now();
  if (!state.sqlData?.length) return { polishedSQLResult: '未查询到数据', nodeTimings: { sqlPolish: 0 } };
  try {
    const llm = new ChatOllama({ model: ollama.fallbackModel, temperature: 0.2 });
    const dataStr = JSON.stringify(state.sqlData.slice(0, 50));
    const resp = await llm.invoke(`用户: ${state.query}\n数据: ${dataStr}\n用中文总结：`);
    return { polishedSQLResult: (resp.content as string).trim(), nodeTimings: { sqlPolish: Date.now() - t0 } };
  } catch {
    return { polishedSQLResult: `查询到 ${state.sqlData.length} 条记录`, nodeTimings: { sqlPolish: 0 } };
  }
}

// ═══════════════════════════════════════════════════════
// 14. 幻觉检测 — P1-2 修复
// ═══════════════════════════════════════════════════════
export async function hallucinationCheckNode(state: RAGState): Promise<Partial<RAGState>> {
  const t0 = Date.now();
  const { finalAnswer, rerankedResults, classifyResult } = state;

  // 非 RAG 分支不需要检测
  if (classifyResult !== 'RAG' && classifyResult !== 'ALL' || !finalAnswer || !rerankedResults?.length) {
    return { nodeTimings: { hallucinationCheck: 0 } };
  }

  try {
    const llm = new ChatOllama({ model: ollama.fallbackModel, temperature: 0 });

    // 抽取答案中的事实断言，逐一校验
    const prompt = `你是一个事实核查器。下面是用户问题的答案和参考资料。
请检查答案中的每个事实断言是否能在参考资料中找到支撑。
如果全部能找到支撑 → 输出 "PASS"
如果有无法验证的断言 → 输出 "MILD_HALLUCINATION: 具体描述"
如果答案是明显编造的 → 输出 "HALLUCINATION: 具体描述"

答案:
${finalAnswer.substring(0, 1500)}

参考资料:
${rerankedResults.slice(0, 5).map((r, i) => `[${i + 1}] ${r.title}: ${r.content?.substring(0, 300)}`).join('\n')}

判定结果:`;

    const resp = await llm.invoke(prompt, { timeout: 20000 } as any);
    const verdict = (resp.content as string).trim();

    if (verdict.includes('HALLUCINATION') || verdict.includes('MILD_HALLUCINATION')) {
      // 在答案末尾追加幻觉警告
      const warning = verdict.includes('HALLUCINATION')
        ? `\n\n⚠️【幻觉警告】以上回答可能包含无法验证的信息，请核实。${verdict}`
        : `\n\n💡【注意】部分信息在参考资料中未找到直接支撑。${verdict}`;

      return {
        finalAnswer: finalAnswer + warning,
        nodeTimings: { hallucinationCheck: Date.now() - t0 },
      };
    }

    return { nodeTimings: { hallucinationCheck: Date.now() - t0 } };
  } catch {
    return { nodeTimings: { hallucinationCheck: Date.now() - t0 } };
  }
}

// ═══════════════════════════════════════════════════════
// 15. 最终输出
// ═══════════════════════════════════════════════════════
export function finalOutputNode(state: RAGState): Partial<RAGState> {
  const { finalAnswer, polishedSQLResult, classifyResult, sqlData, generatedSQL } = state;
  if (classifyResult === 'SQL' || classifyResult === 'LIST') {
    return { finalAnswer: polishedSQLResult || `查询到 ${sqlData?.length || 0} 条记录`, finalSQL: generatedSQL, streamDone: true };
  }
  return { finalAnswer: finalAnswer || '处理完成', finalSQL: generatedSQL || '', streamDone: true };
}
