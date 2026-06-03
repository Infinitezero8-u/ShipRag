/**
 * 航迹智能标注API
 * 输入：船舶AIS航迹数据、地理区域、船舶基础信息
 * 输出：主行为标签+主意图标签+备选标签+判定依据
 * 辅助参考：SQL（历史航迹与标注记录）+ Chroma向量库（相似案例）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

// ============ 标签池定义 ============

const BEHAVIOR_LABELS = [
  { code: 'DOCKING', name: '码头靠泊', description: '船舶停靠在码头进行装卸作业' },
  { code: 'ANCHORING', name: '锚泊', description: '船舶在锚地抛锚等待' },
  { code: 'BUOY_MOORING', name: '浮筒系泊', description: '船舶系泊于浮筒' },
  { code: 'DRIFTING', name: '原地漂泊', description: '船舶无动力漂浮' },
  { code: 'STEADY_SAILING', name: '匀速直航', description: '船舶保持稳定航向航速航行' },
  { code: 'CHANNEL_TURNING', name: '航道转向', description: '船舶在航道中转向' },
  { code: 'VARIABLE_SAILING', name: '变速航行', description: '船舶频繁改变航速' },
  { code: 'TURNING_BACK', name: '原地掉头', description: '船舶原地掉头转向' },
  { code: 'LINGERING', name: '原地徘徊', description: '船舶在小范围内来回移动' },
  { code: 'AVOIDING', name: '船舶避让', description: '船舶主动避让其他船只' },
  { code: 'CROSSING_CHANNEL', name: '横穿航道', description: '船舶横穿主航道' },
  { code: 'DEVIATION', name: '违规偏航', description: '船舶偏离规定航道' },
  { code: 'AIS_LOST', name: 'AIS关机失联', description: 'AIS信号中断或关闭' },
  { code: 'AIMLESS_LOW_SPEED', name: '无目的低速游荡', description: '船舶低速无明确目的移动' },
];

const INTENT_LABELS = [
  { code: 'PORT_ENTRY', name: '船舶进港', description: '船舶驶入港口' },
  { code: 'PORT_EXIT', name: '船舶出港', description: '船舶驶离港口' },
  { code: 'ANCHORAGE_WAITING', name: '锚地候泊', description: '在锚地等待靠泊' },
  { code: 'TRUNK_TRANSPORT', name: '跨港干线运输', description: '港口间长途运输' },
  { code: 'INTERMEDIATE_CALL', name: '中途挂靠港口', description: '中途停靠补充物资' },
  { code: 'PILOTAGE', name: '接驳引水', description: '接送引航员' },
  { code: 'MARINE_WORK', name: '水上工程作业', description: '海上施工作业' },
  { code: 'FISHING', name: '渔船捕捞', description: '渔船进行捕捞作业' },
  { code: 'MEETING_AVOIDING', name: '会船避让', description: '与来船会船避让' },
  { code: 'EMERGENCY_SHELTER', name: '故障临时避险', description: '故障时临时避险' },
  { code: 'SUSPICIOUS_SMUGGLING', name: '可疑走私航行', description: '可疑走私活动' },
  { code: 'RESTRICTED_ENTRY', name: '违规闯入禁航', description: '违规进入禁航区' },
];

// ============ 辅助参考：SQL查询历史记录 ============

async function queryHistoryBySQL(supabase: ReturnType<typeof getSupabaseClient>, params: {
  shipId?: string;
  mmsi?: string;
  trajectoryId?: string;
}) {
  const results: {
    shipHistory: any[];
    labelHistory: any[];
  } = {
    shipHistory: [],
    labelHistory: []
  };

  try {
    // 1. 查询该船舶历史航迹
    if (params.mmsi) {
      const { data: trajectories } = await supabase
        .from('trajectory_segments')
        .select('id, mmsi, start_port, end_port, behavior_code, intent_code, ai_description, created_at')
        .eq('mmsi', params.mmsi)
        .order('created_at', { ascending: false })
        .limit(20);
      
      results.shipHistory = trajectories || [];
      
      // 2. 查询该船舶过往标注记录
      const { data: labels } = await supabase
        .from('trajectory_segments')
        .select('id, behavior_code, intent_code, ai_description, confidence_score')
        .eq('mmsi', params.mmsi)
        .not('behavior_code', 'is', null)
        .order('created_at', { ascending: false })
        .limit(50);
      
      results.labelHistory = labels || [];
    }
    
    // 3. 查询特定航迹的详细信息
    if (params.trajectoryId) {
      const { data: trajectory } = await supabase
        .from('trajectory_segments')
        .select('*')
        .eq('id', params.trajectoryId)
        .single();
      
      if (trajectory) {
        results.shipHistory = [trajectory, ...results.shipHistory];
      }
    }
  } catch (error) {
    console.error('SQL查询历史记录失败:', error);
  }

  return results;
}

// ============ 辅助参考：Chroma向量库检索 ============

async function querySimilarByVector(params: {
  description: string;
  behaviorCode?: string;
  startPort?: string;
  endPort?: string;
  topK?: number;
}, headers?: Headers) {
  try {
    // 直接调用向量检索API（API内部会处理向量化）
    const searchRes = await fetch(
      `${process.env.COZE_PROJECT_DOMAIN_DEFAULT || 'http://localhost:5000'}/api/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: params.description,
          topK: params.topK || 10,
          filters: {
            modality: 'trajectory'
          }
        })
      }
    );
    
    const searchData = await searchRes.json();
    
    // 过滤相似案例
    const similarCases = (searchData.results || [])
      .filter((item: any) => item.metadata?.behavior_code || item.metadata?.intent_code)
      .slice(0, 10);
    
    return similarCases;
  } catch (error) {
    console.error('向量检索相似案例失败:', error);
    return [];
  }
}

// ============ LLM智能标注 ============

async function intelligentLabeling(params: {
  trajectoryData: any;
  historyData: any;
  similarCases: any[];
}, headers?: Headers) {
  const customHeaders = headers ? HeaderUtils.extractForwardHeaders(headers) : {};
  const llmClient = new LLMClient(new Config(), customHeaders);
  
  // 构建Prompt
  const prompt = `你是航迹标注智能分析助手，平台固定14项船舶行为标签、12项航行意图标签，严格遵循标签定义做航迹智能标注。

【行为标签池】
${BEHAVIOR_LABELS.map(b => `- ${b.code}：${b.name}（${b.description}）`).join('\n')}

【意图标签池】
${INTENT_LABELS.map(i => `- ${i.code}：${i.name}（${i.description}）`).join('\n')}

【当前航迹数据】
${JSON.stringify(params.trajectoryData, null, 2)}

【该船舶历史标注记录（SQL查询）】
${params.historyData.labelHistory?.slice(0, 10).map((h: any) => 
  `- 行为: ${h.behavior_code || '未标注'}, 意图: ${h.intent_code || '未标注'}, 描述: ${h.ai_description || '无'}`
).join('\n') || '无历史记录'}

【相似案例（向量检索）】
${params.similarCases.slice(0, 5).map((c: any) => 
  `- 相似度: ${(c.similarity * 100).toFixed(1)}%, 行为: ${c.metadata?.behavior_code || '未知'}, 意图: ${c.metadata?.intent_code || '未知'}`
).join('\n') || '无相似案例'}

请根据以上信息，输出航迹标注结果（JSON格式）：
{
  "primaryBehavior": "行为编码",
  "primaryIntent": "意图编码",
  "alternateBehaviors": ["备选行为1", "备选行为2"],
  "alternateIntents": ["备选意图1", "备选意图2"],
  "confidence": 0.85,
  "reasoning": "判定依据说明"
}

仅输出JSON，不要其他内容。`;

  try {
    const response = await llmClient.invoke(
      [{ role: 'user', content: prompt }],
      { model: 'doubao-seed-2-0-lite-260215', temperature: 0.1 }
    );
    
    const content = response.content || '';
    
    // 尝试解析JSON
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    
    // 解析失败返回默认值
    return {
      primaryBehavior: 'STEADY_SAILING',
      primaryIntent: 'TRUNK_TRANSPORT',
      alternateBehaviors: [],
      alternateIntents: [],
      confidence: 0.5,
      reasoning: '无法解析LLM输出，使用默认值'
    };
  } catch (error) {
    console.error('LLM智能标注失败:', error);
    return {
      primaryBehavior: 'STEADY_SAILING',
      primaryIntent: 'TRUNK_TRANSPORT',
      alternateBehaviors: [],
      alternateIntents: [],
      confidence: 0.3,
      reasoning: 'LLM调用失败，使用默认值'
    };
  }
}

// ============ API处理 ============

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { 
      trajectoryId,
      mmsi,
      trajectoryData,
      action = 'label' // label | batch | save
    } = body;
    
    const supabase = getSupabaseClient();
    
    // 批量标注
    if (action === 'batch') {
      const { trajectoryIds } = body;
      if (!Array.isArray(trajectoryIds)) {
        return NextResponse.json({ error: 'trajectoryIds 必须是数组' }, { status: 400 });
      }
      
      const results = [];
      for (const tid of trajectoryIds) {
        // 获取航迹数据
        const { data: traj } = await supabase
          .from('trajectory_segments')
          .select('*')
          .eq('id', tid)
          .single();
        
        if (!traj) continue;
        
        // SQL查询历史
        const historyData = await queryHistoryBySQL(supabase, { 
          mmsi: traj.mmsi, 
          trajectoryId: tid 
        });
        
        // 向量检索相似案例
        const similarCases = await querySimilarByVector({
          description: traj.ai_description || `${traj.start_port}到${traj.end_port}`,
          startPort: traj.start_port,
          endPort: traj.end_port
        }, request.headers);
        
        // LLM智能标注
        const labelResult = await intelligentLabeling({
          trajectoryData: traj,
          historyData,
          similarCases
        }, request.headers);
        
        results.push({
          trajectoryId: tid,
          mmsi: traj.mmsi,
          ...labelResult
        });
      }
      
      return NextResponse.json({ success: true, results, count: results.length });
    }
    
    // 保存标注结果
    if (action === 'save') {
      const { 
        trajectoryId: tid,
        behaviorCode,
        intentCode,
        confidence,
        reasoning 
      } = body;
      
      if (!tid) {
        return NextResponse.json({ error: '缺少 trajectoryId' }, { status: 400 });
      }
      
      const { error } = await supabase
        .from('trajectory_segments')
        .update({
          behavior_code: behaviorCode,
          intent_code: intentCode,
          confidence_score: confidence,
          label_reasoning: reasoning,
          labeled_at: new Date().toISOString()
        })
        .eq('id', tid);
      
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      
      return NextResponse.json({ success: true });
    }
    
    // 标签管理操作
    if (action === 'addLabel') {
      const { type, code, name, description } = body;
      if (!type || !code || !name) {
        return NextResponse.json({ error: '缺少type/code/name参数' }, { status: 400 });
      }
      if (type !== 'behavior' && type !== 'intent') {
        return NextResponse.json({ error: 'type必须是behavior或intent' }, { status: 400 });
      }
      
      // 获取最大排序号
      const { data: maxSort } = await supabase
        .from('trajectory_labels')
        .select('sort_order')
        .eq('type', type)
        .order('sort_order', { ascending: false })
        .limit(1);
      
      const sortOrder = (maxSort?.[0]?.sort_order || 0) + 1;
      
      const { data, error } = await supabase
        .from('trajectory_labels')
        .insert({
          type,
          code,
          name,
          description: description || '',
          sort_order: sortOrder,
          is_active: true
        })
        .select()
        .single();
      
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      
      return NextResponse.json({ success: true, label: data });
    }
    
    if (action === 'updateLabel') {
      const { code, name, description } = body;
      if (!code) {
        return NextResponse.json({ error: '缺少code参数' }, { status: 400 });
      }
      
      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (name) updateData.name = name;
      if (description !== undefined) updateData.description = description;
      
      const { data, error } = await supabase
        .from('trajectory_labels')
        .update(updateData)
        .eq('code', code)
        .select()
        .single();
      
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      
      return NextResponse.json({ success: true, label: data });
    }
    
    if (action === 'deleteLabel') {
      const { code } = body;
      if (!code) {
        return NextResponse.json({ error: '缺少code参数' }, { status: 400 });
      }
      
      // 软删除：设置is_active为false
      const { error } = await supabase
        .from('trajectory_labels')
        .update({ is_active: false, updated_at: new Date().toISOString() })
        .eq('code', code);
      
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      
      return NextResponse.json({ success: true, message: `标签 ${code} 已删除` });
    }
    
    if (action === 'restoreLabel') {
      const { code } = body;
      if (!code) {
        return NextResponse.json({ error: '缺少code参数' }, { status: 400 });
      }
      
      const { error } = await supabase
        .from('trajectory_labels')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('code', code);
      
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      
      return NextResponse.json({ success: true, message: `标签 ${code} 已恢复` });
    }
    
    // 导入航迹数据
    if (action === 'import') {
      const { data } = body;
      if (!Array.isArray(data)) {
        return NextResponse.json({ error: 'data 必须是数组' }, { status: 400 });
      }
      
      const inserted = [];
      for (const item of data) {
        const record = {
          mmsi: item.mmsi || item.MMSI || null,
          start_port: item.start_port || item.startPort || item.StartPort || null,
          end_port: item.end_port || item.endPort || item.EndPort || null,
          geometry_wkt: item.geometry_wkt || item.geometry || item.WKT || null,
          ai_description: item.ai_description || item.description || null,
          behavior_code: item.behavior_code || item.behavior || null,
          intent_code: item.intent_code || item.intent || null
        };
        
        const { data: insertedRow, error } = await supabase
          .from('trajectory_segments')
          .insert(record)
          .select()
          .single();
        
        if (!error && insertedRow) {
          inserted.push(insertedRow);
        }
      }
      
      return NextResponse.json({ success: true, imported: inserted.length });
    }
    
    // 单条智能标注
    // 获取航迹数据
    let trajData = trajectoryData;
    if (!trajData && trajectoryId) {
      const { data } = await supabase
        .from('trajectory_segments')
        .select('*')
        .eq('id', trajectoryId)
        .single();
      trajData = data;
    }
    
    if (!trajData) {
      return NextResponse.json({ error: '缺少航迹数据' }, { status: 400 });
    }
    
    // 1. SQL查询历史记录
    const historyData = await queryHistoryBySQL(supabase, { 
      mmsi: trajData.mmsi || mmsi, 
      trajectoryId 
    });
    
    // 2. 向量检索相似案例
    const similarCases = await querySimilarByVector({
      description: trajData.ai_description || `${trajData.start_port}到${trajData.end_port}`,
      startPort: trajData.start_port,
      endPort: trajData.end_port
    }, request.headers);
    
    // 3. LLM智能标注
    const labelResult = await intelligentLabeling({
      trajectoryData: trajData,
      historyData,
      similarCases
    }, request.headers);
    
    return NextResponse.json({
      success: true,
      trajectoryId,
      ...labelResult,
      reference: {
        historyCount: historyData.labelHistory?.length || 0,
        similarCount: similarCases.length
      }
    });
    
  } catch (error: any) {
    console.error('智能标注失败:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 获取标签池
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  
  if (action === 'labels') {
    try {
      const supabase = getSupabaseClient();
      
      // 从数据库获取标签
      const { data: dbLabels, error } = await supabase
        .from('trajectory_labels')
        .select('*')
        .eq('is_active', true)
        .order('sort_order', { ascending: true });
      
      if (error || !dbLabels) {
        // 如果数据库失败，返回默认标签
        return NextResponse.json({
          behaviors: BEHAVIOR_LABELS,
          intents: INTENT_LABELS
        });
      }
      
      // 分离行为和意图标签
      const behaviors = dbLabels
        .filter(l => l.type === 'behavior')
        .map(l => ({ code: l.code, name: l.name, description: l.description }));
      
      const intents = dbLabels
        .filter(l => l.type === 'intent')
        .map(l => ({ code: l.code, name: l.name, description: l.description }));
      
      return NextResponse.json({ behaviors, intents });
    } catch {
      return NextResponse.json({
        behaviors: BEHAVIOR_LABELS,
        intents: INTENT_LABELS
      });
    }
  }
  
  // 获取单个标签详情
  if (action === 'labelDetail') {
    const code = searchParams.get('code');
    if (!code) {
      return NextResponse.json({ error: '缺少code参数' }, { status: 400 });
    }
    
    try {
      const supabase = getSupabaseClient();
      const { data, error } = await supabase
        .from('trajectory_labels')
        .select('*')
        .eq('code', code)
        .single();
      
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      
      return NextResponse.json({ success: true, label: data });
    } catch (error: any) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
  }
  
  // 获取待标注航迹列表
  try {
    const supabase = getSupabaseClient();
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');
    
    const { data, error, count } = await supabase
      .from('trajectory_segments')
      .select('id, mmsi, start_port, end_port, ai_description, behavior_code, intent_code, created_at', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);
    
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      items: data,
      total: count,
      hasMore: (count || 0) > offset + limit
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
