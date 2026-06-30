/**
 * embed_batch.ts — 高性能批量向量化脚本
 *
 * 直连 Supabase + Ollama，绕过 Next.js HTTP 路由层。
 * 多 worker 安全：每个 worker 用 embedding IS NULL + LIMIT 取一批，
 * 嵌入后写回。worker 间自然竞速，最多重叠 1 批（可忽略）。
 *
 * 用法:
 *   # 单进程
 *   tsx scripts/embed_batch.ts
 *
 *   # 多进程并行
 *   for i in $(seq 0 3); do
 *     tsx scripts/embed_batch.ts &
 *   done
 *   wait
 *
 * 环境变量:
 *   BATCH_SIZE       每批数量 (默认 500)
 *   OLLAMA_BASE_URL  Ollama 地址 (默认 http://localhost:11434)
 *   EMBED_MODEL      向量模型 (默认 bge-m3)
 */

import 'dotenv/config';
import path from 'path';
import fs from 'fs';

// 加载 .env.local 覆盖
const __filename = new URL(import.meta.url).pathname;
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const envLocal = path.join(projectRoot, '.env.local');
if (fs.existsSync(envLocal)) {
  const content = fs.readFileSync(envLocal, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const idx = trimmed.indexOf('=');
      const key = trimmed.substring(0, idx).trim();
      if (!process.env[key]) process.env[key] = trimmed.substring(idx + 1).trim();
    }
  }
}

// ── 配置 ──────────────────────────────────────────
const BATCH_SIZE = Math.max(1, parseInt(process.env.BATCH_SIZE || '500', 10));
const OLLAMA_URL = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/+$/, '');
const EMBED_MODEL = process.env.EMBED_MODEL || process.env.OLLAMA_EMBEDDING_MODEL || 'bge-m3';
const MAX_TEXT_LEN = 8000;

// ── Ollama 批量 API ──────────────────────────────
async function ollamaEmbed(texts: string[]): Promise<number[][]> {
  const res = await fetch(`${OLLAMA_URL}/api/embed`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: EMBED_MODEL, input: texts }),
    signal: AbortSignal.timeout(180_000),
  });
  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`Ollama ${res.status}: ${err.substring(0, 200)}`);
  }
  const data = await res.json();
  return data.embeddings || [];
}

// ── 初始化检查 ────────────────────────────────────
async function checkConnections(supabase: any) {
  // DB
  const { count, error } = await supabase
    .from('knowledge_items')
    .select('*', { count: 'exact', head: true })
    .is('embedding', null);
  if (error) throw new Error(`DB: ${error.message}`);
  console.log(`[embed_batch] DB OK — ${count} items pending`);

  // Ollama
  const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
  if (!res.ok) throw new Error(`Ollama unreachable: ${res.status}`);
  const { models } = await res.json() as any;
  const found = models?.find((m: any) => m.name?.startsWith(EMBED_MODEL.replace(':latest', '')));
  if (!found) throw new Error(`Model "${EMBED_MODEL}" not found. Available: ${models?.map((m:any)=>m.name).join(', ')}`);
  console.log(`[embed_batch] Ollama OK — model "${EMBED_MODEL}" ready`);

  return count || 0;
}

// ── 主循环 ───────────────────────────────────────
async function main() {
  // 惰性导入：避免顶层 await（tsx/esbuild CJS 限制）
  const { getSupabaseClient } = await import('../src/storage/database/local-db.js');
  const supabase = getSupabaseClient();
  const pendingInitial = await checkConnections(supabase);
  if (pendingInitial === 0) {
    console.log('[embed_batch] Nothing to do.');
    return;
  }

  let done = 0, failed = 0;
  const t0 = Date.now();
  let lastT = t0, lastDone = 0;

  console.log(`[embed_batch] Starting | batch=${BATCH_SIZE} | target=${pendingInitial}`);

  while (true) {
    // 取一批待处理条目
    const { data: items, error } = await supabase
      .from('knowledge_items')
      .select('id, content, title, modality, metadata')
      .is('embedding', null)
      .order('id', { ascending: true })
      .limit(BATCH_SIZE);

    if (error) {
      console.error(`[embed_batch] Query error: ${error.message}`);
      await sleep(3000);
      continue;
    }

    if (!items || items.length === 0) break; // 全部完成

    // ── 分类：文本批量 / 图片单独 ──
    const textBatch: { id: string; text: string }[] = [];

    for (const item of items) {
      // 图片：用标题直接向量化（不做 vision 避免过慢）
      if (item.modality === 'image') {
        const title = (item.title || 'image').substring(0, MAX_TEXT_LEN);
        try {
          const [emb] = await ollamaEmbed([title]);
          if (emb?.length) {
            const { error: upErr } = await supabase.rpc('update_embedding', {
              item_id: item.id, embedding_vector: emb,
            });
            if (upErr) failed++; else done++;
          }
        } catch { failed++; }
        continue;
      }

      // 空内容跳过
      const content = item.content;
      if (!content || !content.trim()) continue;

      textBatch.push({
        id: item.id,
        text: content.length > MAX_TEXT_LEN ? content.substring(0, MAX_TEXT_LEN) : content,
      });
    }

    // ── 批量嵌入 ──
    if (textBatch.length > 0) {
      try {
        const embeddings = await ollamaEmbed(textBatch.map(t => t.text));

        // 并发写回 DB（限制并发数避免压垮连接池）
        const CONCURRENCY = 20;
        let doneCount = 0, failCount = 0;

        for (let chunk = 0; chunk < textBatch.length; chunk += CONCURRENCY) {
          const slice = textBatch.slice(chunk, chunk + CONCURRENCY);
          const results = await Promise.allSettled(
            slice.map(async (tb, j) => {
              const emb = embeddings[chunk + j];
              if (!emb || emb.length === 0) return 'skip' as const;
              const { error } = await supabase.rpc('update_embedding', {
                item_id: tb.id,
                embedding_vector: emb,
              });
              if (error) throw error;
              return 'ok' as const;
            })
          );
          for (const r of results) {
            if (r.status === 'fulfilled' && r.value === 'ok') doneCount++;
            else failCount++;
          }
        }
        done += doneCount;
        failed += failCount;
      } catch (e) {
        console.error(`[embed_batch] Embed error: ${e instanceof Error ? e.message : e}`);
        await sleep(2000);
      }
    }

    // ── 进度 ──
    const now = Date.now();
    const gap = (now - lastT) / 1000;
    if (gap >= 3) {
      const recent = done - lastDone;
      const rate = Math.round(recent / gap);
      const avgRate = Math.round(done / ((now - t0) / 1000));
      const pct = ((done / pendingInitial) * 100).toFixed(1);
      console.log(`[embed_batch] ${done}/${pendingInitial} (${pct}%) | ${rate}/s | avg ${avgRate}/s | fail=${failed}`);
      lastT = now;
      lastDone = done;
    }
  }

  const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`[embed_batch] DONE — ${done} embedded, ${failed} failed in ${elapsed}s`);
}

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

main().catch(e => { console.error('[embed_batch] FATAL:', e); process.exit(1); });
