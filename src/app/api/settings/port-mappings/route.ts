import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/local-db';

// 获取端口映射列表
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    const { data, error } = await supabase
      .from('port_name_mappings')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1000);
    
    if (error) {
      return NextResponse.json({ mappings: [] });
    }
    
    return NextResponse.json({ mappings: data || [] });
    
  } catch (error) {
    return NextResponse.json({ mappings: [] });
  }
}

// 添加端口映射
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { alias_name, standard_name, port_code, country, lat, lng } = body;
    
    const supabase = getSupabaseClient();
    
    const { error } = await supabase
      .from('port_name_mappings')
      .insert({
        alias_name: alias_name.toUpperCase(),
        standard_name,
        port_code,
        country,
        lat,
        lng,
      });
    
    if (error) {
      return NextResponse.json({ error: '添加失败' }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    return NextResponse.json({ error: '添加失败' }, { status: 500 });
  }
}
