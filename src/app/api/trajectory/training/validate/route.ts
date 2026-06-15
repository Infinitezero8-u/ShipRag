import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/local-db';
import { LLMClient } from '@/lib/ollama/llm';

// 质量校验
export async function POST() {
  const supabase = getSupabaseClient();
  
  // 获取所有已标注数据
  const { data: labeledData, error } = await supabase
    .from('trajectory_training_data')
    .select('id, ai_description, behavior_code, intent_code')
    .eq('is_labeled', true);
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  if (!labeledData || labeledData.length === 0) {
    return NextResponse.json({ error: '没有已标注数据' }, { status: 400 });
  }
  
  const llm = new LLMClient();
  
  // 行为和意图标签
  const behaviorLabels: Record<string, string> = {
    'DOCKING': '码头靠泊', 'ANCHORING': '锚泊', 'BUOY_MOORING': '浮筒系泊',
    'DRIFTING': '原地漂泊', 'STEADY_SAILING': '匀速直航', 'CHANNEL_TURNING': '航道转向',
    'VARIABLE_SAILING': '变速航行', 'TURNING_BACK': '原地掉头', 'LOITERING': '原地徘徊',
    'AVOIDING': '船舶避让', 'CROSSING_CHANNEL': '横穿航道', 'DEVIATION': '违规偏航',
    'AIS_OFF': 'AIS关机失联', 'SUSPICIOUS_LOITERING': '无目的低速游荡'
  };
  
  const intentLabels: Record<string, string> = {
    'INBOUND': '船舶进港', 'OUTBOUND': '船舶出港', 'WAITING_ANCHORAGE': '锚地候泊',
    'INTER_PORT_TRANSIT': '跨港干线运输', 'INTERMEDIATE_CALL': '中途挂靠港口',
    'PILOTAGE': '接驳引水', 'ENGINEERING_WORK': '水上工程作业', 'FISHING': '渔船捕捞',
    'MEETING_AVOIDANCE': '会船避让', 'EMERGENCY_SHELTER': '故障临时避险',
    'SUSPICIOUS_SMUGGLING': '可疑走私航行', 'RESTRICTED_ENTRY': '违规闯入禁航'
  };
  
  let passedCount = 0;
  let reviewCount = 0;
  
  for (const item of labeledData) {
    // 使用 LLM 计算语义匹配分数
    const behaviorLabel = behaviorLabels[item.behavior_code || ''] || item.behavior_code;
    const intentLabel = intentLabels[item.intent_code || ''] || item.intent_code;
    
    // 简单的匹配分数计算（实际应使用 reranker）
    const desc = (item.ai_description || '').toLowerCase();
    let score = 0.5;
    
    // 检查描述中是否包含标签相关关键词
    if (behaviorLabel && desc.includes(behaviorLabel.slice(0, 2))) {
      score += 0.2;
    }
    if (intentLabel && desc.includes(intentLabel.slice(0, 2))) {
      score += 0.2;
    }
    
    // 简单规则调整分数
    if (item.behavior_code === 'DOCKING' && (desc.includes('码头') || desc.includes('靠泊'))) {
      score = Math.min(1, score + 0.3);
    }
    if (item.behavior_code === 'ANCHORING' && (desc.includes('锚') || desc.includes('停泊'))) {
      score = Math.min(1, score + 0.3);
    }
    if (item.intent_code === 'INBOUND' && desc.includes('进港')) {
      score = Math.min(1, score + 0.3);
    }
    if (item.intent_code === 'OUTBOUND' && desc.includes('出港')) {
      score = Math.min(1, score + 0.3);
    }
    
    const needsReview = score < 0.6;
    
    // 更新校验结果
    await supabase
      .from('trajectory_training_data')
      .update({
        validation_score: score,
        needs_review: needsReview
      })
      .eq('id', item.id);
    
    if (needsReview) {
      reviewCount++;
    } else {
      passedCount++;
    }
  }
  
  return NextResponse.json({
    total: labeledData.length,
    passed_count: passedCount,
    review_count: reviewCount
  });
}
