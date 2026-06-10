import { llmInvoke } from '@/lib/llm';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, loadEnv } from '@/storage/database/supabase-client';
import { parseFile, getFileType } from '@/lib/parsers';
import { HeaderUtils, S3Storage, FetchClient, Config } from 'coze-coding-dev-sdk';
import { v4 as uuidv4 } from 'uuid';

// 初始化对象存储（懒加载，仅在图片上传时使用）
let storage: S3Storage | null = null;
function getStorage(): S3Storage | null {
  if (storage) return storage;
  if (!process.env.COZE_BUCKET_ENDPOINT_URL || !process.env.COZE_BUCKET_NAME) {
    console.warn('[Upload] S3 存储未配置，图片上传到对象存储功能不可用');
    return null;
  }
  try {
    storage = new S3Storage({
      endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
      accessKey: "",
      secretKey: "",
      bucketName: process.env.COZE_BUCKET_NAME,
      region: "cn-beijing",
    });
    return storage;
  } catch (e) {
    console.warn('[Upload] S3Storage 初始化失败:', e);
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    
    // 支持 JSON 格式的 URL 请求
    if (contentType.includes('application/json')) {
      const body = await request.json();
      if (body.url) {
        return await handleUrlUpload(body.url, request);
      }
      return NextResponse.json({ error: 'JSON 请求需要提供 url 字段' }, { status: 400 });
    }
    
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const url = formData.get('url') as string | null;
    
    // 处理 URL 解析
    if (url && !file) {
      return await handleUrlUpload(url, request);
    }
    
    if (!file) {
      return NextResponse.json({ error: '未提供文件或URL' }, { status: 400 });
    }

    const filename = file.name;
    const fileType = getFileType(filename);
    
    if (!fileType) {
      return NextResponse.json({ error: `不支持的文件类型: ${filename}` }, { status: 400 });
    }

    // 读取文件内容
    const buffer = Buffer.from(await file.arrayBuffer());
    
    // 如果是图片，上传到对象存储并生成描述
    let imageUrl: string | undefined;
    let storageKey: string | undefined;
    let imageDescription: string | undefined;
    if (fileType === 'image') {
      const s3 = getStorage();
      if (s3) {
        try {
          storageKey = await s3.uploadFile({
            fileContent: buffer,
            fileName: `images/${filename}`,
            contentType: file.type || 'image/jpeg',
          });
          // 生成预签名 URL（有效期 7 天）
          imageUrl = await s3.generatePresignedUrl({
            key: storageKey,
            expireTime: 604800, // 7 天
          });

          // 使用 LLM 生成图片描述
          try {
            const descriptionResult = await llmInvoke(
              [
                {
                  role: 'user',
                  content: [
                    { type: 'text', text: '请仔细观察这张图片，用中文生成一段简洁的描述（50-100字），说明图片的主要内容、场景或物体。如果是图表或数据可视化，请描述其主要信息。' },
                    { type: 'image_url', image_url: { url: imageUrl } },
                  ],
                },
              ],
              { model: 'doubao-seed-2-0-lite-260215' }
            );
            imageDescription = descriptionResult.content || '';
          } catch (descError) {
            console.error('生成图片描述失败:', descError);
            imageDescription = filename; // 使用文件名作为备用描述
          }
        } catch (uploadError) {
          console.error('图片上传失败:', uploadError);
          // 继续处理，但记录错误
        }
      }
      // 如果没有 S3，LLM 仍然可以基于文件名生成简单描述
      if (!imageDescription) {
        imageDescription = filename;
      }
    }
    
    // 解析文件
    const parseResult = await parseFile(buffer, filename, file.type);
    
    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error }, { status: 400 });
    }

    // 获取 Supabase 客户端
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const supabase = await getSupabaseClient();

    // 创建文件上传记录
    const { data: uploadRecord, error: uploadError } = await supabase
      .from('file_uploads')
      .insert({
        filename: filename,
        file_type: fileType,
        file_size: String(file.size),
        storage_url: storageKey || null,
        status: 'processing',
        item_count: String(parseResult.items.length),
      })
      .select()
      .single();

    if (uploadError) {
      return NextResponse.json({ error: `创建上传记录失败: ${uploadError.message}` }, { status: 500 });
    }

    // 插入解析出的条目到知识库（带自动标签）
    const itemsToInsert = await Promise.all(parseResult.items.map(async (item) => {
      const autoTags = await generateAutoTags(item.title, item.content?.substring(0, 2000) || '', item.modality);
      return {
        modality: item.modality,
        title: item.title,
        content: item.modality === 'image' && imageDescription ? imageDescription : item.content,
        source: filename,
        metadata: JSON.stringify({
          ...item.metadata,
          ...(imageUrl && { imageUrl }),
          ...(storageKey && { storageKey }),
          ...(imageDescription && { imageDescription }),
        }),
        tags: JSON.stringify(autoTags),
      };
    }));

    // 在if块外定义变量
    let insertedIds: string[] = [];
    
    if (itemsToInsert.length > 0) {
      console.log(`[上传] 准备插入 ${itemsToInsert.length} 条条目，来源: ${filename}`);
      console.log(`[上传] 条目预览:`, itemsToInsert.map(i => ({ modality: i.modality, title: i.title?.substring(0, 30), contentLen: i.content?.length })));
      
      // 分批插入，避免 Supabase 批量插入限制
      const BATCH_SIZE = 2;
      let totalInserted = 0;
      let lastError: string | null = null;
      
      for (let i = 0; i < itemsToInsert.length; i += BATCH_SIZE) {
        const batch = itemsToInsert.slice(i, i + BATCH_SIZE);
        console.log(`[上传] 插入批次 ${Math.floor(i/BATCH_SIZE) + 1}: ${batch.length} 条`);
        console.log(`[上传] 批次数据:`, JSON.stringify(batch.map(b => ({ title: b.title, modality: b.modality, tags: b.tags })), null, 2));
        
        const { data: batchData, error: batchError } = await supabase
          .from('knowledge_items')
          .insert(batch)
          .select('id, title');
        
        console.log(`[上传] 批次结果: 插入=${batchData?.length || 0}, 错误=${batchError?.message || '无'}`);
        console.log(`[上传] 批次返回数据:`, batchData?.map(d => ({ id: d.id?.substring(0,20), title: d.title?.substring(0,20) })));
        
        if (batchData && batchData.length > 0) {
          totalInserted += batchData.length;
          insertedIds.push(...batchData.map(d => d.id));
        }
        
        if (batchError) {
          lastError = batchError.message;
          console.error(`[上传] 批次插入失败:`, batchError);
        }
      }
      
      const actualInserted = insertedIds.length;
      console.log(`[上传] 总计插入: ${actualInserted} 条, IDs: ${insertedIds.join(', ')}`);

      if (insertedIds.length === 0) {
        // 更新上传状态为失败
        await supabase
          .from('file_uploads')
          .update({ status: 'failed' })
          .eq('id', uploadRecord.id);
        
        return NextResponse.json({ error: `插入知识条目失败: ${lastError || '未知错误'}` }, { status: 500 });
      }
      
      console.log(`[上传] 成功插入 ${insertedIds.length} 条条目`);
    } else {
      console.log(`[上传] 警告: 解析出 0 条条目，来源: ${filename}`);
    }

    // 更新上传状态为完成
    await supabase
      .from('file_uploads')
      .update({ status: 'completed' })
      .eq('id', uploadRecord.id);

    // 返回数据库中实际插入的条目
    // 获取最新插入的条目（按创建时间倒序）
    const actualInsertedCount = insertedIds.length;
    const { data: insertedItems } = await supabase
      .from('knowledge_items')
      .select('id, modality, title, content')
      .order('created_at', { ascending: false })
      .limit(actualInsertedCount);
    
    return NextResponse.json({
      success: true,
      uploadId: uploadRecord.id,
      filename,
      fileType,
      itemCount: actualInsertedCount,
      items: (insertedItems || []).map(item => ({
        id: item.id,
        modality: item.modality,
        title: item.title,
        content: item.content,
      })),
    });
  } catch (error) {
    console.error('文件上传处理失败:', error);
    return NextResponse.json({ 
      error: `处理失败: ${error instanceof Error ? error.message : String(error)}` 
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseClient();
    
    // 获取所有上传记录
    const { data, error } = await supabase
      .from('file_uploads')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      return NextResponse.json({ error: `查询失败: ${error.message}` }, { status: 500 });
    }

    return NextResponse.json({ success: true, uploads: data });
  } catch (error) {
    return NextResponse.json({ 
      error: `查询失败: ${error instanceof Error ? error.message : String(error)}` 
    }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const filename = searchParams.get('filename');
    
    if (!id && !filename) {
      return NextResponse.json({ error: '需要提供 id 或 filename' }, { status: 400 });
    }
    
    const supabase = await getSupabaseClient();
    
    // 获取文件记录
    let fileQuery = supabase.from('file_uploads').select('*');
    if (id) {
      fileQuery = fileQuery.eq('id', id);
    } else if (filename) {
      fileQuery = fileQuery.eq('filename', filename);
    }
    
    const { data: fileData, error: fileError } = await fileQuery.single();
    
    if (fileError || !fileData) {
      return NextResponse.json({ error: '文件不存在' }, { status: 404 });
    }
    
    // 删除对象存储中的文件
    if (fileData.storage_url) {
      const s3 = getStorage();
      if (s3) {
        try {
          const storageKey = fileData.storage_url.split('/').pop()?.split('?')[0] || '';
          if (storageKey) {
            await s3.deleteFile({ fileKey: storageKey });
          }
        } catch (e) {
          console.error('删除存储文件失败:', e);
        }
      }
    }
    
    // 删除相关的知识条目
    const { error: itemsError } = await supabase
      .from('knowledge_items')
      .delete()
      .eq('source', fileData.filename);
    
    if (itemsError) {
      console.error('删除知识条目失败:', itemsError);
    }
    
    // 删除文件记录
    const { error: deleteError } = await supabase
      .from('file_uploads')
      .delete()
      .eq('id', fileData.id);
    
    if (deleteError) {
      return NextResponse.json({ error: `删除失败: ${deleteError.message}` }, { status: 500 });
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `已删除文件 ${fileData.filename} 及相关条目` 
    });
  } catch (error) {
    return NextResponse.json({ 
      error: `删除失败: ${error instanceof Error ? error.message : String(error)}` 
    }, { status: 500 });
  }
}

// PATCH - 更新文件信息
export async function PATCH(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: '缺少文件ID' }, { status: 400 });
    }
    
    const body = await request.json();
    const { filename } = body;
    
    if (!filename) {
      return NextResponse.json({ error: '缺少文件名' }, { status: 400 });
    }
    
    const supabase = await getSupabaseClient();
    
    // 更新文件记录
    const { error: updateError } = await supabase
      .from('file_uploads')
      .update({ filename })
      .eq('id', id);
    
    if (updateError) {
      return NextResponse.json({ error: `更新失败: ${updateError.message}` }, { status: 500 });
    }
    
    return NextResponse.json({ 
      success: true, 
      message: `文件名已更新为 ${filename}` 
    });
  } catch (error) {
    return NextResponse.json({ 
      error: `更新失败: ${error instanceof Error ? error.message : String(error)}` 
    }, { status: 500 });
  }
}

// 处理 URL 上传
async function handleUrlUpload(url: string, request: NextRequest) {
  const supabase = getSupabaseClient();
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
  const fetchClient = new FetchClient(new Config({ baseUrl: process.env.COZE_API_BASE_URL || 'https://api.coze.cn' }), customHeaders);
  
  try {
    // 使用 FetchClient 获取网页内容
    const response = await fetchClient.fetch(url);
    
    if (response.status_code !== 0) {
      return NextResponse.json({ 
        error: `网页解析失败: ${response.status_message || '未知错误'}` 
      }, { status: 400 });
    }
    
    // 提取文本内容
    const textContent = response.content
      .filter((item): item is { type: 'text'; text: string } => item.type === 'text' && !!item.text)
      .map(item => item.text)
      .join('\n\n');
    
    if (!textContent.trim()) {
      return NextResponse.json({ 
        error: '网页内容为空' 
      }, { status: 400 });
    }
    
    // 创建文件记录
    const fileId = uuidv4();
    const title = response.title || new URL(url).hostname;
    
    // 保存文件上传记录
    await supabase.from('file_uploads').insert({
      id: fileId,
      filename: title,
      file_type: 'webpage',
      file_size: textContent.length,
      storage_url: url,
      status: 'completed',
      item_count: 1,
    });
    
    // 自动生成标签
    const tags = await generateAutoTags(title, textContent.substring(0, 2000), 'webpage');
    
    // 创建知识条目
    const itemId = uuidv4();
    await supabase.from('knowledge_items').insert({
      id: itemId,
      modality: 'webpage',
      title: title,
      content: textContent.substring(0, 8000), // 限制内容长度
      source: url,
      metadata: JSON.stringify({
        url: url,
        title: response.title,
        publish_time: response.publish_time,
        filetype: response.filetype,
      }),
      tags: JSON.stringify(tags),
    });
    
    return NextResponse.json({
      success: true,
      message: `网页解析成功: ${title}`,
      fileId,
      itemCount: 1,
      title,
      contentLength: textContent.length,
    });
  } catch (error) {
    return NextResponse.json({ 
      error: `网页解析失败: ${error instanceof Error ? error.message : String(error)}` 
    }, { status: 500 });
  }
}

// 自动生成标签
async function generateAutoTags(title: string, content: string, modality: string): Promise<string[]> {
  const tags: string[] = [];
  
  // 基于模态类型的默认标签
  const modalityTags: Record<string, string> = {
    'excel': '表格数据',
    'image': '图片',
    'pdf': 'PDF文档',
    'word': 'Word文档',
    'ppt': 'PPT演示',
    'audio': '音频',
    'webpage': '网页',
    'text': '文本',
    'json': 'JSON数据',
    'markdown': 'Markdown',
  };
  
  if (modalityTags[modality]) {
    tags.push(modalityTags[modality]);
  }
  
  // 基于内容的关键词提取
  const contentLower = (title + ' ' + content).toLowerCase();
  
  // 常见主题关键词
  const keywordPatterns: [RegExp, string][] = [
    [/港口|port|码头|dock/i, '港口'],
    [/船|ship|vessel|航运/i, '航运'],
    [/物流|logistics|运输/i, '物流'],
    [/日本|japan|jp/i, '日本'],
    [/中国|china|cn/i, '中国'],
    [/美国|usa|america/i, '美国'],
    [/欧洲|europe|eu/i, '欧洲'],
    [/亚洲|asia/i, '亚洲'],
    [/数据|data|统计/i, '数据'],
    [/代码|code|编程/i, '编程'],
    [/api|接口/i, 'API'],
    [/配置|config|设置/i, '配置'],
    [/报告|report|报表/i, '报告'],
    [/技术|tech|技术文档/i, '技术'],
  ];
  
  for (const [pattern, tag] of keywordPatterns) {
    if (pattern.test(contentLower) && !tags.includes(tag)) {
      tags.push(tag);
    }
  }
  
  // 最多返回 5 个标签
  return tags.slice(0, 5);
}
