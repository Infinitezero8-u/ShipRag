import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { LLMClient } from 'coze-coding-dev-sdk';

// 推理分类
export async function POST() {
  const supabase = getSupabaseClient();
  
  // 获取无标签的航迹
  const { data: unlabeledTrajectories, error } = await supabase
    .from('trajectories')
    .select('id, ai_description, wkt_route, behavior_code, intent_code')
    .or('behavior_code.is.null,intent_code.is.null')
    .not('ai_description', 'is', null)
    .limit(100);
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  if (!unlabeledTrajectories || unlabeledTrajectories.length === 0) {
    return NextResponse.json({ error: '没有需要推理的航迹' }, { status: 400 });
  }
  
  const llm = new LLMClient();
  
  // 行为和意图选项
  const behaviors = ['DOCKING', 'ANCHORING', 'BUOY_MOORING', 'DRIFTING', 'STEADY_SAILING', 
    'CHANNEL_TURNING', 'VARIABLE_SAILING', 'TURNING_BACK', 'LOITERING', 'AVOIDING', 
    'CROSSING_CHANNEL', 'DEVIATION', 'AIS_OFF', 'SUSPICIOUS_LOITERING'];
  
  const intents = ['INBOUND', 'OUTBOUND', 'WAITING_ANCHORAGE', 'INTER_PORT_TRANSIT',
    'INTERMEDIATE_CALL', 'PILOTAGE', 'ENGINEERING_WORK', 'FISHING', 'MEETING_AVOIDANCE',
    'EMERGENCY_SHELTER', 'SUSPICIOUS_SMUGGLING', 'RESTRICTED_ENTRY'];
  
  const behaviorKeywords: Record<string, string[]> = {
    'DOCKING': ['码头', '靠泊', '停靠'],
    'ANCHORING': ['锚', '锚泊', '抛锚'],
    'BUOY_MOORING': ['浮筒', '系泊'],
    'DRIFTING': ['漂', '漂流'],
    'STEADY_SAILING': ['匀速', '直航', '直线'],
    'CHANNEL_TURNING': ['转向', '转弯', '航道'],
    'VARIABLE_SAILING': ['变速', '加速', '减速'],
    'TURNING_BACK': ['掉头', '回转'],
    'LOITERING': ['徘徊', '等待'],
    'AVOIDING': ['避让', '会船'],
    'CROSSING_CHANNEL': ['横穿', '穿越'],
    'DEVIATION': ['偏航', '偏离'],
    'AIS_OFF': ['AIS', '失联'],
    'SUSPICIOUS_LOITERING': ['低速', '游荡']
  };
  
  const intentKeywords: Record<string, string[]> = {
    'INBOUND': ['进港', '入港'],
    'OUTBOUND': ['出港', '离港'],
    'WAITING_ANCHORAGE': ['锚地', '候泊', '等待'],
    'INTER_PORT_TRANSIT': ['干线', '跨港', '运输'],
    'INTERMEDIATE_CALL': ['挂靠', '中途'],
    'PILOTAGE': ['引水', '引航', '接驳'],
    'ENGINEERING_WORK': ['工程', '作业'],
    'FISHING': ['捕捞', '渔船'],
    'MEETING_AVOIDANCE': ['会船', '避让'],
    'EMERGENCY_SHELTER': ['避险', '故障', '紧急'],
    'SUSPICIOUS_SMUGGLING': ['走私', '可疑'],
    'RESTRICTED_ENTRY': ['禁航', '闯入', '违规']
  };
  
  let inferredCount = 0;
  
  for (const traj of unlabeledTrajectories) {
    const desc = (traj.ai_description || '').toLowerCase();
    
    // 基于关键词推理
    let bestBehavior = behaviors[0];
    let bestIntent = intents[0];
    let maxBehaviorScore = 0;
    let maxIntentScore = 0;
    
    for (const [behavior, keywords] of Object.entries(behaviorKeywords)) {
      const score = keywords.filter(k => desc.includes(k)).length;
      if (score > maxBehaviorScore) {
        maxBehaviorScore = score;
        bestBehavior = behavior;
      }
    }
    
    for (const [intent, keywords] of Object.entries(intentKeywords)) {
      const score = keywords.filter(k => desc.includes(k)).length;
      if (score > maxIntentScore) {
        maxIntentScore = score;
        bestIntent = intent;
      }
    }
    
    // 如果没有匹配到关键词，使用 LLM 兜底推理
    if (maxBehaviorScore === 0 || maxIntentScore === 0) {
      try {
        const prompt = `你是一个航运专家，请根据航迹描述判断其行为和意图。

航迹描述：${traj.ai_description}

可选行为类型：${behaviors.join(', ')}
可选意图类型：${intents.join(', ')}

请仅输出JSON格式：{"behavior":"XXX","intent":"XXX"}`;

        const result = await llm.invoke([{ role: 'user', content: prompt }]);
        const content = typeof result === 'string' ? result : (result as any).content || '';
        
        // 尝试解析 LLM 响应
        const jsonMatch = content.match(/\{[^}]+\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.behavior && behaviors.includes(parsed.behavior)) {
            bestBehavior = parsed.behavior;
          }
          if (parsed.intent && intents.includes(parsed.intent)) {
            bestIntent = parsed.intent;
          }
        }
      } catch (llmError) {
        // LLM 兜底失败，使用默认值，不阻塞流程
        console.error('LLM 兜底推理失败:', llmError);
        if (maxBehaviorScore === 0) {
          bestBehavior = 'STEADY_SAILING';
        }
        if (maxIntentScore === 0) {
          bestIntent = 'INTER_PORT_TRANSIT';
        }
      }
    } else if (maxBehaviorScore === 0) {
      bestBehavior = 'STEADY_SAILING';
    } else if (maxIntentScore === 0) {
      bestIntent = 'INTER_PORT_TRANSIT';
    }
    
    // 更新航迹的分类
    const { error: updateError } = await supabase
      .from('trajectories')
      .update({
        behavior_code: bestBehavior,
        intent_code: bestIntent
      })
      .eq('id', traj.id);
    
    if (!updateError) {
      inferredCount++;
    }
  }
  
  return NextResponse.json({
    inferred_count: inferredCount
  });
}
