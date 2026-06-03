/**
 * 对话流执行引擎 - Coze对话流架构
 * 5类节点：开始节点、AI能力节点、逻辑控制节点、数据&工具节点、子流程&资源节点
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import { LLMClient, EmbeddingClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

// ============ 类型定义 ============

export interface FlowConfig {
  globalConfig: {
    contextMaxChars: number;
    compressionRatio: number;
    vectorTopN: number;
    sqlMaxRows: number;
    enableQueryRewrite: boolean;
    rewriteExcludePatterns: string[];
  };
  nodes: Record<string, NodeConfig>;
  edges: EdgeConfig[];
}

export interface NodeConfig {
  type: 'start' | 'ai' | 'logic' | 'data' | 'tool' | 'subflow';
  name: string;
  [key: string]: any;
}

export interface EdgeConfig {
  from: string;
  to: string;
  condition?: string;
  route?: string;
}

export interface ExecutionContext {
  sessionId: string;
  userQuery: string;
  context: string;
  messages: Array<{ role: string; content: string }>;
  rewrittenQuery?: string;
  intent?: 'SKILL' | 'VECTOR' | 'SQL' | 'CHAT';
  sqlResult?: any;
  vectorResult?: any;
  skillResult?: any;
  summary?: string;
  metadata: Record<string, any>;
}

export interface NodeResult {
  success: boolean;
  output?: any;
  error?: string;
  nextNode?: string;
  durationMs?: number;
}

// ============ 1. 开始节点处理器 ============

export async function processStartNode(
  context: ExecutionContext,
  nodeConfig: NodeConfig,
  flowConfig: FlowConfig
): Promise<NodeResult> {
  const startTime = Date.now();
  
  try {
    const supabase = getSupabaseClient();
    
    // 按 session_id 读取历史上下文
    const { data: contextData } = await supabase
      .from('conversation_contexts')
      .select('*')
      .eq('session_id', context.sessionId)
      .single();
    
    let historyContext = '';
    let messages: Array<{ role: string; content: string }> = [];
    
    if (contextData) {
      messages = (contextData.messages as Array<{ role: string; content: string }>) || [];
      
      // 如果有压缩摘要，先添加摘要
      if (contextData.summary) {
        historyContext += `[历史摘要]\n${contextData.summary}\n\n`;
      }
      
      // 添加最近的对话
      if (messages.length > 0) {
        historyContext += '[最近对话]\n';
        for (const msg of messages) {
          historyContext += `${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content}\n`;
        }
      }
    }
    
    // 拼接原始用户提问
    const fullContext = historyContext 
      ? `${historyContext}\n[当前问题]\n${context.userQuery}`
      : context.userQuery;
    
    return {
      success: true,
      output: {
        context: fullContext,
        query: context.userQuery,
        messages,
        historyLength: fullContext.length
      },
      nextNode: 'queryRewrite',
      durationMs: Date.now() - startTime
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      durationMs: Date.now() - startTime
    };
  }
}

// ============ 2. AI能力节点处理器 ============

export async function processAINode(
  context: ExecutionContext,
  nodeConfig: NodeConfig,
  flowConfig: FlowConfig,
  headers?: Headers
): Promise<NodeResult> {
  const startTime = Date.now();
  
  try {
    const customHeaders = headers ? HeaderUtils.extractForwardHeaders(headers) : {};
    const llmClient = new LLMClient(new Config(), customHeaders);
    
    // 问题改写节点
    if (nodeConfig.name === '问题改写') {
      // 检查是否需要改写
      if (!flowConfig.globalConfig.enableQueryRewrite) {
        return {
          success: true,
          output: { rewrittenQuery: context.userQuery },
          nextNode: 'contextCheck',
          durationMs: Date.now() - startTime
        };
      }
      
      // 检查排除模式
      const query = context.userQuery.toLowerCase();
      const shouldSkip = flowConfig.globalConfig.rewriteExcludePatterns.some(
        p => query.includes(p.toLowerCase())
      );
      
      if (shouldSkip) {
        return {
          success: true,
          output: { rewrittenQuery: context.userQuery },
          nextNode: 'contextCheck',
          durationMs: Date.now() - startTime
        };
      }
      
      // 执行问题改写
      const prompt = nodeConfig.promptTemplate
        .replace('{context}', context.context || '')
        .replace('{query}', context.userQuery);
      
      const response = await llmClient.invoke(
        [{ role: 'user', content: prompt }],
        { model: nodeConfig.model || 'doubao-seed-2-0-lite-260215', temperature: nodeConfig.temperature || 0 }
      );
      
      const rewrittenQuery = response.content?.trim() || context.userQuery;
      
      return {
        success: true,
        output: { rewrittenQuery },
        nextNode: 'contextCheck',
        durationMs: Date.now() - startTime
      };
    }
    
    // 上下文摘要节点
    if (nodeConfig.name === '上下文摘要') {
      const prompt = nodeConfig.promptTemplate
        .replace('{context}', context.context);
      
      const response = await llmClient.invoke(
        [{ role: 'user', content: prompt }],
        { model: nodeConfig.model || 'doubao-seed-2-0-lite-260215', temperature: nodeConfig.temperature || 0.1 }
      );
      
      const summary = response.content?.trim() || '';
      
      return {
        success: true,
        output: { summary },
        nextNode: 'intentClassify',
        durationMs: Date.now() - startTime
      };
    }
    
    // 意图分类节点
    if (nodeConfig.name === '意图分类') {
      const query = context.rewrittenQuery || context.userQuery;
      const prompt = nodeConfig.promptTemplate.replace('{query}', query);
      
      const response = await llmClient.invoke(
        [{ role: 'user', content: prompt }],
        { model: nodeConfig.model || 'doubao-seed-2-0-lite-260215', temperature: 0 }
      );
      
      const result = (response.content?.trim() || 'CHAT').toUpperCase();
      
      // 解析意图
      let intent: 'SKILL' | 'VECTOR' | 'SQL' | 'CHAT' = 'CHAT';
      if (result.includes('SKILL') || result.includes('技能')) {
        intent = 'SKILL';
      } else if (result.includes('VECTOR') || result.includes('向量') || result.includes('知识库')) {
        intent = 'VECTOR';
      } else if (result.includes('SQL') || result.includes('结构化') || result.includes('统计')) {
        intent = 'SQL';
      }
      
      return {
        success: true,
        output: { intent, rawClassification: result },
        nextNode: 'intentRouter',
        durationMs: Date.now() - startTime
      };
    }
    
    return {
      success: true,
      output: {},
      durationMs: Date.now() - startTime
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      durationMs: Date.now() - startTime
    };
  }
}

// ============ 3. 逻辑控制节点处理器 ============

export async function processLogicNode(
  context: ExecutionContext,
  nodeConfig: NodeConfig,
  flowConfig: FlowConfig
): Promise<NodeResult> {
  const startTime = Date.now();
  
  try {
    // 上下文长度检查节点
    if (nodeConfig.name === '上下文长度检查') {
      const contextLength = (context.context || '').length;
      const threshold = flowConfig.globalConfig.contextMaxChars;
      
      if (contextLength > threshold) {
        return {
          success: true,
          output: { exceeded: true, contextLength, threshold },
          nextNode: 'summarize',
          durationMs: Date.now() - startTime
        };
      } else {
        return {
          success: true,
          output: { exceeded: false, contextLength, threshold },
          nextNode: 'intentClassify',
          durationMs: Date.now() - startTime
        };
      }
    }
    
    // 意图路由节点
    if (nodeConfig.name === '意图路由') {
      const intent = context.intent || 'CHAT';
      const routes: Record<string, string> = {
        'SKILL': 'mcpNode',
        'VECTOR': 'chromaNode',
        'SQL': 'sqlNode',
        'CHAT': 'subflowNode'
      };
      
      return {
        success: true,
        output: { routedTo: routes[intent] },
        nextNode: routes[intent],
        durationMs: Date.now() - startTime
      };
    }
    
    return {
      success: true,
      output: {},
      durationMs: Date.now() - startTime
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      durationMs: Date.now() - startTime
    };
  }
}

// ============ 4. 数据&工具节点处理器 ============

export async function processDataNode(
  context: ExecutionContext,
  nodeConfig: NodeConfig,
  flowConfig: FlowConfig,
  headers?: Headers
): Promise<NodeResult> {
  const startTime = Date.now();
  
  try {
    // SQL执行节点
    if (nodeConfig.name === 'SQL执行节点') {
      const query = context.rewrittenQuery || context.userQuery;
      
      // 调用SQL API
      const sqlResponse = await fetch(
        `${process.env.COZE_PROJECT_DOMAIN_DEFAULT || 'http://localhost:5000'}/api/rag/sql`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query })
        }
      );
      
      const sqlData = await sqlResponse.json();
      
      return {
        success: true,
        output: { sqlResult: sqlData },
        nextNode: 'subflowNode',
        durationMs: Date.now() - startTime
      };
    }
    
    // Chroma向量检索节点
    if (nodeConfig.name === 'Chroma向量检索') {
      const query = context.rewrittenQuery || context.userQuery;
      
      // 调用向量检索 API
      const searchResponse = await fetch(
        `${process.env.COZE_PROJECT_DOMAIN_DEFAULT || 'http://localhost:5000'}/api/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query,
            topK: nodeConfig.topN || flowConfig.globalConfig.vectorTopN
          })
        }
      );
      
      const searchData = await searchResponse.json();
      
      return {
        success: true,
        output: { vectorResult: searchData },
        nextNode: 'subflowNode',
        durationMs: Date.now() - startTime
      };
    }
    
    // MCP协议节点
    if (nodeConfig.name === 'MCP协议节点') {
      // MCP通信实现
      // 这里可以扩展具体的MCP协议调用
      return {
        success: true,
        output: { mcpResult: { status: 'ready', message: 'MCP节点已配置' } },
        nextNode: 'skillNode',
        durationMs: Date.now() - startTime
      };
    }
    
    // Skill调度节点
    if (nodeConfig.name === 'Skill调度节点') {
      const query = context.rewrittenQuery || context.userQuery;
      
      // Skill调度实现
      // 这里可以扩展具体的Skill调用逻辑
      return {
        success: true,
        output: { skillResult: { status: 'ready', query } },
        nextNode: 'subflowNode',
        durationMs: Date.now() - startTime
      };
    }
    
    return {
      success: true,
      output: {},
      durationMs: Date.now() - startTime
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      durationMs: Date.now() - startTime
    };
  }
}

// ============ 5. 子流程&资源节点处理器 ============

export async function processSubflowNode(
  context: ExecutionContext,
  nodeConfig: NodeConfig,
  flowConfig: FlowConfig,
  headers?: Headers
): Promise<NodeResult> {
  const startTime = Date.now();
  
  try {
    // 原有业务子流程节点
    // 将SQL结果、Chroma召回片段、Skill返回数据统一作为上下文附属字段
    
    const subflowInput = {
      context: context.context,
      query: context.rewrittenQuery || context.userQuery,
      intent: context.intent,
      sqlResult: context.sqlResult,
      vectorResult: context.vectorResult,
      skillResult: context.skillResult,
      summary: context.summary
    };
    
    // 调用原有RAG流程生成回答
    const ragResponse = await fetch(
      `${process.env.COZE_PROJECT_DOMAIN_DEFAULT || 'http://localhost:5000'}/api/rag`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: subflowInput.query,
          modality: 'all',
          topK: flowConfig.globalConfig.vectorTopN,
          stream: false,
          sessionId: context.sessionId,
          contextData: subflowInput
        })
      }
    );
    
    const ragData = await ragResponse.json();
    
    return {
      success: true,
      output: {
        answer: ragData.answer,
        sources: ragData.sources,
        contextUsed: subflowInput
      },
      durationMs: Date.now() - startTime
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      durationMs: Date.now() - startTime
    };
  }
}

// ============ 对话流执行引擎主函数 ============

export async function executeConversationFlow(
  sessionId: string,
  userQuery: string,
  headers?: Headers
): Promise<{
  success: boolean;
  answer?: string;
  sources?: any[];
  executionLog: Array<{ node: string; durationMs: number; output?: any }>;
  error?: string;
}> {
  const supabase = getSupabaseClient();
  const executionLog: Array<{ node: string; durationMs: number; output?: any }> = [];
  
  try {
    // 1. 获取活跃的对话流配置
    const { data: flowConfigData } = await supabase
      .from('conversation_flow_configs')
      .select('*')
      .eq('is_active', true)
      .single();
    
    if (!flowConfigData) {
      throw new Error('未找到活跃的对话流配置');
    }
    
    const flowConfig: FlowConfig = flowConfigData.config;
    
    // 2. 初始化执行上下文
    let execContext: ExecutionContext = {
      sessionId,
      userQuery,
      context: '',
      messages: [],
      metadata: {}
    };
    
    // 3. 执行节点链
    let currentNode = 'start';
    let finalAnswer = '';
    let finalSources: any[] = [];
    
    while (currentNode && currentNode !== 'end') {
      const nodeConfig = flowConfig.nodes[currentNode];
      if (!nodeConfig) {
        console.warn(`节点 ${currentNode} 不存在，结束执行`);
        break;
      }
      
      let result: NodeResult;
      
      switch (nodeConfig.type) {
        case 'start':
          result = await processStartNode(execContext, nodeConfig, flowConfig);
          if (result.success && result.output) {
            execContext.context = result.output.context;
            execContext.messages = result.output.messages;
          }
          break;
          
        case 'ai':
          result = await processAINode(execContext, nodeConfig, flowConfig, headers);
          if (result.success && result.output) {
            if (result.output.rewrittenQuery) {
              execContext.rewrittenQuery = result.output.rewrittenQuery;
            }
            if (result.output.summary) {
              execContext.summary = result.output.summary;
            }
            if (result.output.intent) {
              execContext.intent = result.output.intent;
            }
          }
          break;
          
        case 'logic':
          result = await processLogicNode(execContext, nodeConfig, flowConfig);
          break;
          
        case 'data':
          result = await processDataNode(execContext, nodeConfig, flowConfig, headers);
          if (result.success && result.output) {
            if (result.output.sqlResult) {
              execContext.sqlResult = result.output.sqlResult;
            }
            if (result.output.vectorResult) {
              execContext.vectorResult = result.output.vectorResult;
            }
            if (result.output.skillResult) {
              execContext.skillResult = result.output.skillResult;
            }
          }
          break;
          
        case 'tool':
          result = await processDataNode(execContext, nodeConfig, flowConfig, headers);
          if (result.success && result.output) {
            if (result.output.mcpResult) {
              execContext.metadata.mcpResult = result.output.mcpResult;
            }
            if (result.output.skillResult) {
              execContext.skillResult = result.output.skillResult;
            }
          }
          break;
          
        case 'subflow':
          result = await processSubflowNode(execContext, nodeConfig, flowConfig, headers);
          if (result.success && result.output) {
            finalAnswer = result.output.answer || '';
            finalSources = result.output.sources || [];
          }
          break;
          
        default:
          result = { success: true, output: {} };
      }
      
      // 记录执行日志
      executionLog.push({
        node: currentNode,
        durationMs: result.durationMs || 0,
        output: result.success ? result.output : { error: result.error }
      });
      
      // 保存节点执行日志到数据库
      await supabase.from('node_execution_logs').insert({
        flow_id: flowConfigData.id,
        session_id: sessionId,
        node_type: nodeConfig.type,
        node_name: nodeConfig.name,
        input: { context: execContext },
        output: result.output,
        duration_ms: result.durationMs,
        status: result.success ? 'success' : 'error',
        error: result.error
      });
      
      if (!result.success) {
        throw new Error(`节点 ${currentNode} 执行失败: ${result.error}`);
      }
      
      // 移动到下一个节点
      currentNode = result.nextNode || '';
    }
    
    // 4. 更新会话上下文
    await supabase.from('conversation_contexts').upsert({
      session_id: sessionId,
      messages: [
        ...execContext.messages,
        { role: 'user', content: userQuery },
        { role: 'assistant', content: finalAnswer }
      ],
      summary: execContext.summary || null,
      updated_at: new Date().toISOString()
    }, { onConflict: 'session_id' });
    
    return {
      success: true,
      answer: finalAnswer,
      sources: finalSources,
      executionLog
    };
    
  } catch (error: any) {
    return {
      success: false,
      error: error.message,
      executionLog
    };
  }
}
