import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 开始训练任务
export async function POST(request: Request) {
  const body = await request.json();
  const modelType = body.model_type || 'ensemble';
  
  const supabase = getSupabaseClient();
  
  // 获取训练和验证数据数量
  const { count: trainCount } = await supabase
    .from('trajectory_training_data')
    .select('*', { count: 'exact', head: true })
    .eq('dataset_type', 'train')
    .eq('is_labeled', true);
  
  const { count: valCount } = await supabase
    .from('trajectory_training_data')
    .select('*', { count: 'exact', head: true })
    .eq('dataset_type', 'val')
    .eq('is_labeled', true);
  
  if (!trainCount || trainCount < 10) {
    return NextResponse.json({ error: '训练数据不足，至少需要10条' }, { status: 400 });
  }
  
  // 创建训练任务
  const modelNames: Record<string, string> = {
    'text_classifier': '文本分类模型 (BGE-base-zh + LoRA)',
    'spatial_classifier': '空间特征模型 (XGBoost)',
    'ensemble': '融合模型 (文本0.7 + 空间0.3)'
  };
  
  const configs: Record<string, any> = {
    'text_classifier': {
      base_model: 'bge-base-zh',
      method: 'lora',
      epochs: 4,
      batch_size: 16,
      learning_rate: '2e-4',
      lora_rank: 8,
      lora_alpha: 16
    },
    'spatial_classifier': {
      model: 'xgboost',
      n_estimators: 120,
      max_depth: 6,
      learning_rate: 0.1,
      features: ['length', 'curvature', 'turn_angle', 'bounds']
    },
    'ensemble': {
      text_weight: 0.7,
      spatial_weight: 0.3,
      text_model: 'text_classifier',
      spatial_model: 'spatial_classifier'
    }
  };
  
  const { data: job, error } = await supabase
    .from('trajectory_training_jobs')
    .insert({
      name: modelNames[modelType] || modelType,
      model_type: modelType,
      status: 'pending',
      config: configs[modelType],
      train_count: trainCount,
      val_count: valCount || 0
    })
    .select()
    .single();
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  // 模拟训练过程（实际应该调用训练服务）
  // 这里只是演示，实际需要调用后端训练服务
  setTimeout(async () => {
    // 更新状态为运行中
    await supabase
      .from('trajectory_training_jobs')
      .update({ status: 'running' })
      .eq('id', job.id);
    
    // 模拟训练时间
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // 模拟训练完成
    const mockMetrics = {
      accuracy: 0.85 + Math.random() * 0.1,
      f1: 0.82 + Math.random() * 0.1,
      precision: 0.83 + Math.random() * 0.1,
      recall: 0.81 + Math.random() * 0.1
    };
    
    await supabase
      .from('trajectory_training_jobs')
      .update({
        status: 'completed',
        metrics: mockMetrics,
        completed_at: new Date().toISOString()
      })
      .eq('id', job.id);
  }, 1000);
  
  return NextResponse.json({
    job_id: job.id,
    message: '训练任务已创建'
  });
}
