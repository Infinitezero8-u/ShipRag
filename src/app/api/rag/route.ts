import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { LLMClient, EmbeddingClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

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

// 更新上下文（在AI回复后调用）
async function updateContextAfterResponse(sessionId: string, query: string, answer: string): Promise<void> {
  try {
    const supabase = getSupabaseClient();
    
    // 获取当前上下文
    const { data: existing } = await supabase
      .from('conversation_contexts')
      .select('messages, total_tokens')
      .eq('session_id', sessionId)
      .single();
    
    const messages = (existing?.messages as Array<{ role: string; content: string }>) || [];
    
    // 追加本轮问答
    messages.push(
      { role: 'user', content: query },
      { role: 'assistant', content: answer }
    );
    
    // 估算 token 数（简单估算：每 4 字符约 1 token）
    const totalTokens = messages.reduce((sum, m) => sum + Math.ceil(m.content.length / 4), 0);
    
    // 更新上下文
    await supabase
      .from('conversation_contexts')
      .upsert({
        session_id: sessionId,
        messages,
        total_tokens: totalTokens,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'session_id' });
  } catch (error) {
    console.error('更新上下文失败:', error);
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
      // 总数查询
      const { count, error } = await supabase
        .from('knowledge_items')
        .select('id', { count: 'exact', head: true });
      
      if (!error) {
        result = `知识库中共有 **${count || 0}** 条记录。`;
        sql = 'SELECT COUNT(*) FROM knowledge_items';
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
        .limit(5000);
      
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
const SYSTEM_PROMPT = `你是一个专业的海图智能问答助手，基于海图知识库进行专业回答。

## 专业术语标准化
- 使用标准海事术语：航道(channel)、锚地(anchorage)、等深线(depth contour)、航标(navigation aid)、碍航物(obstruction)
- 港口代码统一使用UN/LOCODE格式（如CNSHA=上海港）
- 坐标统一使用WGS84坐标系，格式为"经度,纬度"

## 回答规则
1. **相关性判断**：先判断上下文信息是否与用户问题相关
   - 相关度低于0.5或明显不相关，说明"海图知识库中没有找到与该问题相关的信息"
   - 不要强行使用不相关信息回答

2. **诚实回答**：
   - 只使用确实相关的上下文信息回答
   - 无法从上下文中找到答案时诚实说明

3. **自适应回答**：
   - 精简模式：仅输出关键参数与结论，适用于快速查询
   - 详答模式：补充规范原文、完整参数细则，适用于深度查阅
   - 根据问题复杂度自动选择合适模式

4. **强制溯源**：
   - 所有输出内容必须标注数据来源
   - 格式：【来源】文档名称 | 海图图号 | 片段位置
   - 示例：【来源】中国沿海航路指南 | 图号12345 | 第3章第2节

## Token上限处理
- 临近Token上限时，自动剔除冗余文本，保留核心参数与来源标注
- 优先保留：安全相关参数、数值数据、来源信息

## 特别注意
- 海图数据具有时效性，回答时提示用户核实最新版海图
- 安全相关参数（水深、吃水限制等）需特别标注并提示谨慎使用`;

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
    // 如果 noLimit 为 true，则不限制检索数量（最多返回 500 条）
    const actualTopK = noLimit ? 500 : (topK || 100);

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: '问题不能为空' }, { status: 400 });
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
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
            messages: [],
            summary: null,
            total_tokens: 0,
            is_compressed: false,
            locked_context: null,
            updated_at: new Date().toISOString(),
          }).eq('session_id', sessionId);
          contextMessages = [];
          effectiveQuery = correctedQuery;
        } else {
          // 获取当前上下文（包含锁定状态）
          const { data: existingContext } = await supabase
            .from('conversation_contexts')
            .select('messages, locked_context')
            .eq('session_id', sessionId)
            .single();
          
          lockedContext = existingContext?.locked_context as typeof lockedContext;
          
          // 处理锁定上下文指令
          if (lockContext && existingContext) {
            // 从历史消息中提取海域和海图信息
            const historyText = contextMessages.map(m => m.content).join(' ');
            const chartIdMatch = historyText.match(/图号[：:]\s*(\d+)/g);
            const portMatch = historyText.match(/[A-Z]{2}[A-Z]{3}/g);
            
            lockedContext = {
              region: portMatch?.[0] || undefined,
              chartIds: chartIdMatch?.map(m => m.replace(/图号[：:]\s*/, '')) || undefined,
              sources: [],
            };
            
            await supabase.from('conversation_contexts').update({
              locked_context: lockedContext,
            }).eq('session_id', sessionId);
          }
          
          // 如果上下文已锁定，复用锁定的海域和海图范围
          if (lockedContext) {
            if (lockedContext.region) {
              effectiveQuery = `[锁定海域: ${lockedContext.region}] ${correctedQuery}`;
            }
            if (lockedContext.chartIds?.length) {
              effectiveQuery += ` [限定海图: ${lockedContext.chartIds.join(', ')}]`;
            }
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
            const summaryPrompt = `请将以下历史对话压缩为原来的1/3长度，保留关键信息、用户意图、锁定海域和功能状态：

${contextMessages.map(m => `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`).join('\n')}

压缩后的摘要：`;

            const summaryResult = await llmClient.invoke([
              { role: 'user', content: summaryPrompt }
            ]);
            contextSummary = summaryResult.content || '';
            
            // 压缩后的摘要作为上下文
            effectiveQuery = `[历史摘要]${contextSummary}\n\n[当前问题]${correctedQuery}`;
          }
          
          // 保存上下文到数据库
          await supabase.from('conversation_contexts').upsert({
            session_id: sessionId,
            messages: JSON.parse(JSON.stringify(contextMessages)),
            summary: contextSummary || null,
            total_tokens: estimatedTokens,
            is_compressed: estimatedTokens > MAX_TOKENS,
            locked_context: lockedContext,
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
      const classifyResponse = await fetch(`${process.env.COZE_PROJECT_DOMAIN_DEFAULT || 'http://localhost:5000'}/api/rag/classify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: effectiveQuery }),
      });
      const classifyData = await classifyResponse.json();
      isStats = classifyData.route === 'SQL';
    } catch (e) {
      // 分类失败，使用本地判断
      const localClassify = isStatsQuery(query);
      isStats = localClassify.isStats;
    }
    
    if (isStats) {
      // 使用 SQL API 动态生成和执行 SQL
      try {
        const sqlResponse = await fetch(`${process.env.COZE_PROJECT_DOMAIN_DEFAULT || 'http://localhost:5000'}/api/rag/sql`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: effectiveQuery }),
        });
        
        const sqlData = await sqlResponse.json();
        const sql = sqlData.sql || 'SELECT COUNT(*) FROM knowledge_items';
        const result = sqlData.result?.[0]?.count ?? sqlData.result ?? 0;
        
        // 润色结果
        const polishResponse = await fetch(`${process.env.COZE_PROJECT_DOMAIN_DEFAULT || 'http://localhost:5000'}/api/rag/sql-polish`, {
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

    // 1. 生成查询向量
    const queryEmbedding = await embeddingClient.embedText(query);

    // 2. 检索相关上下文（提高相似度阈值）
    const { data: contextItems, error: searchError } = await supabase.rpc('vector_search', {
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
    }

    // 3. 构建上下文
    const context = (contextItems || [])
      .map((item: { title: string; content: string; source: string; similarity: number }, index: number) => {
        return `[${index + 1}] 标题: ${item.title}\n来源: ${item.source}\n相关度: ${item.similarity.toFixed(3)}\n内容: ${item.content?.substring(0, 500) || '无内容'}`;
      })
      .join('\n\n---\n\n');

    // 4. 构建消息（包含指令和模式提示）
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT + modeInstruction + instructionPrompt },
      { 
        role: 'user' as const, 
        content: `上下文信息：
${context || '未找到相关信息'}

${expandedQueries.length > 0 ? `隐含检索维度：${expandedQueries.join('、')}\n` : ''}
用户问题：${effectiveQuery}

注意：所有输出内容必须标注来源，格式为【来源】文档名称 | 海图图号 | 片段位置`
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
              model: 'doubao-seed-1-8-251228',
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
        model: 'doubao-seed-1-8-251228',
        temperature: 0.7,
      });

      // 更新上下文
      if (sessionId) {
        await updateContextAfterResponse(sessionId, query, response.content);
      }

      return NextResponse.json({
        success: true,
        query,
        answer: response.content,
        contextCount: contextItems?.length || 0,
        sources: (contextItems || []).map((item: { title: string; source: string; similarity: number }) => ({
          title: item.title,
          source: item.source,
          similarity: item.similarity,
        })),
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
