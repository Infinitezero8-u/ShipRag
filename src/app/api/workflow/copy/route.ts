import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 复制工作流
export async function POST(request: NextRequest) {
  try {
    const { id, name } = await request.json();
    
    if (!id) {
      return NextResponse.json({ error: '缺少源工作流ID' }, { status: 400 });
    }
    
    const supabase = getSupabaseClient();
    
    // 获取源工作流
    const { data: source, error: fetchError } = await supabase
      .from('workflows')
      .select('*')
      .eq('id', id)
      .single();
    
    if (fetchError || !source) {
      return NextResponse.json({ error: '源工作流不存在' }, { status: 404 });
    }
    
    // 创建副本
    const { data, error } = await supabase
      .from('workflows')
      .insert({
        name: name || `${source.name}-副本`,
        description: source.description,
        nodes: source.nodes,
        edges: source.edges,
        is_locked: false, // 副本默认不锁定
        is_active: false,
      })
      .select()
      .single();
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('复制工作流失败:', error);
    return NextResponse.json({ error: '复制工作流失败' }, { status: 500 });
  }
}
