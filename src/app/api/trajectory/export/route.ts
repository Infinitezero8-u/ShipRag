import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 导出航迹数据
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const format = searchParams.get('format') || 'csv';
    const source = searchParams.get('source'); // 'import' | 'label'
    const behavior = searchParams.get('behavior');
    const intent = searchParams.get('intent');
    
    const supabase = getSupabaseClient();
    
    let query = supabase
      .from('trajectories')
      .select('*')
      .order('created_at', { ascending: false });
    
    if (source === 'import') {
      query = query.not('source_file', 'is', null);
    } else if (source === 'label') {
      query = query.is('source_file', null);
    }
    
    if (behavior) {
      query = query.eq('behavior_code', behavior);
    }
    
    if (intent) {
      query = query.eq('intent_code', intent);
    }
    
    const { data, error } = await query.limit(10000);
    
    if (error) {
      return NextResponse.json({ error: '导出失败' }, { status: 500 });
    }
    
    if (format === 'json') {
      return NextResponse.json({ 
        data,
        exported_at: new Date().toISOString(),
        count: data?.length || 0
      });
    }
    
    if (format === 'md') {
      const md = generateMarkdown(data || []);
      return new NextResponse(md, {
        headers: {
          'Content-Type': 'text/markdown',
          'Content-Disposition': 'attachment; filename="trajectories.md"'
        }
      });
    }
    
    // CSV
    const csv = generateCSV(data || []);
    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="trajectories.csv"'
      }
    });
    
  } catch (error) {
    console.error('导出失败:', error);
    return NextResponse.json({ error: '导出失败' }, { status: 500 });
  }
}

function generateCSV(data: any[]): string {
  if (data.length === 0) return '';
  
  const headers = [
    'segment_id', 'start_port', 'end_port', 'sea_area',
    'behavior_code', 'intent_code', 'ai_description',
    'wkt_route', 'source_file', 'created_at'
  ];
  
  const rows = data.map(t => [
    t.segment_id || '',
    t.start_port || '',
    t.end_port || '',
    t.sea_area || '',
    t.behavior_code || '',
    t.intent_code || '',
    (t.ai_description || '').replace(/"/g, '""'),
    t.wkt_route || '',
    t.source_file || '',
    t.created_at || ''
  ]);
  
  return [
    headers.join(','),
    ...rows.map(r => r.map(v => `"${v}"`).join(','))
  ].join('\n');
}

function generateMarkdown(data: any[]): string {
  const lines = [
    '# 航迹数据导出',
    '',
    `导出时间: ${new Date().toLocaleString()}`,
    `总数: ${data.length} 条`,
    '',
    '## 航迹列表',
    ''
  ];
  
  for (const t of data) {
    lines.push(`### ${t.segment_id || '未知航段'}`);
    lines.push('');
    lines.push(`- **起止港口**: ${t.start_port || '?'} → ${t.end_port || '?'}`);
    lines.push(`- **途经海域**: ${t.sea_area || '未知'}`);
    lines.push(`- **行为类型**: ${t.behavior_code || '未标注'}`);
    lines.push(`- **意图类型**: ${t.intent_code || '未标注'}`);
    if (t.ai_description) {
      lines.push(`- **AI描述**: ${t.ai_description}`);
    }
    if (t.wkt_route) {
      lines.push(`- **航线WKT**: \`${t.wkt_route.substring(0, 100)}...\``);
    }
    lines.push('');
  }
  
  return lines.join('\n');
}
