import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 解析 WKT LINESTRING 获取坐标数组
function parseWKT(wkt: string): [number, number][] {
  const match = wkt.match(/LINESTRING\s*\((.*)\)/i);
  if (!match) return [];
  
  const coords = match[1].split(',').map(c => c.trim());
  return coords.map(coord => {
    const [lng, lat] = coord.split(' ').map(Number);
    return [lng, lat] as [number, number];
  });
}

// 生成 WKT LINESTRING
function generateWKT(coords: [number, number][]): string {
  const coordStr = coords.map(([lng, lat]) => `${lng} ${lat}`).join(', ');
  return `LINESTRING(${coordStr})`;
}

// 计算边界
function calculateBounds(coords: [number, number][]) {
  if (coords.length === 0) return null;
  
  let minLng = coords[0][0], maxLng = coords[0][0];
  let minLat = coords[0][1], maxLat = coords[0][1];
  
  for (const [lng, lat] of coords) {
    minLng = Math.min(minLng, lng);
    maxLng = Math.max(maxLng, lng);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  }
  
  return { minLng, maxLng, minLat, maxLat };
}

// 分割航段
export async function POST(request: NextRequest) {
  const body = await request.json();
  const { trajectoryId, splitIndex, splitPoint } = body;
  
  if (!trajectoryId || !splitIndex) {
    return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
  }
  
  const supabase = getSupabaseClient();
  
  // 获取原航段
  const { data: original, error: fetchError } = await supabase
    .from('trajectories')
    .select('*')
    .eq('id', trajectoryId)
    .single();
  
  if (fetchError || !original) {
    return NextResponse.json({ error: '未找到航段' }, { status: 404 });
  }
  
  const coords = parseWKT(original.wkt_route);
  if (coords.length < splitIndex + 1) {
    return NextResponse.json({ error: '分割点超出范围' }, { status: 400 });
  }
  
  // 分割成两段
  const coords1 = coords.slice(0, splitIndex + 1);
  const coords2 = coords.slice(splitIndex);
  
  const bounds1 = calculateBounds(coords1);
  const bounds2 = calculateBounds(coords2);
  
  // 创建两个新航段
  const newSegments: Record<string, any>[] = [
    {
      segment_id: `${original.segment_id}-A`,
      start_port: original.start_port,
      end_port: null,
      wkt_route: generateWKT(coords1),
      sea_area: original.sea_area,
      segment_attrs: original.segment_attrs,
      source_file: original.source_file,
      parent_trajectory_id: original.id,
      split_index: splitIndex,
      is_split: true,
      ...bounds1
    },
    {
      segment_id: `${original.segment_id}-B`,
      start_port: null,
      end_port: original.end_port,
      wkt_route: generateWKT(coords2),
      sea_area: original.sea_area,
      segment_attrs: original.segment_attrs,
      source_file: original.source_file,
      parent_trajectory_id: original.id,
      split_index: splitIndex,
      is_split: true,
      ...bounds2
    }
  ];
  
  // 如果提供了分割点坐标，更新第一个段的结束和第二个段的开始
  if (splitPoint) {
    newSegments[0].split_point_lat = splitPoint.lat;
    newSegments[0].split_point_lng = splitPoint.lng;
    newSegments[1].split_point_lat = splitPoint.lat;
    newSegments[1].split_point_lng = splitPoint.lng;
  }
  
  const { data, error } = await supabase
    .from('trajectories')
    .insert(newSegments)
    .select();
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  // 标记原航段已分割
  await supabase
    .from('trajectories')
    .update({ is_split: true })
    .eq('id', original.id);
  
  return NextResponse.json({
    success: true,
    original: original.id,
    segments: data
  });
}
