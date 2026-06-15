import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/local-db';
import { LLMClient } from '@/lib/ollama/llm';
import { Config } from '@/lib/ollama/config';
import { EmbeddingClient } from '@/lib/ollama/embedding';
const BASE_URL = process.env.COZE_PROJECT_DOMAIN_DEFAULT || 'http://localhost:5000';


interface RagRequest {
  query: string;
  modality?: string;
  topK?: number;
  stream?: boolean;
  noLimit?: boolean; // 取消检索数量限制
  sessionId?: string; // 会话ID，用于多轮上下文管理
  history?: Array<{ role: 'user' | 'assistant'; content: string }>; // 前端传递的历史消息
  lockContext?: boolean; // 锁定当前上下文（海域、海图范围）
  clearContext?: boolean; // 清空历史上下文
  responseMode?: 'brief' | 'detailed'; // 回答模式：精简/详细
  commandType?: string; // 指令类型：chart_annotation/channel_regulation
}

// 更新/保存对话历史
async function updateContextAfterResponse(sessionId: string, query: string, answer: string): Promise<void> {
  try {
    const supabase = getSupabaseClient();

    const { data: existing } = await supabase
      .from('conversation_contexts')
      .select('context_data, tokens_used')
      .eq('session_id', sessionId)
      .single();

    const contextData = (existing?.context_data as Record<string, any>) || {};
    const messages = (contextData.messages as Array<{ role: string; content: string; time: string }>) || [];

    messages.push(
      { role: 'user', content: query, time: new Date().toISOString() },
      { role: 'assistant', content: answer.substring(0, 500), time: new Date().toISOString() }
    );

    const tokensUsed = messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);

    // 获取最后一条用户消息作为标题
    const lastUserMsg = messages.filter(m => m.role === 'user').pop();
    const title = lastUserMsg ? lastUserMsg.content.substring(0, 50) : '对话';

    await supabase
      .from('conversation_contexts')
      .upsert({
        session_id: sessionId,
        context_type: 'rag',
        context_data: { messages, title },
        tokens_used: tokensUsed,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'session_id' });
  } catch (error) {
    console.error('保存对话历史失败:', error);
  }
}

// 统计问题识别
function isStatsQuery(query: string): { isStats: boolean; statsType: string } {
  const lowerQuery = query.toLowerCase();
  
  // 统计关键词
  const statsPatterns = [
    { pattern: /一共|总共|总计|合计/, type: 'total' },
    { pattern: /多少个|有几个|数量/, type: 'count' },
    { pattern: /统计/, type: 'stats' },
    { pattern: /哪些国家|什么国家|多少国家/, type: 'country_list' },
    { pattern: /按国家|分组统计|各国/, type: 'group_by_country' },
    { pattern: /最大|最小|最多|最少|第一/, type: 'extreme' },
  ];
  
  for (const { pattern, type } of statsPatterns) {
    if (pattern.test(query)) {
      return { isStats: true, statsType: type };
    }
  }
  
  return { isStats: false, statsType: '' };
}

// 执行统计查询
async function executeStatsQuery(supabase: ReturnType<typeof getSupabaseClient>, query: string, statsType: string): Promise<{ result: string; sql: string }> {
  let result = '';
  let sql = '';
  
  try {
    // 判断查询类型
    if (statsType === 'total' || statsType === 'count') {
      // 按查询目标选择正确的表: 港口 → port_data, 否则 → knowledge_items
      const isPortQuestion = query.includes('港口') || query.includes('港');
      if (isPortQuestion) {
        const { count, error } = await supabase
          .from('port_data')
          .select('id', { count: 'exact', head: true });
        if (!error) {
          result = `港口数据库中共有 **${count || 0}** 个港口。`;
          sql = 'SELECT COUNT(*) FROM port_data';
        }
      } else {
        const { count, error } = await supabase
          .from('knowledge_items')
          .select('id', { count: 'exact', head: true });
        if (!error) {
          result = `知识库中共有 **${count || 0}** 条记录。`;
          sql = 'SELECT COUNT(*) FROM knowledge_items';
        }
      }
    } else if (statsType === 'country_list') {
      // 国家列表查询
      const { data, error } = await supabase
        .rpc('execute_sql', {
          sql_query: `
            SELECT DISTINCT 
              regexp_match(content, 'ctryNameCn:\\s*([^,]+)')?[1] as country
            FROM knowledge_items
            WHERE content LIKE '%ctryNameCn:%'
            ORDER BY country
          `
        });
      
      // 备用方案：直接查询
      const { data: items, error: err2 } = await supabase
        .from('knowledge_items')
        .select('content')
        .like('content', '%ctryNameCn:%')
        .limit(100);
      
      if (!err2 && items) {
        const countries = new Set<string>();
        for (const item of items) {
          const match = item.content?.match(/ctryNameCn:\s*([^,]+)/);
          if (match && match[1]) {
            countries.add(match[1].trim());
          }
        }
        result = `知识库中包含 **${countries.size}** 个国家/地区：\n${Array.from(countries).sort().slice(0, 50).join('、')}${countries.size > 50 ? '...' : ''}`;
        sql = 'SELECT DISTINCT country FROM knowledge_items';
      }
    } else if (statsType === 'group_by_country') {
      // 按国家分组统计
      const { data: items, error } = await supabase
        .from('knowledge_items')
        .select('content')
        .like('content', '%ctryNameCn:%')
        .limit(10000);
      
      if (!error && items) {
        const countryCount: Record<string, number> = {};
        for (const item of items) {
          const match = item.content?.match(/ctryNameCn:\s*([^,]+)/);
          if (match && match[1]) {
            const country = match[1].trim();
            countryCount[country] = (countryCount[country] || 0) + 1;
          }
        }
        
        const sorted = Object.entries(countryCount)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 20);
        
        result = `按国家/地区统计（前20）：\n${sorted.map(([c, n]) => `- ${c}: ${n} 条`).join('\n')}`;
        sql = 'SELECT country, COUNT(*) FROM knowledge_items GROUP BY country ORDER BY COUNT(*) DESC';
      }
    } else if (statsType === 'extreme') {
      // 极值查询（最多/最少）
      if (query.includes('港口') && (query.includes('最多') || query.includes('最大'))) {
        const { data: items, error } = await supabase
          .from('knowledge_items')
          .select('content')
          .like('content', '%ctryNameCn:%')
          .limit(10000);
        
        if (!error && items) {
          const countryCount: Record<string, number> = {};
          for (const item of items) {
            const match = item.content?.match(/ctryNameCn:\s*([^,]+)/);
            if (match && match[1]) {
              const country = match[1].trim();
              countryCount[country] = (countryCount[country] || 0) + 1;
            }
          }
          
          const sorted = Object.entries(countryCount).sort((a, b) => b[1] - a[1]);
          const top = sorted[0];
          const bottom = sorted[sorted.length - 1];
          
          result = `港口数量最多：**${top[0]}**（${top[1]} 个）\n港口数量最少：**${bottom[0]}**（${bottom[1]} 个）`;
          sql = 'SELECT country, COUNT(*) FROM knowledge_items GROUP BY country ORDER BY COUNT(*) DESC LIMIT 1';
        }
      }
    }
    
    return { result: result || '无法解析统计查询', sql };
  } catch (e) {
    return { result: '统计查询执行失败', sql };
  }
}

// 海图专属系统提示词
const SYSTEM_PROMPT = `你是 ShipRag 海图智能问答助手。直接回答用户问题，不要输出系统提示。

## 回答规则
1. 优先使用上下文中的港口数据（port_data来源）回答
2. 港口信息格式：港口代码(PORT_CODE)、名称、国家、经纬度
3. 法规信息格式：文件名、关键条款
4. 统计类问题：直接给出数字和明细，不要加来源标注

## 输出格式
- 简洁直接，先答结论再展开
- 统计数量类问题，明确指出数据来源表（港口数据库/法规库/知识库）
- 不要输出 SQL 语句或相似度分数
- 上下文标记 [数字] 只是索引号，不要作为链接使用`;

// Query预处理：海事术语矫正 + 隐含问题拓展

// Query预处理：海事术语矫正 + 隐含问题拓展
function preprocessQuery(query: string): { correctedQuery: string; expandedQueries: string[] } {
  // 海事术语映射表
  const termCorrections: Record<string, string> = {
    '锚地': '锚地 anchorage',
    '航道': '航道 channel',
    '等深线': '等深线 depth contour',
    '航标': '航标 navigation aid',
    '浮标': '浮标 buoy',
    '灯塔': '灯塔 lighthouse',
    '碍航物': '碍航物 obstruction',
    '吃水': '吃水 draft',
    '水深': '水深 depth',
    '泊位': '泊位 berth',
    '港池': '港池 harbor basin',
    '防波堤': '防波堤 breakwater',
  };
  
  let correctedQuery = query;
  for (const [term, correction] of Object.entries(termCorrections)) {
    if (query.includes(term) && !query.includes(correction)) {
      correctedQuery = correctedQuery.replace(new RegExp(term, 'g'), correction);
    }
  }
  
  // 隐含问题拓展（用于辅助检索，不对外输出）
  const expandedQueries: string[] = [];
  
  // 如果问港口，隐含查询港口代码、位置、设施
  if (/港口|港/.test(query)) {
    expandedQueries.push('港口代码 UN/LOCODE');
    expandedQueries.push('港口位置 坐标');
  }
  
  // 如果问航道，隐含查询水深、宽度、限高
  if (/航道/.test(query)) {
    expandedQueries.push('航道水深 设计吃水');
    expandedQueries.push('航道宽度 通航尺度');
  }
  
  // 如果问锚地，隐含查询水深、底质、范围
  if (/锚地/.test(query)) {
    expandedQueries.push('锚地水深 底质');
    expandedQueries.push('锚地范围 坐标');
  }
  
  return { correctedQuery, expandedQueries };
}

export async function POST(request: NextRequest) {
  try {
    const body: RagRequest = await request.json();
    const { query, modality, topK, stream = true, noLimit = false, sessionId, history, lockContext, clearContext, responseMode, commandType } = body;
    // 检索数量默认 30
    const actualTopK = noLimit ? 30 : (topK || 30);

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: '问题不能为空' }, { status: 400 });
    }

    const customHeaders: Record<string, string> = {};
    const supabase = getSupabaseClient();
    
    // ========== Query预处理 ==========
    const { correctedQuery, expandedQueries } = preprocessQuery(query);
    
    // ========== 上下文管理（Coze 对话流架构）==========
    let contextMessages: Array<{ role: 'user' | 'assistant'; content: string }> = history || [];
    let contextSummary = '';
    let effectiveQuery = correctedQuery;
    let lockedContext: { region?: string; chartIds?: string[]; sources?: string[] } | null = null;
    
    if (sessionId) {
      try {
        // 处理清空上下文指令
        if (clearContext) {
          await supabase.from('conversation_contexts').update({
            context_data: { messages: [], title: '对话' },
            tokens_used: 0,
            updated_at: new Date().toISOString(),
          }).eq('session_id', sessionId);
          contextMessages = [];
          effectiveQuery = correctedQuery;
        } else {
          // 获取当前上下文
          const { data: existingContext } = await supabase
            .from('conversation_contexts')
            .select('context_data')
            .eq('session_id', sessionId)
            .single();
          
          const ctxData = existingContext?.context_data as Record<string, any> || {};
          lockedContext = ctxData?.locked_context as typeof lockedContext || null;

          // 从保存的上下文加载历史消息
          const savedMessages = (ctxData.messages as Array<{ role: string; content: string }>) || [];
          if (savedMessages.length > 0) {
            contextMessages = savedMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content }));
          }
          
          // 1. 拼接新问题到历史对话
          const newMessage = { role: 'user' as const, content: query };
          contextMessages = [...contextMessages, newMessage];
          
          // 2. 计算上下文大小（估算 token 数，中文约 1.5 字符/token）
          const contextText = contextMessages.map(m => m.content).join('');
          const estimatedTokens = Math.ceil(contextText.length / 1.5);
          const MAX_TOKENS = 128 * 1024; // 128k
          
          // 3. 如果超过 128k，调用大模型总结压缩
          if (estimatedTokens > MAX_TOKENS) {
            const llmClient = new LLMClient(new Config(), customHeaders);
            const historyLines = contextMessages.map(m => (m.role === 'user' ? '用户' : 'AI') + ': ' + m.content).join('\n');
            const summaryPrompt = '请将以下历史对话压缩为原来的三分之一长度，保留关键信息、用户意图、锁定海域和功能状态：\n\n' + historyLines + '\n\n压缩后的摘要：';

            const summaryResult = await llmClient.invoke([
              { role: 'user', content: summaryPrompt }
            ]);
            contextSummary = summaryResult.content || '';
            
            // 压缩后的摘要作为上下文
            effectiveQuery = '[历史摘要]' + contextSummary + '\n\n[当前问题]' + correctedQuery;
          }
          
          // 保存上下文到数据库
          await supabase.from('conversation_contexts').upsert({
            session_id: sessionId,
            context_type: 'rag',
            context_data: {
              messages: contextMessages,
              title: query.substring(0, 50),
            },
            tokens_used: estimatedTokens,
            updated_at: new Date().toISOString(),
          }, { onConflict: 'session_id' });
        }
        
      } catch (ctxError) {
        console.error('上下文管理失败:', ctxError);
        // 失败时继续使用原始查询
      }
    }
    
    // ========== 指令处理 ==========
    let instructionPrompt = '';
    if (commandType === 'chart_annotation') {
      instructionPrompt = '\n\n[指令]提取海图锚地、等深线、航标、碍航物参数，必须附带来源标注。';
    } else if (commandType === 'channel_regulation') {
      instructionPrompt = '\n\n[指令]汇总航道水深、限吃水、通航管制、约束条件，必须附带来源标注。';
    }
    
    // 根据回答模式调整提示
    const modeInstruction = responseMode === 'brief' 
      ? '\n\n[回答模式]精简回答：仅输出关键参数与结论，去除冗余描述。'
      : responseMode === 'detailed'
        ? '\n\n[回答模式]详细回答：补充规范原文、完整参数细则、安全提示。'
        : '';
    
    // ========== 原有问答逻辑 ==========
    
    // 问题分类：调用分类 API 判断走 SQL 还是 RAG
    let isStats = false;
    try {
      const classifyResponse = await fetch(BASE_URL + '/api/rag/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: effectiveQuery }),
      });
      const classifyData = await classifyResponse.json();
      // ALL 路由 + 计数类问题 → 统计分支
      if (classifyData.route === 'ALL' && /一共|总共|多少个|有几个|数量|统计|多少/.test(query)) {
        isStats = true;
      } else {
        isStats = classifyData.route === 'SQL';
      }
    } catch (e) {
      // 分类失败，使用本地判断
      const localClassify = isStatsQuery(query);
      isStats = localClassify.isStats;
    }

    if (isStats) {
      // 统计类问题统一走 LLM SQL 生成（支持动态 WHERE/过滤/分组）
      try {
        const sqlResponse = await fetch(BASE_URL + '/api/rag/sql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: effectiveQuery }),
        });
        
        const sqlData = await sqlResponse.json();
        const sql = sqlData.sql || 'SELECT COUNT(*) FROM knowledge_items';
        const result = sqlData.result?.[0]?.count ?? sqlData.result ?? 0;
        
        // 润色结果
        const polishResponse = await fetch(BASE_URL + '/api/rag/sql-polish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query, data: sqlData.result }),
        });
        
        const polishData = await polishResponse.json();
        const answer = polishData.answer || `查询结果：${result} 条`;
        
        if (stream) {
          const encoder = new TextEncoder();
          const readable = new ReadableStream({
            async start(controller) {
              controller.enqueue(encoder.encode(`📊 **统计查询**\n\n`));
              controller.enqueue(encoder.encode(answer));
              controller.enqueue(encoder.encode(`\n\n---\n*SQL: ${sql}*`));
              controller.close();
            },
          });
          
          return new Response(readable, {
            headers: {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Transfer-Encoding': 'chunked',
            },
          });
        } else {
          return NextResponse.json({
            success: true,
            answer: `📊 **统计查询**\n\n${answer}\n\n---\n*SQL: ${sql}*`,
            queryType: 'stats',
            sql,
            sources: [],
          });
        }
      } catch (e) {
        // SQL API 失败，使用备用方案
        const localClassify = isStatsQuery(query);
        const { result, sql } = await executeStatsQuery(supabase, query, localClassify.statsType);
        
        if (stream) {
          const encoder = new TextEncoder();
          const readable = new ReadableStream({
            async start(controller) {
              controller.enqueue(encoder.encode(`📊 **统计查询**\n\n`));
              controller.enqueue(encoder.encode(result));
              controller.enqueue(encoder.encode(`\n\n---\n*SQL: ${sql}*`));
              controller.close();
            },
          });
          
          return new Response(readable, {
            headers: {
              'Content-Type': 'text/event-stream; charset=utf-8',
              'Transfer-Encoding': 'chunked',
            },
          });
        } else {
          return NextResponse.json({
            success: true,
            answer: `📊 **统计查询**\n\n${result}\n\n---\n*SQL: ${sql}*`,
            queryType: 'stats',
            sql,
            sources: [],
          });
        }
      }
    }

    // 非统计问题，走 RAG 流程
    const embeddingClient = new EmbeddingClient();
    const llmClient = new LLMClient(new Config(), customHeaders);

    // 构建session上下文对象
    const sessionContext = {
      history: contextMessages.map((m) => ({
        query: m.role === 'user' ? m.content : '',
        answer: m.role === 'assistant' ? m.content : '',
      })).filter((h: { query: string; answer: string }) => h.query || h.answer),
      summary: contextSummary,
      locked: lockedContext,
    };

    // 1. Query改写（强制带入chat_history，代词还原）
    let rewrittenQuery = effectiveQuery;
    if (sessionContext && sessionContext.history.length > 0) {
      try {
        const rewritePrompt = `你是一个问题改写助手。根据对话历史，将用户当前问题改写为独立的、可理解的完整问题。
要求：
1. 代词还原：将"它"、"该港口"、"该航线"、"上文"、"那个"等代词替换为具体名称
2. 补全省略：将"还有多少？"、"呢？"等省略问法补全为完整问题
3. 保持原意：不要改变问题的核心意图

对话历史：
${sessionContext.history.slice(-4).map(h => `Q: ${h.query}\nA: ${h.answer?.substring(0, 200)}...`).join('\n\n')}

当前问题：${effectiveQuery}

请直接输出改写后的问题，不要解释：`;

        const rewriteResponse = await llmClient.invoke([{ role: 'user', content: rewritePrompt }], {
          model: 'qwen2.5:3b',
          temperature: 0.3,
        });
        rewrittenQuery = rewriteResponse.content?.trim() || effectiveQuery;
        console.log(`[Query改写] ${effectiveQuery} -> ${rewrittenQuery}`);
      } catch (e) {
        console.log('[Query改写失败]', e);
      }
    }

    // 2. 生成查询向量
    const queryEmbedding = await embeddingClient.embedText(rewrittenQuery);

    // 3. 检索相关上下文（提高相似度阈值）
    let { data: contextItems, error: searchError } = await supabase.rpc('vector_search', {
      query_embedding: queryEmbedding,
      match_threshold: 0.5,
      match_count: actualTopK,
      filter_modality: modality || null,
    });

    if (searchError) {
      // 使用备用搜索
      const fallbackResult = await fallbackVectorSearch(supabase, queryEmbedding, modality, actualTopK);
      if (fallbackResult.error) {
        return NextResponse.json({ error: fallbackResult.error }, { status: 500 });
      }
      contextItems = fallbackResult.items;
    }

    // 4. 检查 RAG 结果来源类型
    const ragResultCount = contextItems?.length || 0;
    const avgSimilarity = contextItems && contextItems.length > 0
      ? contextItems.reduce((sum: number, item: { similarity: number }) => sum + item.similarity, 0) / contextItems.length
      : 0;
    const hasPortResults = (contextItems || []).some((item: { source?: string }) => item.source === 'port_data');
    const hasRegResults = (contextItems || []).some((item: { source?: string }) => item.source === 'regulations');

    // SQL 兜底仅对 knowledge_items 类型触发，port/reg 已在 vector_search 中有精确结果
    const isRagInsufficient = !hasPortResults && !hasRegResults && (ragResultCount < 3 || avgSimilarity < 0.6);
    let sqlFallbackResult: { sql: string; result: unknown } | null = null;
    let usedFallback = false;

    // 5. RAG结果不足时，自动走SQL补充（仅 knowledge_items 查询）
    if (isRagInsufficient) {
      console.log(`[RAG不足] 结果数:${ragResultCount}, 平均相似度:${avgSimilarity.toFixed(3)}, 触发SQL兜底`);
      try {
        const sqlResponse = await fetch(BASE_URL + '/api/rag/sql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: rewrittenQuery }),
        });
        const sqlData = await sqlResponse.json();
        if (sqlData.result && (!Array.isArray(sqlData.result) || sqlData.result.length > 0)) {
          sqlFallbackResult = { sql: sqlData.sql, result: sqlData.result };
          usedFallback = true;
          console.log(`[SQL兜底成功] SQL: ${sqlData.sql}`);
        }
      } catch (e) {
        console.log('[SQL兜底失败]', e);
      }
    }

    // 6. 构建上下文（按来源分组，清晰标注）
    const sourceGroups = { port: [] as any[], regulation: [] as any[], knowledge: [] as any[] };
    (contextItems || []).forEach((item: any) => {
      if (item.source === 'port_data') sourceGroups.port.push(item);
      else if (item.source === 'regulations') sourceGroups.regulation.push(item);
      else sourceGroups.knowledge.push(item);
    });

    let contextParts: string[] = [];
    if (sourceGroups.port.length > 0) {
      contextParts.push('【港口数据库 port_data】\n' + sourceGroups.port.map((item, i) =>
        `${item.title} | ${item.content?.substring(0, 200) || ''}`
      ).join('\n'));
    }
    if (sourceGroups.regulation.length > 0) {
      contextParts.push('【规章制度库 regulations】\n' + sourceGroups.regulation.map((item, i) =>
        `${item.title} | ${item.content?.substring(0, 300) || ''}`
      ).join('\n'));
    }
    if (sourceGroups.knowledge.length > 0) {
      contextParts.push('【知识库 knowledge_items】\n' + sourceGroups.knowledge.map((item, i) =>
        `[${i + 1}] ${item.title} (相关度:${(item.similarity || 0).toFixed(2)})\n${item.content?.substring(0, 300) || ''}`
      ).join('\n'));
    }
    const context = contextParts.join('\n\n---\n\n') || '未找到相关信息';

    // SQL补充数据（不暴露原始SQL给LLM）
    let sqlContext = '';
    if (sqlFallbackResult) {
      const data = sqlFallbackResult.result;
      if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object' && data[0] !== null) {
        const keys = Object.keys(data[0]);
        sqlContext = `\n\n【统计补充（knowledge_items 表）】\n${keys.join(' | ')}\n` +
          data.slice(0, 20).map((r: any) => keys.map(k => r[k]).join(' | ')).join('\n');
      } else {
        sqlContext = `\n\n【统计补充】\n${JSON.stringify(data).substring(0, 500)}`;
      }
    }

    // 7. 构建消息（包含指令和模式提示）
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT + modeInstruction + instructionPrompt },
      { 
        role: 'user' as const, 
        content: `以下是与用户问题相关的检索信息：

${context || '未找到相关信息'}${sqlContext}

用户问题：${rewrittenQuery}
${ragResultCount === 0 && !usedFallback ? '\n未找到任何相关资料，请如实告知用户，不要编造内容。' : ''}`
      },
    ];

    // 5. 调用 LLM 生成回答
    if (stream) {
      // 流式响应
      let fullAnswer = '';
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        async start(controller) {
          try {
            const llmStream = llmClient.stream(messages, {
              model: 'qwen2.5:3b',
              temperature: 0.7,
            });

            for await (const chunk of llmStream) {
              if (chunk.content) {
                fullAnswer += chunk.content.toString();
                controller.enqueue(encoder.encode(chunk.content.toString()));
              }
            }
            // 流结束后更新上下文
            if (sessionId) {
              updateContextAfterResponse(sessionId, query, fullAnswer).catch(console.error);
            }
            controller.close();
          } catch (streamError) {
            controller.enqueue(encoder.encode(`\n\n[错误: ${streamError instanceof Error ? streamError.message : String(streamError)}]`));
            controller.close();
          }
        },
      });

      return new Response(readable, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    } else {
      // 非流式响应
      const response = await llmClient.invoke(messages, {
        model: 'qwen2.5:3b',
        temperature: 0.7,
      });

      // 更新上下文
      if (sessionId) {
        await updateContextAfterResponse(sessionId, query, response.content);
      }

      return NextResponse.json({
        success: true,
        query,
        rewrittenQuery: rewrittenQuery !== effectiveQuery ? rewrittenQuery : undefined,
        answer: response.content,
        contextCount: contextItems?.length || 0,
        sources: (contextItems || []).map((item: { title: string; source: string; similarity: number }) => ({
          title: item.title,
          source: item.source,
          similarity: item.similarity,
          type: 'knowledge_base' as const,
        })),
        sqlFallback: usedFallback ? {
          sql: sqlFallbackResult?.sql,
          result: sqlFallbackResult?.result,
        } : undefined,
        ragQuality: {
          resultCount: ragResultCount,
          avgSimilarity: Math.round(avgSimilarity * 1000) / 1000,
          isInsufficient: isRagInsufficient,
        },
      });
    }
  } catch (error) {
    console.error('RAG 问答失败:', error);
    return NextResponse.json({ 
      error: `问答失败: ${error instanceof Error ? error.message : String(error)}` 
    }, { status: 500 });
  }
}

// 备用向量搜索
async function fallbackVectorSearch(
  supabase: ReturnType<typeof getSupabaseClient>,
  queryEmbedding: number[],
  modality: string | undefined,
  topK: number
) {
  let query = supabase
    .from('knowledge_items')
    .select('id, modality, title, content, source, embedding')
    .not('embedding', 'is', null);

  if (modality) {
    query = query.eq('modality', modality);
  }

  const { data: items, error: queryError } = await query.limit(100);

  if (queryError) {
    return { error: queryError.message, items: [] };
  }

  if (!items || items.length === 0) {
    return { error: null, items: [] };
  }

  const results = items
    .map(item => {
      const embedding = item.embedding as unknown as number[];
      const similarity = cosineSimilarity(queryEmbedding, embedding);
      return { ...item, similarity };
    })
    .filter(item => item.similarity >= 0.3)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  return { error: null, items: results };
}

// 余弦相似度计算
function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
