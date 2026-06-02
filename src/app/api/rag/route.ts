import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { LLMClient, EmbeddingClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

interface RagRequest {
  query: string;
  modality?: string;
  topK?: number;
  stream?: boolean;
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
    const { query, modality, topK = 5, stream = true } = body;

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: '问题不能为空' }, { status: 400 });
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const supabase = getSupabaseClient();
    const embeddingClient = new EmbeddingClient();
    const llmClient = new LLMClient(new Config(), customHeaders);

    // 1. 生成查询向量
    const queryEmbedding = await embeddingClient.embedText(query);

    // 2. 检索相关上下文
    const { data: contextItems, error: searchError } = await supabase.rpc('vector_search', {
      query_embedding: queryEmbedding,
      match_threshold: 0.3,
      match_count: topK,
      filter_modality: modality || null,
    });

    if (searchError) {
      // 使用备用搜索
      const fallbackResult = await fallbackVectorSearch(supabase, queryEmbedding, modality, topK);
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
