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
- modality: 数据类型 (text)，如: pdf, excel, doc, markdown, json, image
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

根据用户问题，生成SELECT查询SQL。
规则：
1. 只生成SELECT语句，禁止INSERT/UPDATE/DELETE
2. 统计数量用 SELECT COUNT(*) FROM table_name
3. 根据问题中的关键词添加WHERE条件：
   - 提到具体数据类型(pdf/excel/doc/markdown/json/image等)：WHERE modality = 'xxx'
   - 提到具体来源文件名：WHERE source LIKE '%关键词%'
   - 提到具体内容关键词：WHERE content LIKE '%关键词%'
   - 提到标签：WHERE '标签名' = ANY(tags)
4. 多个条件用 AND 或 OR 连接
5. 只输出SQL语句，不要多余文字

示例：
- "一共有多少PDF" → SELECT COUNT(*) FROM knowledge_items WHERE modality = 'pdf'
- "港口有多少条数据" → SELECT COUNT(*) FROM knowledge_items WHERE source LIKE '%港口%' OR content LIKE '%港口%'
- "阿联酋有多少港口" → SELECT COUNT(*) FROM knowledge_items WHERE content LIKE '%阿联酋%'

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
          let queryBuilder = supabase.from(tableName).select('*', { count: 'exact', head: true });
          let hasCondition = false;
          
          // 解析 modality = 'xxx' 或 file_type = 'xxx' 条件
          const modalityMatch = sql.match(/(?:modality|file_type)\s*=\s*'([^']+)'/i);
          if (modalityMatch) {
            const modality = modalityMatch[1];
            queryBuilder = queryBuilder.eq('modality', modality);
            hasCondition = true;
          }
          
          // 解析 source LIKE '%xxx%' 条件
          const sourceLikeMatch = sql.match(/source\s+like\s+'%([^']+)%'/i);
          if (sourceLikeMatch) {
            const keyword = sourceLikeMatch[1];
            queryBuilder = queryBuilder.ilike('source', `%${keyword}%`);
            hasCondition = true;
          }
          
          // 解析 content LIKE '%xxx%' 条件
          const contentLikeMatches = sql.match(/content\s+like\s+'%([^']+)%'/gi);
          if (contentLikeMatches) {
            const keywords = contentLikeMatches.map(m => m.match(/'%([^']+)%'/i)?.[1]).filter(Boolean);
            if (keywords.length > 0) {
              // 使用 or 条件连接多个 content like
              const orConditions = keywords.map(k => `content.ilike.%${k}%`).join(',');
              queryBuilder = queryBuilder.or(orConditions);
              hasCondition = true;
            }
          }
          
          // 解析标签条件 '标签' = ANY(tags)
          const tagMatch = sql.match(/'([^']+)'\s*=\s*any\s*\(\s*tags\s*\)/i);
          if (tagMatch) {
            const tag = tagMatch[1];
            queryBuilder = queryBuilder.contains('tags', [tag]);
            hasCondition = true;
          }
          
          if (hasCondition) {
            const { count, error } = await queryBuilder;
            if (error) {
              // 如果条件查询失败，尝试更宽松的查询
              const keywordMatch = sql.match(/where\s+.+like\s+'%([^']+)%'/i);
              if (keywordMatch) {
                // 尝试搜索 content 字段
                const { count: fallbackCount } = await supabase
                  .from(tableName)
                  .select('*', { count: 'exact', head: true })
                  .ilike('content', `%${keywordMatch[1]}%`);
                result = [{ count: fallbackCount || 0 }];
              } else {
                result = [{ count: 0, note: '查询条件执行失败' }];
              }
            } else {
              result = [{ count: count || 0 }];
            }
          } else {
            // 无法解析条件，返回总数
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
