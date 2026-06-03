import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取所有行为类型
export async function GET() {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('segment_behaviors')
    .select('*')
    .order('sort_order', { ascending: true });
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data);
}

// 新增行为类型
export async function POST(request: NextRequest) {
  const body = await request.json();
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('segment_behaviors')
    .insert([{
      code: body.code,
      name: body.name,
      description: body.description,
      color: body.color || '#3B82F6',
      sort_order: body.sort_order || 1,
      is_active: body.is_active !== false
    }])
    .select()
    .single();
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data);
}
