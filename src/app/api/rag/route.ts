/**
 * RAG API — LangGraph 工作流引擎驱动
 *
 * 与旧版保持完全兼容的 API 契约，核心管线使用 LangChain + LangGraph 实现。
 * 请求格式、响应格式、SSE 流式输出均与旧版一致。
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/local-db';
import { runWorkflow, runWorkflowStream } from '@/lib/workflow/engine';
import type { WorkflowResult } from '@/lib/workflow/engine';

// ═══════════════════════════════════════════════════════
// 请求/响应类型（与旧版兼容）
// ═══════════════════════════════════════════════════════
interface RagRequest {
  query: string;
  modality?: string;
  topK?: number;
  stream?: boolean;
  noLimit?: boolean;
  sessionId?: string;
  history?: Array<{ role: 'user' | 'assistant'; content: string }>;
  lockContext?: boolean;
  clearContext?: boolean;
  responseMode?: 'brief' | 'detailed';
  commandType?: string;
}

// ═══════════════════════════════════════════════════════
// 对话上下文管理（保留旧版逻辑）
// ═══════════════════════════════════════════════════════
async function updateContextAfterResponse(
  sessionId: string | undefined,
  query: string,
  answer: string
): Promise<void> {
  if (!sessionId) return;
  const supabase = getSupabaseClient();
  try {
    const { data: existing } = await supabase
      .from('conversation_contexts')
      .select('context_data, tokens_used').eq('session_id', sessionId).single();
    const ctx = (existing?.context_data || {}) as Record<string, any>;
    const messages = (ctx.messages || []) as Array<{ role: string; content: string; time: string }>;
    messages.push(
      { role: 'user', content: query, time: new Date().toISOString() },
      { role: 'assistant', content: answer.substring(0, 3000), time: new Date().toISOString() }
    );
    await supabase.from('conversation_contexts').upsert({
      session_id: sessionId, context_type: 'rag',
      context_data: { messages, title: query.substring(0, 50) },
      tokens_used: messages.reduce((s, m) => s + Math.ceil(m.content.length / 4), 0),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'session_id' });
  } catch { /* harmless */ }
}

// ═══════════════════════════════════════════════════════
// 加载对话历史（多轮对话上下文）
// ═══════════════════════════════════════════════════════
async function loadContextFromDB(sessionId: string): Promise<Array<{ role: 'user' | 'assistant'; content: string }>> {
  const supabase = getSupabaseClient();
  try {
    const { data } = await supabase
      .from('conversation_contexts')
      .select('context_data').eq('session_id', sessionId).single();
    const messages = (data?.context_data as any)?.messages || [];
    return messages.slice(-6); // 最近3轮
  } catch { return []; }
}

// ═══════════════════════════════════════════════════════
// POST /api/rag
// ═══════════════════════════════════════════════════════
export async function POST(request: NextRequest) {
  const body: RagRequest = await request.json().catch(() => ({}));
  const { query, modality, topK, stream = true, sessionId, history } = body;

  if (!query?.trim()) {
    return NextResponse.json({ error: '缺少查询内容' }, { status: 400 });
  }

  // 清空上下文
  if (body.clearContext && sessionId) {
    const supabase = getSupabaseClient();
    await supabase.from('conversation_contexts').delete().eq('session_id', sessionId);
  }

  // 从 DB 加载历史（如果前端未传入且 sessionId 存在）
  const mergedHistory = history?.length ? history : sessionId ? await loadContextFromDB(sessionId) : [];

  const input = { query, sessionId, history: mergedHistory, topK: topK || 5, modality };

  if (stream) {
    return handleStreamResponse(input);
  }
  return handleNonStreamResponse(input);
}

// ═══════════════════════════════════════════════════════
// 流式响应 (SSE) — 兼容旧版 protocol
// ═══════════════════════════════════════════════════════
async function handleStreamResponse(input: Parameters<typeof runWorkflow>[0]) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let searchSent = false;
      let sqlSent = false;

      const result = await runWorkflowStream(input, {
        onSearchResults(results) {
          if (results?.length && !searchSent) {
            searchSent = true;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'search', results: results.slice(0, 10) })}\n\n`)
            );
          }
        },
        onSQL(sql) {
          if (sql && !sqlSent) {
            sqlSent = true;
            controller.enqueue(
              encoder.encode(`data: ${JSON.stringify({ type: 'sql', sql })}\n\n`)
            );
          }
        },
        onContent(chunk) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'content', text: chunk, delta: true })}\n\n`)
          );
        },
        onNode(nodeName) {
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ type: 'node', node: nodeName })}\n\n`)
          );
        },
        onDone() {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'done' })}\n\n`));
          controller.close();
        },
      });

      // 保存对话上下文
      await updateContextAfterResponse(
        input.sessionId, input.query,
        `${result.answer}${result.sql ? `\n[SQL: ${result.sql}]` : ''}`
      );
      // 保存历史记录
      await fetch(`http://localhost:5000/api/history`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'rag', query: input.query,
          answer: result.answer?.substring(0, 5000),
          modality: input.modality, resultCount: result.searchResults?.length || 0,
        }),
      }).catch(() => {});
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Workflow-Engine': 'langgraph-v1',
    },
  });
}

// ═══════════════════════════════════════════════════════
// 非流式响应
// ═══════════════════════════════════════════════════════
async function handleNonStreamResponse(
  input: Parameters<typeof runWorkflow>[0]
): Promise<NextResponse> {
  const result: WorkflowResult = await runWorkflow(input);

  await updateContextAfterResponse(
    input.sessionId, input.query,
    `${result.answer}${result.sql ? `\n[SQL: ${result.sql}]` : ''}`
  );
  // 保存历史记录
  fetch('http://localhost:5000/api/history', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'rag', query: input.query,
      answer: result.answer?.substring(0, 5000),
      modality: input.modality, resultCount: result.searchResults?.length || 0,
    }),
  }).catch(() => {});

  const resp: Record<string, any> = {
    success: result.success,
    query: input.query,
    route: result.route,
    answer: result.answer,
    searchResults: result.searchResults,
  };

  if (result.sql) resp.sql = result.sql;
  if (result.nodeTimings) resp.timings = result.nodeTimings;
  if (result.errors?.length) resp.errors = result.errors;

  return NextResponse.json(resp);
}
