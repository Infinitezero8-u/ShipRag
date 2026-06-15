import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/local-db';

interface Trajectory {
  id: string;
  segment_id: string;
  start_port: string | null;
  end_port: string | null;
  wkt_route: string | null;
}

// 计算两条航线的空间相似度
function calculateSpatialSimilarity(wkt1: string, wkt2: string): number {
  // 简化版：比较起点和终点距离
  const coords1 = extractCoords(wkt1);
  const coords2 = extractCoords(wkt2);
  
  if (coords1.length < 2 || coords2.length < 2) return 0;
  
  const start1 = coords1[0];
  const end1 = coords1[coords1.length - 1];
  const start2 = coords2[0];
  const end2 = coords2[coords2.length - 1];
  
  const startDist = haversine(start1[1], start1[0], start2[1], start2[0]);
  const endDist = haversine(end1[1], end1[0], end2[1], end2[0]);
  
  // 距离小于 1km 认为相似
  const threshold = 1.0;
  if (startDist < threshold && endDist < threshold) {
    return 1 - (startDist + endDist) / (2 * threshold);
  }
  
  return 0;
}

function extractCoords(wkt: string): number[][] {
  const match = wkt.match(/LINESTRING\s*\((.+)\)/i);
  if (!match) return [];
  
  return match[1].split(',').map(pair => {
    const [lng, lat] = pair.trim().split(' ').map(Number);
    return [lng, lat];
  }).filter(c => !isNaN(c[0]) && !isNaN(c[1]));
}

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

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { threshold = 0.8, dryRun = true } = body;
    
    const supabase = getSupabaseClient();
    
    // 获取所有航迹
    const { data: trajectories, error } = await supabase
      .from('trajectories')
      .select('id, segment_id, start_port, end_port, wkt_route')
      .order('created_at', { ascending: true });
    
    if (error) throw error;
    
    // 按起止港分组
    const grouped = new Map<string, Trajectory[]>();
    
    for (const t of trajectories || []) {
      const key = `${t.start_port || 'UNK'}-${t.end_port || 'UNK'}`;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(t);
    }
    
    // 查找重复
    const duplicates: { keep: string; remove: string[]; similarity: number }[] = [];
    
    for (const [key, group] of grouped) {
      if (group.length < 2) continue;
      
      const processed = new Set<string>();
      
      for (let i = 0; i < group.length; i++) {
        if (processed.has(group[i].id)) continue;
        
        const similar: Trajectory[] = [];
        
        for (let j = i + 1; j < group.length; j++) {
          if (processed.has(group[j].id)) continue;
          
          if (group[i].wkt_route && group[j].wkt_route) {
            const sim = calculateSpatialSimilarity(group[i].wkt_route!, group[j].wkt_route!);
            if (sim >= threshold) {
              similar.push(group[j]);
              processed.add(group[j].id);
            }
          }
        }
        
        if (similar.length > 0) {
          duplicates.push({
            keep: group[i].id,
            remove: similar.map(s => s.id),
            similarity: threshold
          });
        }
      }
    }
    
    // 如果不是 dry run，执行删除
    if (!dryRun && duplicates.length > 0) {
      const toRemove = duplicates.flatMap(d => d.remove);
      
      const { error: deleteError } = await supabase
        .from('trajectories')
        .delete()
        .in('id', toRemove);
      
      if (deleteError) throw deleteError;
    }
    
    return NextResponse.json({
      success: true,
      dryRun,
      totalAnalyzed: trajectories?.length || 0,
      duplicatesFound: duplicates.length,
      recordsToRemove: duplicates.flatMap(d => d.remove).length,
      duplicates: dryRun ? duplicates : undefined
    });
  } catch (error) {
    console.error('去重失败:', error);
    return NextResponse.json({ error: '去重失败' }, { status: 500 });
  }
}
