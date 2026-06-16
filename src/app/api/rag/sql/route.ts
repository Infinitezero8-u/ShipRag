import { NextRequest, NextResponse } from 'next/server';
import { LLMClient } from '@/lib/ollama/llm';
import { Config } from '@/lib/ollama/config';
import { getSupabaseClient } from '@/storage/database/local-db';

const SCHEMA = `
表名: knowledge_items 字段: id, title, content, source, modality, tags, created_at
表名: port_data 字段: port_code, name_cn, ctry_name_cn, ctry_code, continent_name_cn, lat, lon, port_type
表名: regulations 字段: filename, file_type, original_content, categories
表名: file_uploads 字段: filename, file_type, file_size, status, created_at
`;

const VALID_TABLES = ['knowledge_items', 'file_uploads', 'port_data', 'regulations'];

export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();
    if (!query) return NextResponse.json({ error: '缺少查询内容' }, { status: 400 });

    // 1. LLM 生成 SQL
    const prompt = '已知表结构:\n' + SCHEMA +
      '\n按问题意图选正确表，生成SELECT。只输出SQL。' +
      '\n统计: COUNT(*) + WHERE 精确过滤' +
      '\n列举: SELECT port_code, name_cn, ctry_name_cn FROM port_data WHERE ctry_name_cn = \'美国\'' +
      '\n列举: SELECT port_code, name_cn FROM port_data WHERE continent_name_cn = \'亚洲\'' +
      '\n列举: SELECT filename FROM regulations' +
      '\n用户问题：' + query;

    const llm = new LLMClient(new Config(), {});
    const resp = await llm.invoke([{ role: 'user', content: prompt }], { model: 'qwen2.5:3b' });

    let sql = (resp.content || '').replace(/```sql\n?/gi, '').replace(/```\n?/g, '').trim();
    if (!sql.toLowerCase().startsWith('select')) {
      return NextResponse.json({ error: '只允许SELECT', sql }, { status: 400 });
    }

    // 2. 执行（解析式，防注入）
    const supabase = getSupabaseClient();
    const m = sql.toLowerCase().match(/from\s+(\w+)/);
    const table = VALID_TABLES.includes(m?.[1] || '') ? m![1] : 'knowledge_items';
    let result: any[] = [];

    try {
      if (sql.toLowerCase().includes('count(*)')) {
        let q = supabase.from(table).select('*', { count: 'exact', head: true });
        let cond = false;

        // WHERE column = 'value'
        for (const m of sql.matchAll(/(\w+)\s*=\s*'([^']+)'/g)) {
          q = q.eq(m[1], m[2]); cond = true;
        }
        // WHERE column LIKE '%value%'
        for (const m of sql.matchAll(/(\w+)\s+like\s+'%([^']+)%'/gi)) {
          q = q.ilike(m[1], '%' + m[2] + '%'); cond = true;
        }

        if (cond) {
          const { count, error } = await q;
          if (error) {
            const c2 = await supabase.from(table).select('*', { count: 'exact', head: true });
            result = [{ count: c2.count || 0 }];
          } else {
            result = [{ count: count || 0 }];
          }
        } else {
          const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
          result = [{ count: count || 0 }];
        }
      } else {
        // 列举类查询，返回最多 500 行
        const cols = table === 'port_data' ? 'port_code, name_cn, ctry_name_cn, continent_name_cn, lat, lon'
          : table === 'regulations' ? 'filename, file_type, categories'
          : '*';
        // Parse WHERE conditions for non-COUNT
        let q = supabase.from(table).select(cols).limit(500);
        let cond = false;
        for (const m of sql.matchAll(/(\w+)\s*=\s*'([^']+)'/g)) {
          q = q.eq(m[1], m[2]); cond = true;
        }
        for (const m of sql.matchAll(/(\w+)\s+like\s+'%([^']+)%'/gi)) {
          q = q.ilike(m[1], '%' + m[2] + '%'); cond = true;
        }
        const { data } = cond ? await q : await q;
        result = data || [];
      }
    } catch (ex) {
      const { count } = await supabase.from(table).select('*', { count: 'exact', head: true });
      result = [{ count: count || 0, note: 'fallback' }];
    }

    return NextResponse.json({ sql, result, query });
  } catch (e) {
    return NextResponse.json({ error: 'SQL error: ' + (e as Error).message }, { status: 500 });
  }
}
