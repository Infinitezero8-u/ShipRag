import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/local-db';

// 获取模型版本列表
export async function GET() {
  try {
    const supabase = await getSupabaseClient();
    
    const { data: versions, error } = await supabase
      .from('trajectory_model_versions')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (error) throw error;
    
    return NextResponse.json({ versions: versions || [] });
  } catch (error) {
    console.error('Get versions error:', error);
    return NextResponse.json({ error: '获取版本失败' }, { status: 500 });
  }
}
