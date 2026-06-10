import { NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取训练数据列表
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const limit = parseInt(searchParams.get('limit') || '50');
  const datasetType = searchParams.get('dataset_type');
  const needsReview = searchParams.get('needs_review');
  
  const supabase = getSupabaseClient();
  
  let query = supabase
    .from('trajectory_training_data')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);
  
  if (datasetType) {
    query = query.eq('dataset_type', datasetType);
  }
  if (needsReview === 'true') {
    query = query.eq('needs_review', true);
  }
  
  const { data, error } = await query;
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json({ data });
}

// 添加训练数据
export async function POST(request: Request) {
  const body = await request.json();
  const supabase = getSupabaseClient();
  
  const { data, error } = await supabase
    .from('trajectory_training_data')
    .insert({
      trajectory_id: body.trajectory_id,
      segment_id: body.segment_id,
      ai_description: body.ai_description,
      wkt_route: body.wkt_route,
      spatial_features: body.spatial_features,
      behavior_code: body.behavior_code,
      intent_code: body.intent_code,
      is_labeled: !!(body.behavior_code && body.intent_code),
      dataset_type: 'unlabeled',
      source: body.source || 'manual'
    })
    .select()
    .single();
  
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  
  return NextResponse.json(data);
}
