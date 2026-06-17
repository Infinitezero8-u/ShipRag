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
    searchResults: [],
    rerankedResults: [],
    sqlData: [],
    finalAnswer: '',
    errors: [],
    nodeTimings: {},
  };

  let lastAnswer = '';
  let lastSQL = '';
  let lastSearchResults: any[] = [];

  // 使用 stream 模式获取事件
  const stream = await graph.stream(initialState, {
    streamMode: 'updates' as any,
  });

  for await (const chunk of stream) {
    const updates = chunk as Record<string, Partial<RAGState>>;

    for (const [nodeName, nodeState] of Object.entries(updates)) {
      callbacks.onNode?.(nodeName);

      // 检索结果更新
      if (nodeState.searchResults && nodeState.searchResults.length > lastSearchResults.length) {
        lastSearchResults = nodeState.searchResults;
        callbacks.onSearchResults?.(nodeState.searchResults);
      }

      if (nodeState.rerankedResults && nodeState.rerankedResults.length > lastSearchResults.length) {
        lastSearchResults = nodeState.rerankedResults;
        callbacks.onSearchResults?.(nodeState.rerankedResults);
      }

      // SQL 更新
      if (nodeState.generatedSQL && nodeState.generatedSQL !== lastSQL) {
        lastSQL = nodeState.generatedSQL;
        callbacks.onSQL?.(lastSQL);
      }

      // 答案流式
      if (nodeState.finalAnswer && nodeState.finalAnswer !== lastAnswer) {
        const newChunk = nodeState.finalAnswer.slice(lastAnswer.length);
        if (newChunk) {
          callbacks.onContent?.(newChunk);
        }
        lastAnswer = nodeState.finalAnswer;
      }
    }
  }

  callbacks.onDone?.();

  return {
    success: true,
    answer: lastAnswer || '',
    sql: lastSQL || '',
    route: 'RAG',
    searchResults: lastSearchResults,
    nodeTimings: {},
    errors: [],
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
