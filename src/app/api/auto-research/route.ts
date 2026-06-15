import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/local-db';

// AutoResearch框架接口

// GET请求处理
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'list';
    const supabase = getSupabaseClient();

    // 获取实验列表
    if (action === 'list') {
      const status = searchParams.get('status');
      const seaArea = searchParams.get('seaArea');
      const startDate = searchParams.get('startDate');
      const endDate = searchParams.get('endDate');

      let query = supabase
        .from('auto_research_experiments')
        .select('*')
        .order('created_at', { ascending: false });

      if (status) query = query.eq('status', status);
      if (seaArea) query = query.eq('sea_area', seaArea);
      if (startDate) query = query.gte('created_at', startDate);
      if (endDate) query = query.lte('created_at', endDate);

      const { data, error } = await query.limit(50);

      if (error) throw error;
      return NextResponse.json({ success: true, experiments: data });
    }

    // 获取单个实验详情
    if (action === 'detail') {
      const id = searchParams.get('id');
      if (!id) {
        return NextResponse.json({ error: '缺少实验ID' }, { status: 400 });
      }

      const { data: experiment, error: expError } = await supabase
        .from('auto_research_experiments')
        .select('*')
        .eq('id', id)
        .single();

      if (expError) throw expError;

      // 获取迭代记录
      const { data: iterations, error: iterError } = await supabase
        .from('auto_research_iterations')
        .select('*')
        .eq('experiment_id', id)
        .order('iteration', { ascending: true });

      if (iterError) throw iterError;

      // 获取模型版本
      const { data: models, error: modelError } = await supabase
        .from('auto_research_models')
        .select('*')
        .eq('experiment_id', id)
        .order('version', { ascending: false });

      if (modelError) throw modelError;

      return NextResponse.json({
        success: true,
        experiment,
        iterations,
        models
      });
    }

    // 获取训练数据集统计
    if (action === 'dataset-stats') {
      // 从航迹标注库获取数据统计
      const { count: trajectoryCount } = await supabase
        .from('trajectory_segments')
        .select('*', { count: 'exact', head: true });

      const { count: labeledCount } = await supabase
        .from('trajectory_segments')
        .select('*', { count: 'exact', head: true })
        .not('behavior_code', 'is', null);

      // 7:3 划分
      const trainingCount = Math.floor((labeledCount || 0) * 0.7);
      const validationCount = (labeledCount || 0) - trainingCount;

      return NextResponse.json({
        success: true,
        total: trajectoryCount || 0,
        labeled: labeledCount || 0,
        training: trainingCount,
        validation: validationCount
      });
    }

    // 导出最优训练脚本
    if (action === 'export-script') {
      const id = searchParams.get('id');
      if (!id) {
        return NextResponse.json({ error: '缺少实验ID' }, { status: 400 });
      }

      const { data: experiment, error } = await supabase
        .from('auto_research_experiments')
        .select('*')
        .eq('id', id)
        .single();

      if (error) throw error;

      // 生成训练脚本
      const script = generateTrainingScript(experiment);

      return NextResponse.json({
        success: true,
        script,
        experimentName: experiment.name
      });
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (error) {
    console.error('AutoResearch API error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '服务器错误'
    }, { status: 500 });
  }
}

// POST请求处理
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;
    const supabase = getSupabaseClient();

    // 自主调优 - 创建新实验
    if (action === 'start') {
      const { name, seaArea, shipType, optimizeMetrics } = body;

      if (!name || !seaArea || !shipType || !optimizeMetrics) {
        return NextResponse.json({
          error: '缺少必要参数：name, seaArea, shipType, optimizeMetrics'
        }, { status: 400 });
      }

      // 创建实验记录
      const { data: experiment, error: createError } = await supabase
        .from('auto_research_experiments')
        .insert({
          name,
          sea_area: seaArea,
          ship_type: shipType,
          optimize_metrics: optimizeMetrics,
          status: 'running',
          started_at: new Date().toISOString()
        })
        .select()
        .single();

      if (createError) throw createError;

      // 异步执行实验（模拟）
      runExperimentAsync(experiment.id, supabase);

      return NextResponse.json({
        success: true,
        experiment,
        message: '实验已启动，正在后台运行'
      });
    }

    // 停止实验
    if (action === 'stop') {
      const { id } = body;
      if (!id) {
        return NextResponse.json({ error: '缺少实验ID' }, { status: 400 });
      }

      const { data, error } = await supabase
        .from('auto_research_experiments')
        .update({
          status: 'stopped',
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq('id', id)
        .select()
        .single();

      if (error) throw error;

      return NextResponse.json({
        success: true,
        experiment: data,
        message: '实验已停止'
      });
    }

    // 回滚模型
    if (action === 'rollback') {
      const { experimentId, version } = body;
      if (!experimentId || !version) {
        return NextResponse.json({ error: '缺少实验ID或版本号' }, { status: 400 });
      }

      // 将当前活跃模型设为非活跃
      await supabase
        .from('auto_research_models')
        .update({ is_active: false })
        .eq('experiment_id', experimentId)
        .eq('is_active', true);

      // 将指定版本设为活跃
      const { data, error } = await supabase
        .from('auto_research_models')
        .update({ is_active: true })
        .eq('experiment_id', experimentId)
        .eq('version', version)
        .select()
        .single();

      if (error) throw error;

      return NextResponse.json({
        success: true,
        model: data,
        message: `已回滚到版本 ${version}`
      });
    }

    // 增量训练 - 同步新数据
    if (action === 'sync-incremental') {
      // 获取新增标注数据
      const { data: newSegments, error: segError } = await supabase
        .from('trajectory_segments')
        .select('*')
        .not('behavior_code', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(100);

      if (segError) throw segError;

      // 查找正在运行的实验
      const { data: runningExperiments, error: expError } = await supabase
        .from('auto_research_experiments')
        .select('*')
        .eq('status', 'running');

      if (expError) throw expError;

      if (runningExperiments && runningExperiments.length > 0) {
        // 更新实验的训练数据计数
        for (const exp of runningExperiments) {
          await supabase
            .from('auto_research_experiments')
            .update({
              training_data_count: (exp.training_data_count || 0) + newSegments.length,
              updated_at: new Date().toISOString()
            })
            .eq('id', exp.id);
        }
      }

      return NextResponse.json({
        success: true,
        syncedCount: newSegments?.length || 0,
        message: '增量数据已同步'
      });
    }

    // 查询实验数据（供问答引用）
    if (action === 'query') {
      const { startDate, endDate, seaArea } = body;

      let query = supabase
        .from('auto_research_experiments')
        .select('*')
        .order('created_at', { ascending: false });

      if (startDate) query = query.gte('created_at', startDate);
      if (endDate) query = query.lte('created_at', endDate);
      if (seaArea) query = query.eq('sea_area', seaArea);

      const { data, error } = await query.limit(20);

      if (error) throw error;

      // 整理结果供问答引用
      const summary = data?.map(exp => ({
        name: exp.name,
        seaArea: exp.sea_area,
        shipType: exp.ship_type,
        status: exp.status,
        bestScore: exp.best_score,
        iterations: exp.total_iterations,
        completedAt: exp.completed_at
      }));

      return NextResponse.json({
        success: true,
        experiments: data,
        summary
      });
    }

    return NextResponse.json({ error: '未知操作' }, { status: 400 });
  } catch (error) {
    console.error('AutoResearch API error:', error);
    return NextResponse.json({
      error: error instanceof Error ? error.message : '服务器错误'
    }, { status: 500 });
  }
}

// 生成训练脚本
function generateTrainingScript(experiment: {
  name: string;
  best_params?: { [key: string]: unknown } | null;
  optimize_metrics?: string[] | null;
}): string {
  const params = experiment.best_params || {
    learning_rate: 0.001,
    batch_size: 16,
    epochs: 10,
    lora_rank: 8,
    lora_alpha: 16
  };

  return `# AutoResearch 最优训练脚本
# 实验名称: ${experiment.name}
# 优化指标: ${experiment.optimize_metrics?.join(', ') || 'accuracy'}

import torch
from transformers import AutoModel, AutoTokenizer
from peft import LoraConfig, get_peft_model

# 最优超参数
LEARNING_RATE = ${params.learning_rate || 0.001}
BATCH_SIZE = ${params.batch_size || 16}
EPOCHS = ${params.epochs || 10}
LORA_RANK = ${params.lora_rank || 8}
LORA_ALPHA = ${params.lora_alpha || 16}

# 模型配置
model_name = "bge-base-zh"
model = AutoModel.from_pretrained(model_name)
tokenizer = AutoTokenizer.from_pretrained(model_name)

# LoRA配置
lora_config = LoraConfig(
    r=LORA_RANK,
    lora_alpha=LORA_ALPHA,
    target_modules=["query", "value"],
    lora_dropout=0.1,
    bias="none",
    task_type="FEATURE_EXTRACTION"
)

model = get_peft_model(model, lora_config)

# 训练循环
optimizer = torch.optim.AdamW(model.parameters(), lr=LEARNING_RATE)

for epoch in range(EPOCHS):
    for batch in dataloader:
        outputs = model(**batch)
        loss = outputs.loss
        loss.backward()
        optimizer.step()
        optimizer.zero_grad()
    
    print(f"Epoch {epoch+1}/{EPOCHS}, Loss: {loss.item():.4f}")

# 保存模型
model.save_pretrained("./best_model")
tokenizer.save_pretrained("./best_model")
print("训练完成，模型已保存到 ./best_model")
`;
}

// 异步执行实验（模拟）
async function runExperimentAsync(experimentId: string, supabase: ReturnType<typeof getSupabaseClient>): Promise<void> {
  // 这是一个模拟函数，实际应用中会调用真实的AutoResearch框架
  console.log(`AutoResearch实验 ${experimentId} 开始运行`);

  // 模拟迭代过程
  for (let i = 1; i <= 5; i++) {
    // 检查实验是否还在运行
    const { data: exp } = await supabase
      .from('auto_research_experiments')
      .select('status')
      .eq('id', experimentId)
      .single();

    if (!exp || exp.status !== 'running') break;

    // 记录迭代
    const score = 0.7 + Math.random() * 0.2;
    const isBetter = i === 1 || score > 0.85;

    await supabase
      .from('auto_research_iterations')
      .insert({
        experiment_id: experimentId,
        iteration: i,
        params: {
          learning_rate: 0.001 * Math.pow(0.9, i - 1),
          batch_size: 16,
          lora_rank: 8 + i
        },
        score,
        is_better: isBetter,
        status: 'completed',
        completed_at: new Date().toISOString()
      });

    // 如果更好，保存模型版本
    if (isBetter) {
      await supabase
        .from('auto_research_models')
        .insert({
          experiment_id: experimentId,
          version: i,
          model_name: `model_v${i}`,
          model_code: `# Model version ${i}`,
          weights_url: `/weights/${experimentId}/v${i}.pt`,
          score,
          is_active: true
        });

      // 更新最优参数
      await supabase
        .from('auto_research_experiments')
        .update({
          best_score: score,
          best_params: {
            learning_rate: 0.001 * Math.pow(0.9, i - 1),
            batch_size: 16,
            lora_rank: 8 + i
          },
          version: i,
          total_iterations: i,
          updated_at: new Date().toISOString()
        })
        .eq('id', experimentId);
    }

    // 延迟模拟训练时间
    await new Promise(resolve => setTimeout(resolve, 1000));
  }

  // 完成实验
  await supabase
    .from('auto_research_experiments')
    .update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      experiment_report: `实验完成，经过5轮迭代，最优得分为85%+，模型已保存。`,
      updated_at: new Date().toISOString()
    })
    .eq('id', experimentId);

  console.log(`AutoResearch实验 ${experimentId} 完成`);
}
