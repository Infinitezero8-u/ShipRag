/**
 * Data Center API — unified data management for all imported datasets
 *
 * Action-based dispatch following /api/data-maintain pattern.
 *
 * GET  ?action=list&module=bridge&page=1&pageSize=50&search=   — paginated list
 * GET  ?action=stats                                           — per-module row counts
 * GET  ?action=preview&module=bridge&id=                       — single record detail
 * POST { action: 'import', module, records[] }                 — bulk insert records
 * POST { action: 'vectorize', module, ids[] }                  — create vectorize tasks
 * POST { action: 'delete', module, ids[] }                     — delete records
 * POST { action: 'import-file', module, sourceFile }           — mark file import
 * POST { action: 'batch-vectorize', module, vectorizeAll }     — batch vectorize all pending
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/local-db';

// Module → database table mapping
const MODULE_TABLES: Record<string, string> = {
  sea_area: 'sea_areas',
  eez: 'eez_boundaries',
  bridge: 'bridge_inventory',
  safety_incident: 'safety_incidents',
  imdg: 'imdg_goods',
  freight: 'freight_indices',
  ais_synopsis: 'ais_synopses',
  ship_image: 'ship_images',
  import_progress: 'import_progress',
};

// Allowed modules for validation
const ALLOWED_MODULES = Object.keys(MODULE_TABLES);

function validModule(m: string): string | null {
  return MODULE_TABLES[m] || null;
}

// ═══════════════════════════════════════
// GET /api/data-center
// ═══════════════════════════════════════
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') || 'list';
  const module = searchParams.get('module') || '';
  const page = parseInt(searchParams.get('page') || '1');
  const pageSize = parseInt(searchParams.get('pageSize') || '50');
  const search = searchParams.get('search') || '';
  const id = searchParams.get('id') || '';

  const supabase = getSupabaseClient();

  try {
    switch (action) {
      case 'stats': {
        const stats: Record<string, { total: number; embedded: number; pending: number }> = {};
        for (const [modName, tableName] of Object.entries(MODULE_TABLES)) {
          try {
            const { count: total } = await supabase.from(tableName)
              .select('*', { count: 'exact', head: true });
            let embedded = 0;
            try {
              const { count: emb } = await supabase.from(tableName)
                .select('*', { count: 'exact', head: true })
                .eq('embedding_status', 'success');
              embedded = emb || 0;
            } catch { /* no embedding_status column */ }
            stats[modName] = { total: total || 0, embedded, pending: (total || 0) - embedded };
          } catch { stats[modName] = { total: 0, embedded: 0, pending: 0 }; }
        }
        return NextResponse.json({ success: true, stats });
      }

      case 'list': {
        const table = validModule(module);
        if (!table) return NextResponse.json({ error: `未知模块: ${module}`, allowedModules: ALLOWED_MODULES }, { status: 400 });

        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let query = supabase.from(table).select('*', { count: 'exact' });

        // Search across text fields
        if (search) {
          const textCols = getTextColumns(module);
          if (textCols.length > 0) {
            const filter = textCols.map(c => `${c}.ilike.%${search}%`).join(',');
            query = query.or(filter);
          }
        }

        // Determine ordering
        const orderCol = getOrderColumn(module);
        query = query.order(orderCol, { ascending: false }).range(from, to);

        const { data, count, error } = await query;
        if (error) throw error;

        return NextResponse.json({
          success: true,
          data: data || [],
          page, pageSize, totalCount: count || 0,
          totalPages: Math.ceil((count || 0) / pageSize),
          hasMore: to + 1 < (count || 0),
        });
      }

      case 'preview': {
        const table = validModule(module);
        if (!table) return NextResponse.json({ error: `未知模块: ${module}` }, { status: 400 });
        if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });

        const { data, error } = await supabase.from(table).select('*').eq('id', id).single();
        if (error) throw error;
        return NextResponse.json({ success: true, data });
      }

      case 'progress': {
        const { data, error } = await supabase.from('import_progress')
          .select('*').order('created_at', { ascending: false }).limit(100);
        if (error) throw error;
        return NextResponse.json({ success: true, data: data || [] });
      }

      default:
        return NextResponse.json({ error: `未知 action: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ═══════════════════════════════════════
// POST /api/data-center
// ═══════════════════════════════════════
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { action, module, records, ids, sourceFile, vectorizeAll } = body;

  const supabase = getSupabaseClient();

  try {
    switch (action) {
      case 'import': {
        const table = validModule(module);
        if (!table) return NextResponse.json({ error: `未知模块: ${module}` }, { status: 400 });
        if (!records || !Array.isArray(records) || records.length === 0) {
          return NextResponse.json({ error: '缺少 records 数组' }, { status: 400 });
        }

        let inserted = 0;
        const errors: string[] = [];

        // Known columns per table (for stripping extra fields before insert)
        const validCols = getValidColumns(module);

        // Batch insert in chunks of 100
        for (let i = 0; i < records.length; i += 100) {
          const chunk = records.slice(i, i + 100).map(r => {
            // Strip fields not in the target table
            const clean: Record<string, any> = {};
            for (const k of validCols) {
              if (r[k] !== undefined) clean[k] = r[k];
            }
            return clean;
          });
          const { error } = await supabase.from(table).upsert(chunk, {
            onConflict: getConflictKey(module),
            ignoreDuplicates: false,
          });
          if (error) {
            errors.push(`chunk ${i}-${i + 100}: ${error.message}`);
          } else {
            inserted += chunk.length;
          }
        }

        // Also insert into knowledge_items for vectorization
        const kiRows = records.filter(r => r.knowledge_item_id).map(r => ({
          id: r.knowledge_item_id,
          modality: module,
          title: r.title || r.name || `${module}_${r.id?.substring(0, 8)}`,
          content: r.content || '',
          source: r.source || r.source_file || r.import_source || '',
          metadata: r.metadata || {},
        }));
        if (kiRows.length > 0) {
          await supabase.from('knowledge_items').upsert(kiRows, {
            onConflict: 'id', ignoreDuplicates: false,
          });
        }

        // Update import progress
        if (sourceFile) {
          await supabase.from('import_progress').upsert({
            module, source_file: sourceFile,
            processed_rows: String(inserted),
            status: 'completed',
            updated_at: new Date().toISOString(),
          }, { onConflict: 'module,source_file' });
        }

        return NextResponse.json({ success: true, inserted, errors: errors.length > 0 ? errors : undefined });
      }

      case 'vectorize': {
        const table = validModule(module);
        if (!table) return NextResponse.json({ error: `未知模块: ${module}` }, { status: 400 });
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
          return NextResponse.json({ error: '缺少 ids 数组' }, { status: 400 });
        }

        // Create vectorize tasks
        const tasks = ids.map(id => ({
          task_type: module,
          target_id: id,
          action: 'vectorize',
          status: 'pending',
        }));
        const { error } = await supabase.from('vectorize_tasks').insert(tasks);
        if (error) throw error;

        return NextResponse.json({ success: true, tasksCreated: ids.length });
      }

      case 'delete': {
        const table = validModule(module);
        if (!table) return NextResponse.json({ error: `未知模块: ${module}` }, { status: 400 });
        if (!ids || !Array.isArray(ids) || ids.length === 0) {
          return NextResponse.json({ error: '缺少 ids 数组' }, { status: 400 });
        }

        const { error } = await supabase.from(table).delete().in('id', ids);
        if (error) throw error;

        // Also clean up knowledge_items
        const { data: kiData } = await supabase.from(table)
          .select('knowledge_item_id').in('id', ids);
        const kiIds = (kiData || []).map((r: any) => r.knowledge_item_id).filter(Boolean);
        if (kiIds.length > 0) {
          await supabase.from('knowledge_items').delete().in('id', kiIds);
        }

        return NextResponse.json({ success: true, deleted: ids.length });
      }

      case 'import-file': {
        if (!module || !sourceFile) {
          return NextResponse.json({ error: '缺少 module 或 sourceFile' }, { status: 400 });
        }

        const { error } = await supabase.from('import_progress').upsert({
          module, source_file: sourceFile,
          status: 'processing',
          updated_at: new Date().toISOString(),
        }, { onConflict: 'module,source_file' });
        if (error) throw error;

        return NextResponse.json({ success: true, message: `已标记 ${module}/${sourceFile} 开始导入` });
      }

      case 'batch-vectorize': {
        if (!module || !ALLOWED_MODULES.includes(module)) {
          return NextResponse.json({ error: `未知模块: ${module}` }, { status: 400 });
        }
        const table = MODULE_TABLES[module];

        let query = supabase.from(table).select('knowledge_item_id').neq('knowledge_item_id', null);
        if (!vectorizeAll) {
          query = query.eq('embedding_status', 'pending');
        }
        const { data: items, error } = await query;
        if (error) throw error;

        const kiIds = (items || []).map((r: any) => r.knowledge_item_id).filter(Boolean);
        if (kiIds.length === 0) {
          return NextResponse.json({ success: true, message: '无待向量化条目', count: 0 });
        }

        return NextResponse.json({
          success: true,
          message: `${kiIds.length} 条待向量化，请通过 API /api/embed 执行`,
          pendingCount: kiIds.length,
        });
      }

      default:
        return NextResponse.json({ error: `未知 action: ${action}` }, { status: 400 });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ═══════════════════════════════════════
// Helpers
// ═══════════════════════════════════════

function getTextColumns(module: string): string[] {
  const map: Record<string, string[]> = {
    sea_area: ['name'],
    eez: ['country'],
    bridge: ['state_code', 'structure_number', 'facility_carried', 'location'],
    safety_incident: ['vessel_name', 'short_description', 'severity'],
    imdg: ['goods_name', 'un_class'],
    freight: ['index_name', 'source'],
    ais_synopsis: ['vessel_id_hash', 'source_file'],
    ship_image: ['filename'],
  };
  return map[module] || [];
}

function getOrderColumn(module: string): string {
  const map: Record<string, string> = {
    sea_area: 'name',
    eez: 'country',
    bridge: 'created_at',
    safety_incident: 'created_at',
    imdg: 'un_class',
    freight: 'created_at',
    ais_synopsis: 'created_at',
    ship_image: 'created_at',
  };
  return map[module] || 'created_at';
}

function getConflictKey(module: string): string {
  // All records have generated UUID ids — use 'id' for upsert
  return 'id';
}

function getValidColumns(module: string): string[] {
  const cols: Record<string, string[]> = {
    sea_area: ['id', 'name', 'sea_type', 'bounds', 'metadata', 'knowledge_item_id', 'embedding_status'],
    eez: ['id', 'country', 'area_sqkm', 'bounds', 'metadata', 'knowledge_item_id', 'embedding_status'],
    bridge: ['id', 'state_code', 'structure_number', 'route_prefix', 'route_number', 'facility_carried', 'location', 'lat', 'lon', 'year_built', 'year_reconstructed', 'structure_length_m', 'max_span_length_m', 'deck_width_m', 'raw_fields', 'knowledge_item_id', 'import_source', 'embedding_status'],
    safety_incident: ['id', 'occurrence_id', 'source', 'local_date', 'severity', 'main_event_l1', 'main_event_l2', 'short_description', 'description', 'lat', 'lon', 'vessel_name', 'vessel_type', 'port_accident', 'coastal_state', 'state_reporting', 'raw_fields', 'knowledge_item_id', 'import_source', 'embedding_status'],
    imdg: ['id', 'un_class', 'goods_name', 'division', 'classification', 'knowledge_item_id', 'embedding_status'],
    freight: ['id', 'index_name', 'collection_time', 'source', 'data', 'knowledge_item_id', 'embedding_status'],
    ais_synopsis: ['id', 'vessel_id_hash', 'timestamp_unix_ms', 'lon', 'lat', 'heading', 'speed', 'annotations', 'transport_trail', 'source_file', 'knowledge_item_id', 'embedding_status'],
    ship_image: ['id', 'filename', 'timestamp_str', 'lon', 'lat', 'local_path', 'knowledge_item_id', 'import_source', 'embedding_status'],
    import_progress: ['id', 'module', 'source_file', 'total_rows', 'processed_rows', 'status', 'error_message'],
  };
  return cols[module] || [];
}
