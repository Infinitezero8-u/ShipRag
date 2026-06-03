import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, ids, data } = body;
    
    if (!action || !ids || !Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '需要提供 action 和 ids 参数' }, { status: 400 });
    }
    
    const supabase = getSupabaseClient();
    
    switch (action) {
      case 'updateLabels': {
        // 批量修改标签
        const updateData: any = {};
        if (data?.behavior_code) updateData.behavior_code = data.behavior_code;
        if (data?.intent_code) updateData.intent_code = data.intent_code;
        updateData.updated_at = new Date().toISOString();
        
        const { error } = await supabase
          .from('trajectories')
          .update(updateData)
          .in('id', ids);
        
        if (error) throw error;
        
        return NextResponse.json({ success: true, action, updated: ids.length });
      }
      
      case 'markForReembedding': {
        // 批量标记待重新向量化
        const { error } = await supabase
          .from('trajectories')
          .update({ 
            embedding: null,
            updated_at: new Date().toISOString() 
          })
          .in('id', ids);
        
        if (error) throw error;
        
        return NextResponse.json({ success: true, action, updated: ids.length });
      }
      
      case 'regenerateDescription': {
        // 批量重新生成描述 - 返回待处理的 ID 列表
        // 实际生成由前端调用 embed API
        return NextResponse.json({ 
          success: true, 
          action, 
          pendingIds: ids,
          message: `已标记 ${ids.length} 条航迹待重新生成描述` 
        });
      }
      
      case 'delete': {
        // 批量删除
        const { error } = await supabase
          .from('trajectories')
          .delete()
          .in('id', ids);
        
        if (error) throw error;
        
        return NextResponse.json({ success: true, action, deleted: ids.length });
      }
      
      case 'updateSeaArea': {
        // 批量更新海域
        if (!data?.sea_area) {
          return NextResponse.json({ error: '需要提供 sea_area 参数' }, { status: 400 });
        }
        
        const { error } = await supabase
          .from('trajectories')
          .update({ 
            sea_area: data.sea_area,
            updated_at: new Date().toISOString() 
          })
          .in('id', ids);
        
        if (error) throw error;
        
        return NextResponse.json({ success: true, action, updated: ids.length });
      }
      
      default:
        return NextResponse.json({ error: '不支持的操作类型' }, { status: 400 });
    }
  } catch (error) {
    console.error('批量操作失败:', error);
    return NextResponse.json({ error: '批量操作失败' }, { status: 500 });
  }
}
