import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/local-db';

// 获取训练任务列表
export async function GET() {
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('trajectory_training_jobs')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(20);
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data || []);
}
