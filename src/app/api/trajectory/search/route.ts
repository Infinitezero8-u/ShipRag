import { NextRequest, NextResponse } from 'next/server';
import { EmbeddingClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 航迹检索 API
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get('query') || '';
    const startPort = searchParams.get('startPort') || '';
    const endPort = searchParams.get('endPort') || '';
    const seaArea = searchParams.get('seaArea') || '';
    const minLng = searchParams.get('minLng');
    const maxLng = searchParams.get('maxLng');
    const minLat = searchParams.get('minLat');
    const maxLat = searchParams.get('maxLat');
    const limit = parseInt(searchParams.get('limit') || '10');
    const threshold = parseFloat(searchParams.get('threshold') || '0.5');
    
    const supabase = getSupabaseClient();
    
    // 构建基础查询
    let dbQuery = supabase
      .from('trajectories')
      .select('*');
    
    // 元数据过滤
    if (startPort) {
      dbQuery = dbQuery.ilike('start_port', `%${startPort}%`);
    }
    if (endPort) {
      dbQuery = dbQuery.ilike('end_port', `%${endPort}%`);
    }
    if (seaArea) {
      dbQuery = dbQuery.ilike('sea_area', `%${seaArea}%`);
    }
    
    // 空间范围过滤
    if (minLng && maxLng) {
      dbQuery = dbQuery.gte('bounds_min_lng', parseFloat(minLng)).lte('bounds_max_lng', parseFloat(maxLng));
    }
    if (minLat && maxLat) {
      dbQuery = dbQuery.gte('bounds_min_lat', parseFloat(minLat)).lte('bounds_max_lat', parseFloat(maxLat));
    }
    
    // 如果有文本查询，进行向量检索
    if (query && query.trim()) {
      const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
      const embeddingClient = new EmbeddingClient(new Config(), customHeaders);
      
      // 向量化查询
      const queryEmbedding = await embeddingClient.embedText(query);
      
      if (queryEmbedding && queryEmbedding.length > 0) {
        // 使用 RPC 函数进行向量相似度搜索
        const { data: vectorResults, error: vectorError } = await supabase.rpc('search_trajectories', {
          query_embedding: queryEmbedding,
          match_threshold: threshold,
          match_count: limit * 2, // 多取一些再过滤
        });
        
        if (vectorError) {
          console.error('向量检索失败:', vectorError);
          // 回退到普通查询
          const { data, error } = await dbQuery.limit(limit);
          if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
          }
          return NextResponse.json({ trajectories: data || [] });
        }
        
        // 合并向量结果和元数据过滤
        let results = vectorResults || [];
        
        if (startPort) {
          results = results.filter((r: any) => 
            r.start_port?.toLowerCase().includes(startPort.toLowerCase())
          );
        }
        if (endPort) {
          results = results.filter((r: any) => 
            r.end_port?.toLowerCase().includes(endPort.toLowerCase())
          );
        }
        if (seaArea) {
          results = results.filter((r: any) => 
            r.sea_area?.toLowerCase().includes(seaArea.toLowerCase())
          );
        }
        
        return NextResponse.json({ trajectories: results.slice(0, limit) });
      }
    }
    
    // 无文本查询，直接返回过滤结果
    const { data, error } = await dbQuery.limit(limit);
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ trajectories: data || [] });
    
  } catch (error) {
    console.error('航迹检索失败:', error);
    return NextResponse.json({ error: '检索失败: ' + (error as Error).message }, { status: 500 });
  }
}

// POST 方法
export async function POST(request: NextRequest) {
  try {
    const {
      query,
      startPort,
      endPort,
      seaArea,
      minLng,
      maxLng,
      minLat,
      maxLat,
      limit = 10,
      threshold = 0.5,
    } = await request.json();
    
    const supabase = getSupabaseClient();
    
    // 基础查询
    let dbQuery = supabase
      .from('trajectories')
      .select('*')
      .not('embedding', 'is', null);
    
    // 元数据过滤
    if (startPort) {
      dbQuery = dbQuery.ilike('start_port', `%${startPort}%`);
    }
    if (endPort) {
      dbQuery = dbQuery.ilike('end_port', `%${endPort}%`);
    }
    if (seaArea) {
      dbQuery = dbQuery.ilike('sea_area', `%${seaArea}%`);
    }
    
    // 空间范围过滤
    if (minLng !== undefined && maxLng !== undefined) {
      dbQuery = dbQuery.gte('bounds_min_lng', minLng).lte('bounds_max_lng', maxLng);
    }
    if (minLat !== undefined && maxLat !== undefined) {
      dbQuery = dbQuery.gte('bounds_min_lat', minLat).lte('bounds_max_lat', maxLat);
    }
    
    // 如果有文本查询，进行向量检索
    if (query && query.trim()) {
      const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
      const embeddingClient = new EmbeddingClient(new Config(), customHeaders);
      
      // 向量化查询
      const queryEmbedding = await embeddingClient.embedText(query);
      
      if (queryEmbedding && queryEmbedding.length > 0) {
        // 使用 RPC 函数进行向量相似度搜索
        const { data: vectorResults, error: vectorError } = await supabase.rpc('search_trajectories', {
          query_embedding: queryEmbedding,
          match_threshold: threshold,
          match_count: limit * 2, // 多取一些再过滤
        });
        
        if (vectorError) {
          console.error('向量检索失败:', vectorError);
          // 回退到普通查询
          const { data, error } = await dbQuery.limit(limit);
          if (error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
          }
          return NextResponse.json(data || []);
        }
        
        // 合并向量结果和元数据过滤
        let results = vectorResults || [];
        
        if (startPort) {
          results = results.filter((r: any) => 
            r.start_port?.toLowerCase().includes(startPort.toLowerCase())
          );
        }
        if (endPort) {
          results = results.filter((r: any) => 
            r.end_port?.toLowerCase().includes(endPort.toLowerCase())
          );
        }
        if (seaArea) {
          results = results.filter((r: any) => 
            r.sea_area?.toLowerCase().includes(seaArea.toLowerCase())
          );
        }
        
        return NextResponse.json(results.slice(0, limit));
      }
    }
    
    // 无文本查询，直接返回过滤结果
    const { data, error } = await dbQuery.limit(limit);
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json(data || []);
    
  } catch (error) {
    console.error('航迹检索失败:', error);
    return NextResponse.json({ error: '检索失败: ' + (error as Error).message }, { status: 500 });
  }
}
