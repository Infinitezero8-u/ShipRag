import { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { execSync } from 'child_process';

let envLoaded = false;
let pool: Pool | null = null;

interface DatabaseConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

function loadEnv(): void {
  if (envLoaded || (process.env.DATABASE_URL || process.env.PGHOST)) {
    return;
  }

  try {
    try {
      require('dotenv').config();
      if (process.env.DATABASE_URL || process.env.PGHOST) {
        envLoaded = true;
        return;
      }
    } catch {
      // dotenv not available
    }

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

    envLoaded = true;
  } catch {
    // Silently fail
  }
}

function getDatabaseConfig(): DatabaseConfig {
  loadEnv();

  // 如果有 DATABASE_URL，解析它
  const databaseUrl = process.env.DATABASE_URL;
  if (databaseUrl) {
    const url = new URL(databaseUrl);
    return {
      host: url.hostname,
      port: parseInt(url.port) || 5432,
      user: url.username,
      password: url.password,
      database: url.pathname.slice(1),
    };
  }

  // 否则使用单独的环境变量
  return {
    host: process.env.PGHOST || 'localhost',
    port: parseInt(process.env.PGPORT || '5432'),
    user: process.env.PGUSER || 'shiprag',
    password: process.env.PGPASSWORD || 'shiprag123',
    database: process.env.PGDATABASE || 'shiprag',
  };
}

function getPool(): Pool {
  if (!pool) {
    const config = getDatabaseConfig();
    pool = new Pool({
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
  return pool;
}

async function query<T extends QueryResultRow = any>(sql: string, params?: any[]): Promise<QueryResult<T>> {
  const pool = getPool();
  return pool.query<T>(sql, params);
}

async function getClient(): Promise<PoolClient> {
  const pool = getPool();
  return pool.connect();
}

async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
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

export {
  loadEnv,
  getDatabaseConfig,
  getPool,
  getClient,
  query,
  closePool,
  vectorSearch,
  toVector,
  fromVector,
};
