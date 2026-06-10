/**
 * 统一检索层 — 实体精确匹配 + pgvector 语义兜底 + 去重排序
 *
 * 检索策略:
 *   Phase 1: 实体精确命中 — ILIKE 查 port/route/regulation 表
 *   Phase 2: pgvector 语义搜索 — 补充语义相近的结果
 *   Phase 3: 合并 — 精确命中优先，语义去重兜底
 */
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { embedText } from '@/lib/local-embed';

// ---- 类型 ----

export interface RetrievalItem {
  id: string;
  title: string;
  content: string;
  source: string;
  modality: string;
  similarity: number;
  matchType: 'exact' | 'semantic' | 'graph';
  table: string;
  metadata?: Record<string, unknown>;
}

export interface RetrievalResult {
  items: RetrievalItem[];
  exactCount: number;
  semanticCount: number;
  query: string;
}

export interface RetrievalOptions {
  topK?: number;
  threshold?: number;
  modality?: string;
}

// ---- 截断 ----

const EMBEDDING_DIM = 1536;
function trunc(e: number[]): number[] {
  if (!e?.length) return e;
  return e.length <= EMBEDDING_DIM ? e : e.slice(0, EMBEDDING_DIM);
}

// ==================================================================
// Phase 1: 实体精确匹配
// ==================================================================

async function entitySearch(query: string, limit: number): Promise<RetrievalItem[]> {
  const supabase = getSupabaseClient();
  const items: RetrievalItem[] = [];
  const seen = new Set<string>();
  const q = `%${query}%`;

  const add = (item: RetrievalItem) => {
    const k = `${item.table}:${item.id}`;
    if (!seen.has(k)) { seen.add(k); items.push(item); }
  };

  // 1. port_data: 港口代码/名称/拼音
  if (query.length >= 2) {
    try {
      const { data } = await supabase.from('port_data').select('*')
        .or(`port_code.ilike.${q},name_cn.ilike.${q},name_pinyin.ilike.${q},name_py.ilike.${q}`)
        .limit(limit);
      for (const r of (data || [])) add({
        id: r.id, title: `${r.name_cn} (${r.port_code})`,
        content: `港口代码: ${r.port_code}\n港口名称: ${r.name_cn}\n国家: ${r.ctry_name_cn}\n坐标: ${r.lon}, ${r.lat}`,
        source: r.ctry_name_cn || 'port_data', modality: 'port', similarity: 1.0,
        matchType: 'exact', table: 'port_data',
        metadata: { port_code: r.port_code, lat: r.lat, lon: r.lon, country: r.ctry_name_cn },
      });
    } catch {}
  }

  // 2. route_data: 起止港口
  if (query.length >= 2) {
    try {
      const { data } = await supabase.from('route_data').select('*')
        .or(`orig_port.ilike.${q},dest_port.ilike.${q}`).limit(limit);
      for (const r of (data || [])) add({
        id: r.id, title: `${r.orig_port} → ${r.dest_port}`,
        content: `航线: ${r.orig_port} 到 ${r.dest_port}`,
        source: '航线数据', modality: 'route', similarity: 1.0,
        matchType: 'exact', table: 'route_data',
        metadata: { orig_port: r.orig_port, dest_port: r.dest_port },
      });
    } catch {}
  }

  // 3. regulation_chunks: 内容精确包含
  if (query.length >= 3) {
    try {
      const { data } = await supabase.from('regulation_chunks').select('*')
        .ilike('content', q).limit(limit);
      for (const r of (data || [])) {
        const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : (r.metadata || {});
        add({
          id: r.id, title: meta.document_name || '规章制度',
          content: r.content?.substring(0, 800) || '',
          source: meta.document_name || '规章制度', modality: 'regulation', similarity: 1.0,
          matchType: 'exact', table: 'regulation_chunks',
          metadata: { regulation_id: r.regulation_id, ...meta },
        });
      }
    } catch {}
  }

  return items.slice(0, limit);
}

// ==================================================================
// Phase 2: pgvector 语义搜索
// ==================================================================

async function vectorSearch(queryEmbedding: number[], threshold: number, topK: number): Promise<RetrievalItem[]> {
  const supabase = getSupabaseClient();
  const items: RetrievalItem[] = [];
  const seen = new Set<string>();

  const add = (item: RetrievalItem) => {
    if (item.similarity < threshold) return;
    const k = `${item.table}:${item.id}`;
    if (!seen.has(k)) { seen.add(k); items.push(item); }
  };

  // Use the built-in vector_search RPC
  try {
    const { data: results, error } = await supabase.rpc('vector_search', {
      query_embedding: queryEmbedding,
      match_threshold: threshold,
      match_count: topK,
      filter_modality: null,
    });

    if (!error && results) {
      for (const r of results) {
        if (r.table === 'knowledge_items') {
          add({
            id: r.id, title: r.title || '', content: r.content?.substring(0, 500) || '',
            source: r.source || '', modality: r.modality || 'text', similarity: r.similarity,
            matchType: 'semantic', table: 'knowledge_items', metadata: r.metadata,
          });
        } else if (r.table === 'port_data') {
          add({
            id: r.id, title: `${r.name_cn || r.port_code} (${r.port_code})`,
            content: `港口代码: ${r.port_code}\n港口名称: ${r.name_cn}\n国家: ${r.ctry_name_cn}\n坐标: ${r.lon}, ${r.lat}`,
            source: r.ctry_name_cn || 'port_data', modality: 'port', similarity: r.similarity,
            matchType: 'semantic', table: 'port_data',
            metadata: { port_code: r.port_code, lat: r.lat, lon: r.lon },
          });
        } else if (r.table === 'route_data') {
          add({
            id: r.id, title: `${r.orig_port} → ${r.dest_port}`,
            content: `航线: ${r.orig_port} 到 ${r.dest_port}`,
            source: '航线数据', modality: 'route', similarity: r.similarity,
            matchType: 'semantic', table: 'route_data',
          });
        } else if (r.table === 'regulation_chunks') {
          const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : (r.metadata || {});
          add({
            id: r.id, title: meta.document_name || '' || '规章制度',
            content: r.content?.substring(0, 500) || '',
            source: meta.document_name || '' || '规章制度', modality: 'regulation',
            similarity: r.similarity, matchType: 'semantic', table: 'regulation_chunks',
            metadata: { regulation_id: r.regulation_id, ...meta, storage_url: r.storage_url },
          });
        }
      }
    }
  } catch (e) {
    // 如果 RPC 不存在，直接查每张表自己算
    const allRows = await fallbackVectorSearch(queryEmbedding, threshold, topK);
    for (const r of allRows) add(r);
  }

  items.sort((a, b) => b.similarity - a.similarity);
  return items;
}

// fallback: 直接查表 + JS 计算 cos
async function fallbackVectorSearch(queryEmb: number[], threshold: number, topK: number): Promise<RetrievalItem[]> {
  const supabase = getSupabaseClient();
  const items: RetrievalItem[] = [];

  const tables = [
    { t: 'knowledge_items', cols: 'id, title, content, source, modality, metadata, embedding' },
    { t: 'port_data', cols: 'id, port_code, name_cn, ctry_name_cn, ctry_code, lon, lat, embedding' },
    { t: 'route_data', cols: 'id, orig_port, dest_port, embedding' },
    { t: 'regulation_chunks', cols: 'id, regulation_id, content, metadata, embedding' },
  ];

  for (const { t, cols } of tables) {
    try {
      const { data } = await supabase.from(t).select(cols).not('embedding', 'is', null).limit(200);
      for (const row of (data || [])) {
        let emb: number[] = row.embedding;
        if (typeof emb === 'string') { try { emb = JSON.parse(emb); } catch { continue; } }
        if (!Array.isArray(emb) || emb.length === 0) continue;
        const sim = cosineSimilarity(queryEmb, emb);
        if (sim < threshold) continue;
        items.push(mapRawRow(t, row, sim));
      }
    } catch {}
  }

  items.sort((a, b) => b.similarity - a.similarity);
  return items.slice(0, topK);
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return na === 0 || nb === 0 ? 0 : dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function mapRawRow(table: string, r: any, sim: number): RetrievalItem {
  if (table === 'port_data') return {
    id: r.id, title: `${r.name_cn} (${r.port_code})`,
    content: `港口代码: ${r.port_code}\n名称: ${r.name_cn}\n国家: ${r.ctry_name_cn}`,
    source: r.ctry_name_cn || 'port_data', modality: 'port', similarity: sim,
    matchType: 'semantic', table: 'port_data', metadata: { port_code: r.port_code, lat: r.lat, lon: r.lon },
  };
  if (table === 'route_data') return {
    id: r.id, title: `${r.orig_port} → ${r.dest_port}`,
    content: `航线: ${r.orig_port} 到 ${r.dest_port}`,
    source: '航线数据', modality: 'route', similarity: sim,
    matchType: 'semantic', table: 'route_data',
  };
  if (table === 'regulation_chunks') {
    const meta = typeof r.metadata === 'string' ? JSON.parse(r.metadata || '{}') : (r.metadata || {});
    return {
      id: r.id, title: meta.document_name || '规章制度',
      content: r.content?.substring(0, 500) || '',
      source: meta.document_name || '规章制度', modality: 'regulation', similarity: sim,
      matchType: 'semantic', table: 'regulation_chunks', metadata: { regulation_id: r.regulation_id, ...meta },
    };
  }
  return {
    id: r.id, title: r.title || '', content: r.content?.substring(0, 500) || '',
    source: r.source || '', modality: r.modality || 'text', similarity: sim,
    matchType: 'semantic', table: 'knowledge_items', metadata: r.metadata,
  };
}

// ==================================================================
// 混合检索入口
// ==================================================================

export async function hybridSearch(query: string, options: RetrievalOptions = {}): Promise<RetrievalResult> {
  const { topK = 50, threshold = 0.3 } = options;

  // Phase 1, 2, 3 全部并行: 实体精确 + GraphRAG图谱 + 语义向量
  const [exactResults, graphResults, queryEmb] = await Promise.all([
    query.trim() ? entitySearch(query, Math.ceil(topK / 3)) : Promise.resolve([]),
    graphEntitySearch(query, Math.ceil(topK / 3)),
    embedText(query).then(trunc),
  ]);

  const semanticResults = await vectorSearch(queryEmb, threshold, topK);

  // Phase 4: 合并 — 精确 > 图谱 > 语义
  const seen = new Set<string>();
  const items: RetrievalItem[] = [];
  for (const e of exactResults)  { seen.add(`${e.table}:${e.id}`); items.push(e); }
  for (const g of graphResults)   { if (!seen.has(`${g.table}:${g.id}`)) { seen.add(`${g.table}:${g.id}`); items.push(g); } }
  for (const s of semanticResults) { if (!seen.has(`${s.table}:${s.id}`)) { seen.add(`${s.table}:${s.id}`); items.push(s); } }

  return {
    items: items.slice(0, topK),
    exactCount: exactResults.length,
    semanticCount: items.length - exactResults.length,
    query,
  };
}

// ==================================================================
// Phase 2.5: GraphRAG 实体图谱搜索
// ==================================================================

async function graphEntitySearch(query: string, limit: number): Promise<RetrievalItem[]> {
  if (!query.trim()) return [];
  try {
    const { execSync } = await import('child_process');
    const scriptPath = (await import('path')).join(process.cwd(), 'scripts', 'graphrag_entity.py');
    const { existsSync } = await import('fs');
    if (!existsSync(scriptPath)) return [];

    const result = execSync(`python3 "${scriptPath}" search "${query.replace(/"/g, '\"')}"`, {
      encoding: 'utf-8', timeout: 15000, maxBuffer: 1024 * 1024,
    });
    const parsed = JSON.parse(result.trim());
    const items: RetrievalItem[] = [];

    // 处理实体匹配结果
    const exact = parsed?.exact || parsed || [];
    for (const e of (Array.isArray(exact) ? exact : []).slice(0, limit)) {
      if (e.type === 'port') {
        items.push({
          id: e.code, title: `${e.name} (${e.code})`,
          content: `港口代码: ${e.code}
名称: ${e.name}
国家: ${e.country}
坐标: ${e.lon}, ${e.lat}`,
          source: e.country || 'port_data', modality: 'port', similarity: 1.0,
          matchType: 'graph', table: 'port_data',
          metadata: { port_code: e.code, country: e.country, graph_match: true },
        });
      } else if (e.type === 'route') {
        items.push({
          id: `${e.orig}-${e.dest}`, title: `${e.orig} → ${e.dest}`,
          content: `航线: ${e.orig} 到 ${e.dest}`,
          source: '航线数据', modality: 'route', similarity: 1.0,
          matchType: 'graph', table: 'route_data',
          metadata: { orig_port: e.orig, dest_port: e.dest, graph_match: true },
        });
      }
    }
    return items;
  } catch {
    return []; // GraphRAG 不可用时静默跳过
  }
}
