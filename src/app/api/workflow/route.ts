/**
 * 工作流 API — LangGraph 驱动
 *
 * 兼容旧版工作流 CRUD 接口，内置的 3 个工作流由 LangGraph 引擎驱动。
 * 用户自定义工作流仍存储在 Supabase 中，运行时通过引擎执行。
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/local-db';
import { getAvailableWorkflows } from '@/lib/workflow/engine';

// 内置工作流映射
const builtinWorkflowIds = new Set(['rag-sql-dual', 'rag-only', 'search-only']);

/** GET — 获取工作流列表/单个工作流 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  try {
    const supabase = getSupabaseClient();

    if (id) {
      // 优先返回内置工作流
      const builtins = getAvailableWorkflows();
      const builtin = builtins.find(w => w.id === id);
      if (builtin) return NextResponse.json(builtin);

      const { data, error } = await supabase.from('workflows').select('*').eq('id', id).single();
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json(data);
    }

    // 合并内置 + 用户自定义
    const builtins = getAvailableWorkflows();
    const { data: userWorkflows } = await supabase
      .from('workflows')
      .select('*')
      .order('created_at', { ascending: false });

    return NextResponse.json([...builtins, ...(userWorkflows || [])]);
  } catch (error) {
    console.error('获取工作流失败:', error);
    return NextResponse.json({ error: '获取工作流失败' }, { status: 500 });
  }
}

/** POST — 创建工作流 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, description, nodes, edges, is_active } = body;
    if (!name) return NextResponse.json({ error: '工作流名称不能为空' }, { status: 400 });

    const supabase = getSupabaseClient();
    if (is_active) {
      await supabase.from('workflows').update({ is_active: false }).eq('is_active', true);
    }

    const { data, error } = await supabase
      .from('workflows')
      .insert({ name, description: description || '', nodes: nodes || [], edges: edges || [],
        is_locked: false, is_active: is_active || false, engine: 'langgraph',
      })
      .select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: '创建工作流失败' }, { status: 500 });
  }
}

/** PUT — 更新工作流 */
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: '缺少工作流ID' }, { status: 400 });

    // 内置工作流不可修改
    if (builtinWorkflowIds.has(id)) {
      return NextResponse.json({ error: '内置工作流不可修改，请复制后创建自定义版本' }, { status: 403 });
    }

    const supabase = getSupabaseClient();
    const { data: existing } = await supabase.from('workflows').select('is_locked').eq('id', id).single();
    if (existing?.is_locked) return NextResponse.json({ error: '锁定的工作流不能修改' }, { status: 403 });

    if (updates.is_active) {
      await supabase.from('workflows').update({ is_active: false }).eq('is_active', true);
    }

    const { data, error } = await supabase
      .from('workflows').update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id).select().single();

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json(data);
  } catch (error) {
    return NextResponse.json({ error: '更新工作流失败' }, { status: 500 });
  }
}

/** DELETE — 删除工作流 */
export async function DELETE(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: '缺少工作流ID' }, { status: 400 });
  if (builtinWorkflowIds.has(id)) return NextResponse.json({ error: '内置工作流不可删除' }, { status: 403 });

  const supabase = getSupabaseClient();
  const { data: existing } = await supabase.from('workflows').select('is_locked').eq('id', id).single();
  if (existing?.is_locked) return NextResponse.json({ error: '锁定的工作流不能删除' }, { status: 403 });

  const { error } = await supabase.from('workflows').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ success: true });
}
