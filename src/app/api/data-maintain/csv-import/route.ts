import { NextRequest, NextResponse } from 'next/server';

// CSV解析函数
function parseCSV(csvText: string): Record<string, string>[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) return [];
  
  // 解析表头
  const headers = lines[0].split(',').map(h => h.trim().replace(/^\uFEFF/, '')); // 移除BOM
  
  // 解析数据行
  const items: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    if (values.length >= headers.length) {
      const item: Record<string, string> = {};
      headers.forEach((header, index) => {
        item[header] = values[index]?.trim() || '';
      });
      items.push(item);
    }
  }
  
  return items;
}

// 动态导入supabase客户端
async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY!;
  return createClient(supabaseUrl, supabaseKey);
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    const type = formData.get('type') as string; // 'port' 或 'route'
    
    if (!file) {
      return NextResponse.json({ error: '请选择文件' }, { status: 400 });
    }
    
    if (!type || !['port', 'route'].includes(type)) {
      return NextResponse.json({ error: '请指定导入类型 (port 或 route)' }, { status: 400 });
    }
    
    // 读取文件内容
    const text = await file.text();
    const items = parseCSV(text);
    
    if (items.length === 0) {
      return NextResponse.json({ error: 'CSV文件为空或格式错误' }, { status: 400 });
    }
    
    const supabase = await getSupabase();
    
    if (type === 'port') {
      // 港口数据导入
      const portItems = items.map(item => ({
        port_code: item.portCode || item.port_code,
        name_cn: item.nameCn || item.name_cn || '',
        ctry_code: item.ctryCode || item.ctry_code || '',
        ctry_name_cn: item.ctryNameCn || item.ctry_name_cn || '',
        ctry_name_en: item.ctryNameEn || item.ctry_name_en || '',
        name_pinyin: item.namePinyin || item.name_pinyin || '',
        name_py: item.namePy || item.name_py || '',
        tz_offset: parseInt(item.tzOffset || item.tz_offset) || 0,
        port_type: item.portType || item.port_type || '',
        lon: parseFloat(item.lon) || 0,
        lat: parseFloat(item.lat) || 0,
        continent_code: item.continentCode || item.continent_code || '',
        continent_name_cn: item.continentNameCn || item.continent_name_cn || '',
        continent_name_en: item.continentNameEn || item.continent_name_en || '',
        vector_status: '未向量化'
      })).filter(item => item.port_code); // 过滤掉没有港口代码的记录
      
      // 批量插入，遇到重复则更新
      const { data, error } = await supabase
        .from('port_data')
        .upsert(portItems, { onConflict: 'port_code' })
        .select();
      
      if (error) {
        console.error('港口数据导入错误:', error);
        return NextResponse.json({ error: `导入失败: ${error.message}` }, { status: 500 });
      }
      
      return NextResponse.json({
        success: true,
        type: 'port',
        total: items.length,
        imported: data?.length || 0,
        message: `成功导入 ${data?.length || 0} 条港口数据`
      });
      
    } else if (type === 'route') {
      // 航线数据导入
      const routeItems = items.map(item => ({
        orig_port: item.origPort || item.orig_port || item.startPort || item.start_port,
        dest_port: item.destPort || item.dest_port || item.endPort || item.end_port,
        geometry_wkt: item.geometryWkt || item.geometry_wkt || 
          `LINESTRING(${item.fromLon || 0} ${item.fromLat || 0}, ${item.toLon || 0} ${item.toLat || 0})`,
        vector_status: '未向量化'
      })).filter(item => item.orig_port && item.dest_port);
      
      const { data, error } = await supabase
        .from('route_data')
        .upsert(routeItems, { onConflict: 'orig_port,dest_port' })
        .select();
      
      if (error) {
        console.error('航线数据导入错误:', error);
        return NextResponse.json({ error: `导入失败: ${error.message}` }, { status: 500 });
      }
      
      return NextResponse.json({
        success: true,
        type: 'route',
        total: items.length,
        imported: data?.length || 0,
        message: `成功导入 ${data?.length || 0} 条航线数据`
      });
    }
    
    return NextResponse.json({ error: '未知的导入类型' }, { status: 400 });
    
  } catch (error) {
    console.error('CSV导入错误:', error);
    return NextResponse.json({ 
      error: `导入失败: ${error instanceof Error ? error.message : '未知错误'}` 
    }, { status: 500 });
  }
}
