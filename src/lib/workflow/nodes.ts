/**
 * LangGraph 工作流节点实现
 *
 * 每个节点是一个 async function，接收完整 State，返回 partial State。
 * LangGraph 自动将返回值合并到全局 State 中。
 */
import { RAGState } from './state';
import { ChatOllama } from '@langchain/ollama';
import { OllamaEmbeddings } from '@langchain/ollama';
import { getSupabaseClient } from '@/storage/database/local-db';
import { OllamaConfig } from '@/lib/ollama/config';

// 使用项目统一的模型配置
const ollamaConfig = new OllamaConfig();

// ─── 工具函数 ───
function tic(nodeName: string, state: RAGState) {
  return { nodeTimings: { [`${nodeName}_start`]: Date.now() } };
}
function toc(nodeName: string, state: RAGState) {
  const start = state.nodeTimings?.[`${nodeName}_start`] ?? Date.now();
  return { nodeTimings: { [nodeName]: Date.now() - start } };
}

// ─── 1. 用户输入节点 ───
export async function userInputNode(state: RAGState): Promise<Partial<RAGState>> {
  const query = state.query?.trim();
  if (!query) {
    return { errors: ['用户输入为空'] };
  }
  return { query };
}

// ─── 2. 分类节点 ───
export async function classifyNode(state: RAGState): Promise<Partial<RAGState>> {
  const start = Date.now();
  const { query } = state;

  // 快速关键词匹配 — 比 LLM 快且免费
  const lowerQuery = query.toLowerCase();

  // CHAT 优先
  const chatPatterns = /^(你好|谢谢|再见|帮助|help|早上好|下午好|晚上好|hello|hi|thanks|bye)/i;
  if (chatPatterns.test(query.trim())) {
    return { classifyResult: 'CHAT', classifyRaw: 'KEYWORD_CHAT', nodeTimings: { classify: Date.now() - start } };
  }

  // LIST 关键词
  const listPatterns = /有哪些|哪些|列出|清单|目录|列表|全部|一览|所有|多少个|有几个/;
  const portOrReg = /港口|港|规章|法规|条例|制度|航线/;
  if (listPatterns.test(query) && portOrReg.test(query)) {
    return { classifyResult: 'LIST', classifyRaw: 'KEYWORD_LIST', nodeTimings: { classify: Date.now() - start } };
  }

  // SQL 关键词
  const sqlPatterns = /一共|总共|总计|合计|统计|多少个|有几个|数量|按.*分|最大|最小|最多|最少/;
  if (sqlPatterns.test(query)) {
    return { classifyResult: 'SQL', classifyRaw: 'KEYWORD_SQL', nodeTimings: { classify: Date.now() - start } };
  }

  // 默认 → LLM 分类
  try {
    const llm = new ChatOllama({ model: ollamaConfig.fallbackModel, temperature: 0 });
    const prompt = `你是意图判断专家，分析用户问题，仅输出一个标签：
LIST — 需要完整列表/清单/所有 (如"美国港口有哪些")
SQL — 需要统计/计数/汇总 (如"一共多少个港口")
ALL — 同时需要文档+统计 (如"上海港的吞吐量和规章制度")
RAG — 需要文档/规则/说明 (如"SOLAS公约怎么说")
CHAT — 纯闲聊/帮助 (如"你好")
用户问题: ${query}
标签:`;
    const resp = await llm.invoke(prompt);
    const raw = (resp.content as string).trim().toUpperCase();

    let route = 'RAG';
    if (raw.includes('CHAT')) route = 'CHAT';
    else if (raw.includes('LIST')) route = 'LIST';
    else if (raw.includes('ALL')) route = 'ALL';
    else if (raw.includes('SQL')) route = 'SQL';

    return { classifyResult: route, classifyRaw: raw, nodeTimings: { classify: Date.now() - start } };
  } catch {
    return { classifyResult: 'RAG', classifyRaw: 'FALLBACK', nodeTimings: { classify: Date.now() - start } };
  }
}

// ─── 3. 分支路由函数（LangGraph conditional edge） ───
export function routeAfterClassify(state: RAGState): string {
  const result = state.classifyResult;
  if (result === 'CHAT') return 'llmGenerate';
  if (result === 'SQL' || result === 'LIST') return 'sqlGenerate';
  if (result === 'ALL') return 'allBranches';
  return 'queryRewrite'; // RAG
}

// ─── 4. Query 改写节点 ───
export async function queryRewriteNode(state: RAGState): Promise<Partial<RAGState>> {
  const start = Date.now();
  const { query, history } = state;

  // 如果无历史上下文，不需要改写
  if (!history || history.length === 0) {
    return { optimizedQuery: query, nodeTimings: { queryRewrite: 0 } };
  }

  try {
    const llm = new ChatOllama({ model: ollamaConfig.fallbackModel, temperature: 0.1 });
    const historyStr = history.slice(-6).map(h => `${h.role}: ${h.content}`).join('\n');
    const prompt = `根据对话历史重写用户问题，使其独立可理解。
历史:
${historyStr}
当前问题: ${query}
重写后问题（仅输出问题文本）:`;
    const resp = await llm.invoke(prompt);
    return {
      optimizedQuery: (resp.content as string).trim() || query,
      nodeTimings: { queryRewrite: Date.now() - start },
    };
  } catch {
    return { optimizedQuery: query, nodeTimings: { queryRewrite: Date.now() - start } };
  }
}

// ─── 5. 向量化节点 ───
export async function embeddingNode(state: RAGState): Promise<Partial<RAGState>> {
  const start = Date.now();
  try {
    const emb = new OllamaEmbeddings({ model: ollamaConfig.embeddingModel });
    const vectors = await emb.embedQuery(state.optimizedQuery || state.query);
    return { embedding: vectors, nodeTimings: { embedding: Date.now() - start } };
  } catch {
    return { errors: ['向量化失败'], nodeTimings: { embedding: Date.now() - start } };
  }
}

// ─── 6. 向量检索节点 ───
export async function vectorRetrievalNode(state: RAGState): Promise<Partial<RAGState>> {
  const start = Date.now();
  const { optimizedQuery, query, embedding, topK } = state;

  try {
    const supabase = getSupabaseClient();
    const searchQuery = optimizedQuery || query;

    // pgvector 余弦相似度检索
    const { data: vectorResults, error } = await supabase.rpc('match_knowledge_items', {
      query_embedding: embedding,
      match_threshold: 0.3,
      match_count: topK || 10,
    });

    let results = (vectorResults || []).map((r: any) => ({
      id: r.id,
      title: r.title || '',
      content: r.content || '',
      similarity: r.similarity || 0,
      modality: r.modality,
      source: r.source,
    }));

    // BM25 关键词兜底
    if (results.length < 3) {
      const { data: keywordResults } = await supabase
        .from('knowledge_items')
        .select('id, title, content, modality, source')
        .or(`title.ilike.%${searchQuery}%,content.ilike.%${searchQuery}%`)
        .limit(5);

      const existingIds = new Set(results.map((r: any) => r.id));
      const keyRes = (keywordResults || [])
        .filter((r: any) => !existingIds.has(r.id))
        .map((r: any) => ({ ...r, similarity: 0.5 }));
      results = [...results, ...keyRes];
    }

    return {
      searchResults: results,
      nodeTimings: { vectorRetrieval: Date.now() - start },
    };
  } catch (e: any) {
    return {
      searchResults: [],
      nodeTimings: { vectorRetrieval: Date.now() - start },
      errors: [`检索失败: ${e.message}`],
    };
  }
}

// ─── 7. 结果重排节点 ───
export async function rerankNode(state: RAGState): Promise<Partial<RAGState>> {
  const start = Date.now();
  const { searchResults } = state;

  if (searchResults.length <= 5) {
    return { rerankedResults: searchResults, nodeTimings: { rerank: 0 } };
  }

  // 简单重排策略：按相似度降序 + 去重 + 截断
  const seen = new Set<string>();
  const deduped = searchResults.filter((r: any) => {
    const key = r.title + r.content.substring(0, 50);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const reranked = deduped
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 5);

  return { rerankedResults: reranked, nodeTimings: { rerank: Date.now() - start } };
}

// ─── 8. Prompt 组装节点 ───
export function promptAssemblyNode(state: RAGState): Partial<RAGState> {
  const { query, rerankedResults, history } = state;

  const context = rerankedResults
    .map((r, i) => `【资料${i + 1}】${r.title}\n${r.content}`)
    .join('\n\n');

  const historyStr = (history || [])
    .slice(-6)
    .map(h => `${h.role === 'user' ? '用户' : '助手'}: ${h.content}`)
    .join('\n');

  return {
    finalAnswer: '', // will be filled by llmGenerate
    nodeTimings: { promptAssembly: 0 },
  };
}

// ─── 9. LLM 生成节点 ───
export async function llmGenerateNode(state: RAGState): Promise<Partial<RAGState>> {
  const start = Date.now();
  const { query, rerankedResults, history, classifyResult } = state;

  try {
    const llm = new ChatOllama({ model: ollamaConfig.defaultModel, temperature: 0.3 });

    if (classifyResult === 'CHAT') {
      const resp = await llm.invoke(query);
      return {
        finalAnswer: resp.content as string,
        nodeTimings: { llmGenerate: Date.now() - start },
      };
    }

    const context = rerankedResults.length > 0
      ? rerankedResults.map((r, i) => `【资料${i + 1}】${r.title}\n${r.content}\n(相似度: ${r.similarity.toFixed(2)})`).join('\n\n')
      : '（未检索到相关资料）';

    const historyStr = (history || []).slice(-4)
      .map(h => `${h.role === 'user' ? '用户' : '助手'}: ${h.content}`).join('\n');

    const prompt = `你是海事领域知识助手。请根据以下参考资料回答用户问题。
${historyStr ? `\n对话历史:\n${historyStr}\n` : ''}
参考资料:
${context}

用户问题: ${query}

请用中文回答。如参考资料不足以回答问题，请诚实说明。`;

    const resp = await llm.invoke(prompt);
    return {
      finalAnswer: resp.content as string,
      nodeTimings: { llmGenerate: Date.now() - start },
    };
  } catch (e: any) {
    return {
      finalAnswer: `生成失败: ${e.message}`,
      nodeTimings: { llmGenerate: Date.now() - start },
      errors: [`LLM 生成失败: ${e.message}`],
    };
  }
}

// ─── 10. SQL 生成节点 ───
export async function sqlGenerateNode(state: RAGState): Promise<Partial<RAGState>> {
  const start = Date.now();
  const { query, classifyResult } = state;

  const schemaStr = `
表: knowledge_items (id, title, content, source, modality, tags)
表: port_data (port_code, name_cn, ctry_name_cn, ctry_code, continent_name_cn, lat, lon, port_type)
表: regulations (filename, file_type, original_content, categories)
表: file_uploads (filename, file_type, file_size, status)
`;

  try {
    const llm = new ChatOllama({ model: ollamaConfig.fallbackModel, temperature: 0 });
    const prompt = `已知数据库结构:\n${schemaStr}
生成一个 SELECT 查询来回答以下问题。只输出 SQL，不要解释。
如果是 LIST 类问题（列举/清单），使用 SELECT ... LIMIT 500。
如果是 SQL 类问题（统计/计数），使用 SELECT COUNT(*) 等聚合函数。
${classifyResult === 'LIST' ? '这是列表查询，确保返回多行结果。' : ''}
问题: ${query}
SQL:`;

    const resp = await llm.invoke(prompt);
    let sql = (resp.content as string)
      .replace(/```sql\n?/gi, '').replace(/```\n?/g, '').trim();
    if (!sql.toLowerCase().startsWith('select')) {
      sql = `SELECT * FROM knowledge_items LIMIT 10`;
    }
    return { generatedSQL: sql, nodeTimings: { sqlGenerate: Date.now() - start } };
  } catch {
    return { generatedSQL: '', nodeTimings: { sqlGenerate: Date.now() - start } };
  }
}

// ─── 11. SQL 执行节点 ───
export async function sqlExecuteNode(state: RAGState): Promise<Partial<RAGState>> {
  const start = Date.now();
  const { generatedSQL } = state;
  if (!generatedSQL) return { sqlData: [], nodeTimings: { sqlExecute: 0 } };

  try {
    const supabase = getSupabaseClient();
    const m = generatedSQL.toLowerCase().match(/from\s+(\w+)/);
    const validTables = ['knowledge_items', 'port_data', 'regulations', 'file_uploads'];
    const table = validTables.includes(m?.[1] || '') ? m![1] : 'knowledge_items';

    if (generatedSQL.toLowerCase().includes('count(*)')) {
      const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
      return { sqlData: [{ count }], nodeTimings: { sqlExecute: Date.now() - start } };
    }

    // 解析简单 WHERE 条件
    const eqMatches = generatedSQL.matchAll(/WHERE\s+(\w+)\s*=\s*'([^']+)'/gi);
    let query = supabase.from(table).select('*').limit(500);
    for (const m of eqMatches) {
      query = query.eq(m[1], m[2]);
    }
    const { data } = await query;
    return { sqlData: data || [], nodeTimings: { sqlExecute: Date.now() - start } };
  } catch (e: any) {
    return { sqlData: [], errors: [`SQL 执行失败: ${e.message}`], nodeTimings: { sqlExecute: Date.now() - start } };
  }
}

// ─── 12. SQL 结果润色节点 ───
export async function sqlPolishNode(state: RAGState): Promise<Partial<RAGState>> {
  const start = Date.now();
  const { query, sqlData } = state;
  if (!sqlData || sqlData.length === 0) {
    return { polishedSQLResult: '未查询到数据', nodeTimings: { sqlPolish: 0 } };
  }

  try {
    const llm = new ChatOllama({ model: ollamaConfig.fallbackModel, temperature: 0.2 });
    const dataStr = JSON.stringify(sqlData.slice(0, 50));
    const prompt = `用户问题: ${query}
查询结果: ${dataStr}
请用中文简要总结查询结果。如果结果是列表，列出关键项目。`;

    const resp = await llm.invoke(prompt);
    return {
      polishedSQLResult: (resp.content as string).trim(),
      nodeTimings: { sqlPolish: Date.now() - start },
    };
  } catch {
    const count = sqlData.length;
    return {
      polishedSQLResult: `查询到 ${count} 条记录`,
      nodeTimings: { sqlPolish: 0 },
    };
  }
}

// ─── 13. 最终输出节点 ───
export function finalOutputNode(state: RAGState): Partial<RAGState> {
  const { finalAnswer, polishedSQLResult, classifyResult, sqlData, generatedSQL } = state;

  if (classifyResult === 'SQL' || classifyResult === 'LIST') {
    return {
      finalAnswer: polishedSQLResult || `查询到 ${sqlData?.length || 0} 条记录`,
      finalSQL: generatedSQL,
      streamDone: true,
    };
  }

  return {
    finalAnswer: finalAnswer || '处理完成',
    finalSQL: generatedSQL || '',
    streamDone: true,
  };
}
