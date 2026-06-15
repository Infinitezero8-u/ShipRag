/**
 * 本地 PostgreSQL 客户端 - 替换 coze-coding-dev-sdk 的 Supabase 封装
 * 直连本地 PostgREST (localhost:54320)，无需 Coze 环境
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.COZE_SUPABASE_URL || 'http://localhost:54320';
const SUPABASE_ANON_KEY = process.env.COZE_SUPABASE_ANON_KEY || 'local-dev-key';
const SUPABASE_SERVICE_ROLE_KEY = process.env.COZE_SUPABASE_SERVICE_ROLE_KEY;

let envLoaded = false;

function loadEnv(): void {
  if (envLoaded || process.env.COZE_SUPABASE_URL) return;

  try {
    try {
      require('dotenv').config();
    } catch { /* optional */ }
    envLoaded = true;
  } catch {
    /* silently ignore */
  }
}

function getSupabaseClient(token?: string): SupabaseClient {
  loadEnv();

  let key = token ? SUPABASE_ANON_KEY : (SUPABASE_SERVICE_ROLE_KEY ?? SUPABASE_ANON_KEY);

  const globalOptions: Record<string, any> = {};
  if (token) {
    globalOptions.headers = { Authorization: `Bearer ${token}` };
  }

  return createClient(SUPABASE_URL, key, {
    global: globalOptions,
    db: { timeout: 60000, schema: 'public' },
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export { loadEnv, getSupabaseClient };
export type { SupabaseClient };
