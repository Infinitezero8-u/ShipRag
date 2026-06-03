import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { EmbeddingClient, HeaderUtils } from 'coze-coding-dev-sdk';

// 内容哈希缓存，用于判重
const contentHashCache = new Set<string>();

// 计算内容哈希（简单版本：使用前100字符 + 长度）
function getContentHash(content: string): string {
  const normalized = content.trim().toLowerCase();
  const prefix = normalized.substring(0, 100);
  const length = normalized.length;
  return `${length}:${prefix}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { itemId, batchSize = 10, skipDuplicate = true } = body;

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const supabase = getSupabaseClient();
    const embeddingClient = new EmbeddingClient();

    // 如果指定了 itemId，只处理该条目
    if (itemId) {
      return await embedSingleItem(supabase, embeddingClient, itemId);
    }

    // 初始化判重缓存：加载已有条目的内容哈希
    if (skipDuplicate && contentHashCache.size === 0) {
      const { data: existingItems } = await supabase
        .from('knowledge_items')
        .select('content')
        .not('embedding', 'is', null);
      
      if (existingItems) {
        for (const item of existingItems) {
          if (item.content) {
            contentHashCache.add(getContentHash(item.content));
          }
        }
      }
    }

    // 否则批量处理所有未向量化的条目
    // 查询 embedding 为 null 的条目
    const { data: items, error: queryError } = await supabase
      .from('knowledge_items')
      .select('id, modality, content, title')
      .is('embedding', null)
      .limit(batchSize);

    if (queryError) {
      return NextResponse.json({ error: `查询失败: ${queryError.message}` }, { status: 500 });
    }

    if (!items || items.length === 0) {
      return NextResponse.json({ 
        success: true, 
        message: '没有需要向量化的条目',
        processed: 0 
      });
    }

    let processed = 0;
    let skipped = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const item of items) {
      // 跳过图片类型（需要单独处理）
      if (item.modality === 'image') {
        continue;
      }

      // 跳过空内容
      if (!item.content || item.content.trim().length === 0) {
        continue;
      }

      // 判重检查
      if (skipDuplicate) {
        const contentHash = getContentHash(item.content);
        if (contentHashCache.has(contentHash)) {
          skipped++;
          // 删除重复条目
          await supabase.from('knowledge_items').delete().eq('id', item.id);
          continue;
        }
        // 添加到缓存
        contentHashCache.add(contentHash);
      }

      try {
        // 截断内容防止超过 token 限制（最大 8000 字符约 2000 tokens）
        const maxContentLength = 8000;
        const truncatedContent = item.content.length > maxContentLength 
          ? item.content.substring(0, maxContentLength) + '...'
          : item.content;
        
        // 调用 Embedding SDK 生成向量
        const embedding = await embeddingClient.embedText(truncatedContent);
        
        // 使用原生 SQL 更新向量（绕过 Drizzle schema 验证）
        const { error: updateError } = await supabase.rpc('update_embedding', {
          item_id: item.id,
          embedding_vector: embedding,
        });

        if (updateError) {
          failed++;
          errors.push(`更新 ${item.id} 失败: ${updateError.message}`);
        } else {
          processed++;
        }
      } catch (embedError) {
        failed++;
        errors.push(`向量化 ${item.id} 失败: ${embedError instanceof Error ? embedError.message : String(embedError)}`);
      }
    }

    return NextResponse.json({
      success: true,
      processed,
      skipped,
      failed,
      total: items.length,
      errors: errors.length > 0 ? errors : undefined,
    });
  } catch (error) {
    console.error('向量化处理失败:', error);
    return NextResponse.json({ 
      error: `处理失败: ${error instanceof Error ? error.message : String(error)}` 
    }, { status: 500 });
  }
}

async function embedSingleItem(
  supabase: ReturnType<typeof getSupabaseClient>,
  embeddingClient: EmbeddingClient,
  itemId: string
) {
  // 查询条目
  const { data: item, error: queryError } = await supabase
    .from('knowledge_items')
    .select('id, modality, content, title')
    .eq('id', itemId)
    .maybeSingle();

  if (queryError) {
    return NextResponse.json({ error: `查询失败: ${queryError.message}` }, { status: 500 });
  }

  if (!item) {
    return NextResponse.json({ error: '条目不存在' }, { status: 404 });
  }

  // 检查是否为图片
  if (item.modality === 'image') {
    return NextResponse.json({ error: '图片条目需要通过图片 URL 进行向量化' }, { status: 400 });
  }

  // 检查内容
  if (!item.content || item.content.trim().length === 0) {
    return NextResponse.json({ error: '条目内容为空' }, { status: 400 });
  }

  try {
    // 截断内容防止超过 token 限制
    const maxContentLength = 8000;
    const truncatedContent = item.content.length > maxContentLength 
      ? item.content.substring(0, maxContentLength) + '...'
      : item.content;
    
    // 生成向量
    const embedding = await embeddingClient.embedText(truncatedContent);
    
    // 使用原生 SQL 更新向量
    const { error: updateError } = await supabase.rpc('update_embedding', {
      item_id: item.id,
      embedding_vector: embedding,
    });

    if (updateError) {
      return NextResponse.json({ error: `更新失败: ${updateError.message}` }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      itemId: item.id,
      title: item.title,
      embeddingDimension: embedding.length,
    });
  } catch (embedError) {
    return NextResponse.json({ 
      error: `向量化失败: ${embedError instanceof Error ? embedError.message : String(embedError)}` 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    // 统计向量化状态
    const { count: totalCount, error: totalError } = await supabase
      .from('knowledge_items')
      .select('*', { count: 'exact', head: true });

    const { count: embeddedCount, error: embeddedError } = await supabase
      .from('knowledge_items')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);

    if (totalError || embeddedError) {
      return NextResponse.json({ 
        error: `统计失败: ${totalError?.message || embeddedError?.message}` 
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      total: totalCount || 0,
      embedded: embeddedCount || 0,
      pending: (totalCount || 0) - (embeddedCount || 0),
    });
  } catch (error) {
    return NextResponse.json({ 
      error: `统计失败: ${error instanceof Error ? error.message : String(error)}` 
    }, { status: 500 });
  }
}
