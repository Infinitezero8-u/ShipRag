import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { parseFile, getFileType } from '@/lib/parsers';
import { HeaderUtils, S3Storage, LLMClient, Config } from 'coze-coding-dev-sdk';

// 初始化对象存储
const storage = new S3Storage({
  endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
  accessKey: "",
  secretKey: "",
  bucketName: process.env.COZE_BUCKET_NAME,
  region: "cn-beijing",
});

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    
    if (!file) {
      return NextResponse.json({ error: '未提供文件' }, { status: 400 });
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
      try {
        storageKey = await storage.uploadFile({
          fileContent: buffer,
          fileName: `images/${filename}`,
          contentType: file.type || 'image/jpeg',
        });
        // 生成预签名 URL（有效期 7 天）
        imageUrl = await storage.generatePresignedUrl({
          key: storageKey,
          expireTime: 604800, // 7 天
        });
        
        // 使用 LLM 生成图片描述
        try {
          const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
          const llmClient = new LLMClient(new Config(), customHeaders);
          const descriptionResult = await llmClient.invoke(
            [
              {
                role: 'user',
                content: [
                  { type: 'text', text: '请用中文简要描述这张图片的内容，不超过100字。' },
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
    
    // 解析文件
    const parseResult = await parseFile(buffer, filename, file.type);
    
    if (!parseResult.success) {
      return NextResponse.json({ error: parseResult.error }, { status: 400 });
    }

    // 获取 Supabase 客户端
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const supabase = getSupabaseClient();

    // 创建文件上传记录
    const { data: uploadRecord, error: uploadError } = await supabase
      .from('file_uploads')
      .insert({
        filename,
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

    // 插入解析出的条目到知识库
    const itemsToInsert = parseResult.items.map(item => ({
      modality: item.modality,
      title: item.title,
      content: item.modality === 'image' && imageDescription ? imageDescription : item.content,
      source: filename,
      metadata: {
        ...item.metadata,
        ...(imageUrl && { imageUrl }),
        ...(storageKey && { storageKey }),
        ...(imageDescription && { imageDescription }),
      },
    }));

    if (itemsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('knowledge_items')
        .insert(itemsToInsert);

      if (insertError) {
        // 更新上传状态为失败
        await supabase
          .from('file_uploads')
          .update({ status: 'failed' })
          .eq('id', uploadRecord.id);
        
        return NextResponse.json({ error: `插入知识条目失败: ${insertError.message}` }, { status: 500 });
      }
    }

    // 更新上传状态为完成
    await supabase
      .from('file_uploads')
      .update({ status: 'completed' })
      .eq('id', uploadRecord.id);

    return NextResponse.json({
      success: true,
      uploadId: uploadRecord.id,
      filename,
      fileType,
      itemCount: parseResult.items.length,
      items: parseResult.items.map(item => ({
        id: item.id,
        modality: item.modality,
        title: item.title,
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
    const supabase = getSupabaseClient();
    
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
    
    const supabase = getSupabaseClient();
    
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
      try {
        const storageKey = fileData.storage_url.split('/').pop()?.split('?')[0] || '';
        if (storageKey) {
          await storage.deleteFile({ fileKey: storageKey });
        }
      } catch (e) {
        console.error('删除存储文件失败:', e);
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
