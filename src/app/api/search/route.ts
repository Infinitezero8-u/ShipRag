import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { hybridSearch, RetrievalItem } from '@/lib/retrieval';

// ==================================================================
// POST — 统一检索入口
// ==================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { query, modality, topK = 50, threshold = 0.3, mode = 'fuzzy', page = 1, pageSize = 20, filter } = body;

    if (!query?.trim()) {
      return NextResponse.json({ error: '查询内容不能为空' }, { status: 400 });
    }

    // 精确搜索 → 直接走 ILIKE（纯关键词，无语义）
    if (mode === 'exact') {
      return await exactSearch(query, modality, page, pageSize);
    }

    // 模糊搜索 → 混合检索
    const result = await hybridSearch(query, { topK, threshold, modality });

    // 标签过滤
    let filteredItems = result.items;
    if (filter?.tags) {
      const tags = Array.isArray(filter.tags) ? filter.tags : [filter.tags];
      filteredItems = filteredItems.filter(item =>
        tags.some((t: string) => (item.metadata as any)?.tags?.includes?.(t))
      );
    }

    // 分页
    const total = filteredItems.length;
    const start = (page - 1) * pageSize;
    const paged = filteredItems.slice(start, start + pageSize);

    return NextResponse.json({
      success: true,
      query,
      results: paged.map(r => ({
        id: r.id, modality: r.modality, title: r.title, content: r.content,
        source: r.source, similarity: r.similarity, table: r.table,
        matchType: r.matchType, metadata: r.metadata,
      })),
      count: paged.length,
      pagination: { page, pageSize, totalCount: total, totalPages: Math.ceil(total / pageSize), hasMore: start + pageSize < total },
    });
  } catch (error: any) {
    console.error('检索失败:', error);
    return NextResponse.json({ error: `检索失败: ${error.message}` }, { status: 500 });
  }
}

// ==================================================================
// GET — 列表/标签/简单查询
// ==================================================================

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action');
  const q = searchParams.get('q');

  // 标签列表
  if (action === 'tags') {
    const supabase = getSupabaseClient();
    const { data, error } = await supabase.from('knowledge_items').select('tags');
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    const tagCount: Record<string, number> = {};
    for (const item of (data || [])) {
      for (const tag of (item.tags || [])) tagCount[tag] = (tagCount[tag] || 0) + 1;
    }
    const tags = Object.entries(tagCount).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count);
    return NextResponse.json({ success: true, tags });
  }

  // 语义搜索 (GET 快捷方式)
  if (q?.trim()) {
    const mode = searchParams.get('mode') as 'fuzzy' | 'exact' || 'fuzzy';
    const result = await hybridSearch(q, {
      topK: parseInt(searchParams.get('topK') || '50'),
      threshold: parseFloat(searchParams.get('threshold') || '0.3'),
    });
    return NextResponse.json({ success: true, query: q, results: result.items, count: result.items.length });
  }

  // 列表查询
  const supabase = getSupabaseClient();
  const modality = searchParams.get('modality');
  const type = searchParams.get('type') || 'all';
  const page = parseInt(searchParams.get('page') || '1');
  const limit = parseInt(searchParams.get('limit') || '20');
  const offsetParam = searchParams.get('offset');
  const offset = offsetParam ? parseInt(offsetParam) : (page - 1) * limit;
  const source = searchParams.get('source');
  const status = searchParams.get('status');
  const tag = searchParams.get('tag');
  const search = searchParams.get('search');

  let query = supabase.from('knowledge_items').select('id, modality, title, content, source, metadata, created_at, embedding, tags', { count: 'exact' }).order('created_at', { ascending: false });

  if (modality) query = query.eq('modality', modality);
  if (type === 'embedded') query = query.not('embedding', 'is', null);
  else if (type === 'pending') query = query.is('embedding', null);
  if (status === 'embedded') query = query.not('embedding', 'is', null);
  else if (status === 'pending') query = query.is('embedding', null);
  if (source) query = query.eq('source', source);
  if (tag) query = query.contains('tags', [tag]);
  if (search) query = query.or(`title.ilike.%${search}%,content.ilike.%${search}%`);

  query = query.range(offset, offset + limit - 1);
  const { data, count, error } = await query;
  if (error) return NextResponse.json({ error: `查询失败: ${error.message}` }, { status: 500 });

  const items = (data || []).map(item => ({
    id: item.id, modality: item.modality, title: item.title, content: item.content,
    source: item.source, metadata: item.metadata, tags: item.tags,
    status: item.embedding ? 'embedded' : 'pending', created_at: item.created_at,
  }));

  return NextResponse.json({ success: true, items, total: count || 0, page, limit });
}

// ==================================================================
// PATCH — 更新条目/标签操作
// ==================================================================

export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { id, title, content, metadata, tags, action } = body;
    const supabase = getSupabaseClient();

    if (action === 'renameTag') {
      const { oldTag, newTag } = body;
      if (!oldTag || !newTag) return NextResponse.json({ error: '缺少标签参数' }, { status: 400 });
      const { data: items } = await supabase.from('knowledge_items').select('id, tags').contains('tags', [oldTag]);
      for (const item of (items || [])) {
        const nt = (item.tags as string[]).filter(t => t !== oldTag);
        if (!nt.includes(newTag)) nt.push(newTag);
        await supabase.from('knowledge_items').update({ tags: nt, updated_at: new Date().toISOString() }).eq('id', item.id);
      }
      await supabase.from('tag_vectors').update({ name: newTag }).eq('name', oldTag);
      return NextResponse.json({ success: true, affectedCount: items?.length || 0 });
    }
    if (action === 'deleteTag') {
      const { tag } = body;
      if (!tag) return NextResponse.json({ error: '缺少标签参数' }, { status: 400 });
      const { data: items } = await supabase.from('knowledge_items').select('id, tags').contains('tags', [tag]);
      for (const item of (items || [])) {
        await supabase.from('knowledge_items').update({ tags: (item.tags as string[]).filter(t => t !== tag), updated_at: new Date().toISOString() }).eq('id', item.id);
      }
      await supabase.from('tag_vectors').delete().eq('name', tag);
      return NextResponse.json({ success: true });
    }

    if (!id) return NextResponse.json({ error: '缺少 id 参数' }, { status: 400 });
    const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (metadata !== undefined) updateData.metadata = metadata;
    if (tags !== undefined) updateData.tags = tags;
    const { error } = await supabase.from('knowledge_items').update(updateData).eq('id', id);
    if (error) return NextResponse.json({ error: `更新失败: ${error.message}` }, { status: 500 });
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: `更新失败: ${error.message}` }, { status: 500 });
  }
}

// ==================================================================
// 精确搜索 (纯 ILIKE，与混合检索分流)
// ==================================================================

async function exactSearch(query: string, modality?: string, page = 1, pageSize = 20) {
  const supabase = getSupabaseClient();
  const allResults: any[] = [];

  // knowledge_items
  if (!modality || ['text', 'image', 'excel', 'doc', 'md', 'json', 'trajectory'].includes(modality)) {
    try {
      const { data } = await supabase.from('knowledge_items').select('id, modality, title, content, source, metadata, created_at, tags')
        .or(`title.ilike.%${query}%,content.ilike.%${query}%`).limit(200);
      if (data) allResults.push(...data.map((i: any) => ({ ...i, table: 'knowledge_items' })));
    } catch {}
  }

  // port_data
  if (!modality || modality === 'port') {
    try {
      const { data } = await supabase.from('port_data').select('id, port_code, name_cn, ctry_name_cn, ctry_code, lon, lat')
        .or(`port_code.ilike.%${query}%,name_cn.ilike.%${query}%,ctry_name_cn.ilike.%${query}%`).limit(200);
      if (data) allResults.push(...data.map((p: any) => ({
        id: p.id, title: `${p.name_cn} (${p.port_code})`,
        content: `港口代码: ${p.port_code}\n港口名称: ${p.name_cn}\n所属国家: ${p.ctry_name_cn}\n坐标: ${p.lon}, ${p.lat}`,
        modality: 'port', source: p.ctry_name_cn, table: 'port_data', metadata: { port_code: p.port_code, lon: p.lon, lat: p.lat },
      })));
    } catch {}
  }

  // route_data
  if (!modality || modality === 'route') {
    try {
      const { data } = await supabase.from('route_data').select('id, orig_port, dest_port')
        .or(`orig_port.ilike.%${query}%,dest_port.ilike.%${query}%`).limit(200);
      if (data) allResults.push(...data.map((r: any) => ({
        id: r.id, title: `${r.orig_port} → ${r.dest_port}`,
        content: `起始港: ${r.orig_port}\n目的港: ${r.dest_port}`,
        modality: 'route', source: '航线数据', table: 'route_data',
      })));
    } catch {}
  }

  // regulation_chunks
  if (!modality || modality === 'regulation') {
    try {
      const { data } = await supabase.from('regulation_chunks').select('id, regulation_id, content, metadata')
        .ilike('content', `%${query}%`).limit(200);
      if (data) {
        const regIds = [...new Set(data.map((r: any) => r.regulation_id))];
        const { data: regs } = await supabase.from('regulations').select('id, filename, storage_url').in('id', regIds);
        const regMap = new Map((regs || []).map((r: any) => [r.id, r]));
        allResults.push(...data.map((c: any) => {
          const reg: any = regMap.get(c.regulation_id);
          const meta = typeof c.metadata === 'string' ? JSON.parse(c.metadata || '{}') : (c.metadata || {});
          return {
            id: c.id, title: reg?.filename || '规章制度', content: c.content, modality: 'regulation',
            source: reg?.filename || '规章制度', table: 'regulation_chunks', regulation_id: c.regulation_id,
            metadata: { ...meta, storageUrl: reg?.storage_url },
          };
        }));
      }
    } catch {}
  }

  const total = allResults.length;
  const start = (page - 1) * pageSize;
  return NextResponse.json({
    success: true, query, mode: 'exact',
    results: allResults.slice(start, start + pageSize),
    count: Math.min(pageSize, total - start),
    pagination: { page, pageSize, totalCount: total, totalPages: Math.ceil(total / pageSize), hasMore: start + pageSize < total },
  });
}
