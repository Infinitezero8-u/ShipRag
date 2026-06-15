import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/local-db';
import { EmbeddingClient } from '@/lib/ollama/embedding';
import { Config } from '@/lib/ollama/config';
import { LLMClient } from '@/lib/ollama/llm';
// S3 not needed locally
function extractHeaders() { return {}; }
import path from 'path';

// 初始化对象存储
const storage = null as any; // S3 not needed locally

// 初始化 LLM 配置
const llmConfig = new Config();

// 内容哈希缓存，用于判重
const contentHashCache = new Set<string>();

// 自动标签生成函数
function generateAutoTags(content: string, title: string, modality: string, source: string): string[] {
  const tags: string[] = [];
  const text = `${content} ${title} ${source}`.toLowerCase();
  
  // 模态标签
  if (modality === 'image') tags.push('图片');
  if (modality === 'excel' || modality === 'csv') tags.push('表格数据');
  if (modality === 'text') tags.push('文本');
  if (modality === 'pdf') tags.push('PDF');
  if (modality === 'ppt') tags.push('PPT');
  if (modality === 'audio') tags.push('音频');
  if (modality === 'webpage') tags.push('网页');
  
  // 内容关键词标签
  const keywordTags: [RegExp, string][] = [
    [/港口|port|harbor/i, '港口'],
    [/日本|japan|jp/i, '日本'],
    [/中国|china|cn/i, '中国'],
    [/美国|usa|us/i, '美国'],
    [/韩国|korea|kr/i, '韩国'],
    [/英国|uk|gb/i, '英国'],
    [/德国|germany|de/i, '德国'],
    [/法国|france|fr/i, '法国'],
    [/俄罗斯|russia|ru/i, '俄罗斯'],
    [/澳大利亚|australia|au/i, '澳大利亚'],
    [/印度|india|in/i, '印度'],
    [/巴西|brazil|br/i, '巴西'],
    [/加拿大|canada|ca/i, '加拿大'],
    [/意大利|italy|it/i, '意大利'],
    [/西班牙|spain|es/i, '西班牙'],
    [/东南亚|southeast asia/i, '东南亚'],
    [/欧洲|europe/i, '欧洲'],
    [/亚洲|asia/i, '亚洲'],
    [/非洲|africa/i, '非洲'],
    [/大洋洲|oceania/i, '大洋洲'],
    [/集装箱|container/i, '集装箱'],
    [/码头|terminal|wharf/i, '码头'],
    [/海关|customs/i, '海关'],
    [/物流|logistics/i, '物流'],
    [/贸易|trade/i, '贸易'],
  ];
  
  for (const [pattern, tag] of keywordTags) {
    if (pattern.test(text) && !tags.includes(tag)) {
      tags.push(tag);
    }
  }
  
  return tags;
}


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

    const customHeaders: Record<string, string> = {};
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
      .select('id, modality, content, title, metadata')
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
      // 处理图片类型
      if (item.modality === 'image') {
        const imageUrl = (item.metadata as Record<string, unknown>)?.imageUrl as string | undefined;
        const localPath = (item.metadata as Record<string, unknown>)?.localPath as string | undefined;
        const imgPath = (item.metadata as Record<string, unknown>)?.imgPath as string | undefined;

        // 策略 1: 有本地路径（上传时存/RA解析）→ vision LLM + embedText
        // 策略 2: 有 S3 URL → download + embedImage
        // 策略 3: 两者都无 → 直接用标题文本 embedText

        if (imageUrl) {
          try {
            const embedding = await embeddingClient.embedImage(imageUrl);
            const { error: updateError } = await supabase.rpc('update_embedding', {
              item_id: item.id, embedding_vector: embedding,
            });
            if (updateError) { failed++; errors.push(`图片 ${item.id} 更新失败: ${updateError.message}`); }
            else { processed++; }
          } catch (e) {
            failed++; errors.push(`图片 ${item.id} 嵌入失败: ${e instanceof Error ? e.message : String(e)}`);
          }
          continue;
        }

        // No URL — try local file vision description, otherwise embed title text
        let imageDesc = item.content;
        const resolvedPath = localPath || imgPath;
        if ((!imageDesc || imageDesc === item.title) && resolvedPath) {
          try {
            const fs = await import('fs/promises');
            const buf = await fs.readFile(resolvedPath);
            const base64 = buf.toString('base64');
            const mime = resolvedPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
            const llmClient = new LLMClient(new Config(), {});
            const visResult = await llmClient.invoke([{
              role: 'user',
              content: [
                { type: 'text', text: '请用中文简要描述这张图片的内容，不超过100字。' },
                { type: 'image_url', image_url: { url: 'data:' + mime + ';base64,' + base64 } },
              ],
            }]);
            imageDesc = visResult.content || item.title || '图片';
          } catch (e) {
            imageDesc = item.title || '图片内容待识别';
          }
        }

        // Embed description text
        try {
          if (!imageDesc || imageDesc.trim().length === 0) imageDesc = item.title;
          const embedding = await embeddingClient.embedText(imageDesc.substring(0, 2000));
          await supabase.from('knowledge_items').update({ content: imageDesc }).eq('id', item.id);
          const { error: updateError } = await supabase.rpc('update_embedding', {
            item_id: item.id, embedding_vector: embedding,
          });
          if (updateError) { failed++; errors.push(`图片 ${item.id} 更新失败: ${updateError.message}`); }
          else { processed++; }
        } catch (e) {
          failed++; errors.push(`图片 ${item.id} 嵌入失败: ${e instanceof Error ? e.message : String(e)}`);
        }
        continue;
      }

      // 跳过空内容
      if (!item.content || item.content.trim().length === 0) {
        continue;
      }

      // 判重检查 (仅跳过，不删除)
      if (skipDuplicate) {
        const contentHash = getContentHash(item.content);
        if (contentHashCache.has(contentHash)) {
          skipped++;
          continue;
        }
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

// 删除待向量化条目（取消向量化）
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { ids, clearAll, singleId } = body;

    console.log('[DELETE] 收到请求:', { clearAll, singleId, idsCount: ids?.length });

    const supabase = getSupabaseClient();

    let deletedCount = 0;

    // 删除条目（支持已向量化和待向量化）
    // 单条删除 / 批量删除
    if (singleId) {
      const { error } = await supabase
        .from('knowledge_items')
        .delete({ count: 'exact' })
        .eq('id', singleId);
      if (error) { console.error('[DELETE] 删除失败:', error); throw error; }
      deletedCount = 1;
    }
    // 全部取消
    else if (clearAll) {
      // 先查询待删除数量（embedding为null的条目）
      const { count: pendingCount, error: countError } = await supabase
        .from('knowledge_items')
        .select('*', { count: 'exact', head: true })
        .is('embedding', null);
      
      if (countError) {
        console.error('[DELETE] 查询待删除数量失败:', countError);
        throw countError;
      }
      
      console.log('[DELETE] 待删除条目数:', pendingCount);

      if (pendingCount === 0) {
        return NextResponse.json({
          success: true,
          deleted: 0,
          message: '没有待向量化的条目'
        });
      }

      // 删除所有待向量化的条目（embedding 为 null）
      // 注意：不会删除已向量化的数据（embedding不为null的）
      const { count, error } = await supabase
        .from('knowledge_items')
        .delete({ count: 'exact' })
        .is('embedding', null);

      if (error) {
        console.error('[DELETE] 批量删除失败:', error);
        throw error;
      }
      deletedCount = count || 0;
      console.log('[DELETE] 实际删除数量:', deletedCount);
    } 
    // 批量取消指定条目（仅删除待向量化的）
    else if (ids && Array.isArray(ids) && ids.length > 0) {
      // 仅删除待向量化的条目（embedding为null）
      const { count, error } = await supabase
        .from('knowledge_items')
        .delete({ count: 'exact' })
        .in('id', ids)
        .is('embedding', null);  // 确保只删除未向量化的

      if (error) {
        console.error('[DELETE] 批量删除指定条目失败:', error);
        throw error;
      }
      deletedCount = count || 0;
      console.log('[DELETE] 已删除指定待向量化条目:', deletedCount);
    } else {
      console.log('[DELETE] 无操作: 未提供有效参数');
    }

    // 重新查询统计，验证结果
    const { count: newTotal } = await supabase
      .from('knowledge_items')
      .select('*', { count: 'exact', head: true });
    
    const { count: newEmbedded } = await supabase
      .from('knowledge_items')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);
    
    const newPending = (newTotal || 0) - (newEmbedded || 0);
    
    console.log('[DELETE] 操作后统计:', { total: newTotal, embedded: newEmbedded, pending: newPending });

    return NextResponse.json({
      success: true,
      deleted: deletedCount,
      message: deletedCount > 0 ? `已删除 ${deletedCount} 条待向量化条目` : '没有待处理的条目',
      stats: {
        total: newTotal || 0,
        embedded: newEmbedded || 0,
        pending: newPending
      }
    });
  } catch (error) {
    console.error('取消向量化失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '取消失败'
    }, { status: 500 });
  }
}

// 重新向量化和重新打标签
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ids, all } = body;
    
    const supabase = getSupabaseClient();
    
    if (action === 'reembed') {
      // 重新向量化
      const { keepOld } = body;
      let targetIds = ids;
      
      if (all) {
        // 获取所有已向量化的条目
        const { data, error } = await supabase
          .from('knowledge_items')
          .select('id')
          .not('embedding', 'is', null);
        
        if (error) throw error;
        targetIds = data?.map((item: { id: string }) => item.id) || [];
      }
      
      if (!targetIds || targetIds.length === 0) {
        return NextResponse.json({ success: true, processed: 0, message: '没有需要重新向量化的条目' });
      }
      
      if (keepOld) {
        // 保留原结果：直接执行向量化覆盖
        const embeddingClient = new EmbeddingClient();
        let processed = 0;
        let failed = 0;
        const errors: string[] = [];
        
        for (const itemId of targetIds) {
          try {
            // 获取条目内容
            const { data: item, error: queryError } = await supabase
              .from('knowledge_items')
              .select('id, content, modality, metadata')
              .eq('id', itemId)
              .maybeSingle();
            
            if (queryError || !item) {
              failed++;
              continue;
            }
            
            // 处理图片
            if (item.modality === 'image') {
              const imageUrl = (item.metadata as Record<string, unknown>)?.imageUrl as string | undefined;
              if (imageUrl) {
                const embedding = await embeddingClient.embedImage(imageUrl);
                await supabase.rpc('update_embedding', {
                  item_id: item.id,
                  embedding_vector: embedding,
                });
                processed++;
                continue;
              }
            }
            
            // 文本向量化
            if (item.content && item.content.trim().length > 0) {
              const maxContentLength = 8000;
              const truncatedContent = item.content.length > maxContentLength 
                ? item.content.substring(0, maxContentLength) + '...'
                : item.content;
              
              const embedding = await embeddingClient.embedText(truncatedContent);
              
              const { error: updateError } = await supabase.rpc('update_embedding', {
                item_id: item.id,
                embedding_vector: embedding,
              });
              
              if (updateError) {
                failed++;
                errors.push(`更新 ${itemId} 失败: ${updateError.message}`);
              } else {
                processed++;
              }
            } else {
              failed++;
            }
          } catch (e) {
            failed++;
            errors.push(`处理 ${itemId} 失败: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
        
        return NextResponse.json({
          success: true,
          processed,
          failed,
          total: targetIds.length,
          message: `已重新向量化 ${processed} 个条目`,
          errors: errors.length > 0 ? errors : undefined
        });
      } else {
        // 不保留原结果：清除向量，让它们重新被向量化
        const { error: clearError } = await supabase
          .from('knowledge_items')
          .update({ embedding: null })
          .in('id', targetIds);
        
        if (clearError) throw clearError;
        
        return NextResponse.json({
          success: true,
          processed: targetIds.length,
          message: `已清除 ${targetIds.length} 条条目的向量，请执行向量化`
        });
      }
    }
    
    if (action === 'retag') {
      // 重新打标签
      let query = supabase.from('knowledge_items').select('id, content, title, modality, source');
      
      if (ids && ids.length > 0) {
        query = query.in('id', ids) as typeof query;
      }
      
      const { data: items, error: queryError } = await query;
      
      if (queryError) throw queryError;
      
      if (!items || items.length === 0) {
        return NextResponse.json({ success: true, processed: 0, message: '没有需要打标签的条目' });
      }
      
      let processed = 0;
      const errors: string[] = [];
      
      for (const item of items) {
        try {
          const tags = generateAutoTags(item.content || '', item.title || '', item.modality, item.source || '');
          
          const { error: updateError } = await supabase
            .from('knowledge_items')
            .update({ tags })
            .eq('id', item.id);
          
          if (updateError) {
            errors.push(`更新 ${item.id} 失败: ${updateError.message}`);
          } else {
            processed++;
          }
        } catch (e) {
          errors.push(`处理 ${item.id} 失败: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      
      return NextResponse.json({
        success: true,
        processed,
        total: items.length,
        errors: errors.length > 0 ? errors : undefined
      });
    }
    
    // 标签向量化
    if (action === 'vectorizeTags') {
      const { tagNames } = body;
      
      if (!tagNames || !Array.isArray(tagNames) || tagNames.length === 0) {
        return NextResponse.json({ error: '请提供标签列表' }, { status: 400 });
      }
      
      const embeddingClient = new EmbeddingClient();
      const processed: string[] = [];
      const errors: string[] = [];
      
      for (const tagName of tagNames) {
        try {
          // 生成标签文本的向量
          const embedding = await embeddingClient.embedText(tagName);
          
          if (!embedding || embedding.length === 0) {
            errors.push(`标签 "${tagName}" 向量化失败`);
            continue;
          }
          
          // 获取该标签的条目数量
          const { data: tagItems } = await supabase
            .from('knowledge_items')
            .select('id')
            .contains('tags', [tagName]);
          
          const count = tagItems?.length || 0;
          
          // 插入或更新标签向量
          const { error: upsertError } = await supabase
            .from('tag_vectors')
            .upsert({
              name: tagName,
              embedding: `[${embedding.join(',')}]`,
              count,
              updated_at: new Date().toISOString(),
            }, { onConflict: 'name' });
          
          if (upsertError) {
            errors.push(`保存标签 "${tagName}" 失败: ${upsertError.message}`);
          } else {
            processed.push(tagName);
          }
        } catch (e) {
          errors.push(`处理标签 "${tagName}" 失败: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      
      return NextResponse.json({
        success: true,
        processed,
        total: tagNames.length,
        errors: errors.length > 0 ? errors : undefined
      });
    }
    
    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (error) {
    console.error('重新处理失败:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '操作失败'
    }, { status: 500 });
  }
}
