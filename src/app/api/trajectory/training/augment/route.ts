import { NextRequest, NextResponse } from 'next/server';
import { LLMClient } from 'coze-coding-dev-sdk';

const llm = new LLMClient();

// 数据增强 API
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { spatialPerturb, textSynonym, perturbScale = 0.001, synonymCount = 2 } = body;

    // 获取已标注的训练数据
    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    
    const response = await fetch(`${supabaseUrl}/rest/v1/trajectory_training_data?is_labeled=eq.true&select=*`, {
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      }
    });
    
    const labeledData = await response.json();
    let augmentedCount = 0;

    // 空间扰动增强
    if (spatialPerturb) {
      for (const item of labeledData) {
        if (item.wkt_route) {
          // 解析 WKT 并添加扰动
          const perturbedWkt = perturbWKT(item.wkt_route, perturbScale);
          
          // 插入增强数据
          await fetch(`${supabaseUrl}/rest/v1/trajectory_augmented_data`, {
            method: 'POST',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({
              source_data_id: item.id,
              aug_type: 'spatial_perturb',
              wkt_route: perturbedWkt,
              ai_description: item.ai_description,
              spatial_features: item.spatial_features,
              behavior_code: item.behavior_code,
              intent_code: item.intent_code
            })
          });
          augmentedCount++;
        }
      }
    }

    // 文本同义改写增强
    if (textSynonym) {
      for (const item of labeledData) {
        if (item.ai_description) {
          // 使用 LLM 生成同义改写
          const prompt = `请对以下航迹描述进行同义改写，保持语义不变，输出${synonymCount}个不同的改写版本，每行一个：
          
原文：${item.ai_description}

要求：
1. 保持关键信息（起止港口、海域、航向）不变
2. 使用不同的表达方式
3. 只输出改写后的文本，不要其他内容`;

          try {
            const messages = [{ role: 'user' as const, content: prompt }];
            const llmResponse = await llm.invoke(messages, {
              model: 'doubao-seed-2-0-lite-260215',
              temperature: 0.7
            });

            const rewrites = llmResponse.content.split('\n').filter((line: string) => line.trim());
            
            for (const rewrite of rewrites.slice(0, synonymCount)) {
              await fetch(`${supabaseUrl}/rest/v1/trajectory_augmented_data`, {
                method: 'POST',
                headers: {
                  'apikey': supabaseKey,
                  'Authorization': `Bearer ${supabaseKey}`,
                  'Content-Type': 'application/json',
                  'Prefer': 'return=minimal'
                },
                body: JSON.stringify({
                  source_data_id: item.id,
                  aug_type: 'text_synonym',
                  wkt_route: item.wkt_route,
                  ai_description: rewrite.trim(),
                  spatial_features: item.spatial_features,
                  behavior_code: item.behavior_code,
                  intent_code: item.intent_code
                })
              });
              augmentedCount++;
            }
          } catch (e) {
            console.error('LLM rewrite error:', e);
          }
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      augmented: augmentedCount 
    });
  } catch (error) {
    console.error('Augment error:', error);
    return NextResponse.json({ error: '数据增强失败' }, { status: 500 });
  }
}

// WKT 坐标扰动函数
function perturbWKT(wkt: string, scale: number): string {
  // 解析 LINESTRING(x1 y1, x2 y2, ...)
  const match = wkt.match(/LINESTRING\s*\((.*)\)/i);
  if (!match) return wkt;
  
  const coords = match[1].split(',').map(coord => {
    const parts = coord.trim().split(/\s+/);
    if (parts.length >= 2) {
      const lng = parseFloat(parts[0]) + (Math.random() - 0.5) * scale;
      const lat = parseFloat(parts[1]) + (Math.random() - 0.5) * scale;
      return `${lng.toFixed(6)} ${lat.toFixed(6)}`;
    }
    return coord.trim();
  });
  
  return `LINESTRING(${coords.join(', ')})`;
}
