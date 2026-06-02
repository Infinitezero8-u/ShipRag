import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { parseFile, getFileType } from '@/lib/parsers';
import { HeaderUtils } from 'coze-coding-dev-sdk';

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
      content: item.content,
      source: filename,
      metadata: item.metadata || {},
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
