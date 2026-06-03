import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const { direction } = body;
  const supabase = getSupabaseClient();
  
  const { data: current } = await supabase
    .from('segment_intents')
    .select('*')
    .eq('id', id)
    .single();
  
  if (!current) {
    return NextResponse.json({ error: '未找到该项' }, { status: 404 });
  }
  
  const targetOrder = direction === 'up' 
    ? current.sort_order - 1 
    : current.sort_order + 1;
  
  const { data: target } = await supabase
    .from('segment_intents')
    .select('*')
    .eq('sort_order', targetOrder)
    .single();
  
  if (!target) {
    return NextResponse.json({ error: '无法移动' }, { status: 400 });
  }
  
  await supabase
    .from('segment_intents')
    .update({ sort_order: target.sort_order })
    .eq('id', id);
  
  await supabase
    .from('segment_intents')
    .update({ sort_order: current.sort_order })
    .eq('id', target.id);
  
  return NextResponse.json({ success: true });
}
