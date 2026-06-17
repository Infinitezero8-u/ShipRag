/**
 * LangGraph 工作流图定义
 *
 * 修复后管线:
 *   RAG: classify → queryRewrite → embedding → hybridRetrieval(RRF) → rerank(BGE) → promptAssembly → llmGenerate(citations) → finalOutput
 *   SQL: sqlGenerate → sqlExecute → sqlPolish → finalOutput
 */
import { StateGraph, END, START } from '@langchain/langgraph';
import { RAGStateAnnotation } from './state';
import {
  userInputNode, classifyNode, routeAfterClassify,
  queryRewriteNode, embeddingNode,
  hybridRetrievalNode, rerankNode, // ← P0-1/P0-2 替换
  promptAssemblyNode, llmGenerateNode,
  hallucinationCheckNode, sqlGenerateNode, sqlExecuteNode,
  sqlPolishNode, finalOutputNode,
} from './nodes';

export function buildRagSqlDualGraph() {
  const g = new StateGraph(RAGStateAnnotation)
    .addNode('node_userInput', userInputNode)
    .addNode('node_classify', classifyNode)
    .addNode('node_queryRewrite', queryRewriteNode)
    .addNode('node_embedding', embeddingNode)
    .addNode('node_hybridRetrieval', hybridRetrievalNode)   // P0-1: RRF
    .addNode('node_rerank', rerankNode)                     // P0-2: BGE-Reranker
    .addNode('node_promptAssembly', promptAssemblyNode)
    .addNode('node_llmGenerate', llmGenerateNode)           // P0-3: citations
    .addNode('node_hallucinationCheck', hallucinationCheckNode)  // P1-2: hallucination check
    .addNode('node_sqlGenerate', sqlGenerateNode)
    .addNode('node_sqlExecute', sqlExecuteNode)
    .addNode('node_sqlPolish', sqlPolishNode)
    .addNode('node_finalOutput', finalOutputNode)

    .addEdge(START, 'node_userInput')
    .addEdge('node_userInput', 'node_classify')
    .addConditionalEdges('node_classify', routeAfterClassify, {
      queryRewrite: 'node_queryRewrite',
      sqlGenerate: 'node_sqlGenerate',
      llmGenerate: 'node_llmGenerate',
      allBranches: 'node_queryRewrite',
    })
    // RAG 管线 (upgraded)
    .addEdge('node_queryRewrite', 'node_embedding')
    .addEdge('node_embedding', 'node_hybridRetrieval')      // vector + keyword RRF
    .addEdge('node_hybridRetrieval', 'node_rerank')          // BGE cross-encoder
    .addEdge('node_rerank', 'node_promptAssembly')
    .addEdge('node_promptAssembly', 'node_llmGenerate')      // citations in answer
    .addEdge('node_llmGenerate', 'node_hallucinationCheck')   // P1-2: fact-check answer
    .addEdge('node_hallucinationCheck', 'node_finalOutput')
    // SQL 管线
    .addEdge('node_sqlGenerate', 'node_sqlExecute')
    .addEdge('node_sqlExecute', 'node_sqlPolish')
    .addEdge('node_sqlPolish', 'node_finalOutput')
    .addEdge('node_finalOutput', END);

  return g.compile();
}

export function buildRagOnlyGraph() {
  const g = new StateGraph(RAGStateAnnotation)
    .addNode('node_userInput', userInputNode)
    .addNode('node_queryRewrite', queryRewriteNode)
    .addNode('node_embedding', embeddingNode)
    .addNode('node_hybridRetrieval', hybridRetrievalNode)
    .addNode('node_rerank', rerankNode)
    .addNode('node_llmGenerate', llmGenerateNode)
    .addNode('node_hallucinationCheck', hallucinationCheckNode)
    .addEdge(START, 'node_userInput')
    .addEdge('node_userInput', 'node_queryRewrite')
    .addEdge('node_queryRewrite', 'node_embedding')
    .addEdge('node_embedding', 'node_hybridRetrieval')
    .addEdge('node_hybridRetrieval', 'node_rerank')
    .addEdge('node_rerank', 'node_llmGenerate')
    .addEdge('node_llmGenerate', 'node_hallucinationCheck')
    .addEdge('node_hallucinationCheck', END);
  return g.compile();
}

export function buildSearchOnlyGraph() {
  const g = new StateGraph(RAGStateAnnotation)
    .addNode('node_userInput', userInputNode)
    .addNode('node_queryRewrite', queryRewriteNode)
    .addNode('node_embedding', embeddingNode)
    .addNode('node_hybridRetrieval', hybridRetrievalNode)
    .addNode('node_rerank', rerankNode)
    .addEdge(START, 'node_userInput')
    .addEdge('node_userInput', 'node_queryRewrite')
    .addEdge('node_queryRewrite', 'node_embedding')
    .addEdge('node_embedding', 'node_hybridRetrieval')
    .addEdge('node_hybridRetrieval', 'node_rerank')
    .addEdge('node_rerank', END);
  return g.compile();
}

export function getWorkflowGraph(name?: string) {
  switch (name) {
    case 'rag-only': return buildRagOnlyGraph();
    case 'search-only': return buildSearchOnlyGraph();
    default: return buildRagSqlDualGraph();
  }
}
