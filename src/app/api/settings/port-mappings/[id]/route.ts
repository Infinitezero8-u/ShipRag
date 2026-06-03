import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = getSupabaseClient();
    
    const { error } = await supabase
      .from('port_name_mappings')
      .delete()
      .eq('id', id);
    
    if (error) {
      return NextResponse.json({ error: '删除失败' }, { status: 500 });
    }
    
    return NextResponse.json({ success: true });
    
  } catch (error) {
    return NextResponse.json({ error: '删除失败' }, { status: 500 });
  }
}
