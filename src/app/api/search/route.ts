import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { EmbeddingClient, HeaderUtils } from 'coze-coding-dev-sdk';

interface SearchParams {
  query: string;
  modality?: string; // 可选：限定模态类型
  topK?: number; // 返回结果数量
  threshold?: number; // 相似度阈值
  filter?: { [key: string]: string }; // 可选：按字段过滤，如 { ctryNameCn: '日本' }
  mode?: 'exact' | 'fuzzy'; // 搜索模式：exact=精确搜索(关键词匹配)，fuzzy=模糊搜索(语义搜索)
}

export async function POST(request: NextRequest) {
  try {
    const body: SearchParams = await request.json();
    const { query, modality, topK = 20, threshold = 0.3, filter, mode = 'fuzzy' } = body;

    if (!query || query.trim().length === 0) {
      return NextResponse.json({ error: '查询内容不能为空' }, { status: 400 });
    }

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const supabase = getSupabaseClient();

    // 精确搜索模式：使用关键词匹配
    if (mode === 'exact') {
      return await exactSearch(supabase, query, modality, topK, filter);
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
        return await fallbackSearch(supabase, queryEmbedding, modality, topK, threshold, filter);
      }
      return NextResponse.json({ error: `搜索失败: ${searchError.message}` }, { status: 500 });
    }

    // 应用过滤器
    let filteredResults = results || [];
    if (filter && filteredResults.length > 0) {
      filteredResults = filteredResults.filter((item: { content?: string; metadata?: Record<string, unknown> }) => {
        return Object.entries(filter).every(([key, value]) => {
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

    return NextResponse.json({
      success: true,
      query,
      results: filteredResults,
      count: filteredResults.length,
    });
  } catch (error) {
    console.error('检索失败:', error);
    return NextResponse.json({ 
      error: `检索失败: ${error instanceof Error ? error.message : String(error)}` 
    }, { status: 500 });
  }
}

// 备用搜索方法：直接查询并计算相似度
async function fallbackSearch(
  supabase: ReturnType<typeof getSupabaseClient>,
  queryEmbedding: number[],
  modality: string | undefined,
  topK: number,
  threshold: number,
  filter?: { [key: string]: string }
) {
  // 查询所有已向量化的条目
  let query = supabase
    .from('knowledge_items')
    .select('id, modality, title, content, source, metadata, embedding')
    .not('embedding', 'is', null);

  if (modality) {
    query = query.eq('modality', modality);
  }

  const { data: items, error: queryError } = await query.limit(1000);

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
    filteredResults = filteredResults.filter((item: { content?: string; metadata?: Record<string, unknown> }) => {
      return Object.entries(filter).every(([key, value]) => {
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
}

// 精确搜索：使用关键词匹配
async function exactSearch(
  supabase: ReturnType<typeof getSupabaseClient>,
  query: string,
  modality?: string,
  topK?: number,
  filter?: { [key: string]: string }
) {
  // 构建搜索查询
  let searchQuery = supabase
    .from('knowledge_items')
    .select('id, modality, title, content, source, metadata, created_at')
    .not('embedding', 'is', null); // 只搜索已向量化的条目
  
  // 添加关键词搜索条件（搜索 title 和 content）
  searchQuery = searchQuery.or(`title.ilike.%${query}%,content.ilike.%${query}%`);
  
  // 限定模态
  if (modality) {
    searchQuery = searchQuery.eq('modality', modality);
  }
  
  // 限制返回数量
  searchQuery = searchQuery.limit(topK || 50);
  
  const { data: results, error } = await searchQuery;
  
  if (error) {
    return NextResponse.json({ error: `精确搜索失败: ${error.message}` }, { status: 500 });
  }
  
  // 应用过滤器
  let filteredResults = results || [];
  if (filter && filteredResults.length > 0) {
    filteredResults = filteredResults.filter((item: { content?: string; metadata?: Record<string, unknown> }) => {
      return Object.entries(filter).every(([key, value]) => {
        // 从 content 中提取字段值进行匹配
        const content = item.content || '';
        const regex = new RegExp(`${key}:\\s*([^,]+)`, 'i');
        const match = content.match(regex);
        if (match) {
          return match[1].trim().toLowerCase() === value.toLowerCase();
        }
        // 也检查 metadata
        if (item.metadata && typeof item.metadata === 'object') {
          const metadataValue = (item.metadata as Record<string, unknown>)[key];
          if (metadataValue) {
            return String(metadataValue).toLowerCase() === value.toLowerCase();
          }
        }
        return false;
      });
    });
  }
  
  // 添加状态标识
  const resultsWithStatus = filteredResults.map((item: { id: string; modality: string; title: string; content: string; source: string; metadata: Record<string, unknown>; created_at: string }) => ({
    ...item,
    status: 'embedded',
    similarity: 1.0, // 精确匹配相似度为 1
  }));
  
  return NextResponse.json({
    success: true,
    query,
    mode: 'exact',
    results: resultsWithStatus,
    count: resultsWithStatus.length,
  });
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
    const modality = searchParams.get('modality');
    const type = searchParams.get('type') || 'all'; // all, embedded, pending
    const page = parseInt(searchParams.get('page') || '1', 10);
    const limit = parseInt(searchParams.get('limit') || '20', 10);
    const offset = (page - 1) * limit;

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
    
    const { count: total } = await countQuery;
    
    // 获取知识条目列表
    let query = supabase
      .from('knowledge_items')
      .select('id, modality, title, content, source, metadata, created_at, embedding')
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
