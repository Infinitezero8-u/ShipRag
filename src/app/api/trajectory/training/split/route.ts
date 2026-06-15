import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/local-db';

// 重新拆分数据集 (7:3)
export async function POST() {
  const supabase = getSupabaseClient();
  
  // 获取所有已标注数据
  const { data: allData, error } = await supabase
    .from('trajectory_training_data')
    .select('id')
    .eq('is_labeled', true);
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  if (!allData || allData.length === 0) {
    return NextResponse.json({ error: '没有已标注数据' }, { status: 400 });
  }
  
  // 随机打乱
  const shuffled = [...allData].sort(() => Math.random() - 0.5);
  const trainCount = Math.floor(shuffled.length * 0.7);
  
  const trainIds = shuffled.slice(0, trainCount).map((d: any) => d.id);
  const valIds = shuffled.slice(trainCount).map((d: any) => d.id);
  
  // 先重置所有为 unlabeled
  await supabase
    .from('trajectory_training_data')
    .update({ dataset_type: 'unlabeled' })
    .eq('is_labeled', true);
  
  // 更新训练集
  if (trainIds.length > 0) {
    await supabase
      .from('trajectory_training_data')
      .update({ dataset_type: 'train' })
      .in('id', trainIds);
  }
  
  // 更新验证集
  if (valIds.length > 0) {
    await supabase
      .from('trajectory_training_data')
      .update({ dataset_type: 'val' })
      .in('id', valIds);
  }
  
  return NextResponse.json({
    train_count: trainIds.length,
    val_count: valIds.length
  });
}
