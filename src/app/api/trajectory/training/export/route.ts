import { NextRequest, NextResponse } from 'next/server';

// 导出训练数据集
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'json';

    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    // 获取训练数据
    const [trainRes, valRes] = await Promise.all([
      fetch(`${supabaseUrl}/rest/v1/trajectory_training_data?dataset_type=eq.train&select=*`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      }),
      fetch(`${supabaseUrl}/rest/v1/trajectory_training_data?dataset_type=eq.val&select=*`, {
        headers: {
          'apikey': supabaseKey,
          'Authorization': `Bearer ${supabaseKey}`,
          'Content-Type': 'application/json'
        }
      })
    ]);

    const trainData = await trainRes.json();
    const valData = await valRes.json();

    const dataset = {
      train: trainData,
      val: valData,
      meta: {
        train_count: trainData.length,
        val_count: valData.length,
        exported_at: new Date().toISOString(),
        behaviors: [...new Set(trainData.map((d: any) => d.behavior_code).filter(Boolean))],
        intents: [...new Set(trainData.map((d: any) => d.intent_code).filter(Boolean))]
      }
    };

    if (format === 'json') {
      return new NextResponse(JSON.stringify(dataset, null, 2), {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': 'attachment; filename="trajectory_dataset.json"'
        }
      });
    } else if (format === 'csv') {
      // 简单 CSV 格式
      const headers = ['segment_id', 'ai_description', 'behavior_code', 'intent_code', 'dataset_type'];
      const rows = [...trainData, ...valData].map((d: any) => 
        headers.map(h => `"${(d[h] || '').toString().replace(/"/g, '""')}"`).join(',')
      );
      const csv = [headers.join(','), ...rows].join('\n');
      
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv',
          'Content-Disposition': 'attachment; filename="trajectory_dataset.csv"'
        }
      });
    }

    return NextResponse.json(dataset);
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: '导出失败' }, { status: 500 });
  }
}
