import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Supabase客户端
function getSupabase() {
  const supabaseUrl = process.env.COZE_SUPABASE_URL;
  const supabaseKey = process.env.COZE_SUPABASE_ANON_KEY;
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase环境变量未配置');
  }
  
  return createClient(supabaseUrl, supabaseKey);
}

// SQL安全检查 - 只允许SELECT语句
function validateSqlSecurity(sql: string): { safe: boolean; reason?: string } {
  const normalizedSql = sql.toUpperCase().trim();
  
  // 危险关键词黑名单
  const dangerousKeywords = [
    'INSERT', 'UPDATE', 'DELETE', 'DROP', 'ALTER', 'CREATE', 'TRUNCATE',
    'GRANT', 'REVOKE', 'EXEC', 'EXECUTE', 'MERGE', 'CALL',
    '--', '/*', '*/', 'XP_', 'SP_', 'PG_', 'SYS.'
  ];
  
  // 检查是否以SELECT开头
  if (!normalizedSql.startsWith('SELECT')) {
    return { safe: false, reason: '只允许SELECT查询语句' };
  }
  
  // 检查危险关键词
  for (const keyword of dangerousKeywords) {
    if (normalizedSql.includes(keyword)) {
      return { safe: false, reason: `SQL包含禁止的关键词: ${keyword}` };
    }
  }
  
  // 检查是否包含分号（防止多语句注入）
  if (sql.includes(';') && sql.indexOf(';') < sql.length - 1) {
    return { safe: false, reason: '禁止多语句执行' };
  }
  
  return { safe: true };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { sql, params } = body;
    
    if (!sql) {
      return NextResponse.json({ error: '缺少SQL语句' }, { status: 400 });
    }
    
    // 安全检查
    const securityCheck = validateSqlSecurity(sql);
    if (!securityCheck.safe) {
      return NextResponse.json({ 
        error: 'SQL安全检查未通过', 
        reason: securityCheck.reason 
      }, { status: 403 });
    }
    
    const supabase = getSupabase();
    
    // 执行SQL查询
    const { data, error } = await supabase.rpc('execute_sql', { 
      query: sql,
      params: params || []
    });
    
    if (error) {
      // 如果rpc不存在，尝试直接查询（仅限简单查询）
      if (error.message.includes('function') && error.message.includes('does not exist')) {
        // 解析表名
        const tableMatch = sql.match(/FROM\s+(\w+)/i);
        if (tableMatch) {
          const tableName = tableMatch[1];
          const { data: tableData, error: tableError } = await supabase
            .from(tableName)
            .select('*')
            .limit(100);
          
          if (tableError) {
            return NextResponse.json({ 
              error: '查询执行失败', 
              reason: tableError.message 
            }, { status: 500 });
          }
          
          return NextResponse.json({
            success: true,
            sql,
            result: tableData,
            rowCount: tableData?.length || 0,
            source: 'database',
          });
        }
      }
      
      return NextResponse.json({ 
        error: 'SQL执行失败', 
        reason: error.message 
      }, { status: 500 });
    }
    
    return NextResponse.json({
      success: true,
      sql,
      result: data,
      rowCount: Array.isArray(data) ? data.length : (data ? 1 : 0),
      source: 'database',
    });
    
  } catch (error) {
    console.error('SQL查询错误:', error);
    return NextResponse.json({ 
      error: 'SQL查询异常', 
      reason: error instanceof Error ? error.message : '未知错误' 
    }, { status: 500 });
  }
}

// 获取数据库表信息
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action');
    
    const supabase = getSupabase();
    
    if (action === 'tables') {
      // 获取可查询的表列表
      const tables = [
        { name: 'knowledge_items', description: '知识条目表' },
        { name: 'port_data', description: '港口数据表' },
        { name: 'route_data', description: '航线数据表' },
        { name: 'regulations', description: '规章制度表' },
        { name: 'regulation_chunks', description: '规章切片表' },
      ];
      
      return NextResponse.json({ tables });
    }
    
    if (action === 'schema') {
      const tableName = searchParams.get('table');
      if (!tableName) {
        return NextResponse.json({ error: '缺少表名' }, { status: 400 });
      }
      
      // 获取表结构
      const { data, error } = await supabase
        .from(tableName)
        .select('*')
        .limit(1);
      
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }
      
      const columns = data && data.length > 0 ? Object.keys(data[0]) : [];
      
      return NextResponse.json({
        table: tableName,
        columns,
        sampleData: data,
      });
    }
    
    return NextResponse.json({ error: '未知操作' }, { status: 400 });
    
  } catch (error) {
    console.error('SQL信息查询错误:', error);
    return NextResponse.json({ 
      error: '查询异常', 
      reason: error instanceof Error ? error.message : '未知错误' 
    }, { status: 500 });
  }
}
