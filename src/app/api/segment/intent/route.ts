import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/local-db';

// 获取所有意图类型
export async function GET() {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('segment_intents')
    .select('*')
    .order('sort_order', { ascending: true });
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data);
}

// 新增意图类型
export async function POST(request: NextRequest) {
  const body = await request.json();
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('segment_intents')
    .insert([{
      code: body.code,
      name: body.name,
      description: body.description,
      color: body.color || '#10B981',
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
