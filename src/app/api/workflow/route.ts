import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/local-db';

// 默认工作流节点连线关系
const DEFAULT_EDGES = [
  { from: 0, to: 1 },
  { from: 1, to: 2 },
  { from: 2, to: 3 },
  { from: 3, to: 4 },
  { from: 4, to: 5 },
  { from: 5, to: 6 },
  { from: 6, to: 7 },
  { from: 7, to: 8 },
  { from: 8, to: 9 },
  { from: 9, to: 13 },
  { from: 3, to: 10 },
  { from: 10, to: 11 },
  { from: 11, to: 12 },
  { from: 12, to: 13 },
];

// 系统内置默认工作流
const DEFAULT_WORKFLOW = {
  id: 'default-rag-sql',
  name: '双分支 RAG+SQL 智能问答',
  description: '用户输入→意图分类→条件分支→RAG分支/SQL分支→结果汇总',
  nodes: [
    { type: 'chatInput', name: '用户输入' },
    { type: 'classifyPrompt', name: '分类Prompt' },
    { type: 'classifyLLM', name: '分类LLM' },
    { type: 'branchCondition', name: '条件分支' },
    { type: 'queryRewrite', name: 'Query优化' },
    { type: 'embedding', name: '向量化' },
    { type: 'vectorRetrieval', name: '向量检索' },
    { type: 'rerank', name: '结果重排' },
    { type: 'promptAssembly', name: 'Prompt组装' },
    { type: 'llm', name: 'LLM生成' },
    { type: 'sqlPrompt', name: 'SQL生成' },
    { type: 'sqlExecute', name: '数据库执行' },
    { type: 'sqlPolish', name: '结果润色' },
    { type: 'chatOutput', name: '输出汇总' },
  ],
  edges: DEFAULT_EDGES,
  is_locked: true,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

// 获取工作流列表
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    
    if (id) {
      // 检查是否是内置默认工作流
      if (id === 'default-rag-sql') {
        return NextResponse.json(DEFAULT_WORKFLOW);
      }
      
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
    let id = searchParams.get('id');
    
    // 如果URL中没有id，尝试从body中获取
    if (!id) {
      try {
        const body = await request.json();
        id = body.id;
      } catch {
        // body解析失败，忽略
      }
    }
    
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
