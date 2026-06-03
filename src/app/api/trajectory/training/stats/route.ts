import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取统计数据
export async function GET() {
  const supabase = getSupabaseClient();
  
  // 获取总数统计
  const { count: total } = await supabase
    .from('trajectory_training_data')
    .select('*', { count: 'exact', head: true });
  
  const { count: labeled } = await supabase
    .from('trajectory_training_data')
    .select('*', { count: 'exact', head: true })
    .not('behavior_code', 'is', null)
    .not('intent_code', 'is', null);
  
  const { count: unlabeled } = await supabase
    .from('trajectory_training_data')
    .select('*', { count: 'exact', head: true })
    .or('behavior_code.is.null,intent_code.is.null');
  
  const { count: train } = await supabase
    .from('trajectory_training_data')
    .select('*', { count: 'exact', head: true })
    .eq('dataset_type', 'train');
  
  const { count: val } = await supabase
    .from('trajectory_training_data')
    .select('*', { count: 'exact', head: true })
    .eq('dataset_type', 'val');
  
  const { count: needsReview } = await supabase
    .from('trajectory_training_data')
    .select('*', { count: 'exact', head: true })
    .eq('needs_review', true);
  
  return NextResponse.json({
    total: total || 0,
    labeled: labeled || 0,
    unlabeled: unlabeled || 0,
    train: train || 0,
    val: val || 0,
    needsReview: needsReview || 0
  });
}
