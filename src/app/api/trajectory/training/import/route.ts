import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 从标注平台导入数据（已标注的航迹）
export async function POST() {
  const supabase = getSupabaseClient();
  
  // 获取所有已标注的航迹
  const { data: trajectories, error: trajError } = await supabase
    .from('trajectories')
    .select('id, segment_id, ai_description, wkt_route, behavior_code, intent_code, bounds_min_lng, bounds_max_lng, bounds_min_lat, bounds_max_lat')
    .not('behavior_code', 'is', null)
    .not('intent_code', 'is', null);
  
  if (trajError) {
    return NextResponse.json({ error: trajError.message }, { status: 500 });
  }
  
  if (!trajectories || trajectories.length === 0) {
    return NextResponse.json({ error: '没有已标注的航迹数据' }, { status: 400 });
  }
  
  // 准备训练数据
  const trainingData = trajectories.map((t: any) => ({
    trajectory_id: t.id,
    segment_id: t.segment_id,
    ai_description: t.ai_description,
    wkt_route: t.wkt_route,
    spatial_features: {
      min_lng: t.bounds_min_lng,
      max_lng: t.bounds_max_lng,
      min_lat: t.bounds_min_lat,
      max_lat: t.bounds_max_lat
    },
    behavior_code: t.behavior_code,
    intent_code: t.intent_code,
    is_labeled: true,
    dataset_type: 'unlabeled', // 先标记为未分配，后面拆分
    source: 'imported'
  }));
  
  // 插入训练数据（跳过已存在的）
  const { data: inserted, error: insertError } = await supabase
    .from('trajectory_training_data')
    .upsert(trainingData, { onConflict: 'trajectory_id' })
    .select();
  
  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }
  
  // 执行 7:3 拆分
  const { data: allData } = await supabase
    .from('trajectory_training_data')
    .select('id')
    .eq('is_labeled', true);
  
  if (allData && allData.length > 0) {
    // 随机打乱
    const shuffled = allData.sort(() => Math.random() - 0.5);
    const trainCount = Math.floor(shuffled.length * 0.7);
    
    const trainIds = shuffled.slice(0, trainCount).map((d: any) => d.id);
    const valIds = shuffled.slice(trainCount).map((d: any) => d.id);
    
    // 更新数据集类型
    if (trainIds.length > 0) {
      await supabase
        .from('trajectory_training_data')
        .update({ dataset_type: 'train' })
        .in('id', trainIds);
    }
    if (valIds.length > 0) {
      await supabase
        .from('trajectory_training_data')
        .update({ dataset_type: 'val' })
        .in('id', valIds);
    }
  }
  
  return NextResponse.json({
    imported: inserted?.length || 0,
    train_count: Math.floor((inserted?.length || 0) * 0.7),
    val_count: Math.ceil((inserted?.length || 0) * 0.3)
  });
}
