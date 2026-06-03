/**
 * 对话流配置API
 * 支持配置管理、节点执行、流式对话
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { HeaderUtils } from 'coze-coding-dev-sdk';
import { 
  executeConversationFlow, 
  FlowConfig 
} from '@/lib/conversation-flow-engine';

// ============ GET: 获取对话流配置 ============

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    const id = searchParams.get('id');
    
    // 获取单个配置
    if (id) {
      const { data, error } = await supabase
        .from('conversation_flow_configs')
        .select('*')
        .eq('id', id)
        .single();
      
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json(data);
    }
    
    // 获取执行日志
    if (action === 'logs') {
      const sessionId = searchParams.get('session_id');
      const limit = parseInt(searchParams.get('limit') || '50');
      
      let query = supabase
        .from('node_execution_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      
      if (sessionId) {
        query = query.eq('session_id', sessionId);
      }
      
      const { data, error } = await query;
      
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      return NextResponse.json(data || []);
    }
    
    // 获取所有配置
    const { data, error } = await supabase
      .from('conversation_flow_configs')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json(data || []);
    
  } catch (error: any) {
    console.error('获取对话流配置失败:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============ POST: 创建/更新配置或执行对话流 ============

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ...params } = body;
    
    switch (action) {
      case 'execute':
        // 执行对话流
        return await handleExecute(request, params);
      
      case 'create':
        // 创建新配置
        return await handleCreate(params);
      
      case 'update':
        // 更新配置
        return await handleUpdate(params);
      
      case 'activate':
        // 激活配置
        return await handleActivate(params);
      
      case 'delete':
        // 删除配置
        return await handleDelete(params);
      
      default:
        return NextResponse.json({ error: '未知操作' }, { status: 400 });
    }
    
  } catch (error: any) {
    console.error('对话流操作失败:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============ 处理函数 ============

async function handleExecute(request: NextRequest, params: {
  sessionId: string;
  query: string;
}) {
  const { sessionId, query } = params;
  
  if (!sessionId || !query) {
    return NextResponse.json({ 
      error: '缺少必要参数: sessionId, query' 
    }, { status: 400 });
  }
  
  const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
  
  const result = await executeConversationFlow(sessionId, query, request.headers);
  
  return NextResponse.json(result);
}

async function handleCreate(params: {
  name: string;
  description?: string;
  config: FlowConfig;
}) {
  const supabase = getSupabaseClient();
  const { name, description, config } = params;
  
  if (!name || !config) {
    return NextResponse.json({ 
      error: '缺少必要参数: name, config' 
    }, { status: 400 });
  }
  
  const { data, error } = await supabase
    .from('conversation_flow_configs')
    .insert({
      name,
      description: description || '',
      config
    })
    .select()
    .single();
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data);
}

async function handleUpdate(params: {
  id: string;
  name?: string;
  description?: string;
  config?: FlowConfig;
}) {
  const supabase = getSupabaseClient();
  const { id, name, description, config } = params;
  
  if (!id) {
    return NextResponse.json({ error: '缺少配置ID' }, { status: 400 });
  }
  
  const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
  if (name) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (config) updateData.config = config;
  
  const { data, error } = await supabase
    .from('conversation_flow_configs')
    .update(updateData)
    .eq('id', id)
    .select()
    .single();
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data);
}

async function handleActivate(params: { id: string }) {
  const supabase = getSupabaseClient();
  const { id } = params;
  
  if (!id) {
    return NextResponse.json({ error: '缺少配置ID' }, { status: 400 });
  }
  
  // 先取消所有激活状态
  await supabase
    .from('conversation_flow_configs')
    .update({ is_active: false })
    .neq('id', id);
  
  // 激活指定配置
  const { data, error } = await supabase
    .from('conversation_flow_configs')
    .update({ is_active: true })
    .eq('id', id)
    .select()
    .single();
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data);
}

async function handleDelete(params: { id: string }) {
  const supabase = getSupabaseClient();
  const { id } = params;
  
  if (!id) {
    return NextResponse.json({ error: '缺少配置ID' }, { status: 400 });
  }
  
  // 检查是否为默认配置
  const { data: config } = await supabase
    .from('conversation_flow_configs')
    .select('is_default')
    .eq('id', id)
    .single();
  
  if (config?.is_default) {
    return NextResponse.json({ 
      error: '默认配置不可删除' 
    }, { status: 400 });
  }
  
  const { error } = await supabase
    .from('conversation_flow_configs')
    .delete()
    .eq('id', id);
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json({ success: true });
}
