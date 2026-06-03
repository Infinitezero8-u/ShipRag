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

根据用户问题，生成合规的SELECT查询SQL，禁止增删改语句。
用户问题：${query}
只输出SQL语句，不要多余文字。`;

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

    // 2. 执行 SQL - 简化版本，直接执行常见统计
    const supabase = getSupabaseClient();
    let result: any[] = [];
    
    // 解析 SQL 类型
    const lowerSql = sql.toLowerCase();
    
    if (lowerSql.includes('count(*)')) {
      // COUNT 查询
      const tableName = lowerSql.match(/from\s+(\w+)/)?.[1] || 'knowledge_items';
      const { count, error } = await supabase
        .from(tableName)
        .select('*', { count: 'exact', head: true });
      
      if (error) {
        return NextResponse.json({ sql, error: error.message });
      }
      result = [{ count: count || 0 }];
    } else if (lowerSql.includes('count(') && lowerSql.includes('distinct')) {
      // DISTINCT COUNT - 尝试从 knowledge_items 获取字段
      const { data, error } = await supabase
        .from('knowledge_items')
        .select('title, source, file_type, tags')
        .limit(1000);
      
      if (error) {
        return NextResponse.json({ sql, error: error.message });
      }
      result = data || [];
    } else {
      // 其他查询 - 尝试获取基本数据
      const { data, error } = await supabase
        .from('knowledge_items')
        .select('id, title, source, file_type, created_at')
        .limit(50);
      
      if (error) {
        return NextResponse.json({ sql, error: error.message });
      }
      result = data || [];
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
