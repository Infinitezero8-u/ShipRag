import { NextRequest, NextResponse } from 'next/server';

// CSV解析函数 - 支持带引号的字段和字段内逗号
function parseCSV(csvText: string): Record<string, string>[] {
  // 移除BOM标记
  const text = csvText.replace(/^\uFEFF/, '');
  const lines: string[] = [];
  
  // 解析CSV行，处理带引号的字段
  let currentLine = '';
  let inQuotes = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const nextChar = text[i + 1];
    
    if (char === '"' && !inQuotes) {
      inQuotes = true;
    } else if (char === '"' && inQuotes) {
      if (nextChar === '"') {
        // 双引号转义
        currentLine += '"';
        i++;
      } else {
        inQuotes = false;
      }
    } else if (char === '\n' && !inQuotes) {
      if (currentLine.trim()) {
        lines.push(currentLine.trim());
      }
      currentLine = '';
    } else if (char === '\r') {
      // 忽略回车符
      continue;
    } else {
      currentLine += char;
    }
  }
  
  // 添加最后一行
  if (currentLine.trim()) {
    lines.push(currentLine.trim());
  }
  
  if (lines.length < 2) {
    console.log('CSV解析: 行数不足', lines.length);
    return [];
  }
  
  // 解析一行CSV
  const parseLine = (line: string): string[] => {
    const values: string[] = [];
    let currentValue = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const nextChar = line[i + 1];
      
      if (char === '"' && !inQuotes) {
        inQuotes = true;
      } else if (char === '"' && inQuotes) {
        if (nextChar === '"') {
          currentValue += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else if (char === ',' && !inQuotes) {
        values.push(currentValue.trim());
        currentValue = '';
      } else {
        currentValue += char;
      }
    }
    
    // 添加最后一个值
    values.push(currentValue.trim());
    return values;
  };
  
  // 解析表头
  const headers = parseLine(lines[0]).map(h => h.trim());
  console.log('CSV解析: 表头', headers);
  
  // 解析数据行
  const items: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    if (values.length > 0) {
      const item: Record<string, string> = {};
      headers.forEach((header, index) => {
        if (header) {
          item[header] = values[index]?.trim() || '';
        }
      });
      items.push(item);
    }
  }
  
  console.log('CSV解析: 数据行数', items.length);
  return items;
}

// 动态导入supabase客户端
async function getSupabase() {
  const { createClient } = await import('@supabase/supabase-js');
  const supabaseUrl = process.env.COZE_SUPABASE_URL!;
  const supabaseKey = process.env.COZE_SUPABASE_ANON_KEY!;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase环境变量未配置: COZE_SUPABASE_URL 或 COZE_SUPABASE_ANON_KEY');
  }
  
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
      
      // 去重：同一port_code只保留最后一条（CSV中后面的覆盖前面的）
      const uniqueItems = new Map<string, typeof portItems[0]>();
      portItems.forEach(item => {
        uniqueItems.set(item.port_code, item);
      });
      const dedupedItems = Array.from(uniqueItems.values());
      
      console.log(`CSV导入: 原始${portItems.length}条, 去重后${dedupedItems.length}条`);
      
      // 批量插入，遇到重复则更新
      const { data, error } = await supabase
        .from('port_data')
        .upsert(dedupedItems, { onConflict: 'port_code' })
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
        data: data, // 返回导入的数据
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
      
      // 去重：同一orig_port+dest_port组合只保留最后一条
      const uniqueItems = new Map<string, typeof routeItems[0]>();
      routeItems.forEach(item => {
        const key = `${item.orig_port}-${item.dest_port}`;
        uniqueItems.set(key, item);
      });
      const dedupedItems = Array.from(uniqueItems.values());
      
      console.log(`CSV导入: 原始${routeItems.length}条, 去重后${dedupedItems.length}条`);
      
      const { data, error } = await supabase
        .from('route_data')
        .upsert(dedupedItems, { onConflict: 'orig_port,dest_port' })
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
        data: data, // 返回导入的数据
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
