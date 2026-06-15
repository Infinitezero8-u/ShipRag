import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/local-db';

// 获取异常样本
export async function GET() {
  try {
    const supabase = await getSupabaseClient();
    
    const { data: anomalies, error } = await supabase
      .from('trajectory_anomaly_samples')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);
    
    if (error) throw error;
    
    // 补充 segment_id 信息
    if (anomalies && anomalies.length > 0) {
      const trajectoryIds = anomalies.map((a: any) => a.trajectory_id).filter(Boolean);
      if (trajectoryIds.length > 0) {
        const { data: trajectories } = await supabase
          .from('trajectories')
          .select('id, segment_id')
          .in('id', trajectoryIds);
        
        const trajectoryMap = new Map((trajectories || []).map((t: any) => [t.id, t.segment_id]));
        
        for (const anomaly of anomalies) {
          anomaly.segment_id = trajectoryMap.get(anomaly.trajectory_id);
        }
      }
    }
    
    return NextResponse.json({ anomalies: anomalies || [] });
  } catch (error) {
    console.error('Get anomalies error:', error);
    return NextResponse.json({ error: '获取异常样本失败' }, { status: 500 });
  }
}
