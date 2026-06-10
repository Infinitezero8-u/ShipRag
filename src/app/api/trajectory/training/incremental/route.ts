import { NextRequest, NextResponse } from 'next/server';

// 增量训练
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { base_version_id } = body;

    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // 获取自上次训练以来的新标注数据
    const lastJobRes = await fetch(
      `${supabaseUrl}/rest/v1/trajectory_training_jobs?status=eq.completed&order=completed_at.desc&limit=1`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    const lastJobs = await lastJobRes.json();
    const lastTrainingTime = lastJobs[0]?.completed_at || '2000-01-01';

    // 获取新增的标注数据
    const newDataRes = await fetch(
      `${supabaseUrl}/rest/v1/trajectory_training_data?is_labeled=eq.true&updated_at=gt.${lastTrainingTime}&select=*`,
      {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      }
    );
    const newData = await newDataRes.json();

    if (newData.length === 0) {
      return NextResponse.json({ message: '没有新增标注数据需要增量训练' });
    }

    // 创建增量训练任务
    const jobRes = await fetch(
      `${supabaseUrl}/rest/v1/trajectory_training_jobs`,
      {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        body: JSON.stringify({
          name: `增量训练 - ${new Date().toLocaleDateString()}`,
          model_type: 'ensemble',
          status: 'pending',
          config: {
            type: 'incremental',
            base_version_id,
            new_samples: newData.length,
            epochs: 2, // 增量训练 epoch 更少
            batch_size: 16,
            learning_rate: 2e-5 // 更小的学习率
          },
          train_count: newData.length
        })
      }
    );
    const [job] = await jobRes.json();

    // 模拟增量训练过程
    await simulateIncrementalTraining(job.id, newData.length, base_version_id);

    return NextResponse.json({
      message: '增量训练已启动',
      job_id: job.id,
      new_samples: newData.length
    });
  } catch (error) {
    console.error('Incremental train error:', error);
    return NextResponse.json({ error: '增量训练失败' }, { status: 500 });
  }
}

// 模拟增量训练
async function simulateIncrementalTraining(jobId: string, sampleCount: number, baseVersionId?: string) {
  const supabaseUrl = process.env.SUPABASE_URL!;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

  // 更新状态为运行中
  await fetch(
    `${supabaseUrl}/rest/v1/trajectory_training_jobs?id=eq.${jobId}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify({ status: 'running' })
    }
  );

  // 模拟训练日志
  const epochs = 2;
  for (let epoch = 1; epoch <= epochs; epoch++) {
    await new Promise(r => setTimeout(r, 1000));
    
    await fetch(
      `${supabaseUrl}/rest/v1/trajectory_training_logs`,
      {
        method: 'POST',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          job_id: jobId,
          epoch,
          step: epoch * 10,
          train_loss: 0.3 - epoch * 0.05 + Math.random() * 0.05,
          val_loss: 0.35 - epoch * 0.04 + Math.random() * 0.05,
          train_acc: 0.7 + epoch * 0.05,
          val_acc: 0.68 + epoch * 0.04
        })
      }
    );
  }

  // 创建新版本
  const versionRes = await fetch(
    `${supabaseUrl}/rest/v1/trajectory_model_versions`,
    {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({
        version_name: `v${Date.now()}`,
        model_type: 'ensemble',
        job_id: jobId,
        is_active: true,
        is_incremental: true,
        base_version_id: baseVersionId,
        train_samples: sampleCount,
        metrics: { train_acc: 0.8, val_acc: 0.76 }
      })
    }
  );
  const [newVersion] = await versionRes.json();

  // 将旧版本下线
  if (newVersion) {
    await fetch(
      `${supabaseUrl}/rest/v1/trajectory_model_versions?id=neq.${newVersion.id}&is_active=eq.true`,
      {
        method: 'PATCH',
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ is_active: false })
      }
    );
  }

  // 完成训练
  await fetch(
    `${supabaseUrl}/rest/v1/trajectory_training_jobs?id=eq.${jobId}`,
    {
      method: 'PATCH',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        status: 'completed',
        completed_at: new Date().toISOString(),
        metrics: { train_acc: 0.8, val_acc: 0.76 }
      })
    }
  );
}
