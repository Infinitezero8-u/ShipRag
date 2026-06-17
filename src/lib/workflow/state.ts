/**
 * LangGraph 工作流状态定义
 */
import { Annotation } from '@langchain/langgraph';

export const RAGStateAnnotation = Annotation.Root({
  // ── 输入 ──
  query: Annotation<string>({ reducer: (_, newVal) => newVal, default: () => '' }),
  sessionId: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  history: Annotation<Array<{ role: string; content: string }>>({ reducer: (prev, next) => next ?? prev, default: () => [] }),
  modality: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  topK: Annotation<number>({ reducer: (_, n) => n, default: () => 5 }),

  // ── 分类 ──
  classifyResult: Annotation<string>({ reducer: (_, n) => n, default: () => 'RAG' }),
  classifyRaw: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),

  // ── RAG 分支 ──
  optimizedQuery: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  embedding: Annotation<number[]>({ reducer: (_, n) => n ?? [], default: () => [] }),

  // -- 混合检索：向量结果 --
  searchResults: Annotation<Array<{
    id: string; title: string; content: string; similarity: number;
    modality?: string; source?: string; retrievalMethod?: string;
  }>>({ reducer: (prev, next) => next ?? prev, default: () => [] }),

  // -- 混合检索：关键词结果（RRF 融合前暂存） --
  keywordResults: Annotation<Array<{
    id: string; title: string; content: string; similarity: number;
    modality?: string; source?: string;
  }>>({ reducer: (prev, next) => next ?? prev, default: () => [] }),

  // -- RRF 融合后的结果 --
  fusedResults: Annotation<Array<{
    id: string; title: string; content: string; similarity: number;
    modality?: string; source?: string; retrievalMethod?: string;
  }>>({ reducer: (prev, next) => next ?? prev, default: () => [] }),

  // -- Reranker 精排后 --
  rerankedResults: Annotation<Array<{
    id: string; title: string; content: string; similarity: number;
    modality?: string; source?: string;
  }>>({ reducer: (prev, next) => next ?? prev, default: () => [] }),

  // -- 引用溯源（LLM 生成后解析出的引用映射） --
  citations: Annotation<Array<{ index: number; sourceId: string; title: string; snippet: string }>>({
    reducer: (prev, next) => next ?? prev, default: () => [],
  }),

  // ── SQL 分支 ──
  generatedSQL: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  sqlData: Annotation<any[]>({ reducer: (prev, next) => next ?? prev, default: () => [] }),
  polishedSQLResult: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),

  // ── 输出 ──
  finalAnswer: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  finalSQL: Annotation<string>({ reducer: (_, n) => n, default: () => '' }),
  streamDone: Annotation<boolean>({ reducer: (_, n) => n ?? false, default: () => false }),

  // ── 元数据 ──
  nodeTimings: Annotation<Record<string, number>>({ reducer: (prev, next) => ({ ...prev, ...next }), default: () => ({}) }),
  errors: Annotation<string[]>({ reducer: (prev, next) => (next ? [...(prev??[]), ...next] : prev), default: () => [] }),
});

export type RAGState = typeof RAGStateAnnotation.State;
