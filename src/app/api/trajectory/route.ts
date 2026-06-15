import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/local-db';

// 航迹上传 API - 支持 Excel/CSV 导入
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: '缺少文件' }, { status: 400 });
    }
    
    const fileName = file.name.toLowerCase();
    const isCsv = fileName.endsWith('.csv');
    const isExcel = fileName.endsWith('.xlsx') || fileName.endsWith('.xls');
    
    if (!isCsv && !isExcel) {
      return NextResponse.json({ error: '仅支持 CSV 或 Excel 文件' }, { status: 400 });
    }
    
    // 读取文件内容
    const buffer = await file.arrayBuffer();
    const content = Buffer.from(buffer);
    
    let rows: any[] = [];
    
    if (isCsv) {
      // 解析 CSV
      const text = content.toString('utf-8');
      const lines = text.split('\n').filter(line => line.trim());
      if (lines.length < 2) {
        return NextResponse.json({ error: 'CSV 文件为空或格式错误' }, { status: 400 });
      }
      
      // 解析表头
      const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''));
      
      // 解析数据行
      for (let i = 1; i < lines.length; i++) {
        const values = parseCSVLine(lines[i]);
        if (values.length === headers.length) {
          const row: any = {};
          headers.forEach((h, idx) => row[h] = values[idx]?.trim() || '');
          rows.push(row);
        }
      }
    } else {
      // Excel 需要通过上传接口处理
      // 这里简化处理，调用现有的上传逻辑
      return NextResponse.json({ 
        error: 'Excel 文件请通过普通上传接口处理，或转换为 CSV 格式',
        hint: '建议字段：航段编号、起港口、止港口、WKT航线、途经海域、航段属性'
      }, { status: 400 });
    }
    
    // 解析航迹数据
    const trajectories: any[] = [];
    
    for (const row of rows) {
      // 字段名兼容多种写法
      const segmentId = row['航段编号'] || row['segment_id'] || row['航段ID'] || row['id'];
      const startPort = row['起港口'] || row['start_port'] || row['起点'] || row['起港'];
      const endPort = row['止港口'] || row['end_port'] || row['终点'] || row['止港'];
      const wktRoute = row['WKT航线'] || row['wkt_route'] || row['wkt'] || row['航线'];
      const seaArea = row['途经海域'] || row['sea_area'] || row['海域'] || '';
      const attrsStr = row['航段属性'] || row['segment_attrs'] || row['属性'] || '{}';
      
      if (!segmentId || !wktRoute) {
        continue; // 跳过无效行
      }
      
      // 解析 WKT 获取边界
      const bounds = parseWKTBounds(wktRoute);
      
      // 解析属性
      let attrs = {};
      try {
        attrs = typeof attrsStr === 'string' ? JSON.parse(attrsStr) : attrsStr;
      } catch {
        attrs = { raw: attrsStr };
      }
      
      trajectories.push({
        segment_id: segmentId,
        start_port: startPort || '',
        end_port: endPort || '',
        wkt_route: wktRoute,
        sea_area: seaArea,
        segment_attrs: attrs,
        bounds_min_lng: bounds.minLng,
        bounds_max_lng: bounds.maxLng,
        bounds_min_lat: bounds.minLat,
        bounds_max_lat: bounds.maxLat,
        source_file: file.name,
      });
    }
    
    if (trajectories.length === 0) {
      return NextResponse.json({ error: '未解析到有效航迹数据' }, { status: 400 });
    }
    
    // 存入数据库（不含向量，向量需要单独处理）
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('trajectories')
      .insert(trajectories)
      .select();
    
    if (error) {
      console.error('插入航迹失败:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      count: data?.length || 0,
      trajectories: data,
      message: `成功导入 ${data?.length || 0} 条航迹，请执行向量化处理`,
    });
    
  } catch (error) {
    console.error('航迹上传失败:', error);
    return NextResponse.json({ error: '上传失败: ' + (error as Error).message }, { status: 500 });
  }
}

// 解析 CSV 行（处理引号内的逗号）
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  
  return result.map(v => v.replace(/^"|"$/g, ''));
}

// 解析 WKT 获取边界范围
function parseWKTBounds(wkt: string): { minLng: number; maxLng: number; minLat: number; maxLat: number } {
  const coords: number[] = [];
  
  // 提取所有数字
  const matches = wkt.match(/-?\d+\.?\d*/g);
  if (matches) {
    for (const m of matches) {
      coords.push(parseFloat(m));
    }
  }
  
  if (coords.length < 4) {
    return { minLng: 0, maxLng: 0, minLat: 0, maxLat: 0 };
  }
  
  // WKT 格式：LINESTRING(lng1 lat1, lng2 lat2, ...)
  const lngs: number[] = [];
  const lats: number[] = [];
  
  for (let i = 0; i < coords.length - 1; i += 2) {
    lngs.push(coords[i]);
    lats.push(coords[i + 1]);
  }
  
  return {
    minLng: Math.min(...lngs),
    maxLng: Math.max(...lngs),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
  };
}

// 获取航迹列表
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const startPort = searchParams.get('startPort');
    const endPort = searchParams.get('endPort');
    const seaArea = searchParams.get('seaArea');
    const limit = parseInt(searchParams.get('limit') || '50');
    
    const supabase = getSupabaseClient();
    
    // 使用 RPC 函数绕过 schema cache
    const { data, error } = await supabase.rpc('get_trajectories', {
      p_limit: limit,
      p_start_port: startPort || null,
      p_end_port: endPort || null,
      p_sea_area: seaArea || null,
    });
    
    if (error) {
      console.error('RPC 查询失败:', error);
      // 回退到普通查询
      let query = supabase.from('trajectories').select('*');
      
      if (id) {
        query = query.eq('id', id);
      }
      if (startPort) {
        query = query.ilike('start_port', `%${startPort}%`);
      }
      if (endPort) {
        query = query.ilike('end_port', `%${endPort}%`);
      }
      if (seaArea) {
        query = query.ilike('sea_area', `%${seaArea}%`);
      }
      
      const { data: fallbackData, error: fallbackError } = await query.limit(limit).order('created_at', { ascending: false });
      
      if (fallbackError) {
        return NextResponse.json({ error: fallbackError.message }, { status: 500 });
      }
      
      return NextResponse.json(fallbackData || []);
    }
    
    // 如果有 ID 过滤，在结果中过滤
    let result = data || [];
    if (id) {
      result = result.filter((item: any) => item.id === id);
    }
    
    return NextResponse.json(result);
  } catch (error) {
    console.error('获取航迹失败:', error);
    return NextResponse.json({ error: '获取失败' }, { status: 500 });
  }
}
