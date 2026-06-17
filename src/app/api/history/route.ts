/**
 * 历史记录 API — 统一管理智能问答和智能检索的历史
 *
 * GET  /api/history?type=rag|search&page=1&pageSize=20
 * POST /api/history — { type: 'rag'|'search', query, answer, ... }
 * DELETE /api/history?id=xxx  or  ?action=clear&type=rag|search
 * GET  /api/history?action=export&type=rag|search — 导出 Excel (.xlsx)
 *
 * 使用原生 pg 直连避免 Supabase PostgREST schema cache 问题
 */
import { NextRequest, NextResponse } from 'next/server';
import pg from 'pg';

const DB_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/shiprag';

function getPool(): pg.Pool {
  if (!(globalThis as any).__historyPool) {
    (globalThis as any).__historyPool = new pg.Pool({ connectionString: DB_URL, max: 5 });
  }
  return (globalThis as any).__historyPool;
}

// ─── GET: 列表 / 导出 ────────────────────────────
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'list';
    const type = searchParams.get('type') || 'all';
    const page = parseInt(searchParams.get('page') || '1');
    const pageSize = parseInt(searchParams.get('pageSize') || '20');

    const pool = getPool();

    if (action === 'export') {
      return await exportHistory(pool, type);
    }

    let where = '';
    const params: any[] = [];
    if (type !== 'all') { where = 'WHERE history_type = $1'; params.push(type); }

    const [countResult, dataResult] = await Promise.all([
      pool.query(`SELECT count(*) FROM search_history ${where}`, params),
      pool.query(
        `SELECT * FROM search_history ${where} ORDER BY created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
        [...params, pageSize, (page - 1) * pageSize]
      ),
    ]);

    const total = parseInt(countResult.rows[0].count);
    return NextResponse.json({
      success: true,
      history: dataResult.rows,
      pagination: { page, pageSize, totalCount: total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── POST: 新增 ─────────────────────────────────
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { type, query, answer, modality, source, resultCount } = body;
    const pool = getPool();
    await pool.query(
      `INSERT INTO search_history (history_type, query, answer, modality, source, result_count)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [type || 'rag', query?.substring(0, 500) || '', answer?.substring(0, 5000) || '', modality || '', source || '', resultCount || 0]
    );
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── DELETE: 按 ID 删除 / 清空 ──────────────────
export async function DELETE(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');
    const type = searchParams.get('type');
    const action = searchParams.get('action');
    const pool = getPool();

    if (action === 'clear' && type) {
      await pool.query('DELETE FROM search_history WHERE history_type = $1', [type]);
      return NextResponse.json({ success: true });
    }
    if (!id) return NextResponse.json({ error: '缺少 id' }, { status: 400 });
    await pool.query('DELETE FROM search_history WHERE id = $1', [id]);
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ─── Excel 导出 ──────────────────────────────────
async function exportHistory(pool: pg.Pool, type: string) {
  let where = '';
  const params: any[] = [];
  if (type !== 'all') { where = 'WHERE history_type = $1'; params.push(type); }

  const result = await pool.query(
    `SELECT * FROM search_history ${where} ORDER BY created_at DESC LIMIT 5000`, params
  );
  if (result.rows.length === 0) {
    return NextResponse.json({ error: '无历史记录可导出' }, { status: 404 });
  }

  const XLSX = await import('xlsx');
  const rows = result.rows.map((r: any) => ({
    '时间': r.created_at ? new Date(r.created_at).toLocaleString('zh-CN') : '',
    '类型': r.history_type === 'rag' ? '智能问答' : '智能检索',
    '查询内容': r.query?.substring(0, 500) || '',
    '回答/结果': r.answer?.substring(0, 500) || '',
    '模态': r.modality || '',
    '来源': r.source || '',
    '结果数': r.result_count || 0,
  }));

  const ws = XLSX.utils.json_to_sheet(rows);
  ws['!cols'] = [{ wch: 20 }, { wch: 10 }, { wch: 40 }, { wch: 40 }, { wch: 10 }, { wch: 15 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, type === 'rag' ? '智能问答历史' : '智能检索历史');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
  const filename = `历史记录_${type}_${new Date().toISOString().slice(0, 10)}.xlsx`;
  return new NextResponse(buf, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
    },
  });
}
