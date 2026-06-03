import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { LLMClient, EmbeddingClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

interface RagRequest {
  query: string;
  modality?: string;
  topK?: number;
  stream?: boolean;
  noLimit?: boolean; // 取消检索数量限制
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
      const { data, error } = await supabase
        .from('knowledge_items')
        .select('id', { count: 'exact', head: true });
      
      if (!error) {
        result = `知识库中共有 **${data?.length || 0}** 条记录。`;
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

// 系统提示词
const SYSTEM_PROMPT = `你是一个智能问答助手，基于知识库进行回答。

规则：
1. 只使用提供的上下文信息回答问题
2. 如果上下文中没有相关信息，请诚实说明
3. 回答要简洁、准确、有条理
4. 如果有多个相关信息，请综合整理
5. 在回答末尾标注信息来源`;

export async function POST(request: NextRequest) {
  try {
    const body: RagRequest = await request.json();
    const { query, modality, topK, stream = true, noLimit = false } = body;
    // 如果 noLimit 为 true，则不限制检索数量（最多返回 500 条）
    const actualTopK = noLimit ? 500 : (topK || 100);

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: '问题不能为空' }, { status: 400 });
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const supabase = getSupabaseClient();
    
    // 问题分类：检查是否是统计问题
    const { isStats, statsType } = isStatsQuery(query);
    
    if (isStats) {
      // 直接执行统计查询
      const { result, sql } = await executeStatsQuery(supabase, query, statsType);
      
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
          answer: `📊 **统计查询**\n\n${result}\n\n---\n*SQL: ${sql}*`,
          queryType: 'stats',
          sql,
        });
      }
    }

    // 非统计问题，走 RAG 流程
    const embeddingClient = new EmbeddingClient();
    const llmClient = new LLMClient(new Config(), customHeaders);

    // 1. 生成查询向量
    const queryEmbedding = await embeddingClient.embedText(query);

    // 2. 检索相关上下文
    const { data: contextItems, error: searchError } = await supabase.rpc('vector_search', {
      query_embedding: queryEmbedding,
      match_threshold: 0.3,
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

    // 4. 构建消息
    const messages = [
      { role: 'system' as const, content: SYSTEM_PROMPT },
      { 
        role: 'user' as const, 
        content: `上下文信息：
${context || '未找到相关信息'}

用户问题：${query}`
      },
    ];

    // 5. 调用 LLM 生成回答
    if (stream) {
      // 流式响应
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
                controller.enqueue(encoder.encode(chunk.content.toString()));
              }
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
