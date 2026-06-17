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
      const prompt = `你是 ShipRag，一个海事航运领域的智能知识助手。你运行在本地，基于 RAG 检索增强生成技术，可以查询海事法规、船舶数据、港口信息等专业知识。

用友好、简洁的中文回答用户的问题。如果用户问"你是谁"，简要介绍自己。

用户: ${input.query}`;
      const stream = await llm.stream(prompt);
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

      const prompt = `你是 ShipRag，海事航运领域智能知识助手。请严格根据以下参考资料回答用户问题。

回答规则：
1. 优先使用参考资料中的原文或直接相关的段落来回答
2. 如果参考资料中有具体条款/数据/定义——必须引用，用【资料N】标注(如"根据【资料1】…")
3. 如果参考资料完全不相关——直接说"知识库中暂无相关信息"，不要编造
4. 如果参考资料部分相关但不完整——先引用相关内容，再说明局限
5. 只在参考资料确实包含答案时才标注【资料N】，不要乱标注
6. 不要编造具体的条款编号、日期、数字——如果资料里没有就别说
7. 用清晰的中文回答，分点列出时用数字编号

${hist ? `\n对话历史:\n${hist}\n` : ''}
参考资料:
${ctx}

用户问题: ${input.query}

回答：`;

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

      const checkPrompt = `严格核查：答案中的具体事实(法规条款号/日期/数字/人名/地名)是否能在参考资料中找到？
如果答案只是常识概述(如"违反规定可能被处罚")→ PASS
如果答案引用了参考资料中确实存在的具体信息→ PASS
如果答案编造了参考资料中不存在的具体条款号/数字/事实→ HALLUCINATION
如果答案标注了【据我所知】但内容其实是通用常识→ PASS

答案: ${finalAnswer.substring(0, 1500)}
参考资料: ${searchRes.slice(0, 3).map((r, i) => `[${i + 1}] ${r.content?.substring(0, 300)}`).join('\n')}
判定(PASS/HALLUCINATION/MILD_HALLUCINATION):`;

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
