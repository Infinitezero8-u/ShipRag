import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/local-db';

// 获取用户角色列表
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('user_roles')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    return NextResponse.json({ roles: data });
  } catch (error) {
    console.error('获取角色失败:', error);
    return NextResponse.json({ error: '获取角色失败' }, { status: 500 });
  }
}

// 创建或更新用户角色
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, role, permissions } = body;

    const supabase = getSupabaseClient();
    const { data, error } = await supabase
      .from('user_roles')
      .upsert({
        user_id,
        role: role || 'viewer',
        permissions: permissions || {},
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id' })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ role: data });
  } catch (error) {
    console.error('更新角色失败:', error);
    return NextResponse.json({ error: '更新角色失败' }, { status: 500 });
  }
}
