import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取工作流列表
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (id) {
      // 获取单个工作流
      const { data, error } = await supabase
        .from('workflows')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json(data);
    }
    
    // 获取所有工作流
    const { data, error } = await supabase
      .from('workflows')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json(data || []);
  } catch (error) {
    console.error('获取工作流失败:', error);
    return NextResponse.json({ error: '获取工作流失败' }, { status: 500 });
  }
}

// 创建工作流
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, nodes, edges, is_locked, is_active } = body;
    
    if (!name) {
      return NextResponse.json({ error: '工作流名称不能为空' }, { status: 400 });
    }
    
    const supabase = getSupabaseClient();
    
    // 如果设为激活，先取消其他激活状态
    if (is_active) {
      await supabase
        .from('workflows')
        .update({ is_active: false })
        .eq('is_active', true);
    }
    
    const { data, error } = await supabase
      .from('workflows')
      .insert({
        name,
        description: description || '',
        nodes: nodes || [],
        edges: edges || [],
        is_locked: is_locked || false,
        is_active: is_active || false,
      })
      .select()
      .single();
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('创建工作流失败:', error);
    return NextResponse.json({ error: '创建工作流失败' }, { status: 500 });
  }
}

// 更新工作流
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, name, description, nodes, edges, is_locked, is_active } = body;
    
    if (!id) {
      return NextResponse.json({ error: '缺少工作流ID' }, { status: 400 });
    }
    
    const supabase = getSupabaseClient();
    
    // 检查是否锁定
    const { data: existing } = await supabase
      .from('workflows')
      .select('is_locked')
      .eq('id', id)
      .single();
    
    if (existing?.is_locked && is_locked !== false) {
      return NextResponse.json({ error: '锁定的工作流不能修改' }, { status: 403 });
    }
    
    // 如果设为激活，先取消其他激活状态
    if (is_active) {
      await supabase
        .from('workflows')
        .update({ is_active: false })
        .eq('is_active', true);
    }
    
    const updateData: any = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (nodes !== undefined) updateData.nodes = nodes;
    if (edges !== undefined) updateData.edges = edges;
    if (is_locked !== undefined) updateData.is_locked = is_locked;
    if (is_active !== undefined) updateData.is_active = is_active;
    
    const { data, error } = await supabase
      .from('workflows')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('更新工作流失败:', error);
    return NextResponse.json({ error: '更新工作流失败' }, { status: 500 });
  }
}

// 删除工作流
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (!id) {
      return NextResponse.json({ error: '缺少工作流ID' }, { status: 400 });
    }
    
    const supabase = getSupabaseClient();
    
    // 检查是否锁定
    const { data: existing } = await supabase
      .from('workflows')
      .select('is_locked')
      .eq('id', id)
      .single();
    
    if (existing?.is_locked) {
      return NextResponse.json({ error: '锁定的工作流不能删除' }, { status: 403 });
    }
    
    const { error } = await supabase
      .from('workflows')
      .delete()
      .eq('id', id);
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('删除工作流失败:', error);
    return NextResponse.json({ error: '删除工作流失败' }, { status: 500 });
  }
}
