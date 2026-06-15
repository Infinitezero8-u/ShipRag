import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/local-db';

// Haversine 公式计算距离
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371; // 地球半径 km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

// 从 WKT 提取坐标
function extractCoords(wkt: string): number[][] {
  if (!wkt) return [];
  const match = wkt.match(/LINESTRING\s*\((.+)\)/i);
  if (!match) return [];
  
  return match[1].split(',').map(pair => {
    const [lng, lat] = pair.trim().split(' ').map(Number);
    return [lng, lat];
  }).filter(c => !isNaN(c[0]) && !isNaN(c[1]));
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { lat, lng, radius = 10, limit = 50 } = body;
    
    if (lat === undefined || lng === undefined) {
      return NextResponse.json({ error: '需要提供 lat 和 lng 参数' }, { status: 400 });
    }
    
    const supabase = getSupabaseClient();
    
    // 先用边界框过滤
    const latRange = radius / 111; // 约 1度纬度 = 111km
    const lngRange = radius / (111 * Math.cos(lat * Math.PI / 180));
    
    const { data: candidates, error } = await supabase
      .from('trajectories')
      .select('*')
      .gte('bounds_min_lat', lat - latRange)
      .lte('bounds_max_lat', lat + latRange)
      .gte('bounds_min_lng', lng - lngRange)
      .lte('bounds_max_lng', lng + lngRange)
      .limit(500);
    
    if (error) throw error;
    
    // 精确过滤：检查航线上是否有任意点在缓冲区内
    const results: any[] = [];
    
    for (const t of candidates || []) {
      if (!t.wkt_route) continue;
      
      const coords = extractCoords(t.wkt_route);
      let minDist = Infinity;
      
      for (const [clng, clat] of coords) {
        const dist = haversine(lat, lng, clat, clng);
        if (dist < minDist) minDist = dist;
      }
      
      if (minDist <= radius) {
        results.push({
          ...t,
          minDistance: minDist
        });
      }
    }
    
    // 按距离排序并限制数量
    results.sort((a, b) => a.minDistance - b.minDistance);
    const limited = results.slice(0, limit);
    
    return NextResponse.json({
      success: true,
      center: { lat, lng },
      radius,
      count: limited.length,
      trajectories: limited
    });
  } catch (error) {
    console.error('缓冲区查询失败:', error);
    return NextResponse.json({ error: '缓冲区查询失败' }, { status: 500 });
  }
}
