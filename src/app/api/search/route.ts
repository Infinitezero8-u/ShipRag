import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/local-db';
import { EmbeddingClient } from '@/lib/ollama/embedding';
// HeaderUtils stub (local dev)
function extractHeaders() { return {}; }

// 异步保存搜索历史（不阻塞响应）
async function saveSearchHistory(query: string, modality: string, resultCount: number) {
  try {
    const supabase = getSupabaseClient();
    await supabase.from('search_history').insert({
      history_type: 'search',
      query: query?.substring(0, 500) || '',
      modality: modality || '',
      result_count: resultCount || 0,
    });
  } catch { /* 保存失败不影响搜索 */ }
}

interface SearchParams {
  query: string;
  modality?: string; // 可选：限定模态类型
  topK?: number; // 返回结果数量
  threshold?: number; // 相似度阈值
  filter?: { [key: string]: string }; // 可选：按字段过滤，如 { ctryNameCn: '日本' }
  mode?: 'exact' | 'fuzzy'; // 搜索模式：exact=精确搜索(关键词匹配)，fuzzy=模糊搜索(语义搜索)
  page?: number; // 分页：页码（从1开始）
  pageSize?: number; // 分页：每页数量
}

export async function POST(request: NextRequest) {
  try {
    const body: SearchParams = await request.json();
    const { 
      query, 
      modality, 
      topK = 30,
      threshold = 0.3, 
      filter, 
      mode = 'fuzzy',
      page = 1,
      pageSize = 20 
    } = body;

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: '查询内容不能为空' }, { status: 400 });
    }

    const supabase = getSupabaseClient();

    // 如果指定了标签过滤，使用标签优先搜索
    if (filter?.tags) {
      return await tagBasedSearch(supabase, query, filter.tags, modality, topK, threshold, page, pageSize);
    }

    // 精确搜索模式：使用关键词匹配
    if (mode === 'exact') {
      return await exactSearch(supabase, query, modality, topK, filter, page, pageSize);
    }

    // 模糊搜索模式：使用语义搜索
    const embeddingClient = new EmbeddingClient();

    // 生成查询向量
    const queryEmbedding = await embeddingClient.embedText(query);

    // 执行向量相似度搜索
    // 使用 RPC 调用 PostgreSQL 的向量搜索函数
    const { data: results, error: searchError } = await supabase.rpc('vector_search', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: topK,
      filter_modality: modality || null,
    });

    if (searchError) {
      // 如果 RPC 不存在，使用备用方法
      if (searchError.message.includes('function') || searchError.message.includes('does not exist')) {
        return await fallbackSearch(supabase, queryEmbedding, query, modality, topK, threshold, filter);
      }
      return NextResponse.json({ error: `搜索失败: ${searchError.message}` }, { status: 500 });
    }

    // 应用过滤器
    let filteredResults = results || [];
    
    // 同时搜索port_data表中的向量化港口数据
    try {
      const { data: ports, error: portError } = await supabase
        .from('port_data')
        .select('id, port_code, name_cn, ctry_name_cn, lon, lat, embedding')
        .not('embedding', 'is', null)
        .limit(100);

      if (!portError && ports && ports.length > 0) {
        const portResults = ports
          .map(port => {
            // embedding可能是字符串格式，需要解析
            let embedding = port.embedding as unknown as number[];
            if (typeof port.embedding === 'string') {
              try {
                embedding = JSON.parse(port.embedding);
              } catch (e) {
                return null;
              }
            }
            const similarity = cosineSimilarity(queryEmbedding, embedding);
            return {
              id: port.id,
              modality: 'port',
              title: port.name_cn || port.port_code,
              content: `港口代码: ${port.port_code}, 中文名: ${port.name_cn}, 国家: ${port.ctry_name_cn}, 经度: ${port.lon}, 纬度: ${port.lat}`,
              source: 'port_data',
              similarity,
            };
          })
          .filter((item): item is NonNullable<typeof item> => item !== null && item.similarity >= threshold)
          .sort((a, b) => b.similarity - a.similarity)
          .slice(0, Math.min(topK, 20));

        // 合并结果
        filteredResults = [...filteredResults, ...portResults] as typeof filteredResults;
        // 重新排序
        filteredResults.sort((a: { similarity?: number }, b: { similarity?: number }) => (b.similarity || 0) - (a.similarity || 0));
        filteredResults = filteredResults.slice(0, topK);
      }
    } catch (e) {
      console.error('搜索港口数据失败:', e);
    }
    
    if (filter && filteredResults.length > 0) {
      filteredResults = filteredResults.filter((item: { content?: string; metadata?: Record<string, unknown>; tags?: string[] }) => {
        return Object.entries(filter).every(([key, value]) => {
          // 特殊处理标签过滤
          if (key === 'tags') {
            const filterTags = Array.isArray(value) ? value : [value];
            const itemTags = item.tags || [];
            return filterTags.some((t: string) => itemTags.includes(t));
          }
          // 从 content 中提取字段值
          if (item.content) {
            const regex = new RegExp(`${key}:\\s*([^,]+)`, 'i');
            const match = item.content.match(regex);
            if (match && match[1].trim() === value) return true;
          }
          // 从 metadata 中查找
          if (item.metadata && item.metadata[key] === value) return true;
          return false;
        });
      });
    }

    // 分页处理
    const totalCount = filteredResults.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const startIndex = (page - 1) * pageSize;
    const paginatedResults = filteredResults.slice(startIndex, startIndex + pageSize);

    const response = NextResponse.json({
      success: true, query,
      results: paginatedResults,
      count: paginatedResults.length,
      pagination: { page, pageSize, totalCount, totalPages, hasMore: page < totalPages },
    });

    // 异步保存搜索历史 (不阻塞响应)
    saveSearchHistory(query, modality || '', paginatedResults.length).catch(() => {});

    return response;
  } catch (error) {
    console.error('检索失败:', error);
    return NextResponse.json({
      error: `检索失败: ${error instanceof Error ? error.message : String(error)}`
    }, { status: 500 });
  }
}

// 更新条目信息
export async function PATCH(request: NextRequest) {
    try {
      const body = await request.json();
      const { id, title, content, metadata, tags, action } = body;

      const supabase = getSupabaseClient();

      // 标签操作
      if (action === 'renameTag') {
        const { oldTag, newTag } = body;
        if (!oldTag || !newTag) {
          return NextResponse.json({ error: '缺少标签参数' }, { status: 400 });
        }

        // 检查新标签是否已存在
        const { data: existingItems } = await supabase
          .from('knowledge_items')
          .select('id')
          .contains('tags', [newTag])
          .limit(1);

        const tagExists = existingItems && existingItems.length > 0;

        // 获取所有包含旧标签的条目
        const { data: items, error: fetchError } = await supabase
          .from('knowledge_items')
          .select('id, tags')
          .contains('tags', [oldTag]);

        if (fetchError) {
          return NextResponse.json({ error: `查询失败: ${fetchError.message}` }, { status: 500 });
        }

        if (!items || items.length === 0) {
          return NextResponse.json({ success: true, message: '未找到需要重命名的条目' });
        }

        // 批量更新标签
        for (const item of items) {
          let newTags = (item.tags as string[]).filter(t => t !== oldTag);
          
          // 如果新标签已存在且不是当前条目的标签，则合并（不重复添加）
          if (tagExists && !newTags.includes(newTag)) {
            newTags.push(newTag);
          } else if (!tagExists) {
            newTags.push(newTag);
          }

          await supabase
            .from('knowledge_items')
            .update({ tags: newTags, updated_at: new Date().toISOString() })
            .eq('id', item.id);
        }

        // 更新标签向量表
        await supabase.from('tag_vectors').update({ name: newTag }).eq('name', oldTag);

        return NextResponse.json({ 
          success: true, 
          message: tagExists ? '标签已合并' : '标签已重命名',
          merged: tagExists,
          affectedCount: items.length
        });
      }

      if (action === 'deleteTag') {
        const { tag } = body;
        if (!tag) {
          return NextResponse.json({ error: '缺少标签参数' }, { status: 400 });
        }

        // 获取所有包含该标签的条目
        const { data: items, error: fetchError } = await supabase
          .from('knowledge_items')
          .select('id, tags')
          .contains('tags', [tag]);

        if (fetchError) {
          return NextResponse.json({ error: `查询失败: ${fetchError.message}` }, { status: 500 });
        }

        // 批量删除标签
        if (items) {
          for (const item of items) {
            const newTags = (item.tags as string[]).filter(t => t !== tag);
            await supabase
              .from('knowledge_items')
              .update({ tags: newTags, updated_at: new Date().toISOString() })
              .eq('id', item.id);
          }
        }

        // 删除标签向量
        await supabase.from('tag_vectors').delete().eq('name', tag);

        return NextResponse.json({ success: true, message: '标签已删除' });
      }

      // 更新条目
      if (!id) {
        return NextResponse.json({ error: '缺少 id 参数' }, { status: 400 });
      }
      
      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (title !== undefined) updateData.title = title;
      if (content !== undefined) {
        updateData.content = content;
        // 内容变更后清除旧向量，迫使下次embed时重新计算
        // 否则旧向量与新内容不匹配，导致语义检索命中率极低
        updateData.embedding = null;
      }
      if (metadata !== undefined) updateData.metadata = metadata;
      if (tags !== undefined) updateData.tags = tags;

      const { error } = await supabase
        .from('knowledge_items')
        .update(updateData)
        .eq('id', id);

      if (error) {
        return NextResponse.json({ error: `更新失败: ${error.message}` }, { status: 500 });
      }

      return NextResponse.json({ success: true, message: '更新成功' });
    } catch (error) {
      console.error('更新条目失败:', error);
      return NextResponse.json({ error: '更新失败' }, { status: 500 });
    }
  }

// 备用搜索方法：直接查询并计算相似度
async function fallbackSearch(
  supabase: ReturnType<typeof getSupabaseClient>,
  queryEmbedding: number[],
  queryText: string,
  modality: string | undefined,
  topK: number,
  threshold: number,
  filter?: { [key: string]: string }
) {
  // 查询所有已向量化的条目
  let dbQuery = supabase
    .from('knowledge_items')
    .select('id, modality, title, content, source, metadata, embedding, tags')
    .not('embedding', 'is', null);

  if (modality) {
    dbQuery = dbQuery.eq('modality', modality);
  }

  const poolSize = Math.max(topK * 10, 300);
  const { data: items, error: queryError } = await dbQuery.limit(poolSize);

  if (queryError) {
    return NextResponse.json({ error: `查询失败: ${queryError.message}` }, { status: 500 });
  }

  if (!items || items.length === 0) {
    return NextResponse.json({
      success: true,
      query: '',
      results: [],
      count: 0,
    });
  }

  // 计算余弦相似度
  const results = items
    .map(item => {
      const embedding = item.embedding as unknown as number[];
      const similarity = cosineSimilarity(queryEmbedding, embedding);
      return {
        ...item,
        similarity,
      };
    })
    .filter(item => item.similarity >= threshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, topK);

  // 应用过滤器
  let filteredResults = results;
  if (filter && filteredResults.length > 0) {
    filteredResults = filteredResults.filter((item: { content?: string; metadata?: Record<string, unknown>; tags?: string[] }) => {
      return Object.entries(filter).every(([key, value]) => {
        // 标签过滤
        if (key === 'tags' && item.tags) {
          const tagArray = Array.isArray(value) ? value : [value];
          return tagArray.some((tag: string) => item.tags!.includes(tag));
        }
        // 从 content 中提取字段值
        if (item.content) {
          const regex = new RegExp(`${key}:\\s*([^,]+)`, 'i');
          const match = item.content.match(regex);
          if (match && match[1].trim() === value) return true;
        }
        // 从 metadata 中查找
        if (item.metadata && item.metadata[key] === value) return true;
        return false;
      });
    });
  }

  // 同时搜索port_data表中的向量化港口数据
  try {
    const { data: ports, error: portError } = await supabase
      .from('port_data')
      .select('id, port_code, name_cn, ctry_name_cn, lon, lat, embedding')
      .not('embedding', 'is', null)
      .limit(Math.max(topK * 3, 50));

    if (!portError && ports && ports.length > 0) {
      const portResults = ports
        .map(port => {
          const embedding = port.embedding as unknown as number[];
          const similarity = cosineSimilarity(queryEmbedding, embedding);
          return {
            id: port.id,
            modality: 'port',
            title: port.name_cn || port.port_code,
            content: `港口代码: ${port.port_code}, 中文名: ${port.name_cn}, 国家: ${port.ctry_name_cn}, 经度: ${port.lon}, 纬度: ${port.lat}`,
            source: 'port_data',
            similarity,
          };
        })
        .filter(item => item.similarity >= threshold)
        .sort((a, b) => b.similarity - a.similarity)
        .slice(0, Math.min(topK, 10));

      // 合并结果
      filteredResults = [...filteredResults, ...portResults] as typeof filteredResults;
      // 重新排序
      filteredResults.sort((a, b) => b.similarity - a.similarity);
      filteredResults = filteredResults.slice(0, topK);
    }
  } catch (e) {
    console.error('搜索港口数据失败:', e);
  }

  // 关键词兜底（ILIKE）— 向量没命中时自动补充精确匹配
  if (filteredResults.length < topK && queryText) {
    try {
      const words = queryText.split(/[\s,，。；;、]+/).filter((w: string) => w.length > 1);
      const ilikeWords = words.length > 0 ? words : [queryText];
      const ilikeClause = ilikeWords.map((w: string) =>
        `title.ilike.%${w}%,content.ilike.%${w}%`).join(',');

      let kwQuery = getSupabaseClient()
        .from('knowledge_items')
        .select('id, modality, title, content, source, tags')
        .or(ilikeClause)
        .limit(Math.max(topK, 50));

      if (modality) kwQuery = kwQuery.eq('modality', modality);

      const { data: kwItems } = await kwQuery;
      if (kwItems?.length) {
        const existingIds = new Set(filteredResults.map((r: any) => r.id));
        for (const item of kwItems) {
          if (!existingIds.has(item.id)) {
            filteredResults.push({ ...item, similarity: 0.55 } as any);
          }
        }
        filteredResults.sort((a: any, b: any) => (b.similarity || 0) - (a.similarity || 0));
      }
    } catch (_) { /* 关键词兜底失败不影响主逻辑 */ }
  }

  return NextResponse.json({
    success: true,
    query: '',
    results: filteredResults.map(r => ({
      id: r.id,
      modality: r.modality,
      title: r.title,
      content: r.content,
      source: r.source,
      similarity: r.similarity,
    })),
    count: filteredResults.length,
  });
}

// 精确搜索：使用关键词匹配
async function exactSearch(
  supabase: ReturnType<typeof getSupabaseClient>,
  query: string,
  modality?: string,
  topK?: number,
  filter?: { [key: string]: string },
  page: number = 1,
  pageSize: number = 20
) {
  const allResults: any[] = [];

  // 1. 搜索 knowledge_items
  if (!modality || modality !== 'port') {
    let q = supabase
      .from('knowledge_items')
      .select('id, modality, title, content, source, metadata, created_at, tags', { count: 'exact' })
      .not('embedding', 'is', null)
      .or(`title.ilike.%${query}%,content.ilike.%${query}%`)
      .limit(topK || 100);

    const { data, error } = await q;
    if (!error && data) {
      allResults.push(...data.map((r: any) => ({ ...r, similarity: 1.0, status: 'embedded' })));
    }
  }

  // 2. 搜索 port_data
  if (!modality || modality === 'port') {
    const { data: ports } = await supabase
      .from('port_data')
      .select('id, port_code, name_cn, ctry_name_cn, lon, lat')
      .or(`port_code.ilike.%${query}%,name_cn.ilike.%${query}%,ctry_name_cn.ilike.%${query}%`)
      .limit(topK || 100);

    if (ports) {
      for (const p of ports) {
        allResults.push({
          id: p.id,
          modality: 'port',
          title: p.name_cn || p.port_code,
          content: `港口代码: ${p.port_code}, 中文名: ${p.name_cn}, 国家: ${p.ctry_name_cn}, 经度: ${p.lon}, 纬度: ${p.lat}`,
          source: 'port_data',
          similarity: 1.0,
          status: 'embedded',
        });
      }
    }
  }

  // 3. 搜索 regulations
  if (!modality || modality === 'regulation') {
    const { data: regs } = await supabase
      .from('regulations')
      .select('id, filename, original_content')
      .or(`filename.ilike.%${query}%,original_content.ilike.%${query}%`)
      .limit(topK || 100);

    if (regs) {
      for (const r of regs) {
        allResults.push({
          id: r.id,
          modality: 'pdf',
          title: r.filename,
          content: r.original_content?.substring(0, 500) || '',
          source: 'regulations',
          similarity: 1.0,
          status: 'embedded',
        });
      }
    }
  }

  // 去重 + 排序
  const seen = new Set<string>();
  const uniqueResults = allResults.filter(r => {
    const key = `${r.modality}:${r.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => b.similarity - a.similarity).slice(0, topK || 100);

  // 分页
  const totalCount = uniqueResults.length;
  const totalPages = Math.ceil(totalCount / pageSize);
  const startIndex = (page - 1) * pageSize;
  const paginatedResults = uniqueResults.slice(startIndex, startIndex + pageSize);

  // 异步保存搜索历史
  saveSearchHistory(query, modality || '', paginatedResults.length).catch(() => {});

  return NextResponse.json({
    success: true, query, mode: 'exact',
    results: paginatedResults,
    count: paginatedResults.length,
    pagination: { page, pageSize, totalCount, totalPages, hasMore: page < totalPages },
  });
}
export {}; // 模块声明

// 删除旧的 exactSearch 余下部分
async function _oldExactSearchDeleted() {}

// 基于标签的搜索
async function tagBasedSearch(
  supabase: ReturnType<typeof getSupabaseClient>,
  query: string,
  tag: string,
  modality?: string,
  topK: number = 30,
  threshold: number = 0.3,
  page: number = 1,
  pageSize: number = 20
): Promise<NextResponse> {
  try {
    const embeddingClient = new EmbeddingClient();
    const queryEmbedding = await embeddingClient.embedText(query);
    
    // 先查询带有该标签的条目
    let tagQuery = supabase
      .from('knowledge_items')
      .select('id, title, content, source, metadata, created_at, tags, embedding')
      .contains('tags', [tag])
      .limit(topK * 3); // 多获取一些用于排序
    
    if (modality) {
      tagQuery = tagQuery.eq('modality', modality);
    }
    
    const { data: tagItems, error: tagError } = await tagQuery;
    
    if (tagError) {
      return NextResponse.json({ error: `标签查询失败: ${tagError.message}` }, { status: 500 });
    }
    
    // 如果没有 embedding 的条目，直接返回
    const itemsWithEmbedding = (tagItems || []).filter((item: { embedding: number[] | null }) => item.embedding);
    const itemsWithoutEmbedding = (tagItems || []).filter((item: { embedding: number[] | null }) => !item.embedding);
    
    // 计算相似度并排序
    const resultsWithSimilarity = itemsWithEmbedding
      .map((item: { id: string; title: string; content: string; source: string; metadata: Record<string, unknown>; created_at: string; tags: string[]; embedding: number[] }) => {
        const similarity = cosineSimilarity(queryEmbedding, item.embedding);
        return { ...item, similarity, status: 'embedded' };
      })
      .filter((item: { similarity: number }) => item.similarity >= threshold)
      .sort((a: { similarity: number }, b: { similarity: number }) => b.similarity - a.similarity)
      .slice(0, topK);
    
    // 如果没有相似度匹配的结果，返回标签匹配的结果（无 embedding 的）
    const finalResults = resultsWithSimilarity.length > 0 
      ? resultsWithSimilarity 
      : itemsWithoutEmbedding.map((item: { id: string; title: string; content: string; source: string; metadata: Record<string, unknown>; created_at: string; tags: string[] }) => ({
          ...item,
          similarity: 0.5,
          status: 'pending'
        })).slice(0, topK);
    
    // 分页处理
    const totalCount = finalResults.length;
    const totalPages = Math.ceil(totalCount / pageSize);
    const startIndex = (page - 1) * pageSize;
    const paginatedResults = finalResults.slice(startIndex, startIndex + pageSize);
    
    return NextResponse.json({
      success: true,
      query,
      tagFilter: tag,
      tagMatchCount: tagItems?.length || 0,
      embeddedCount: itemsWithEmbedding.length,
      results: paginatedResults,
      count: paginatedResults.length,
      pagination: {
        page,
        pageSize,
        totalCount,
        totalPages,
        hasMore: page < totalPages,
      },
    });
  } catch (error) {
    return NextResponse.json({ 
      error: `标签搜索失败: ${error instanceof Error ? error.message : String(error)}` 
    }, { status: 500 });
  }
}

export {}; // 模块声明

// 备用向量搜索函数
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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    // 图片预览代理：读取本地文件返回图片
    if (action === 'preview-image') {
      const fsp = await import('fs/promises');
      const imgPath = searchParams.get('path') || '';
      const base = '/Volumes/Data/raganything_storage';
      if (!imgPath.startsWith(base)) {
        return new NextResponse('Forbidden', { status: 403 });
      }
      try {
        const buf = await fsp.readFile(imgPath);
        const ext = imgPath.split('.').pop()?.toLowerCase() || 'png';
        const mt: Record<string, string> = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' };
        return new NextResponse(buf, { headers: { 'Content-Type': mt[ext] || 'image/png' } });
      } catch {
        return new NextResponse('Image not found', { status: 404 });
      }
    }


    
    // 获取标签列表
    if (action === 'tags') {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('knowledge_items')
        .select('tags');
      
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }
      
      // 统计标签使用次数
      const tagCount: Record<string, number> = {};
      for (const item of data || []) {
        for (const tag of item.tags || []) {
          tagCount[tag] = (tagCount[tag] || 0) + 1;
        }
      }
      
      const tags = Object.entries(tagCount)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
      
      return NextResponse.json({ success: true, tags });
    }
    
    const modality = searchParams.get('modality');
    const type = searchParams.get('type') || 'all'; // all, embedded, pending
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offsetParam = searchParams.get('offset');
    const offset = offsetParam ? parseInt(offsetParam, 10) : (page - 1) * limit;
    const source = searchParams.get('source');
    const status = searchParams.get('status');
    const tag = searchParams.get('tag'); // 标签过滤
    const search = searchParams.get('search'); // 模糊搜索

    const supabase = getSupabaseClient();
    
    // 先获取总数
    let countQuery = supabase
      .from('knowledge_items')
      .select('id', { count: 'exact', head: true });
    
    if (modality) {
      countQuery = countQuery.eq('modality', modality);
    }
    if (type === 'embedded') {
      countQuery = countQuery.not('embedding', 'is', null);
    } else if (type === 'pending') {
      countQuery = countQuery.is('embedding', null);
    }
    if (status === 'embedded') {
      countQuery = countQuery.not('embedding', 'is', null);
    } else if (status === 'pending') {
      countQuery = countQuery.is('embedding', null);
    }
    if (source) {
      countQuery = countQuery.eq('source', source);
    }
    if (tag) {
      countQuery = countQuery.contains('tags', [tag]);
    }
    if (search) {
      // 模糊搜索：匹配 title 或 content
      countQuery = countQuery.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
    }
    
    const { count: total } = await countQuery;
    
    // 获取知识条目列表
    let query = supabase
      .from('knowledge_items')
      .select('id, modality, title, content, source, metadata, created_at, embedding, tags')
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (modality) {
      query = query.eq('modality', modality);
    }
    if (type === 'embedded') {
      query = query.not('embedding', 'is', null);
    } else if (type === 'pending') {
      query = query.is('embedding', null);
    }
    if (status === 'embedded') {
      query = query.not('embedding', 'is', null);
    } else if (status === 'pending') {
      query = query.is('embedding', null);
    }
    if (source) {
      query = query.eq('source', source);
    }
    if (tag) {
      query = query.contains('tags', [tag]);
    }
    if (search) {
      // 模糊搜索：匹配 title 或 content
      query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ error: `查询失败: ${error.message}` }, { status: 500 });
    }

    // 格式化返回数据
    const items = (data || []).map(item => ({
      id: item.id,
      modality: item.modality,
      title: item.title,
      content: item.content,
      source: item.source,
      metadata: item.metadata,
      tags: item.tags,
      status: item.embedding ? 'embedded' : 'pending',
      created_at: item.created_at,
    }));

    return NextResponse.json({ success: true, items, total: total || 0, page, limit });
  } catch (error) {
    return NextResponse.json({ 
      error: `查询失败: ${error instanceof Error ? error.message : String(error)}` 
    }, { status: 500 });
  }
}

// 获取所有标签
export async function HEAD(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    // 获取所有条目的标签
    const { data, error } = await supabase
      .from('knowledge_items')
      .select('tags')
      .not('tags', 'is', null);
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    // 统计标签频率
    const tagCounts: Record<string, number> = {};
    for (const item of data || []) {
      for (const tag of item.tags || []) {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      }
    }
    
    // 按频率排序
    const tags = Object.entries(tagCounts)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    
    return NextResponse.json({ success: true, tags });
  } catch (error) {
    return NextResponse.json({ 
      error: `获取标签失败: ${error instanceof Error ? error.message : String(error)}` 
    }, { status: 500 });
  }
}
