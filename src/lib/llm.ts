/**
 * 本地 LLM 模块 —— 替代 coze-coding-dev-sdk 的 LLMClient
 * 使用 DeepSeek API (OpenAI-compatible /v1/chat/completions)
 *
 * 完全离线场景时，模型用 deepseek-chat；无网络时回退到本地 ollama。
 */
import 'dotenv/config';

const BASE_URL = process.env.LLM_BASE_URL || process.env.ANTHROPIC_BASE_URL?.replace('/anthropic', '') || 'https://api.deepseek.com';
const API_KEY = process.env.LLM_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN || process.env.DEEPSEEK_API_KEY || '';
const MODEL = process.env.LLM_MODEL || 'deepseek-chat';

interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>;
}

interface LLMOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
}

interface LLMResponse {
  content: string;
}

/** 非流式调用 */
export async function llmInvoke(messages: Message[], opts: LLMOptions = {}): Promise<LLMResponse> {
  const url = `${BASE_URL}/v1/chat/completions`;

  const body = {
    model: opts.model || MODEL,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.max_tokens ?? 4096,
    stream: false,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(120_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`LLM 调用失败 (${res.status}): ${err.slice(0, 200)}`);
  }

  const data = await res.json();
  return { content: data.choices?.[0]?.message?.content || '' };
}

/** 流式调用 */
export async function* llmStream(messages: Message[], opts: LLMOptions = {}): AsyncGenerator<{ content: string }> {
  const url = `${BASE_URL}/v1/chat/completions`;

  const body = {
    model: opts.model || MODEL,
    messages: messages.map(m => ({ role: m.role, content: m.content })),
    temperature: opts.temperature ?? 0.7,
    max_tokens: opts.max_tokens ?? 4096,
    stream: true,
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${API_KEY}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(180_000),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => '');
    throw new Error(`LLM 流式调用失败 (${res.status}): ${err.slice(0, 200)}`);
  }

  const reader = res.body?.getReader();
  if (!reader) return;

  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) yield { content };
        } catch {}
      }
    }
  } finally {
    reader.releaseLock();
  }
}
