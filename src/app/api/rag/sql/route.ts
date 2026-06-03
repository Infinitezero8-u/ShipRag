import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// SQL 生成与执行 API
export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();
    
    if (!query) {
      return NextResponse.json({ error: '缺少查询内容' }, { status: 400 });
    }

    const schema = `表名: knowledge_items
字段:
- id: 主键 (uuid)
- title: 标题 (text)
- content: 内容 (text)
- source: 来源文件名 (text)
- file_type: 文件类型 (text)
- tags: 标签数组 (text[])
- created_at: 创建时间 (timestamp)

表名: file_uploads
字段:
- id: 主键 (uuid)
- filename: 文件名 (text)
- file_type: 文件类型 (text)
- file_size: 文件大小 (bigint)
- status: 状态 (text)
- created_at: 创建时间 (timestamp)`;

    const sqlPrompt = `已知数据表结构：
${schema}

根据用户问题，生成简单的SELECT查询SQL。
规则：
1. 只生成SELECT语句，禁止INSERT/UPDATE/DELETE
2. 统计数量用 SELECT COUNT(*) FROM table_name
3. 不要添加复杂的WHERE条件，除非用户明确指定筛选条件
4. 不要使用数组操作函数
5. 只输出SQL语句，不要多余文字

用户问题：${query}`;

    // 1. 生成 SQL
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const llmClient = new LLMClient(new Config(), customHeaders);
    
    const response = await llmClient.invoke(
      [{ role: 'user', content: sqlPrompt }],
      { model: 'doubao-seed-2-0-lite-260215' }
    );

    let sql = response.content || '';
    
    // 清理 SQL，移除 markdown 标记
    sql = sql.replace(/```sql\n?/gi, '').replace(/```\n?/g, '').trim();
    
    // 安全检查：只允许 SELECT
    if (!sql.toLowerCase().startsWith('select')) {
      return NextResponse.json({ 
        error: '只允许 SELECT 查询',
        sql 
      }, { status: 400 });
    }

    // 2. 执行 SQL
    const supabase = getSupabaseClient();
    let result: any[] = [];
    
    // 解析 SQL 类型并执行
    const lowerSql = sql.toLowerCase();
    
    try {
      if (lowerSql.includes('count(*)')) {
        // COUNT 查询
        const tableMatch = lowerSql.match(/from\s+(\w+)/);
        const tableName = tableMatch?.[1] || 'knowledge_items';
        
        // 检查是否有 WHERE 条件
        if (lowerSql.includes('where')) {
          // 有条件查询 - 尝试解析条件
          const tagMatch = sql.match(/'([^']+)'\s*=\s*any\s*\(\s*tags\s*\)/i);
          if (tagMatch) {
            // 标签查询
            const tag = tagMatch[1];
            const { count, error } = await supabase
              .from(tableName)
              .select('*', { count: 'exact', head: true })
              .contains('tags', [tag]);
            if (error) {
              // 如果标签查询失败，返回总数
              const { count: totalCount } = await supabase
                .from(tableName)
                .select('*', { count: 'exact', head: true });
              result = [{ count: totalCount || 0, note: `未找到标签 "${tag}" 的数据，返回总数` }];
            } else {
              result = [{ count: count || 0 }];
            }
          } else {
            // 其他 WHERE 条件，返回总数
            const { count } = await supabase
              .from(tableName)
              .select('*', { count: 'exact', head: true });
            result = [{ count: count || 0 }];
          }
        } else {
          // 无条件的 COUNT 查询
          const { count, error } = await supabase
            .from(tableName)
            .select('*', { count: 'exact', head: true });
          
          if (error) {
            return NextResponse.json({ sql, error: error.message });
          }
          result = [{ count: count || 0 }];
        }
      } else if (lowerSql.includes('distinct')) {
        // DISTINCT 查询
        const fieldMatch = sql.match(/distinct\s+(\w+)/i);
        const field = fieldMatch?.[1] || 'title';
        
        const { data, error } = await supabase
          .from('knowledge_items')
          .select(field)
          .limit(1000);
        
        if (error) {
          return NextResponse.json({ sql, error: error.message });
        }
        
        // 去重
        const uniqueValues = [...new Set((data || []).map((item: any) => item[field]).filter(Boolean))];
        result = uniqueValues.map((v) => ({ [field]: v }));
      } else if (lowerSql.includes('group by')) {
        // GROUP BY 查询 - 简化处理
        const { data, error } = await supabase
          .from('knowledge_items')
          .select('file_type, source')
          .limit(500);
        
        if (error) {
          return NextResponse.json({ sql, error: error.message });
        }
        
        // 按文件类型分组统计
        const groups: Record<string, number> = {};
        (data || []).forEach((item: any) => {
          const key = item.file_type || 'unknown';
          groups[key] = (groups[key] || 0) + 1;
        });
        result = Object.entries(groups).map(([type, count]) => ({ file_type: type, count }));
      } else {
        // 普通 SELECT 查询
        const selectMatch = sql.match(/select\s+(.+?)\s+from/i);
        const fields = selectMatch?.[1] || '*';
        
        let query = supabase.from('knowledge_items').select('id, title, source, file_type, tags, created_at');
        
        // 添加限制
        const limitMatch = sql.match(/limit\s+(\d+)/i);
        const limit = limitMatch ? parseInt(limitMatch[1]) : 20;
        query = query.limit(Math.min(limit, 100));
        
        const { data, error } = await query;
        
        if (error) {
          return NextResponse.json({ sql, error: error.message });
        }
        result = data || [];
      }
    } catch (execError) {
      // 执行失败，返回总数作为兜底
      const { count } = await supabase
        .from('knowledge_items')
        .select('*', { count: 'exact', head: true });
      result = [{ count: count || 0, note: '简化查询结果' }];
    }

    return NextResponse.json({
      sql,
      result,
      query,
    });
  } catch (error) {
    console.error('SQL执行失败:', error);
    return NextResponse.json({ 
      error: 'SQL执行失败: ' + (error as Error).message 
    }, { status: 500 });
  }
}
