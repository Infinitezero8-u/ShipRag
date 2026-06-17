/**
 * LangGraph 工作流引擎
 *
 * 统一的运行时入口，负责：
 * 1. 选择/加载工作流图
 * 2. 执行状态图
 * 3. 收集日志和指标
 * 4. 流式输出（SSE）支持
 */

import { getWorkflowGraph } from './graphs';
import { RAGState } from './state';

export interface WorkflowInput {
  /** 用户查询 */
  query: string;
  /** 会话 ID，用于多轮对话上下文 */
  sessionId?: string;
  /** 对话历史 */
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  /** 工作流名称，默认 'rag-sql-dual' */
  workflow?: string;
  /** 检索数量 */
  topK?: number;
  /** 数据模态筛选 */
  modality?: string;
}

export interface WorkflowResult {
  success: boolean;
  answer: string;
  sql: string;
  route: string;
  searchResults: Array<{
    id: string;
    title: string;
    content: string;
    similarity: number;
    modality?: string;
    source?: string;
  }>;
  nodeTimings: Record<string, number>;
  errors: string[];
}

export interface StreamCallback {
  /** 发送检索结果 */
  onSearchResults?: (results: RAGState['searchResults']) => void;
  /** 流式发送生成内容片段 */
  onContent?: (chunk: string) => void;
  /** 发送 SQL */
  onSQL?: (sql: string) => void;
  /** 节点完成通知 */
  onNode?: (nodeName: string) => void;
  /** 完成 */
  onDone?: () => void;
}

/**
 * 执行工作流（非流式）
 */
export async function runWorkflow(input: WorkflowInput): Promise<WorkflowResult> {
  const graph = getWorkflowGraph(input.workflow);

  const initialState: Partial<RAGState> = {
    query: input.query,
    sessionId: input.sessionId || '',
    history: input.history || [],
    modality: input.modality || '',
    topK: input.topK || 5,
    classifyResult: 'RAG',
    searchResults: [],
    rerankedResults: [],
    sqlData: [],
    finalAnswer: '',
    errors: [],
    nodeTimings: {},
  };

  const tStart = Date.now();
  const finalState = await graph.invoke(initialState);

  const result: WorkflowResult = {
    success: !finalState.errors?.length || finalState.errors.length === 0,
    answer: finalState.finalAnswer || '',
    sql: finalState.finalSQL || '',
    route: finalState.classifyResult || 'RAG',
    searchResults: finalState.rerankedResults || finalState.searchResults || [],
    nodeTimings: finalState.nodeTimings || {},
    errors: finalState.errors || [],
  };

  // P2-3: 可观测性 — 结构化 trace 日志
  const trace = {
    timestamp: new Date().toISOString(),
    workflow: input.workflow || 'rag-sql-dual',
    query: input.query.substring(0, 200),
    route: result.route,
    totalMs: Date.now() - tStart,
    nodeTimings: result.nodeTimings,
    resultCount: result.searchResults.length,
    answerLen: result.answer.length,
    hasErrors: result.errors.length > 0,
  };
  console.log('[LangGraph trace]', JSON.stringify(trace));

  return result;
}

/**
 * 执行工作流（流式，通过回调输出）
 *
 * 架构: LangGraph 走检索管线 (classify → rewrite → embed → retrieve → rerank)
 *      然后用 ChatOllama.stream() 逐 token 输出生成阶段。
 *      这样前端能逐字看到答案，而不是等全量生成完再一次性收到。
 */
export async function runWorkflowStream(input: WorkflowInput, callbacks: StreamCallback): Promise<WorkflowResult> {
  const graph = getWorkflowGraph(input.workflow);

  const initialState: Partial<RAGState> = {
    query: input.query,
    sessionId: input.sessionId || '',
    history: input.history || [],
    modality: input.modality || '',
    topK: input.topK || 5,
    classifyResult: 'RAG',
    searchResults: [], fusedResults: [], rerankedResults: [],
    sqlData: [], finalAnswer: '', errors: [], nodeTimings: {},
  };

  // Step 1: 运行检索管线 (到 rerank 为止)
  const retrievalState = await graph.invoke(initialState);

  // 发送检索结果 + SQL
  const searchRes = retrievalState.rerankedResults || retrievalState.fusedResults || retrievalState.searchResults || [];
  if (searchRes.length > 0) {
    callbacks.onSearchResults?.(searchRes);
  }
  if (retrievalState.generatedSQL) {
    callbacks.onSQL?.(retrievalState.generatedSQL);
  }
  callbacks.onNode?.('retrieval_done');

  // Step 2: 流式 LLM 生成 (绕过 LangGraph, 直接 .stream())
  const classifyResult = retrievalState.classifyResult || 'RAG';
  let finalAnswer = '';

  try {
    const { ChatOllama } = await import('@langchain/ollama');
    const { OllamaConfig } = await import('@/lib/ollama/config');
    const cfg = new OllamaConfig();

    if (classifyResult === 'CHAT') {
      const llm = new ChatOllama({ model: cfg.defaultModel, temperature: 0.3 });
      const stream = await llm.stream(input.query);
      for await (const chunk of stream) {
        const text = typeof chunk.content === 'string' ? chunk.content : '';
        finalAnswer += text;
        callbacks.onContent?.(text);
      }
    } else if (classifyResult === 'SQL' || classifyResult === 'LIST') {
      finalAnswer = retrievalState.polishedSQLResult || retrievalState.finalAnswer || `查询到 ${(retrievalState.sqlData || []).length} 条记录`;
      // SQL 结果一次性发送（每10字分块模拟流式）
      for (let i = 0; i < finalAnswer.length; i += 10) {
        callbacks.onContent?.(finalAnswer.slice(i, i + 10));
      }
    } else {
      // RAG / ALL: 用检索到的资料生成
      const llm = new ChatOllama({ model: cfg.defaultModel, temperature: 0.3 });
      const ctx = searchRes.length > 0
        ? searchRes.map((r, i) => `【资料${i + 1}】(来源: ${r.title}) ${(r.content || '').substring(0, 800)}`).join('\n\n')
        : '（未检索到相关资料）';

      const hist = (input.history || []).slice(-4)
        .map(m => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`).join('\n');

      const prompt = `你是海事领域知识助手。根据以下参考资料回答用户问题，并用【资料N】标注每条信息的来源。

引用规则：
- 每引用一个资料，在句末标注【资料1】【资料2】等编号
- 如果是自身知识而非参考资料，标注【据我所知】
- 如果资料不足以回答问题，请诚实说明

${hist ? `对话历史:\n${hist}\n` : ''}
参考资料:
${ctx}

用户问题: ${input.query}

请用中文回答：`;

      const stream = await llm.stream(prompt);
      for await (const chunk of stream) {
        const text = typeof chunk.content === 'string' ? chunk.content : '';
        finalAnswer += text;
        callbacks.onContent?.(text);
      }
    }
  } catch (e: any) {
    finalAnswer = finalAnswer || `生成失败: ${e.message}`;
    callbacks.onContent?.(finalAnswer);
  }

  callbacks.onNode?.('llm_done');

  // Step 3: 幻觉检测 (post-hoc)
  let withCheck = finalAnswer;
  if (classifyResult !== 'CHAT' && classifyResult !== 'SQL' && classifyResult !== 'LIST' && searchRes.length > 0) {
    try {
      const { ChatOllama } = await import('@langchain/ollama');
      const { OllamaConfig } = await import('@/lib/ollama/config');
      const cfg = new OllamaConfig();
      const checker = new ChatOllama({ model: cfg.fallbackModel, temperature: 0 });

      const checkPrompt = `你是一个事实核查器。检查答案中的事实是否能在参考资料中找到支撑。
如果全部能找到支撑 → "PASS"
如果有无法验证的断言 → "MILD_HALLUCINATION: 描述"
如果答案是明显编造的 → "HALLUCINATION: 描述"

答案: ${finalAnswer.substring(0, 1500)}
参考资料: ${searchRes.slice(0, 3).map((r, i) => `[${i + 1}] ${r.content?.substring(0, 300)}`).join('\n')}
判定:`;

      const checkResp = await checker.invoke(checkPrompt, { timeout: 15000 } as any);
      const verdict = (checkResp.content as string).trim();
      if (verdict.includes('HALLUCINATION') || verdict.includes('MILD_HALLUCINATION')) {
        const warning = verdict.includes('HALLUCINATION')
          ? `\n\n⚠️【幻觉警告】以上回答可能包含无法核实的信息，请查证。`
          : `\n\n💡【注意】部分信息在参考资料中未找到直接支撑。`;
        withCheck = finalAnswer + warning;
        callbacks.onContent?.(warning);
      }
    } catch { /* harmless */ }
  }

  callbacks.onDone?.();

  return {
    success: true,
    answer: withCheck || finalAnswer,
    sql: retrievalState.generatedSQL || '',
    route: classifyResult,
    searchResults: searchRes,
    nodeTimings: retrievalState.nodeTimings || {},
    errors: retrievalState.errors || [],
  };
}

/**
 * 获取所有可用工作流列表
 */
export function getAvailableWorkflows() {
  return [
    {
      id: 'rag-sql-dual',
      name: '双分支 RAG+SQL 智能问答',
      description: '用户输入→意图分类→条件分支→RAG管线/SQL管线→输出汇总',
      nodes: [
        { type: 'chatInput', name: '用户输入' },
        { type: 'classifyLLM', name: '意图分类' },
        { type: 'branchCondition', name: '条件分支' },
        { type: 'queryRewrite', name: 'Query优化' },
        { type: 'embedding', name: '向量化' },
        { type: 'vectorRetrieval', name: '向量检索' },
        { type: 'rerank', name: '结果重排' },
        { type: 'promptAssembly', name: 'Prompt组装' },
        { type: 'llm', name: 'LLM生成' },
        { type: 'sqlGenerate', name: 'SQL生成' },
        { type: 'sqlExecute', name: 'SQL执行' },
        { type: 'sqlPolish', name: '结果润色' },
        { type: 'chatOutput', name: '输出汇总' },
      ],
      is_locked: true,
      is_active: true,
    },
    {
      id: 'rag-only',
      name: '纯 RAG 检索增强生成',
      description: '用户输入→Query优化→向量化→检索→重排→LLM生成',
      nodes: [
        { type: 'chatInput', name: '用户输入' },
        { type: 'queryRewrite', name: 'Query优化' },
        { type: 'embedding', name: '向量化' },
        { type: 'vectorRetrieval', name: '向量检索' },
        { type: 'rerank', name: '结果重排' },
        { type: 'llm', name: 'LLM生成' },
      ],
      is_locked: true,
      is_active: false,
    },
    {
      id: 'search-only',
      name: '纯检索（无生成）',
      description: '用户输入→Query优化→向量化→检索→重排→返回结果',
      nodes: [
        { type: 'chatInput', name: '用户输入' },
        { type: 'queryRewrite', name: 'Query优化' },
        { type: 'embedding', name: '向量化' },
        { type: 'vectorRetrieval', name: '向量检索' },
        { type: 'rerank', name: '结果重排' },
      ],
      is_locked: true,
      is_active: false,
    },
  ];
}
