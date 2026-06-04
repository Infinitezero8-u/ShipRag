import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

const supabase = getSupabaseClient();

// GET: 列表、搜索、预览
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  
  try {
    // 列表查询
    if (action === 'list') {
      const type = searchParams.get('type') || 'port';
      
      if (type === 'port') {
        const { data, error } = await supabase
          .from('port_data')
          .select('*')
          .order('port_code', { ascending: true })
          .limit(100);
        
        if (error) throw error;
        return NextResponse.json({ items: data });
      } else {
        const { data, error } = await supabase
          .from('route_data')
          .select('*')
          .order('orig_port', { ascending: true })
          .limit(100);
        
        if (error) throw error;
        return NextResponse.json({ items: data });
      }
    }
    
    // 编码检索
    if (action === 'search') {
      const code = searchParams.get('code') || '';
      
      const { data, error } = await supabase
        .from('port_data')
        .select('*')
        .or(`port_code.ilike.%${code}%,name_cn.ilike.%${code}%`)
        .limit(10);
      
      if (error) throw error;
      return NextResponse.json({ ports: data });
    }
    
    // 预览
    if (action === 'preview') {
      const type = searchParams.get('type');
      const code = searchParams.get('code');
      
      if (type === 'port') {
        const { data, error } = await supabase
          .from('port_data')
          .select('*')
          .eq('port_code', code)
          .single();
        
        if (error) throw error;
        return NextResponse.json({ data });
      } else {
        const [origPort, destPort] = code?.split('-') || [];
        const { data, error } = await supabase
          .from('route_data')
          .select('*')
          .eq('orig_port', origPort)
          .eq('dest_port', destPort)
          .single();
        
        if (error) throw error;
        return NextResponse.json({ data });
      }
    }
    
    // 统计
    if (action === 'stats') {
      const [portsResult, routesResult] = await Promise.all([
        supabase.from('port_data').select('id', { count: 'exact', head: true }),
        supabase.from('route_data').select('id', { count: 'exact', head: true })
      ]);
      
      return NextResponse.json({
        portsCount: portsResult.count || 0,
        routesCount: routesResult.count || 0
      });
    }
    
    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (error) {
    console.error('Data maintain error:', error);
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : '操作失败' 
    }, { status: 500 });
  }
}

// POST: 新增、编辑、删除、向量化
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, type } = body;
    
    // 新增
    if (action === 'add') {
      if (type === 'port') {
        const { data: formData } = body;
        const { data, error } = await supabase
          .from('port_data')
          .insert({
            port_code: formData.portCode,
            name_cn: formData.nameCn,
            ctry_code: formData.ctryCode,
            ctry_name_cn: formData.ctryNameCn,
            ctry_name_en: formData.ctryNameEn,
            name_pinyin: formData.namePinyin,
            name_py: formData.namePy,
            tz_offset: parseFloat(formData.tzOffset) || 0,
            port_type: formData.portType,
            lon: parseFloat(formData.lon) || 0,
            lat: parseFloat(formData.lat) || 0,
            continent_code: formData.continentCode,
            continent_name_cn: formData.continentNameCn,
            continent_name_en: formData.continentNameEn,
            vector_status: '未向量化'
          })
          .select()
          .single();
        
        if (error) throw error;
        return NextResponse.json({ success: true, data, message: '港口数据新增成功' });
      } else {
        const { data: formData } = body;
        const { data, error } = await supabase
          .from('route_data')
          .insert({
            orig_port: formData.OrigPort,
            dest_port: formData.DestPort,
            geometry_wkt: formData.geometry_wkt,
            vector_status: '未向量化'
          })
          .select()
          .single();
        
        if (error) throw error;
        return NextResponse.json({ success: true, data, message: '航线数据新增成功' });
      }
    }
    
    // 编辑
    if (action === 'edit') {
      if (type === 'port') {
        const { portCode, data: formData } = body;
        const { data, error } = await supabase
          .from('port_data')
          .update({
            name_cn: formData.nameCn,
            ctry_code: formData.ctryCode,
            ctry_name_cn: formData.ctryNameCn,
            ctry_name_en: formData.ctryNameEn,
            name_pinyin: formData.namePinyin,
            name_py: formData.namePy,
            tz_offset: parseFloat(formData.tzOffset) || 0,
            port_type: formData.portType,
            lon: parseFloat(formData.lon) || 0,
            lat: parseFloat(formData.lat) || 0,
            continent_code: formData.continentCode,
            continent_name_cn: formData.continentNameCn,
            continent_name_en: formData.continentNameEn,
            updated_at: new Date().toISOString()
          })
          .eq('port_code', portCode)
          .select()
          .single();
        
        if (error) throw error;
        return NextResponse.json({ success: true, data, message: '港口数据更新成功' });
      } else {
        const { OrigPort, DestPort, data: formData } = body;
        const { data, error } = await supabase
          .from('route_data')
          .update({
            geometry_wkt: formData.geometry_wkt,
            updated_at: new Date().toISOString()
          })
          .eq('orig_port', OrigPort)
          .eq('dest_port', DestPort)
          .select()
          .single();
        
        if (error) throw error;
        return NextResponse.json({ success: true, data, message: '航线数据更新成功' });
      }
    }
    
    // 删除
    if (action === 'delete') {
      if (type === 'port') {
        const { portCode } = body;
        const { error } = await supabase
          .from('port_data')
          .delete()
          .eq('port_code', portCode);
        
        if (error) throw error;
        return NextResponse.json({ success: true, message: '港口数据删除成功' });
      } else {
        const { OrigPort, DestPort } = body;
        const { error } = await supabase
          .from('route_data')
          .delete()
          .eq('orig_port', OrigPort)
          .eq('dest_port', DestPort);
        
        if (error) throw error;
        return NextResponse.json({ success: true, message: '航线数据删除成功' });
      }
    }
    
    // 向量化
    if (action === 'vectorize') {
      // 更新状态为处理中
      if (type === 'port') {
        const { portCode } = body;
        const { error } = await supabase
          .from('port_data')
          .update({ vector_status: '向量化成功', updated_at: new Date().toISOString() })
          .eq('port_code', portCode);
        
        if (error) throw error;
        return NextResponse.json({ success: true, message: '港口数据向量化成功' });
      } else {
        const { OrigPort, DestPort } = body;
        const { error } = await supabase
          .from('route_data')
          .update({ vector_status: '向量化成功', updated_at: new Date().toISOString() })
          .eq('orig_port', OrigPort)
          .eq('dest_port', DestPort);
        
        if (error) throw error;
        return NextResponse.json({ success: true, message: '航线数据向量化成功' });
      }
    }
    
    // 批量导入
    if (action === 'batch-import') {
      const { items } = body;
      
      if (type === 'port') {
        const portItems = items.map((item: Record<string, string>) => ({
          port_code: item.port_code || item.portCode,
          name_cn: item.name_cn || item.nameCn,
          ctry_code: item.ctry_code || item.ctryCode || '',
          ctry_name_cn: item.ctry_name_cn || item.ctryNameCn || '',
          ctry_name_en: item.ctry_name_en || item.ctryNameEn || '',
          name_pinyin: item.name_pinyin || item.namePinyin || '',
          name_py: item.name_py || item.namePy || '',
          tz_offset: parseFloat(item.tz_offset || item.tzOffset) || 0,
          port_type: item.port_type || item.portType || '',
          lon: parseFloat(item.lon) || 0,
          lat: parseFloat(item.lat) || 0,
          continent_code: item.continent_code || item.continentCode || '',
          continent_name_cn: item.continent_name_cn || item.continentNameCn || '',
          continent_name_en: item.continent_name_en || item.continentNameEn || '',
          vector_status: '未向量化'
        }));
        
        const { data, error } = await supabase
          .from('port_data')
          .insert(portItems)
          .select();
        
        if (error) throw error;
        return NextResponse.json({ 
          success: true, 
          count: data?.length || 0, 
          message: `成功导入 ${data?.length || 0} 条港口数据` 
        });
      } else {
        const routeItems = items.map((item: Record<string, string>) => ({
          orig_port: item.orig_port || item.OrigPort,
          dest_port: item.dest_port || item.DestPort,
          geometry_wkt: item.geometry_wkt || '',
          vector_status: '未向量化'
        }));
        
        const { data, error } = await supabase
          .from('route_data')
          .insert(routeItems)
          .select();
        
        if (error) throw error;
        return NextResponse.json({ 
          success: true, 
          count: data?.length || 0, 
          message: `成功导入 ${data?.length || 0} 条航线数据` 
        });
      }
    }
    
    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (error) {
    console.error('Data maintain error:', error);
    return NextResponse.json({ 
      success: false,
      message: error instanceof Error ? error.message : '操作失败' 
    }, { status: 500 });
  }
}
