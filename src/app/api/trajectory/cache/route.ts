import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 缓存配置
const CACHE_KEY = 'trajectory_cache';
const CACHE_TTL = 3600000; // 1小时

interface CacheEntry {
  data: any;
  timestamp: number;
}

// 内存缓存
const memoryCache = new Map<string, CacheEntry>();

// GET: 获取缓存的航迹数据
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'common'; // common, recent, all
  
  const cacheKey = `${CACHE_KEY}_${type}`;
  const cached = memoryCache.get(cacheKey);
  
  // 检查缓存是否有效
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json({
      source: 'cache',
      data: cached.data
    });
  }
  
  // 缓存过期或不存在，从数据库加载
  const supabase = getSupabaseClient();
  
  let query = supabase
    .from('trajectories')
    .select('id, segment_id, start_port, end_port, wkt_route, sea_area, behavior_code, intent_code, ai_description, bounds_min_lng, bounds_max_lng, bounds_min_lat, bounds_max_lat');
  
  if (type === 'common') {
    // 常用航迹：有标注的
    query = query.not('behavior_code', 'is', null).limit(100);
  } else if (type === 'recent') {
    // 最近航迹
    query = query.order('created_at', { ascending: false }).limit(50);
  }
  
  const { data, error } = await query;
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  // 更新缓存
  memoryCache.set(cacheKey, {
    data,
    timestamp: Date.now()
  });
  
  return NextResponse.json({
    source: 'database',
    data
  });
}

// POST: 预热缓存
export async function POST() {
  const supabase = getSupabaseClient();
  
  // 预加载常用航迹
  const { data: commonTrajectories, error } = await supabase
    .from('trajectories')
    .select('id, segment_id, start_port, end_port, wkt_route, sea_area, behavior_code, intent_code, ai_description, bounds_min_lng, bounds_max_lng, bounds_min_lat, bounds_max_lat')
    .not('behavior_code', 'is', null)
    .limit(200);
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  // 更新缓存
  memoryCache.set(`${CACHE_KEY}_common`, {
    data: commonTrajectories,
    timestamp: Date.now()
  });
  
  return NextResponse.json({
    message: '缓存预热完成',
    cached_count: commonTrajectories?.length || 0
  });
}

// DELETE: 清除缓存
export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type');
  
  if (type) {
    memoryCache.delete(`${CACHE_KEY}_${type}`);
  } else {
    memoryCache.clear();
  }
  
  return NextResponse.json({ message: '缓存已清除' });
}
