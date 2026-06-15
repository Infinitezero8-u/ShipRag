import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/local-db';
import { LLMClient } from '@/lib/ollama/llm';

// KMeans 聚类预分类
export async function POST() {
  const supabase = getSupabaseClient();
  
  // 获取无标签的航迹数据
  const { data: unlabeledData, error } = await supabase
    .from('trajectories')
    .select('id, segment_id, ai_description, wkt_route')
    .or('behavior_code.is.null,intent_code.is.null')
    .not('ai_description', 'is', null)
    .limit(1000);
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  if (!unlabeledData || unlabeledData.length < 8) {
    return NextResponse.json({ error: '无标签数据不足' }, { status: 400 });
  }
  
  // 使用 LLM 进行聚类建议
  const llm = new LLMClient();
  
  // 行为和意图的默认映射
  const behaviorClusterMap: Record<number, string> = {
    0: 'STEADY_SAILING',
    1: 'ANCHORING',
    2: 'DOCKING',
    3: 'VARIABLE_SAILING',
    4: 'CHANNEL_TURNING',
    5: 'LOITERING',
    6: 'AVOIDING',
    7: 'DRIFTING'
  };
  
  const intentClusterMap: Record<number, string> = {
    0: 'INTER_PORT_TRANSIT',
    1: 'WAITING_ANCHORAGE',
    2: 'INBOUND',
    3: 'OUTBOUND',
    4: 'INTERMEDIATE_CALL',
    5: 'PILOTAGE',
    6: 'MEETING_AVOIDANCE',
    7: 'FISHING'
  };
  
  // 简单聚类：基于描述文本的简单规则
  const clusterResults: any[] = [];
  
  for (const traj of unlabeledData) {
    const desc = (traj.ai_description || '').toLowerCase();
    let clusterId = 0;
    
    // 简单规则聚类
    if (desc.includes('锚') || desc.includes('停泊')) {
      clusterId = 1;
    } else if (desc.includes('码头') || desc.includes('靠泊')) {
      clusterId = 2;
    } else if (desc.includes('变速') || desc.includes('加速')) {
      clusterId = 3;
    } else if (desc.includes('转向') || desc.includes('弯')) {
      clusterId = 4;
    } else if (desc.includes('徘徊') || desc.includes('等待')) {
      clusterId = 5;
    } else if (desc.includes('避让') || desc.includes('会船')) {
      clusterId = 6;
    } else if (desc.includes('漂') || desc.includes('低速')) {
      clusterId = 7;
    }
    
    // 插入聚类结果
    const { data: clusterResult } = await supabase
      .from('trajectory_clusters')
      .insert({
        trajectory_id: traj.id,
        cluster_id: clusterId,
        confidence: 0.5,
        suggested_behavior: behaviorClusterMap[clusterId],
        suggested_intent: intentClusterMap[clusterId],
        is_confirmed: false
      })
      .select()
      .single();
    
    if (clusterResult) {
      clusterResults.push(clusterResult);
    }
  }
  
  return NextResponse.json({
    cluster_count: 8,
    clustered_count: clusterResults.length
  });
}
