import { NextRequest, NextResponse } from 'next/server';
import { LLMClient } from '@/lib/ollama/llm';
import { EmbeddingClient } from '@/lib/ollama/embedding';
import { Config } from '@/lib/ollama/config';
import { getSupabaseClient } from '@/storage/database/local-db';

// 航迹向量化 API
export async function POST(request: NextRequest) {
  try {
    const { trajectoryId, prompt } = await request.json();
    
    const supabase = getSupabaseClient();
    const customHeaders: Record<string, string> = {};
    
    // 获取待向量化的航迹
    let query = supabase.from('trajectories').select('*');
    
    if (trajectoryId) {
      query = query.eq('id', trajectoryId);
    } else {
      // 获取所有未向量化的航迹
      query = query.is('embedding', null);
    }
    
    const { data: trajectories, error: fetchError } = await query.limit(10);
    
    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    
    if (!trajectories || trajectories.length === 0) {
      return NextResponse.json({ message: '没有待向量化的航迹', processed: 0 });
    }
    
    const llmClient = new LLMClient(new Config(), customHeaders);
    const embeddingClient = new EmbeddingClient(new Config(), customHeaders);
    
    let processed = 0;
    let failed = 0;
    
    for (const traj of trajectories) {
      try {
        // 1. LLM 生成航迹描述
        const descPrompt = prompt || `请根据以下航迹信息生成一段简洁的航迹描述，包含起止港口、途经海域、航线走向等信息：
航段编号：${traj.segment_id}
起港口：${traj.start_port || '未知'}
止港口：${traj.end_port || '未知'}
途经海域：${traj.sea_area || '未知'}
WKT航线：${traj.wkt_route}
航段属性：${JSON.stringify(traj.segment_attrs || {})}

请生成 100-200 字的航迹描述：`;

        const llmResponse = await llmClient.invoke(
          [{ role: 'user', content: descPrompt }],
          { model: 'qwen2.5:3b' }
        );
        
        const aiDescription = llmResponse.content || '';
        
        // 2. 构建向量化的文本内容
        const vectorText = `${aiDescription}
起港口: ${traj.start_port}
止港口: ${traj.end_port}
途经海域: ${traj.sea_area}
经度范围: ${traj.bounds_min_lng} ~ ${traj.bounds_max_lng}
纬度范围: ${traj.bounds_min_lat} ~ ${traj.bounds_max_lat}`;
        
        // 3. 向量化
        const embedding = await embeddingClient.embedText(vectorText);
        
        if (!embedding || embedding.length === 0) {
          console.error('向量化失败:', traj.segment_id);
          failed++;
          continue;
        }
        
        // 4. 更新数据库
        const { error: updateError } = await supabase
          .from('trajectories')
          .update({
            ai_description: aiDescription,
            embedding: embedding,
            updated_at: new Date().toISOString(),
          })
          .eq('id', traj.id);
        
        if (updateError) {
          console.error('更新失败:', traj.segment_id, updateError);
          failed++;
        } else {
          processed++;
        }
        
      } catch (err) {
        console.error('处理航迹失败:', traj.segment_id, err);
        failed++;
      }
    }
    
    return NextResponse.json({
      success: true,
      processed,
      failed,
      message: `成功向量化 ${processed} 条航迹，失败 ${failed} 条`,
    });
    
  } catch (error) {
    console.error('航迹向量化失败:', error);
    return NextResponse.json({ error: '向量化失败: ' + (error as Error).message }, { status: 500 });
  }
}

// 获取向量化状态
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    
    const { count: total } = await supabase
      .from('trajectories')
      .select('*', { count: 'exact', head: true });
    
    const { count: embedded } = await supabase
      .from('trajectories')
      .select('*', { count: 'exact', head: true })
      .not('embedding', 'is', null);
    
    return NextResponse.json({
      total: total || 0,
      embedded: embedded || 0,
      pending: (total || 0) - (embedded || 0),
    });
  } catch (error) {
    console.error('获取状态失败:', error);
    return NextResponse.json({ error: '获取状态失败' }, { status: 500 });
  }
}
