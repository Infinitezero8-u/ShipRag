/**
 * LangGraph 工作流引擎 — 统一运行时入口
 *
 * 架构: 非流式走 full graph.invoke()
 *      流式走 检索管线(invoke) + ChatOllama.stream() token-by-token
 */

import { getWorkflowGraph } from './graphs';
import { RAGState } from './state';

export interface WorkflowInput {
  query: string; sessionId?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  workflow?: string; topK?: number; modality?: string;
}

export interface WorkflowResult {
  success: boolean; answer: string; sql: string; route: string;
  searchResults: Array<{ id: string; title: string; content: string; similarity: number; modality?: string; source?: string }>;
  nodeTimings: Record<string, number>; errors: string[];
}

export interface StreamCallback {
  onSearchResults?: (r: RAGState['searchResults']) => void;
  onContent?: (chunk: string) => void;
  onSQL?: (sql: string) => void;
  onNode?: (name: string) => void;
  onDone?: () => void;
}

/** 非流式 — 完整管线执行 */
export async function runWorkflow(input: WorkflowInput): Promise<WorkflowResult> {
  const graph = getWorkflowGraph(input.workflow);
  const tStart = Date.now();
  const finalState = await graph.invoke({
    query: input.query, sessionId: input.sessionId || '',
    history: input.history || [], modality: input.modality || '', topK: input.topK || 5,
    classifyResult: 'RAG', searchResults: [], fusedResults: [], rerankedResults: [],
    sqlData: [], finalAnswer: '', errors: [], nodeTimings: {},
  } as Partial<RAGState>);

  const result: WorkflowResult = {
    success: !finalState.errors?.length,
    answer: finalState.finalAnswer || '', sql: finalState.finalSQL || '',
    route: finalState.classifyResult || 'RAG',
    searchResults: finalState.rerankedResults || finalState.searchResults || [],
    nodeTimings: finalState.nodeTimings || {}, errors: finalState.errors || [],
  };

  console.log('[LangGraph trace]', JSON.stringify({
    timestamp: new Date().toISOString(), workflow: input.workflow || 'rag-sql-dual',
    query: input.query.substring(0, 200), route: result.route, totalMs: Date.now() - tStart,
    nodeTimings: result.nodeTimings, resultCount: result.searchResults.length,
    answerLen: result.answer.length, hasErrors: result.errors.length > 0,
  }));
  return result;
}

/** 流式 — 检索管线(invoke) + 流式生成(.stream()) */
export async function runWorkflowStream(input: WorkflowInput, callbacks: StreamCallback): Promise<WorkflowResult> {
  const graph = getWorkflowGraph(input.workflow);

  // Step 1: 检索管线
  const retrievalState = await graph.invoke({
    query: input.query, sessionId: input.sessionId || '',
    history: input.history || [], modality: input.modality || '', topK: input.topK || 5,
    classifyResult: 'RAG', searchResults: [], fusedResults: [], rerankedResults: [],
    sqlData: [], finalAnswer: '', errors: [], nodeTimings: {},
  } as Partial<RAGState>);

  const classifyResult = retrievalState.classifyResult || 'RAG';
  const searchRes = retrievalState.rerankedResults || retrievalState.fusedResults || retrievalState.searchResults || [];
  if (searchRes.length > 0) callbacks.onSearchResults?.(searchRes);
  if (retrievalState.generatedSQL) callbacks.onSQL?.(retrievalState.generatedSQL);
  callbacks.onNode?.('retrieval_done');

  // Step 2: 流式生成
  let finalAnswer = '';
  try {
    const { ChatOllama } = await import('@langchain/ollama');
    const { OllamaConfig } = await import('@/lib/ollama/config');
    const cfg = new OllamaConfig();

    if (classifyResult === 'CHAT') {
      const llm = new ChatOllama({ model: cfg.defaultModel, temperature: 0.3 });
      const stream = await llm.stream(
        `你是ShipRag,海事航运智能知识助手,基于RAG技术查询法规和港口数据。友好简洁回答。\n\n用户: ${input.query}`
      );
      for await (const c of stream) { const t = (c.content as string) || ''; finalAnswer += t; callbacks.onContent?.(t); }
    } else if (classifyResult === 'SQL' || classifyResult === 'LIST') {
      finalAnswer = retrievalState.polishedSQLResult || retrievalState.finalAnswer || `查询到 ${(retrievalState.sqlData || []).length} 条`;
      for (let i = 0; i < finalAnswer.length; i += 10) callbacks.onContent?.(finalAnswer.slice(i, i + 10));
    } else {
      const llm = new ChatOllama({ model: cfg.defaultModel, temperature: 0.3 });
      const ctx = searchRes.length > 0
        ? searchRes.map((r, i) => `【资料${i + 1}】(来源:${r.title}) ${(r.content || '').substring(0, 800)}`).join('\n\n')
        : '（未检索到相关资料）';
      const hist = (input.history || []).slice(-4)
        .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`).join('\n');

      const stream = await llm.stream(
        `你是ShipRag,海事航运智能知识助手。严格根据参考资料回答。\n规则:优先用原文,有条款时引用【资料N】,不编造数据。\n${hist ? `\n历史:\n${hist}\n` : ''}\n参考资料:\n${ctx}\n\n用户: ${input.query}\n\n回答:`
      );
      for await (const c of stream) { const t = (c.content as string) || ''; finalAnswer += t; callbacks.onContent?.(t); }
    }
  } catch (e: any) { finalAnswer = finalAnswer || `生成失败:${e.message}`; callbacks.onContent?.(finalAnswer); }

  callbacks.onNode?.('llm_done');
  callbacks.onDone?.();
  return { success: true, answer: finalAnswer, sql: retrievalState.generatedSQL || '', route: classifyResult, searchResults: searchRes, nodeTimings: retrievalState.nodeTimings || {}, errors: retrievalState.errors || [] };
}

/** 可用工作流列表 */
export function getAvailableWorkflows() {
  return [
    { id: 'rag-sql-dual', name: '双分支RAG+SQL智能问答', description: '意图分类→条件分支→RAG/SQL→输出', nodes: [
      { type: 'chatInput', name: '用户输入' },{ type: 'classifyLLM', name: '意图分类' },{ type: 'branchCondition', name: '条件分支' },
      { type: 'queryRewrite', name: 'Query优化' },{ type: 'embedding', name: '向量化' },{ type: 'vectorRetrieval', name: '混合检索(RRF)' },
      { type: 'rerank', name: '结果精排' },{ type: 'promptAssembly', name: 'Prompt组装' },{ type: 'llm', name: 'LLM生成(ShipRag身份+引用)' },
      { type: 'sqlGenerate', name: 'SQL生成(表路由)' },{ type: 'sqlExecute', name: 'SQL执行(WHERE解析)' },
      { type: 'sqlPolish', name: '结果润色(港口格式化)' },{ type: 'chatOutput', name: '输出汇总' },
    ], is_locked: true, is_active: true },
    { id: 'rag-only', name: '纯RAG检索增强生成', description: 'Query优化→向量化→混合检索→精排→生成', nodes: [
      { type: 'chatInput', name: '用户输入' },{ type: 'queryRewrite', name: 'Query优化' },{ type: 'embedding', name: '向量化' },
      { type: 'vectorRetrieval', name: '混合检索(RRF)' },{ type: 'rerank', name: '结果精排' },{ type: 'llm', name: 'LLM生成' },
    ], is_locked: true, is_active: false },
    { id: 'search-only', name: '纯检索(无生成)', description: 'Query优化→向量化→混合检索→精排', nodes: [
      { type: 'chatInput', name: '用户输入' },{ type: 'queryRewrite', name: 'Query优化' },{ type: 'embedding', name: '向量化' },
      { type: 'vectorRetrieval', name: '混合检索(RRF)' },{ type: 'rerank', name: '结果精排' },
    ], is_locked: true, is_active: false },
  ];
}
