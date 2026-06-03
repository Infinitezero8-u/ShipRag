import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { EmbeddingClient, LLMClient } from 'coze-coding-dev-sdk';

const supabase = getSupabaseClient();

// 港口数据必填字段
const PORT_REQUIRED_FIELDS = [
  'portCode', 'nameCn', 'ctryCode', 'ctryNameCn', 'ctryNameEn',
  'namePinyin', 'namePy', 'tzOffset', 'portType', 'lon', 'lat',
  'continentCode', 'continentNameCn', 'continentNameEn'
];

// 航线数据必填字段
const ROUTE_REQUIRED_FIELDS = ['OrigPort', 'DestPort', 'geometry_wkt'];

// 校验港口数据字段
function validatePortData(data: Record<string, unknown>): { valid: boolean; missing: string[]; errors: string[] } {
  const missing: string[] = [];
  const errors: string[] = [];

  for (const field of PORT_REQUIRED_FIELDS) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      missing.push(field);
    }
  }

  // 数字格式校验
  if (data.lon !== undefined && isNaN(Number(data.lon))) {
    errors.push('lon必须是数字格式');
  }
  if (data.lat !== undefined && isNaN(Number(data.lat))) {
    errors.push('lat必须是数字格式');
  }
  if (data.tzOffset !== undefined && isNaN(Number(data.tzOffset))) {
    errors.push('tzOffset必须是数字格式');
  }

  return { valid: missing.length === 0 && errors.length === 0, missing, errors };
}

// 校验航线数据字段
function validateRouteData(data: Record<string, unknown>): { valid: boolean; missing: string[]; errors: string[] } {
  const missing: string[] = [];
  const errors: string[] = [];

  for (const field of ROUTE_REQUIRED_FIELDS) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      missing.push(field);
    }
  }

  // WKT格式校验
  if (data.geometry_wkt && !String(data.geometry_wkt).toUpperCase().startsWith('MULTILINESTRING')) {
    errors.push('geometry_wkt必须为MULTILINESTRING格式');
  }

  return { valid: missing.length === 0 && errors.length === 0, missing, errors };
}

// 格式化输出
function formatOutput(
  operation: string,
  identifier: string,
  result: string,
  vectorStatus: string
): string {
  return `① 操作类型：${operation}
② 数据标识：${identifier}
③ 执行结果：${result}
④ 向量化状态：${vectorStatus}`;
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'list';
  const type = searchParams.get('type'); // port | route
  const code = searchParams.get('code');
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '20');

  try {
    // 获取港口数据列表
    if (action === 'list' && type === 'port') {
      const { data, error, count } = await supabase
        .from('port_data')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (error) throw error;
      return NextResponse.json({ success: true, items: data, total: count, page, pageSize });
    }

    // 获取航线数据列表
    if (action === 'list' && type === 'route') {
      const { data, error, count } = await supabase
        .from('route_data')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (error) throw error;
      return NextResponse.json({ success: true, items: data, total: count, page, pageSize });
    }

    // 预览港口数据
    if (action === 'preview' && type === 'port' && code) {
      const { data, error } = await supabase
        .from('port_data')
        .select('*')
        .eq('port_code', code)
        .single();

      if (error) throw error;
      if (!data) return NextResponse.json({ error: '未找到该港口数据' }, { status: 404 });

      return NextResponse.json({
        success: true,
        data: {
          portCode: data.port_code,
          nameCn: data.name_cn,
          ctryCode: data.ctry_code,
          ctryNameCn: data.ctry_name_cn,
          ctryNameEn: data.ctry_name_en,
          namePinyin: data.name_pinyin,
          namePy: data.name_py,
          tzOffset: data.tz_offset,
          portType: data.port_type,
          lon: data.lon,
          lat: data.lat,
          continentCode: data.continent_code,
          continentNameCn: data.continent_name_cn,
          continentNameEn: data.continent_name_en,
          vectorStatus: data.vector_status
        }
      });
    }

    // 预览航线数据
    if (action === 'preview' && type === 'route' && code) {
      const [origPort, destPort] = code.split('-');
      const { data, error } = await supabase
        .from('route_data')
        .select('*')
        .eq('orig_port', origPort)
        .eq('dest_port', destPort)
        .single();

      if (error) throw error;
      if (!data) return NextResponse.json({ error: '未找到该航线数据' }, { status: 404 });

      return NextResponse.json({
        success: true,
        data: {
          OrigPort: data.orig_port,
          DestPort: data.dest_port,
          geometry_wkt: data.geometry_wkt,
          vectorStatus: data.vector_status
        }
      });
    }

    // 编码检索（模糊匹配）
    if (action === 'search' && code) {
      const portResults = await supabase
        .from('port_data')
        .select('port_code, name_cn, vector_status')
        .or(`port_code.ilike.%${code}%,name_cn.ilike.%${code}%`)
        .limit(20);

      return NextResponse.json({
        success: true,
        ports: portResults.data || []
      });
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { action, type } = body;

  try {
    // 新增港口数据
    if (action === 'add' && type === 'port') {
      const validation = validatePortData(body.data);
      if (!validation.valid) {
        return NextResponse.json({
          success: false,
          message: formatOutput(
            '新增',
            body.data.portCode || '未知',
            `失败：缺失字段 [${validation.missing.join(', ')}]；${validation.errors.join('；')}`,
            '未向量化'
          ),
          missing: validation.missing,
          errors: validation.errors
        });
      }

      const d = body.data;
      const { error } = await supabase.from('port_data').insert({
        port_code: d.portCode,
        name_cn: d.nameCn,
        ctry_code: d.ctryCode,
        ctry_name_cn: d.ctryNameCn,
        ctry_name_en: d.ctryNameEn,
        name_pinyin: d.namePinyin,
        name_py: d.namePy,
        tz_offset: Number(d.tzOffset),
        port_type: d.portType,
        lon: Number(d.lon),
        lat: Number(d.lat),
        continent_code: d.continentCode,
        continent_name_cn: d.continentNameCn,
        continent_name_en: d.continentNameEn,
        vector_status: '未向量化'
      });

      if (error) {
        return NextResponse.json({
          success: false,
          message: formatOutput('新增', d.portCode, `失败：${error.message}`, '未向量化')
        });
      }

      return NextResponse.json({
        success: true,
        message: formatOutput('新增', d.portCode, '成功', '未向量化')
      });
    }

    // 新增航线数据
    if (action === 'add' && type === 'route') {
      const validation = validateRouteData(body.data);
      if (!validation.valid) {
        return NextResponse.json({
          success: false,
          message: formatOutput(
            '新增',
            `${body.data.OrigPort || '未知'}-${body.data.DestPort || '未知'}`,
            `失败：缺失字段 [${validation.missing.join(', ')}]；${validation.errors.join('；')}`,
            '未向量化'
          ),
          missing: validation.missing,
          errors: validation.errors
        });
      }

      const d = body.data;
      const { error } = await supabase.from('route_data').insert({
        orig_port: d.OrigPort,
        dest_port: d.DestPort,
        geometry_wkt: d.geometry_wkt,
        vector_status: '未向量化'
      });

      if (error) {
        return NextResponse.json({
          success: false,
          message: formatOutput('新增', `${d.OrigPort}-${d.DestPort}`, `失败：${error.message}`, '未向量化')
        });
      }

      return NextResponse.json({
        success: true,
        message: formatOutput('新增', `${d.OrigPort}-${d.DestPort}`, '成功', '未向量化')
      });
    }

    // 编辑港口数据
    if (action === 'edit' && type === 'port') {
      const { portCode, ...updates } = body.data;
      if (!portCode) {
        return NextResponse.json({ error: '缺少portCode' }, { status: 400 });
      }

      // 字段映射
      const fieldMap: Record<string, string> = {
        nameCn: 'name_cn', ctryCode: 'ctry_code', ctryNameCn: 'ctry_name_cn',
        ctryNameEn: 'ctry_name_en', namePinyin: 'name_pinyin', namePy: 'name_py',
        tzOffset: 'tz_offset', portType: 'port_type', lon: 'lon', lat: 'lat',
        continentCode: 'continent_code', continentNameCn: 'continent_name_cn',
        continentNameEn: 'continent_name_en'
      };

      const dbUpdates: Record<string, unknown> = { updated_at: new Date().toISOString() };
      const modifiedFields: string[] = [];

      for (const [key, value] of Object.entries(updates)) {
        if (fieldMap[key]) {
          dbUpdates[fieldMap[key]] = key === 'tzOffset' || key === 'lon' || key === 'lat' 
            ? Number(value) 
            : value;
          modifiedFields.push(key);
        }
      }

      const { data: existing, error: findError } = await supabase
        .from('port_data')
        .select('vector_status')
        .eq('port_code', portCode)
        .single();

      if (findError || !existing) {
        return NextResponse.json({
          success: false,
          message: formatOutput('编辑', portCode, '失败：未找到该港口', '未知')
        });
      }

      const { error } = await supabase
        .from('port_data')
        .update(dbUpdates)
        .eq('port_code', portCode);

      if (error) {
        return NextResponse.json({
          success: false,
          message: formatOutput('编辑', portCode, `失败：${error.message}`, existing.vector_status)
        });
      }

      return NextResponse.json({
        success: true,
        message: formatOutput('编辑', portCode, `成功，修改字段：${modifiedFields.join(', ')}`, existing.vector_status)
      });
    }

    // 编辑航线数据
    if (action === 'edit' && type === 'route') {
      const { OrigPort, DestPort, geometry_wkt } = body.data;
      if (!OrigPort || !DestPort) {
        return NextResponse.json({ error: '缺少OrigPort或DestPort' }, { status: 400 });
      }

      const { data: existing, error: findError } = await supabase
        .from('route_data')
        .select('vector_status')
        .eq('orig_port', OrigPort)
        .eq('dest_port', DestPort)
        .single();

      if (findError || !existing) {
        return NextResponse.json({
          success: false,
          message: formatOutput('编辑', `${OrigPort}-${DestPort}`, '失败：未找到该航线', '未知')
        });
      }

      const { error } = await supabase
        .from('route_data')
        .update({ geometry_wkt, updated_at: new Date().toISOString() })
        .eq('orig_port', OrigPort)
        .eq('dest_port', DestPort);

      if (error) {
        return NextResponse.json({
          success: false,
          message: formatOutput('编辑', `${OrigPort}-${DestPort}`, `失败：${error.message}`, existing.vector_status)
        });
      }

      return NextResponse.json({
        success: true,
        message: formatOutput('编辑', `${OrigPort}-${DestPort}`, '成功，修改字段：geometry_wkt', existing.vector_status)
      });
    }

    // 删除数据
    if (action === 'delete') {
      if (type === 'port') {
        const { portCode } = body;
        const { error } = await supabase.from('port_data').delete().eq('port_code', portCode);
        if (error) throw error;
        return NextResponse.json({
          success: true,
          message: formatOutput('删除', portCode, '成功', '已删除')
        });
      }

      if (type === 'route') {
        const { OrigPort, DestPort } = body;
        const { error } = await supabase
          .from('route_data')
          .delete()
          .eq('orig_port', OrigPort)
          .eq('dest_port', DestPort);
        if (error) throw error;
        return NextResponse.json({
          success: true,
          message: formatOutput('删除', `${OrigPort}-${DestPort}`, '成功', '已删除')
        });
      }
    }

    // 一键向量化
    if (action === 'vectorize') {
      const embeddingClient = new EmbeddingClient();

      if (type === 'port') {
        const { portCode } = body;
        const { data: port, error: findError } = await supabase
          .from('port_data')
          .select('*')
          .eq('port_code', portCode)
          .single();

        if (findError || !port) {
          return NextResponse.json({
            success: false,
            message: formatOutput('向量化', portCode, '失败：未找到该港口', '未知')
          });
        }

        // 拼接描述文本
        const text = `港口代码:${port.port_code},中文港名:${port.name_cn},国家:${port.ctry_name_cn}(${port.ctry_name_en}),全拼音:${port.name_pinyin},拼音简码:${port.name_py},时区偏移:${port.tz_offset}小时,港口类型:${port.port_type},经度:${port.lon},纬度:${port.lat},大洲:${port.continent_name_cn}(${port.continent_name_en})`;

        try {
          const embedResult = await embeddingClient.embed([text]);
          const vector = embedResult as unknown as number[];

          if (!vector) throw new Error('向量化失败');

          // 存入knowledge_items表
          const { error: insertError } = await supabase.from('knowledge_items').insert({
            title: port.name_cn,
            content: text,
            modality: 'port',
            source_file: 'port_data',
            embedding: vector
          });

          if (insertError) throw insertError;

          await supabase
            .from('port_data')
            .update({ vector_status: '向量化成功' })
            .eq('port_code', portCode);

          return NextResponse.json({
            success: true,
            message: formatOutput('向量化', portCode, '成功', '向量化成功')
          });
        } catch (vecError) {
          await supabase
            .from('port_data')
            .update({ vector_status: '向量化失败' })
            .eq('port_code', portCode);

          return NextResponse.json({
            success: false,
            message: formatOutput('向量化', portCode, `失败：${String(vecError)}`, '向量化失败')
          });
        }
      }

      if (type === 'route') {
        const { OrigPort, DestPort } = body;
        const { data: route, error: findError } = await supabase
          .from('route_data')
          .select('*')
          .eq('orig_port', OrigPort)
          .eq('dest_port', DestPort)
          .single();

        if (findError || !route) {
          return NextResponse.json({
            success: false,
            message: formatOutput('向量化', `${OrigPort}-${DestPort}`, '失败：未找到该航线', '未知')
          });
        }

        // WKT格式校验
        if (!route.geometry_wkt.toUpperCase().startsWith('MULTILINESTRING')) {
          await supabase
            .from('route_data')
            .update({ vector_status: '向量化失败' })
            .eq('orig_port', OrigPort)
            .eq('dest_port', DestPort);

          return NextResponse.json({
            success: false,
            message: formatOutput('向量化', `${OrigPort}-${DestPort}`, '失败：WKT格式错误', '向量化失败')
          });
        }

        // 提取WKT坐标描述（取前5个点）
        const wktCoords = route.geometry_wkt.match(/\d+\.?\d*\s+-?\d+\.?\d*/g) || [];
        const coordPreview = wktCoords.slice(0, 5).join(' -> ');

        const text = `航线:起运港${OrigPort}到目的港${DestPort},航线坐标:${coordPreview}`;

        try {
          const embedResult = await embeddingClient.embed([text]);
          const vector = embedResult as unknown as number[];

          if (!vector) throw new Error('向量化失败');

          const { error: insertError } = await supabase.from('knowledge_items').insert({
            title: `${OrigPort}-${DestPort}`,
            content: text,
            modality: 'route',
            source_file: 'route_data',
            embedding: vector,
            metadata: { orig_port: OrigPort, dest_port: DestPort, geometry_wkt: route.geometry_wkt }
          });

          if (insertError) throw insertError;

          await supabase
            .from('route_data')
            .update({ vector_status: '向量化成功' })
            .eq('orig_port', OrigPort)
            .eq('dest_port', DestPort);

          return NextResponse.json({
            success: true,
            message: formatOutput('向量化', `${OrigPort}-${DestPort}`, '成功', '向量化成功')
          });
        } catch (vecError) {
          await supabase
            .from('route_data')
            .update({ vector_status: '向量化失败' })
            .eq('orig_port', OrigPort)
            .eq('dest_port', DestPort);

          return NextResponse.json({
            success: false,
            message: formatOutput('向量化', `${OrigPort}-${DestPort}`, `失败：${String(vecError)}`, '向量化失败')
          });
        }
      }
    }

    // 批量导入
    if (action === 'batchImport') {
      const results: { success: boolean; identifier: string; message: string }[] = [];
      const items = body.data as Array<Record<string, unknown>>;

      for (const item of items) {
        if (type === 'port') {
          const validation = validatePortData(item);
          if (!validation.valid) {
            results.push({
              success: false,
              identifier: String(item.portCode || '未知'),
              message: `缺失字段: ${validation.missing.join(', ')}`
            });
            continue;
          }

          const { error } = await supabase.from('port_data').insert({
            port_code: item.portCode,
            name_cn: item.nameCn,
            ctry_code: item.ctryCode,
            ctry_name_cn: item.ctryNameCn,
            ctry_name_en: item.ctryNameEn,
            name_pinyin: item.namePinyin,
            name_py: item.namePy,
            tz_offset: Number(item.tzOffset),
            port_type: item.portType,
            lon: Number(item.lon),
            lat: Number(item.lat),
            continent_code: item.continentCode,
            continent_name_cn: item.continentNameCn,
            continent_name_en: item.continentNameEn,
            vector_status: '未向量化'
          });

          results.push({
            success: !error,
            identifier: String(item.portCode),
            message: error ? error.message : '导入成功'
          });
        }

        if (type === 'route') {
          const validation = validateRouteData(item);
          if (!validation.valid) {
            results.push({
              success: false,
              identifier: `${item.OrigPort || '未知'}-${item.DestPort || '未知'}`,
              message: `缺失字段: ${validation.missing.join(', ')}`
            });
            continue;
          }

          const { error } = await supabase.from('route_data').insert({
            orig_port: item.OrigPort,
            dest_port: item.DestPort,
            geometry_wkt: item.geometry_wkt,
            vector_status: '未向量化'
          });

          results.push({
            success: !error,
            identifier: `${item.OrigPort}-${item.DestPort}`,
            message: error ? error.message : '导入成功'
          });
        }
      }

      return NextResponse.json({
        success: true,
        results,
        summary: {
          total: items.length,
          succeeded: results.filter(r => r.success).length,
          failed: results.filter(r => !r.success).length
        }
      });
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
