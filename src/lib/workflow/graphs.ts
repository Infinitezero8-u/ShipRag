/**
 * LangGraph 工作流图定义
 *
 * 预置三种工作流图：
 * 1. ragSqlDualGraph — 双分支 RAG+SQL（默认，对应原 "双分支 RAG+SQL 智能问答"）
 * 2. ragOnlyGraph — 纯 RAG 流水线
 * 3. searchOnlyGraph — 纯检索（无 LLM 生成）
 *
 * 注意：节点名称使用 "node_" 前缀以区别于 State Annotation 的同名字段
 */

import { StateGraph, END, START } from '@langchain/langgraph';
import { RAGStateAnnotation } from './state';
import {
  userInputNode,
  classifyNode,
  routeAfterClassify,
  queryRewriteNode,
  embeddingNode,
  vectorRetrievalNode,
  rerankNode,
  promptAssemblyNode,
  llmGenerateNode,
  sqlGenerateNode,
  sqlExecuteNode,
  sqlPolishNode,
  finalOutputNode,
} from './nodes';

/**
 * 双分支 RAG+SQL 智能问答图
 */
export function buildRagSqlDualGraph() {
  const graph = new StateGraph(RAGStateAnnotation)
    .addNode('node_userInput', userInputNode)
    .addNode('node_classify', classifyNode)
    .addNode('node_queryRewrite', queryRewriteNode)
    .addNode('node_embedding', embeddingNode)
    .addNode('node_vectorRetrieval', vectorRetrievalNode)
    .addNode('node_rerank', rerankNode)
    .addNode('node_promptAssembly', promptAssemblyNode)
    .addNode('node_llmGenerate', llmGenerateNode)
    .addNode('node_sqlGenerate', sqlGenerateNode)
    .addNode('node_sqlExecute', sqlExecuteNode)
    .addNode('node_sqlPolish', sqlPolishNode)
    .addNode('node_finalOutput', finalOutputNode)
    // 入口
    .addEdge(START, 'node_userInput')
    .addEdge('node_userInput', 'node_classify')
    // 条件分支
    .addConditionalEdges('node_classify', routeAfterClassify, {
      queryRewrite: 'node_queryRewrite',
      sqlGenerate: 'node_sqlGenerate',
      llmGenerate: 'node_llmGenerate',
      allBranches: 'node_queryRewrite',
    })
    // RAG 管线
    .addEdge('node_queryRewrite', 'node_embedding')
    .addEdge('node_embedding', 'node_vectorRetrieval')
    .addEdge('node_vectorRetrieval', 'node_rerank')
    .addEdge('node_rerank', 'node_promptAssembly')
    .addEdge('node_promptAssembly', 'node_llmGenerate')
    .addEdge('node_llmGenerate', 'node_finalOutput')
    // SQL 管线
    .addEdge('node_sqlGenerate', 'node_sqlExecute')
    .addEdge('node_sqlExecute', 'node_sqlPolish')
    .addEdge('node_sqlPolish', 'node_finalOutput')
    // 出口
    .addEdge('node_finalOutput', END);

  return graph.compile();
}

/**
 * 纯 RAG 流水线（无 SQL 分支）
 */
export function buildRagOnlyGraph() {
  const graph = new StateGraph(RAGStateAnnotation)
    .addNode('node_userInput', userInputNode)
    .addNode('node_queryRewrite', queryRewriteNode)
    .addNode('node_embedding', embeddingNode)
    .addNode('node_vectorRetrieval', vectorRetrievalNode)
    .addNode('node_rerank', rerankNode)
    .addNode('node_llmGenerate', llmGenerateNode)
    .addEdge(START, 'node_userInput')
    .addEdge('node_userInput', 'node_queryRewrite')
    .addEdge('node_queryRewrite', 'node_embedding')
    .addEdge('node_embedding', 'node_vectorRetrieval')
    .addEdge('node_vectorRetrieval', 'node_rerank')
    .addEdge('node_rerank', 'node_llmGenerate')
    .addEdge('node_llmGenerate', END);

  return graph.compile();
}

/**
 * 纯检索工作流（无 LLM 生成）
 */
export function buildSearchOnlyGraph() {
  const graph = new StateGraph(RAGStateAnnotation)
    .addNode('node_userInput', userInputNode)
    .addNode('node_queryRewrite', queryRewriteNode)
    .addNode('node_embedding', embeddingNode)
    .addNode('node_vectorRetrieval', vectorRetrievalNode)
    .addNode('node_rerank', rerankNode)
    .addEdge(START, 'node_userInput')
    .addEdge('node_userInput', 'node_queryRewrite')
    .addEdge('node_queryRewrite', 'node_embedding')
    .addEdge('node_embedding', 'node_vectorRetrieval')
    .addEdge('node_vectorRetrieval', 'node_rerank')
    .addEdge('node_rerank', END);

  return graph.compile();
}

/**
 * 根据工作流名称获取编译后的图
 */
export function getWorkflowGraph(name?: string) {
  switch (name) {
    case 'rag-only':
      return buildRagOnlyGraph();
    case 'search-only':
      return buildSearchOnlyGraph();
    case 'rag-sql-dual':
    case 'default-rag-sql':
    default:
      return buildRagSqlDualGraph();
  }
}
