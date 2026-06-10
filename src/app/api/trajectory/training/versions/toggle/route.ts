import { NextRequest, NextResponse } from 'next/server';

// 切换模型版本上线/下线
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { version_id, activate } = body;

    const supabaseUrl = process.env.SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (activate) {
      // 先将所有同类型版本设为下线
      const versionRes = await fetch(
        `${supabaseUrl}/rest/v1/trajectory_model_versions?id=eq.${version_id}&select=model_type`,
        {
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      const versionData = await versionRes.json();
      const modelType = versionData[0]?.model_type;

      if (modelType) {
        await fetch(
          `${supabaseUrl}/rest/v1/trajectory_model_versions?model_type=eq.${modelType}`,
          {
            method: 'PATCH',
            headers: {
              'apikey': supabaseKey,
              'Authorization': `Bearer ${supabaseKey}`,
              'Content-Type': 'application/json',
              'Prefer': 'return=minimal'
            },
            body: JSON.stringify({ is_active: false })
          }
        );
      }

      // 再将目标版本设为上线
      await fetch(
        `${supabaseUrl}/rest/v1/trajectory_model_versions?id=eq.${version_id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ is_active: true })
        }
      );
    } else {
      // 下线目标版本
      await fetch(
        `${supabaseUrl}/rest/v1/trajectory_model_versions?id=eq.${version_id}`,
        {
          method: 'PATCH',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({ is_active: false })
        }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Toggle version error:', error);
    return NextResponse.json({ error: '切换版本失败' }, { status: 500 });
  }
}
