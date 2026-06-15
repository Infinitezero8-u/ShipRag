import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/local-db';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const days = parseInt(searchParams.get('days') || '7');
    
    const supabase = getSupabaseClient();
    
    // 计算时间范围
    const since = new Date();
    since.setDate(since.getDate() - days);
    
    // 航迹统计
    const { data: trajectoryStats } = await supabase
      .from('trajectories')
      .select('id, source_file, behavior_code, intent_code, embedding, created_at', { count: 'exact' });
    
    // 标注统计
    const { data: labeledTrajectories } = await supabase
      .from('trajectories')
      .select('id')
      .not('behavior_code', 'is', null);
    
    // 训练数据统计
    const { data: trainingStats } = await supabase
      .from('trajectory_training_data')
      .select('id, is_labeled, dataset_type', { count: 'exact' });
    
    // 异常样本统计
    const { data: anomalyStats } = await supabase
      .from('trajectory_anomaly_samples')
      .select('id, is_corrected', { count: 'exact' });
    
    // 文件上传统计
    const { data: fileUploads } = await supabase
      .from('file_uploads')
      .select('id, filename, status', { count: 'exact' });
    
    // 知识条目统计
    const { data: knowledgeStats } = await supabase
      .from('knowledge_items')
      .select('id, embedding, source_file', { count: 'exact' });
    
    // 按来源分组统计
    const sourceGroups = new Map<string, number>();
    for (const t of trajectoryStats || []) {
      const source = t.source_file || 'unknown';
      sourceGroups.set(source, (sourceGroups.get(source) || 0) + 1);
    }
    
    // 向量化统计
    const vectorized = trajectoryStats?.filter(t => t.embedding !== null).length || 0;
    const pendingVector = (trajectoryStats?.length || 0) - vectorized;
    
    // 行为分布
    const behaviorDistribution = new Map<string, number>();
    for (const t of trajectoryStats || []) {
      if (t.behavior_code) {
        behaviorDistribution.set(t.behavior_code, (behaviorDistribution.get(t.behavior_code) || 0) + 1);
      }
    }
    
    // 意图分布
    const intentDistribution = new Map<string, number>();
    for (const t of trajectoryStats || []) {
      if (t.intent_code) {
        intentDistribution.set(t.intent_code, (intentDistribution.get(t.intent_code) || 0) + 1);
      }
    }
    
    return NextResponse.json({
      success: true,
      period: { days, since: since.toISOString() },
      trajectories: {
        total: trajectoryStats?.length || 0,
        labeled: labeledTrajectories?.length || 0,
        vectorized,
        pendingVector,
        bySource: Object.fromEntries(sourceGroups),
        byBehavior: Object.fromEntries(behaviorDistribution),
        byIntent: Object.fromEntries(intentDistribution)
      },
      training: {
        total: trainingStats?.length || 0,
        labeled: trainingStats?.filter(t => t.is_labeled).length || 0,
        train: trainingStats?.filter(t => t.dataset_type === 'train').length || 0,
        val: trainingStats?.filter(t => t.dataset_type === 'val').length || 0
      },
      anomalies: {
        total: anomalyStats?.length || 0,
        corrected: anomalyStats?.filter(a => a.is_corrected).length || 0,
        pending: anomalyStats?.filter(a => !a.is_corrected).length || 0
      },
      uploads: {
        total: fileUploads?.length || 0,
        success: fileUploads?.filter(f => f.status === 'success').length || 0,
        pending: fileUploads?.filter(f => f.status === 'pending').length || 0
      },
      knowledge: {
        total: knowledgeStats?.length || 0,
        vectorized: knowledgeStats?.filter(k => k.embedding !== null).length || 0
      }
    });
  } catch (error) {
    console.error('获取统计失败:', error);
    return NextResponse.json({ error: '获取统计失败' }, { status: 500 });
  }
}
