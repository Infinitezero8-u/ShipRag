/**
 * LangGraph 工作流状态定义
 *
 * 所有节点通过共享的 RAGState 传递数据
 * LangGraph StateGraph 自动合并各节点返回的 partial state
 */
import { Annotation } from '@langchain/langgraph';

export const RAGStateAnnotation = Annotation.Root({
  // ── 输入 ──
  query: Annotation<string>({
    reducer: (_, newVal) => newVal,
    default: () => '',
  }),
  sessionId: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  history: Annotation<Array<{ role: string; content: string }>>({
    reducer: (prev, next) => next ?? prev,
    default: () => [],
  }),
  modality: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  topK: Annotation<number>({ reducer: (_, n) => n, default: () => 5 }),

  // ── 分类 ──
  classifyResult: Annotation<string>({ reducer: (_, n) => n, default: () => 'RAG' }),
  classifyRaw: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),

  // ── RAG 分支 ──
  optimizedQuery: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  embedding: Annotation<number[]>({ reducer: (_, n) => n ?? [], default: () => [] }),
  searchResults: Annotation<Array<{
    id: string;
    title: string;
    content: string;
    similarity: number;
    modality?: string;
    source?: string;
  }>>({ reducer: (prev, next) => next ?? prev, default: () => [] }),
  rerankedResults: Annotation<Array<{
    id: string;
    title: string;
    content: string;
    similarity: number;
    modality?: string;
    source?: string;
  }>>({ reducer: (prev, next) => next ?? prev, default: () => [] }),

  // ── SQL 分支 ──
  generatedSQL: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  sqlData: Annotation<any[]>({ reducer: (prev, next) => next ?? prev, default: () => [] }),
  polishedSQLResult: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),

  // ── 输出 ──
  finalAnswer: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  finalSQL: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  streamDone: Annotation<boolean>({ reducer: (_, n) => n ?? false, default: () => false }),

  // ── 元数据 ──
  nodeTimings: Annotation<Record<string, number>>({
    reducer: (prev, next) => ({ ...prev, ...next }),
    default: () => ({}),
  }),
  errors: Annotation<string[]>({
    reducer: (prev, next) => (next ? [...(prev ?? []), ...next] : prev),
    default: () => [],
  }),
});

export type RAGState = typeof RAGStateAnnotation.State;
