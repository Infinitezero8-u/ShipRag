import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { execSync } from 'child_process';

let envLoaded = false;
let pgPool: Pool | null = null;

interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function loadEnv(): void {
  if (envLoaded) return;

  try {
    require('dotenv').config();
    if (process.env.SUPABASE_URL || process.env.PGHOST || process.env.DATABASE_URL) {
      envLoaded = true;
      return;
    }
  } catch {
    // dotenv not available
  }

  try {
    const pythonCode = `
import os
import sys
try:
    from coze_workload_identity import Client
    client = Client()
    env_vars = client.get_project_env_vars()
    client.close()
    for env_var in env_vars:
        print(f"{env_var.key}={env_var.value}")
except Exception as e:
    print(f"# Error: {e}", file=sys.stderr)
`;

    const output = execSync(`python3 -c '${pythonCode.replace(/'/g, "'\"'\"'")}'`, {
      encoding: 'utf-8',
      timeout: 10000,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const lines = output.trim().split('\n');
    for (const line of lines) {
      if (line.startsWith('#')) continue;
      const eqIndex = line.indexOf('=');
      if (eqIndex > 0) {
        const key = line.substring(0, eqIndex);
        let value = line.substring(eqIndex + 1);
        if ((value.startsWith("'") && value.endsWith("'")) ||
            (value.startsWith('"') && value.endsWith('"'))) {
          value = value.slice(1, -1);
        }
        if (!process.env[key]) {
          process.env[key] = value;
        }
      }
    }
  } catch {
    // Silently fail
  }

  envLoaded = true;
}

// 获取数据库客户端（统一使用本地PostgreSQL）
function getSupabaseClient() {
  loadEnv();
  return getSupabase();
}

function getDatabaseConfig(): DatabaseConfig {
  loadEnv();

  // 强制使用本地PostgreSQL（优先级最高）
  const forceLocal = process.env.FORCE_LOCAL_PG === 'true';
  if (forceLocal) {
    return {
      host: 'localhost',
      port: 5432,
      user: 'shiprag',
      password: 'shiprag123',
      database: 'shiprag',
    };
  }

  // 优先使用 DATABASE_URL
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    try {
      const url = new URL(databaseUrl);
      return {
        host: url.hostname,
        port: parseInt(url.port) || 5432,
        user: url.username,
        password: url.password,
        database: url.pathname.slice(1),
      };
    } catch {
      // Invalid URL, fall through
    }
  }

  // 使用单独的环境变量（优先使用本地配置的默认值）
  return {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    user: process.env.PGUSER || 'shiprag',
    password: process.env.PGPASSWORD || 'shiprag123',
    database: process.env.PGDATABASE || 'shiprag',
  };
}

function getPgPool(): Pool {
  if (!pgPool) {
    const config = getDatabaseConfig();
    pgPool = new Pool({
      host: config.host,
      port: config.port,
      user: config.user,
      password: config.password,
      database: config.database,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
      // 禁用SSL（本地PostgreSQL不需要SSL）
      ssl: false,
    });
  }
  return pgPool;
}

// PostgreSQL 直接查询
async function query<T extends QueryResultRow = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
  const pool = getPgPool();
  return pool.query<T>(sql, params);
}

async function getPgClient(): Promise<PoolClient> {
  const pool = getPgPool();
  return pool.connect();
}

async function closePool(): Promise<void> {
  if (pgPool) {
    await pgPool.end();
    pgPool = null;
  }
}

// 向量相似度搜索
async function vectorSearch(
  table: string,
  embedding: number[],
  options: {
    limit?: number;
    threshold?: number;
    filter?: string;
    filterParams?: any[];
    columns?: string[];
  } = {}
): Promise<any[]> {
  const { limit = 10, threshold = 0.3, filter, filterParams = [], columns } = options;
  
  const selectColumns = columns ? columns.join(', ') : '*';
  const embeddingStr = `[${embedding.join(',')}]`;
  
  let sql = `
    SELECT 
      ${selectColumns},
      1 - (embedding <=> $1::vector) as similarity
    FROM ${table}
    WHERE embedding IS NOT NULL
  `;
  
  const params: any[] = [embeddingStr];
  
  if (filter) {
    sql += ` AND ${filter}`;
    params.push(...filterParams);
  }
  
  sql += `
    ORDER BY similarity DESC
    LIMIT $${params.length + 1}
  `;
  params.push(limit);
  
  const result = await query(sql, params);
  return result.rows.filter(row => row.similarity >= threshold);
}

// 将数组转换为 PostgreSQL vector 格式
function toVector(arr: number[]): string {
  return `[${arr.join(',')}]`;
}

// 将 PostgreSQL vector 格式转换为数组
function fromVector(vec: string): number[] {
  if (!vec) return [];
  const str = vec.replace(/^\[|\]$/g, '');
  return str.split(',').map(Number);
}

// 兼容 Supabase 风格的查询接口
function getSupabase() {
  const pool = getPgPool();
  
  return {
    from: (table: string) => {
      let queryBuilder: any = {
        _table: table,
        _columns: '*',
        _filters: [] as string[],
        _params: [] as any[],
        _order: '',
        _limit: 0,
        _offset: 0,
        _single: false,
        _maybeSingle: false,
        _countMode: null as string | null,
        _headMode: false,
        
        select(columns: string = '*', options?: { count?: 'exact'; head?: boolean }) {
          this._columns = columns;
          if (options?.count) {
            this._countMode = options.count;
          }
          if (options?.head) {
            this._headMode = options.head;
          }
          return this;
        },
        
        eq(column: string, value: any) {
          this._filters.push(`${column} = $${this._params.length + 1}`);
          this._params.push(value);
          return this;
        },
        
        neq(column: string, value: any) {
          this._filters.push(`${column} != $${this._params.length + 1}`);
          this._params.push(value);
          return this;
        },
        
        ilike(column: string, pattern: string) {
          this._filters.push(`${column} ILIKE $${this._params.length + 1}`);
          this._params.push(pattern);
          return this;
        },
        
        like(column: string, pattern: string) {
          this._filters.push(`${column} LIKE $${this._params.length + 1}`);
          this._params.push(pattern);
          return this;
        },
        
        in(column: string, values: any[]) {
          const placeholders = values.map((_, i) => `$${this._params.length + i + 1}`).join(', ');
          this._filters.push(`${column} IN (${placeholders})`);
          this._params.push(...values);
          return this;
        },
        
        gte(column: string, value: any) {
          this._filters.push(`${column} >= $${this._params.length + 1}`);
          this._params.push(value);
          return this;
        },
        
        lte(column: string, value: any) {
          this._filters.push(`${column} <= $${this._params.length + 1}`);
          this._params.push(value);
          return this;
        },
        
        // 解析Supabase格式的or查询: "column1.ilike.%value%,column2.eq.value"
        or(condition: string) {
          const parts = condition.split(',');
          const orParts: string[] = [];
          
          for (const part of parts) {
            // 解析 column.op.value 格式
            const match = part.match(/^(\w+)\.(ilike|like|eq|neq|gte|lte|gt|lt|is)\.(.+)$/);
            if (match) {
              const [, col, op, val] = match;
              let filter: string;
              
              // 处理特殊值
              if (val === 'null') {
                if (op === 'is') {
                  filter = `${col} IS NULL`;
                } else {
                  filter = `${col} IS NOT NULL`;
                }
              } else {
                // 处理百分号通配符
                const paramValue = val.startsWith('%') || val.endsWith('%') ? val : val;
                const paramIndex = this._params.length + 1;
                this._params.push(paramValue);
                
                switch (op) {
                  case 'ilike':
                    filter = `${col} ILIKE $${paramIndex}`;
                    break;
                  case 'like':
                    filter = `${col} LIKE $${paramIndex}`;
                    break;
                  case 'eq':
                    filter = `${col} = $${paramIndex}`;
                    break;
                  case 'neq':
                    filter = `${col} != $${paramIndex}`;
                    break;
                  case 'gte':
                    filter = `${col} >= $${paramIndex}`;
                    break;
                  case 'lte':
                    filter = `${col} <= $${paramIndex}`;
                    break;
                  case 'gt':
                    filter = `${col} > $${paramIndex}`;
                    break;
                  case 'lt':
                    filter = `${col} < $${paramIndex}`;
                    break;
                  default:
                    filter = `${col} = $${paramIndex}`;
                }
              }
              orParts.push(filter);
            }
          }
          
          if (orParts.length > 0) {
            this._filters.push(`(${orParts.join(' OR ')})`);
          }
          return this;
        },
        
        // is方法用于null检查
        is(column: string, value: null | boolean) {
          if (value === null) {
            this._filters.push(`${column} IS NULL`);
          } else {
            this._filters.push(`${column} IS NOT NULL`);
          }
          return this;
        },
        
        not(column: string, op: string, value: any) {
          // 简单实现
          if (op === 'is') {
            this._filters.push(`${column} IS NOT NULL`);
          }
          return this;
        },
        
        order(column: string, options?: { ascending?: boolean }) {
          const dir = options?.ascending === false ? 'DESC' : 'ASC';
          this._order = `ORDER BY ${column} ${dir}`;
          return this;
        },
        
        limit(n: number) {
          this._limit = n;
          return this;
        },
        
        range(start: number, end: number) {
          this._offset = start;
          this._limit = end - start + 1;
          return this;
        },
        
        single() {
          this._single = true;
          return this;
        },
        
        maybeSingle() {
          this._maybeSingle = true;
          return this;
        },
        
        async then(resolve: Function) {
          return this._execute().then(resolve);
        },
        
        async _execute() {
          try {
            // 如果是head模式且需要count，只返回count
            if (this._headMode && this._countMode) {
              let countSql = `SELECT COUNT(*) as count FROM ${this._table}`;
              if (this._filters.length > 0) {
                countSql += ` WHERE ${this._filters.join(' AND ')}`;
              }
              const countResult = await query(countSql, this._params);
              return { data: null, error: null, count: parseInt(countResult.rows[0]?.count || '0') };
            }
            
            let sql = `SELECT ${this._columns} FROM ${this._table}`;
            
            if (this._filters.length > 0) {
              sql += ` WHERE ${this._filters.join(' AND ')}`;
            }
            
            if (this._order) {
              sql += ` ${this._order}`;
            }
            
            if (this._limit > 0) {
              sql += ` LIMIT ${this._limit}`;
            }
            
            if (this._offset > 0) {
              sql += ` OFFSET ${this._offset}`;
            }
            
            const result = await query(sql, this._params);
            
            // 如果需要count，额外查询总数
            let count: number | undefined = undefined;
            if (this._countMode) {
              let countSql = `SELECT COUNT(*) as count FROM ${this._table}`;
              if (this._filters.length > 0) {
                countSql += ` WHERE ${this._filters.join(' AND ')}`;
              }
              const countResult = await query(countSql, this._params);
              count = parseInt(countResult.rows[0]?.count || '0');
            }
            
            if (this._single || this._maybeSingle) {
              return { data: result.rows[0] || null, error: null, count };
            }
            
            return { data: result.rows, error: null, count };
          } catch (err: any) {
            return { data: null, error: { message: err.message } };
          }
        },
        
        insert(records: any | any[]) {
          const items = Array.isArray(records) ? records : [records];
          
          // 返回支持链式调用的对象
          const insertBuilder: any = {
            _items: items,
            _table: this._table,
            _select: true,
            _single: false,
            
            select() {
              this._select = true;
              return this;
            },
            
            single() {
              this._single = true;
              return this;
            },
            
            async then(resolve: Function) {
              return this._execute().then(resolve);
            },
            
            async _execute() {
              try {
                if (this._items.length === 0) {
                  return { data: [], error: null };
                }
                
                const columns = Object.keys(this._items[0]);
                const values: any[] = [];
                const placeholders: string[] = [];
                
                this._items.forEach((item: any) => {
                  const itemPlaceholders = columns.map(col => {
                    values.push(item[col]);
                    return `$${values.length}`;
                  });
                  placeholders.push(`(${itemPlaceholders.join(', ')})`);
                });
                
                const sql = `INSERT INTO ${this._table} (${columns.join(', ')}) VALUES ${placeholders.join(', ')} RETURNING *`;
                const result = await query(sql, values);
                
                if (this._single) {
                  return { data: result.rows[0] || null, error: null };
                }
                return { data: result.rows, error: null };
              } catch (err: any) {
                return { data: null, error: { message: err.message } };
              }
            }
          };
          
          return insertBuilder;
        },
        
        update(updates: any) {
          // 返回支持链式调用的对象
          const updateBuilder = {
            _updates: updates,
            _filters: [...this._filters] as string[],
            _params: [...this._params] as any[],
            
            eq(column: string, value: any) {
              this._params.push(value);
              this._filters.push(`${column} = $${this._params.length}`);
              return this;
            },
            
            neq(column: string, value: any) {
              this._params.push(value);
              this._filters.push(`${column} != $${this._params.length}`);
              return this;
            },
            
            in(column: string, values: any[]) {
              const placeholders = values.map((v, i) => {
                this._params.push(v);
                return `$${this._params.length}`;
              });
              this._filters.push(`${column} IN (${placeholders.join(', ')})`);
              return this;
            },
            
            async select() {
              try {
                const setClauses: string[] = [];
                const values: any[] = [];
                
                Object.entries(this._updates).forEach(([key, value]) => {
                  // 处理embedding数组，转换为vector格式
                  if (key === 'embedding' && Array.isArray(value)) {
                    const embeddingStr = `[${value.join(',')}]`;
                    setClauses.push(`${key} = '${embeddingStr}'::vector`);
                  } else if (Array.isArray(value)) {
                    values.push(value);
                    setClauses.push(`${key} = $${values.length}`);
                  } else {
                    values.push(value);
                    setClauses.push(`${key} = $${values.length}`);
                  }
                });
                
                let sql = `UPDATE ${table} SET ${setClauses.join(', ')}`;
                
                if (this._filters.length > 0) {
                  // 重新构建WHERE子句，参数编号从values.length + 1开始
                  const whereClauses: string[] = [];
                  this._params.forEach((param, i) => {
                    whereClauses.push(this._filters[i].replace(`$${i + 1}`, `$${values.length + i + 1}`));
                  });
                  sql += ` WHERE ${whereClauses.join(' AND ')}`;
                }
                
                sql += ' RETURNING *';
                
                const result = await query(sql, [...values, ...this._params]);
                
                return { data: result.rows, error: null };
              } catch (err: any) {
                return { data: null, error: { message: err.message } };
              }
            },
            
            async then(resolve: any, reject: any) {
              const result = await this.select();
              return resolve(result);
            }
          };
          
          return updateBuilder;
        },
        
        delete() {
          // 返回支持链式调用的对象
          const deleteBuilder = {
            _filters: [...this._filters] as string[],
            _params: [...this._params] as any[],
            
            eq(column: string, value: any) {
              this._params.push(value);
              this._filters.push(`${column} = $${this._params.length}`);
              return this;
            },
            
            neq(column: string, value: any) {
              this._params.push(value);
              this._filters.push(`${column} != $${this._params.length}`);
              return this;
            },
            
            in(column: string, values: any[]) {
              const placeholders = values.map((v, i) => {
                this._params.push(v);
                return `$${this._params.length}`;
              });
              this._filters.push(`${column} IN (${placeholders.join(', ')})`);
              return this;
            },
            
            async select() {
              try {
                let sql = `DELETE FROM ${table}`;
                
                if (this._filters.length > 0) {
                  sql += ` WHERE ${this._filters.join(' AND ')}`;
                }
                
                sql += ' RETURNING *';
                
                const result = await query(sql, this._params);
                
                return { data: result.rows, error: null };
              } catch (err: any) {
                return { data: null, error: { message: err.message } };
              }
            },
            
            async then(resolve: any, reject: any) {
              const result = await this.select();
              return resolve(result);
            }
          };
          
          return deleteBuilder;
        },
        
        upsert(records: any | any[], options?: { onConflict?: string }) {
          const items = Array.isArray(records) ? records : [records];
          
          // 返回支持链式调用的对象
          const upsertBuilder: any = {
            _items: items,
            _table: this._table,
            _options: options,
            _select: true,
            _single: false,
            
            select() {
              this._select = true;
              return this;
            },
            
            single() {
              this._single = true;
              return this;
            },
            
            async then(resolve: Function) {
              return this._execute().then(resolve);
            },
            
            async _execute() {
              try {
                if (this._items.length === 0) {
                  return { data: [], error: null };
                }
                
                // 分批处理，每批最多100条（避免参数过多）
                const BATCH_SIZE = 100;
                const allResults: any[] = [];
                const columns = Object.keys(this._items[0]);
                const conflictColumn = this._options?.onConflict || columns[0];
                const updateClauses = columns.filter(c => c !== conflictColumn).map(c => `${c} = EXCLUDED.${c}`);
                
                for (let i = 0; i < this._items.length; i += BATCH_SIZE) {
                  const batch = this._items.slice(i, i + BATCH_SIZE);
                  const values: any[] = [];
                  const placeholders: string[] = [];
                  
                  batch.forEach((item: any) => {
                    const itemPlaceholders = columns.map(col => {
                      values.push(item[col]);
                      return `$${values.length}`;
                    });
                    placeholders.push(`(${itemPlaceholders.join(', ')})`);
                  });
                  
                  let sql = `INSERT INTO ${this._table} (${columns.join(', ')}) VALUES ${placeholders.join(', ')}`;
                  if (updateClauses.length > 0) {
                    sql += ` ON CONFLICT (${conflictColumn}) DO UPDATE SET ${updateClauses.join(', ')}`;
                  } else {
                    sql += ` ON CONFLICT (${conflictColumn}) DO NOTHING`;
                  }
                  sql += ' RETURNING *';
                  
                  const result = await query(sql, values);
                  allResults.push(...result.rows);
                }
                
                if (this._single) {
                  return { data: allResults[0] || null, error: null };
                }
                return { data: allResults, error: null };
              } catch (err: any) {
                return { data: null, error: { message: err.message } };
              }
            }
          };
          
          return upsertBuilder;
        },
      };
      
      return queryBuilder;
    },
    
    rpc: async (fnName: string, params?: any) => {
      // 对于 vector_search RPC，搜索所有已向量化的表
      if (fnName === 'vector_search') {
        const { query_embedding, match_threshold = 0.3, match_count = 10, filter_modality } = params || {};
        const embeddingStr = `[${query_embedding.join(',')}]`;
        const results: any[] = [];
        
        try {
          // 搜索 knowledge_items 表
          const kiSql = `
            SELECT 
              id, title, content, modality, source, metadata,
              1 - (embedding <=> $1::vector) as similarity
            FROM knowledge_items
            WHERE embedding IS NOT NULL
              AND 1 - (embedding <=> $1::vector) >= $2
            ORDER BY similarity DESC
            LIMIT $3
          `;
          const kiResult = await query(kiSql, [embeddingStr, match_threshold, match_count]);
          for (const row of kiResult.rows) {
            results.push({ ...row, table: 'knowledge_items' });
          }
          
          // 搜索 port_data 表
          const portSql = `
            SELECT 
              id, port_code, name_cn, ctry_name_cn, ctry_code, lon, lat,
              1 - (embedding <=> $1::vector) as similarity
            FROM port_data
            WHERE embedding IS NOT NULL
              AND 1 - (embedding <=> $1::vector) >= $2
            ORDER BY similarity DESC
            LIMIT $3
          `;
          const portResult = await query(portSql, [embeddingStr, match_threshold, match_count]);
          for (const row of portResult.rows) {
            results.push({
              id: row.id,
              title: row.name_cn,
              content: `港口代码: ${row.port_code}, 国家: ${row.ctry_name_cn}, 位置: (${row.lon}, ${row.lat})`,
              modality: 'port',
              similarity: row.similarity,
              table: 'port_data',
              port_code: row.port_code,
              name_cn: row.name_cn,
              ctry_name_cn: row.ctry_name_cn,
              lon: row.lon,
              lat: row.lat
            });
          }
          
          // 搜索 route_data 表
          const routeSql = `
            SELECT 
              id, orig_port, dest_port,
              1 - (embedding <=> $1::vector) as similarity
            FROM route_data
            WHERE embedding IS NOT NULL
              AND 1 - (embedding <=> $1::vector) >= $2
            ORDER BY similarity DESC
            LIMIT $3
          `;
          const routeResult = await query(routeSql, [embeddingStr, match_threshold, match_count]);
          for (const row of routeResult.rows) {
            results.push({
              id: row.id,
              title: `${row.orig_port} -> ${row.dest_port}`,
              content: `航线: ${row.orig_port} 到 ${row.dest_port}`,
              modality: 'route',
              similarity: row.similarity,
              table: 'route_data',
              orig_port: row.orig_port,
              dest_port: row.dest_port
            });
          }
          
          // 搜索 regulation_chunks 表
          const regSql = `
            SELECT 
              rc.id, rc.regulation_id, rc.content, rc.metadata,
              r.filename, r.storage_url,
              1 - (rc.embedding <=> $1::vector) as similarity
            FROM regulation_chunks rc
            LEFT JOIN regulations r ON rc.regulation_id = r.id
            WHERE rc.embedding IS NOT NULL
              AND 1 - (rc.embedding <=> $1::vector) >= $2
            ORDER BY similarity DESC
            LIMIT $3
          `;
          const regResult = await query(regSql, [embeddingStr, match_threshold, match_count]);
          for (const row of regResult.rows) {
            results.push({
              id: row.id,
              title: row.filename || '规章制度',
              content: row.content,
              modality: 'regulation',
              similarity: row.similarity,
              table: 'regulation_chunks',
              regulation_id: row.regulation_id,
              metadata: { ...row.metadata, storageUrl: row.storage_url },
              storage_url: row.storage_url
            });
          }
          
          // 按相似度排序并返回top结果
          results.sort((a, b) => b.similarity - a.similarity);
          return { data: results.slice(0, match_count), error: null };
        } catch (err: any) {
          return { data: null, error: { message: err.message } };
        }
      }
      
      // 对于 update_embedding RPC，直接执行UPDATE
      if (fnName === 'update_embedding') {
        const { item_id, embedding_vector, table_name = 'knowledge_items' } = params || {};
        if (!item_id || !embedding_vector) {
          return { data: null, error: { message: 'Missing item_id or embedding_vector' } };
        }
        
        const embeddingStr = `[${embedding_vector.join(',')}]`;
        
        // 根据item_id判断要更新哪个表
        // 先尝试knowledge_items
        let sql = `UPDATE knowledge_items SET embedding = $1::vector, updated_at = NOW() WHERE id = $2::uuid`;
        let result = await query(sql, [embeddingStr, item_id]);
        
        // 如果没有更新到任何行，尝试其他表
        if (result.rowCount === 0) {
          sql = `UPDATE port_data SET embedding = $1::vector, vector_status = '已向量化', updated_at = NOW() WHERE id = $2::uuid`;
          result = await query(sql, [embeddingStr, item_id]);
        }
        
        if (result.rowCount === 0) {
          sql = `UPDATE route_data SET embedding = $1::vector, vector_status = '已向量化', updated_at = NOW() WHERE id = $2::uuid`;
          result = await query(sql, [embeddingStr, item_id]);
        }
        
        if (result.rowCount === 0) {
          sql = `UPDATE regulation_chunks SET embedding = $1::vector WHERE id = $2::uuid`;
          result = await query(sql, [embeddingStr, item_id]);
        }
        
        return { data: [{ success: true, rowCount: result.rowCount }], error: null };
      }
      
      return { data: null, error: { message: `RPC ${fnName} not implemented` } };
    },
  };
}

export {
  loadEnv,
  getSupabaseClient,
  getDatabaseConfig,
  getPgPool,
  getPgClient,
  query,
  closePool,
  vectorSearch,
  toVector,
  fromVector,
  getSupabase,
};
