import { llmInvoke } from '@/lib/llm';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { S3Storage } from 'coze-coding-dev-sdk';
import { embedText } from '@/lib/local-embed';
import { v4 as uuidv4 } from 'uuid';

// 禁用TLS证书验证（用于解决self-signed certificate问题）
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

// 向量维度限制（pgvector HNSW索引限制）
const EMBEDDING_DIM = 1536;

// 截断embedding到指定维度
function truncateEmbedding(embedding: number[]): number[] {
  if (!embedding || embedding.length === 0) return embedding;
  if (embedding.length <= EMBEDDING_DIM) return embedding;
  return embedding.slice(0, EMBEDDING_DIM);
}

// 文档分类
const REGULATION_CATEGORIES = [
  'maritime_rules',      // 海事规章制度
  'platform_ops',        // 平台运维规范
  'trajectory_annotation', // 航迹标注准则
  'model_training',      // 模型训练管理办法
  'other'                // 其他资料
] as const;

const CATEGORY_LABELS: Record<string, string> = {
  'maritime_rules': '海事规章制度',
  'platform_ops': '平台运维规范',
  'trajectory_annotation': '航迹标注准则',
  'model_training': '模型训练管理办法',
  'other': '其他资料'
};

// 初始化对象存储（懒加载）
let storage: S3Storage | null = null;
function getStorage(): S3Storage | null {
  if (storage) return storage;
  if (!process.env.COZE_BUCKET_ENDPOINT_URL || !process.env.COZE_BUCKET_NAME) {
    console.warn('[Regulations] S3 存储未配置，文件将仅存入数据库');
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
    console.warn('[Regulations] S3Storage 初始化失败:', e);
    return null;
  }
}

// 获取分类标签
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const id = searchParams.get('id');
  
  const supabase = getSupabaseClient();
  
  // 获取分类列表
  if (action === 'categories') {
    return NextResponse.json({
      categories: REGULATION_CATEGORIES.map(key => ({
        key,
        label: CATEGORY_LABELS[key]
      }))
    });
  }
  
  // 获取单个文档详情
  if (action === 'detail' && id) {
    const { data: regulation, error } = await supabase
      .from('regulations')
      .select('*')
      .eq('id', id)
      .single();
    
    if (error || !regulation) {
      return NextResponse.json({ error: '文档不存在' }, { status: 404 });
    }
    
    // 获取该文档的所有切片
    const { data: chunks } = await supabase
      .from('regulation_chunks')
      .select('*')
      .eq('regulation_id', id)
      .order('chunk_index', { ascending: true });
    
    return NextResponse.json({
      regulation,
      chunks: chunks || []
    });
  }
  
  // 获取向量化状态统计
  if (action === 'vector-stats') {
    const { data: stats, count: total } = await supabase
      .from('regulations')
      .select('vector_status', { count: 'exact' });
    
    const statusCounts = {
      pending: 0,
      success: 0,
      failed: 0
    };
    
    if (stats) {
      for (const item of stats) {
        statusCounts[item.vector_status as keyof typeof statusCounts]++;
      }
    }
    
    return NextResponse.json({
      total,
      ...statusCounts
    });
  }
  
  // 列表查询
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '20');
  const category = searchParams.get('category');
  const isValid = searchParams.get('isValid');
  const vectorStatus = searchParams.get('vectorStatus');
  const search = searchParams.get('search');
  
  let query = supabase
    .from('regulations')
    .select('*', { count: 'exact' });
  
  // 分类筛选
  if (category) {
    query = query.contains('categories', [category]);
  }
  
  // 生效状态筛选
  if (isValid !== null && isValid !== undefined && isValid !== '') {
    query = query.eq('is_valid', isValid === 'true');
  }
  
  // 向量化状态筛选
  if (vectorStatus) {
    query = query.eq('vector_status', vectorStatus);
  }
  
  // 关键词搜索
  if (search) {
    query = query.or(`filename.ilike.%${search}%,description.ilike.%${search}%`);
  }
  
  // 分页
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  
  const { data, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to);
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json({
    items: data || [],
    total: count || 0,
    page,
    pageSize
  });
}

// 文档上传与处理
export async function POST(request: NextRequest) {
  try {
    const contentType = request.headers.get('content-type') || '';
    
    // 处理 JSON 请求（包括操作请求）
    if (contentType.includes('application/json')) {
      const body = await request.json();
      
      // 批量分类推荐
      if (body.action === 'recommend-categories') {
        return await handleCategoryRecommendation(body.filenames, request);
      }
      
      // 编辑基本信息
      if (body.action === 'update') {
        return await handleUpdate(body, request);
      }
      
      // 删除文档
      if (body.action === 'delete') {
        return await handleDelete(body.ids, request);
      }
      
      // 重新向量化
      if (body.action === 'revectorize') {
        return await handleRevectorize(body.id, request);
      }
      
      // 批量向量化
      if (body.action === 'batch-vectorize') {
        return await handleBatchVectorize(body.ids, request);
      }
    }
    
    // 文件上传
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const categoriesStr = formData.get('categories') as string | null;
    const isValidStr = formData.get('isValid') as string | null;
    const version = formData.get('version') as string | null;
    const publishDate = formData.get('publishDate') as string | null;
    const publishOrg = formData.get('publishOrg') as string | null;
    const description = formData.get('description') as string | null;
    
    if (!file) {
      return NextResponse.json({ error: '未提供文件' }, { status: 400 });
    }
    
    // 解析分类
    let categories: string[] = [];
    if (categoriesStr) {
      try {
        categories = JSON.parse(categoriesStr);
      } catch {
        categories = categoriesStr.split(',').filter(c => c);
      }
    }
    
    // 验证分类必须选择
    if (categories.length === 0) {
      return NextResponse.json({ 
        error: '请选择文档分类',
        needCategory: true 
      }, { status: 400 });
    }
    
    // 验证分类有效性
    const validCategories = categories.filter(c => REGULATION_CATEGORIES.includes(c as any));
    if (validCategories.length === 0) {
      return NextResponse.json({ 
        error: '请选择有效的文档分类',
        needCategory: true,
        availableCategories: REGULATION_CATEGORIES.map(key => ({
          key,
          label: CATEGORY_LABELS[key]
        }))
      }, { status: 400 });
    }
    
    const filename = file.name;
    const fileType = filename.split('.').pop()?.toLowerCase() || 'txt';
    
    // 读取文件内容
    const buffer = Buffer.from(await file.arrayBuffer());
    const fileSize = buffer.length;
    
    // 上传到对象存储（可选，S3 未配置时跳过）
    let storageUrl: string | null = null;
    const s3 = getStorage();
    if (s3) {
      try {
        const storageKey = await s3.uploadFile({
          fileContent: buffer,
          fileName: `regulations/${uuidv4()}/${filename}`,
          contentType: file.type || 'application/octet-stream',
        });
        storageUrl = await s3.generatePresignedUrl({
          key: storageKey,
          expireTime: 604800, // 7 天
        });
      } catch (e) {
        console.warn('[Regulations] 上传到对象存储失败，继续处理:', e);
      }
    }
    
    // 解析文件内容
    const content = await parseDocumentContent(buffer, fileType);
    
    // 清洗并分片
    const chunks = cleanAndChunkContent(content, filename);
    
    const supabase = getSupabaseClient();
    const isValid = isValidStr !== 'false';
    
    // 创建文档记录
    const { data: regulation, error: insertError } = await supabase
      .from('regulations')
      .insert({
        filename,
        file_type: fileType,
        file_size: fileSize.toString(),
        storage_url: storageUrl,
        original_content: content,
        categories: JSON.stringify(validCategories),
        is_valid: isValid,
        version: version || null,
        publish_date: publishDate || null,
        publish_org: publishOrg || null,
        description: description || null,
        vector_status: 'pending',
        chunk_count: chunks.length.toString()
      })
      .select()
      .single();
    
    if (insertError || !regulation) {
      return NextResponse.json({ error: `文档创建失败: ${insertError?.message}` }, { status: 500 });
    }
    
    // 创建切片记录
    const chunkRecords = chunks.map((chunk, index) => ({
      regulation_id: regulation.id,
      chunk_index: index.toString(),
      chapter: chunk.chapter || null,
      clause: chunk.clause || null,
      title: chunk.title || null,
      content: chunk.content,
      metadata: JSON.stringify({
        document_name: filename,
        categories: validCategories,
        is_valid: isValid,
        version: version || null,
        publish_date: publishDate || null,
        publish_org: publishOrg || null
      }),
      embedding_status: 'pending'
    }));
    
    if (chunkRecords.length > 0) {
      const { error: chunkError } = await supabase
        .from('regulation_chunks')
        .insert(chunkRecords);
      
      if (chunkError) {
        console.error('切片创建失败:', chunkError);
      }
    }
    
    return NextResponse.json({
      success: true,
      regulation: {
        id: regulation.id,
        filename: regulation.filename,
        categories: regulation.categories,
        is_valid: regulation.is_valid,
        chunk_count: chunks.length
      }
    });
    
  } catch (error) {
    console.error('规章制度处理错误:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : '处理失败' 
    }, { status: 500 });
  }
}

// 解析文档内容
async function parseDocumentContent(buffer: Buffer, fileType: string): Promise<string> {
  // 简单的文本提取逻辑
  if (fileType === 'txt') {
    return buffer.toString('utf-8');
  }
  
  // 对于其他格式，尝试使用MarkItDown转换
  if (['pdf', 'doc', 'docx'].includes(fileType)) {
    try {
      const { execSync } = await import('child_process');
      const path = await import('path');
      const scriptPath = path.join(process.cwd(), 'scripts', 'markitdown_converter.py');
      
      // 写入临时文件
      const fs = await import('fs');
      const tmpFile = `/tmp/regulation_${Date.now()}.${fileType}`;
      fs.writeFileSync(tmpFile, buffer);
      
      const result = execSync(`python3 "${scriptPath}" "${tmpFile}"`, {
        encoding: 'utf-8',
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });
      
      // 清理临时文件
      try { fs.unlinkSync(tmpFile); } catch {}
      
      const parsed = JSON.parse(result);
      return parsed.text_content || `[${fileType.toUpperCase()}文档内容解析失败]`;
    } catch {
      return `[${fileType.toUpperCase()}文档内容需解析]`;
    }
  }
  
  return buffer.toString('utf-8');
}

// 清洗并分片
function cleanAndChunkContent(content: string, filename: string): Array<{
  content: string;
  chapter?: string;
  clause?: string;
  title?: string;
}> {
  const chunks: Array<{
    content: string;
    chapter?: string;
    clause?: string;
    title?: string;
  }> = [];
  
  // 移除无效内容（封面、空白页等）
  const lines = content.split('\n');
  const cleanedLines: string[] = [];
  let skipEmpty = 0;
  
  for (const line of lines) {
    const trimmed = line.trim();
    
    // 跳过连续空白行（可能为空白页）
    if (!trimmed) {
      skipEmpty++;
      if (skipEmpty > 3) continue;
      cleanedLines.push('');
      continue;
    }
    
    skipEmpty = 0;
    
    // 跳过可能是封面的内容（大标题、页码等）
    if (/^第?\d+页?$/.test(trimmed)) continue;
    if (/^\d{4}[-/]\d{2}[-/]\d{2}$/.test(trimmed)) continue;
    
    cleanedLines.push(line);
  }
  
  const cleanedContent = cleanedLines.join('\n');
  
  // 按章节、条款分片
  const chapterRegex = /^(第[一二三四五六七八九十百千万零]+[章节篇部]|[一二三四五六七八九十]+[、.．]\s*.+)/gm;
  const clauseRegex = /^([一二三四五六七八九十百千万零]+|[（(][一二三四五六七八九十]+[)）]|\d+[.．、])\s*(.+)/gm;
  
  let lastIndex = 0;
  let currentChapter = '';
  let match;
  
  // 查找所有章节标记
  const chapterMatches: Array<{ index: number; title: string }> = [];
  while ((match = chapterRegex.exec(cleanedContent)) !== null) {
    chapterMatches.push({ index: match.index, title: match[1].trim() });
  }
  
  if (chapterMatches.length === 0) {
    // 没有章节结构，按段落分片
    const paragraphs = cleanedContent.split(/\n\n+/);
    let chunkIndex = 0;
    
    for (const para of paragraphs) {
      if (para.trim().length > 50) {
        chunks.push({
          content: para.trim(),
          title: `段落${chunkIndex + 1}`
        });
        chunkIndex++;
      }
    }
  } else {
    // 按章节分片
    for (let i = 0; i < chapterMatches.length; i++) {
      const start = chapterMatches[i].index;
      const end = i < chapterMatches.length - 1 ? chapterMatches[i + 1].index : cleanedContent.length;
      const sectionContent = cleanedContent.substring(start, end).trim();
      
      if (sectionContent.length > 20) {
        chunks.push({
          content: sectionContent,
          chapter: chapterMatches[i].title,
          title: chapterMatches[i].title
        });
      }
    }
  }
  
  // 如果没有分出任何切片，将整个内容作为一个切片
  if (chunks.length === 0 && cleanedContent.trim().length > 0) {
    chunks.push({
      content: cleanedContent.trim(),
      title: filename
    });
  }
  
  return chunks;
}

// 分类推荐
async function handleCategoryRecommendation(filenames: string[], request: NextRequest) {
  if (!filenames || filenames.length === 0) {
    return NextResponse.json({ recommendations: [] });
  }
  const recommendations: Array<{
    filename: string;
    suggested: string[];
    reason: string;
  }> = [];
  
  for (const filename of filenames) {
    try {
      const prompt = `请根据文件名判断该规章制度文档最可能的分类。

文件名：${filename}

可选分类：
- maritime_rules: 海事规章制度
- platform_ops: 平台运维规范
- trajectory_annotation: 航迹标注准则
- model_training: 模型训练管理办法
- other: 其他资料

请直接返回最可能的分类（一个或多个），以及简要理由。格式：
分类: xxx,xxx
理由: xxx`;

      const result = await llmInvoke(
        [{ role: 'user', content: prompt }],
        { model: 'doubao-seed-2-0-lite-260215' }
      );
      
      const response = result.content || '';
      
      // 解析推荐结果
      const categoryMatch = response.match(/分类[：:]\s*([^\n]+)/);
      const reasonMatch = response.match(/理由[：:]\s*([^\n]+)/);
      
      let suggested: string[] = [];
      if (categoryMatch) {
        const categoryLabels = categoryMatch[1].split(/[,，、]/).map((s: string) => s.trim());
        for (const label of categoryLabels) {
          const key = Object.entries(CATEGORY_LABELS).find(([k, v]) => 
            v === label || k === label.toLowerCase()
          )?.[0];
          if (key && REGULATION_CATEGORIES.includes(key as any)) {
            suggested.push(key);
          }
        }
      }
      
      recommendations.push({
        filename,
        suggested: suggested.length > 0 ? suggested : ['other'],
        reason: reasonMatch?.[1]?.trim() || response.substring(0, 100)
      });
      
    } catch (error) {
      recommendations.push({
        filename,
        suggested: ['other'],
        reason: '模型分析失败，建议人工选择'
      });
    }
  }
  
  return NextResponse.json({ recommendations });
}

// 编辑基本信息
async function handleUpdate(body: any, request: NextRequest) {
  const { id, categories, isValid, version, publishDate, publishOrg, description } = body;
  
  if (!id) {
    return NextResponse.json({ error: '缺少文档ID' }, { status: 400 });
  }
  
  const supabase = getSupabaseClient();
  
  const updateData: Record<string, any> = {
    updated_at: new Date().toISOString()
  };
  
  if (categories !== undefined) {
    // 验证分类
    const validCategories = (categories as string[]).filter(c => REGULATION_CATEGORIES.includes(c as any));
    if (validCategories.length === 0) {
      return NextResponse.json({ error: '请选择有效的文档分类' }, { status: 400 });
    }
    updateData.categories = validCategories;
  }
  
  if (isValid !== undefined) updateData.is_valid = isValid;
  if (version !== undefined) updateData.version = version;
  if (publishDate !== undefined) updateData.publish_date = publishDate;
  if (publishOrg !== undefined) updateData.publish_org = publishOrg;
  if (description !== undefined) updateData.description = description;
  
  const { error } = await supabase
    .from('regulations')
    .update(updateData)
    .eq('id', id);
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  // 更新切片的元数据
  if (categories !== undefined || isValid !== undefined) {
    const { data: regulation } = await supabase
      .from('regulations')
      .select('filename, categories, is_valid, version, publish_date, publish_org')
      .eq('id', id)
      .single();
    
    if (regulation) {
      await supabase
        .from('regulation_chunks')
        .update({
          metadata: JSON.stringify({
            document_name: regulation.filename,
            categories: regulation.categories,
            is_valid: regulation.is_valid,
            version: regulation.version,
            publish_date: regulation.publish_date,
            publish_org: regulation.publish_org
          })
        })
        .eq('regulation_id', id);
    }
  }
  
  return NextResponse.json({ success: true });
}

// 删除文档
async function handleDelete(ids: string[], request: NextRequest) {
  if (!ids || ids.length === 0) {
    return NextResponse.json({ error: '缺少文档ID' }, { status: 400 });
  }
  
  const supabase = getSupabaseClient();
  
  // 删除切片的向量数据
  const { error: chunkError } = await supabase
    .from('regulation_chunks')
    .delete()
    .in('regulation_id', ids);
  
  if (chunkError) {
    console.error('删除切片失败:', chunkError);
  }
  
  // 删除文档记录
  const { error: docError, count } = await supabase
    .from('regulations')
    .delete()
    .in('id', ids);
  
  if (docError) {
    return NextResponse.json({ error: docError.message }, { status: 500 });
  }
  
  return NextResponse.json({ 
    success: true, 
    deleted: count || ids.length 
  });
}

// 重新向量化
async function handleRevectorize(id: string, request: NextRequest) {
  if (!id) {
    return NextResponse.json({ error: '缺少文档ID' }, { status: 400 });
  }
  
  const supabase = getSupabaseClient();
  
  // 获取文档
  const { data: regulation } = await supabase
    .from('regulations')
    .select('*')
    .eq('id', id)
    .single();
  
  if (!regulation) {
    return NextResponse.json({ error: '文档不存在' }, { status: 404 });
  }
  
  // 更新状态为处理中
  await supabase
    .from('regulations')
    .update({ vector_status: 'pending', vector_error: null })
    .eq('id', id);
  
  // 删除旧切片
  await supabase
    .from('regulation_chunks')
    .delete()
    .eq('regulation_id', id);
  
  // 重新分片
  const content = regulation.original_content || '';
  const chunks = cleanAndChunkContent(content, regulation.filename);
  
  // 创建新切片
  const chunkRecords = chunks.map((chunk, index) => ({
    regulation_id: id,
    chunk_index: String(index),
    content: chunk.content,
    metadata: JSON.stringify({
      document_name: regulation.filename,
      categories: regulation.categories,
      is_valid: regulation.is_valid,
      version: regulation.version,
      publish_date: regulation.publish_date,
      publish_org: regulation.publish_org,
      chapter: chunk.chapter ? chunk.chapter.substring(0, 100) : null,
      clause: chunk.clause ? chunk.clause.substring(0, 100) : null,
      title: chunk.title ? chunk.title.substring(0, 500) : null
    })
  }));
  
  if (chunkRecords.length > 0) {
    const { error: insertError } = await supabase.from('regulation_chunks').insert(chunkRecords);
    if (insertError) {
      console.error('插入regulation_chunks失败:', insertError);
      return NextResponse.json({ 
        success: false, 
        error: `插入切片失败: ${insertError.message}`,
        totalChunks: chunkRecords.length,
        successCount: 0,
        failCount: chunkRecords.length,
        errors: [insertError.message]
      });
    }
    console.log(`成功插入${chunkRecords.length}个chunks`);
  }
  
  // 向量化处理
  let successCount = 0;
  let failCount = 0;
  const errors: string[] = [];
  
  for (const chunk of chunkRecords) {
    try {
      // 截断内容防止超过 token 限制
      const maxContentLength = 8000;
      const truncatedContent = chunk.content.length > maxContentLength 
        ? chunk.content.substring(0, maxContentLength) + '...'
        : chunk.content;
      
      const embedding = truncateEmbedding(await embedText(truncatedContent));
      
      const { error: updateError } = await supabase
        .from('regulation_chunks')
        .update({
          embedding: embedding,
          embedding_status: 'success'
        })
        .eq('regulation_id', id)
        .eq('chunk_index', String(chunk.chunk_index));
      
      if (updateError) {
        console.error(`更新chunk ${chunk.chunk_index} embedding失败:`, updateError);
        throw updateError;
      }
      
      successCount++;
    } catch (error) {
      failCount++;
      const errorMsg = error instanceof Error ? error.message : '向量化失败';
      errors.push(`切片${chunk.chunk_index}: ${errorMsg}`);
      
      await supabase
        .from('regulation_chunks')
        .update({
          embedding_status: 'failed'
        })
        .eq('regulation_id', id)
        .eq('chunk_index', chunk.chunk_index);
    }
  }
  
  // 更新文档状态
  const finalStatus = failCount === 0 ? 'success' : (successCount === 0 ? 'failed' : 'success');
  await supabase
    .from('regulations')
    .update({
      vector_status: finalStatus,
      vector_error: errors.length > 0 ? errors.join('; ') : null,
      chunk_count: chunkRecords.length.toString()
    })
    .eq('id', id);
  
  // 创建或更新向量化任务
  try {
    const existingTask = await supabase
      .from('vectorize_tasks')
      .select('id')
      .eq('target_id', id)
      .single();
    
    console.log('[DEBUG] 创建任务 - target_id:', id, 'filename:', regulation.filename, 'existingTask:', existingTask.data ? 'exists' : 'new');
    
    if (existingTask.data) {
      const updateResult = await supabase
        .from('vectorize_tasks')
        .update({
          status: finalStatus === 'success' ? 'completed' : 'failed',
          total_count: chunkRecords.length,
          processed_count: successCount,
          progress: Math.round((successCount / chunkRecords.length) * 100),
          completed_at: new Date().toISOString()
        })
        .eq('id', existingTask.data.id);
      console.log('[DEBUG] 更新任务结果:', updateResult.error ? updateResult.error.message : 'success');
    } else {
      const insertResult = await supabase
        .from('vectorize_tasks')
        .insert({
          task_type: 'file',
          target_id: id,
          action: 'vectorize',
          target_name: regulation.filename,
          status: finalStatus === 'success' ? 'completed' : 'failed',
          total_count: chunkRecords.length,
          processed_count: successCount,
          progress: Math.round((successCount / chunkRecords.length) * 100)
        });
      console.log('[DEBUG] 插入任务结果:', insertResult.error ? insertResult.error.message : 'success');
    }
  } catch (taskError) {
    console.error('任务记录创建失败:', taskError);
  }

  return NextResponse.json({
    success: true,
    totalChunks: chunkRecords.length,
    successCount,
    failCount,
    errors: errors.slice(0, 5)
  });
}

// 批量向量化
async function handleBatchVectorize(ids: string[], request: NextRequest) {
  if (!ids || ids.length === 0) {
    return NextResponse.json({ error: '缺少文档ID列表' }, { status: 400 });
  }
  
  const results: Array<{
    id: string;
    success: boolean;
    message?: string;
  }> = [];
  
  for (const id of ids) {
    try {
      const result = await handleRevectorize(id, request);
      const data = await result.json();
      results.push({
        id,
        success: data.success,
        message: data.failCount > 0 ? `成功${data.successCount}条，失败${data.failCount}条` : undefined
      });
    } catch (error) {
      results.push({
        id,
        success: false,
        message: error instanceof Error ? error.message : '向量化失败'
      });
    }
  }
  
  const successCount = results.filter(r => r.success).length;
  
  return NextResponse.json({
    success: true,
    total: ids.length,
    successCount,
    failCount: ids.length - successCount,
    results
  });
}
