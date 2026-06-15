/**
 * OllamaLLMClient — 基于 Ollama HTTP API 的 LLM 客户端。
 * 替换原 coze-coding-dev-sdk 的 LLMClient。
 *
 * API:
 *   invoke(messages, options?) → { content: string }
 *   stream(messages, options?) → AsyncGenerator<{ content: string, done: boolean }>
 *
 * 与旧 SDK 兼容:
 *   - new LLMClient()          → 使用默认配置
 *   - new LLMClient(config)    → 使用自定义配置
 *   - new LLMClient(config, customHeaders) → 带自定义头（本地部署会忽略 headers）
 */

import { OllamaConfig } from './config';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | Array<{
    type: 'text' | 'image_url';
    text?: string;
    image_url?: { url: string };
  }>;
}

export interface InvokeOptions {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
}

export interface InvokeResponse {
  content: string;
  model?: string;
  total_duration?: number;
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

export class OllamaLLMClient {
  private config: OllamaConfig;
  private _availableModels: Set<string> | null = null;

  constructor(config?: OllamaConfig, _customHeaders?: Record<string, string>) {
    this.config = config || new OllamaConfig();
  }

  /**
   * 非流式调用 — 匹配旧 LLMClient.invoke()
   */
  async invoke(
    messages: ChatMessage[],
    options?: InvokeOptions
  ): Promise<InvokeResponse> {
    const model = await this.resolveModel(options?.model);
    const resolvedMessages = await this.resolveMultimodalMessages(messages);

    const body: Record<string, unknown> = {
      model,
      messages: resolvedMessages,
      stream: false,
    };

    const ollamaOptions: Record<string, unknown> = {};
    if (options?.temperature !== undefined) ollamaOptions.temperature = options.temperature;
    if (options?.max_tokens !== undefined) ollamaOptions.num_predict = options.max_tokens;
    if (options?.top_p !== undefined) ollamaOptions.top_p = options.top_p;
    if (Object.keys(ollamaOptions).length > 0) body.options = ollamaOptions;

    const res = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`Ollama chat error ${res.status}: ${errText}`);
    }

    const data = await res.json();
    return {
      content: data.message?.content || '',
      model: data.model,
      total_duration: data.total_duration,
    };
  }

  /**
   * 流式调用 — 匹配旧 LLMClient.stream()
   */
  async *stream(
    messages: ChatMessage[],
    options?: InvokeOptions
  ): AsyncGenerator<StreamChunk> {
    const model = await this.resolveModel(options?.model);
    const resolvedMessages = await this.resolveMultimodalMessages(messages);

    const body: Record<string, unknown> = {
      model,
      messages: resolvedMessages,
      stream: true,
    };

    const ollamaOptions: Record<string, unknown> = {};
    if (options?.temperature !== undefined) ollamaOptions.temperature = options.temperature;
    if (options?.max_tokens !== undefined) ollamaOptions.num_predict = options.max_tokens;
    if (options?.top_p !== undefined) ollamaOptions.top_p = options.top_p;
    if (Object.keys(ollamaOptions).length > 0) body.options = ollamaOptions;

    const res = await fetch(`${this.config.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(300_000),
    });

    if (!res.ok) {
      throw new Error(`Ollama chat stream error ${res.status}: ${await res.text().catch(() => '')}`);
    }

    const reader = res.body!.getReader();
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
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              yield { content: data.message.content, done: data.done || false };
            } else if (data.done) {
              yield { content: '', done: true };
            }
          } catch {
            // 跳过非 JSON 行
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ── 私有方法 ──────────────────────────────────────────────

  /**
   * 解析模型名：优先用请求指定的，否则用默认值。
   * 自动检测可用性，缺失时回退到 fallback 模型。
   */
  private async resolveModel(requested?: string): Promise<string> {
    const model = requested || this.config.defaultModel;
    await this.ensureModelsLoaded();
    if (this._availableModels?.has(model)) return model;
    // 回退
    if (
      model === this.config.defaultModel &&
      this._availableModels?.has(this.config.fallbackModel)
    ) {
      console.warn(`[ollama] 模型 "${model}" 未找到, 回退到 "${this.config.fallbackModel}"`);
      return this.config.fallbackModel;
    }
    return model; // 尝试使用，让 Ollama 返回具体错误
  }

  /**
   * 载入可用模型列表（仅首次）
   */
  private async ensureModelsLoaded(): Promise<void> {
    if (this._availableModels) return;
    try {
      const res = await fetch(`${this.config.baseUrl}/api/tags`);
      if (!res.ok) {
        this._availableModels = new Set();
        return;
      }
      const data = await res.json();
      this._availableModels = new Set(
        (data.models || []).map((m: { name: string }) => m.name)
      );
    } catch {
      this._availableModels = new Set();
    }
  }

  /**
   * 处理多模态消息中的图片（将 local URL / data URL 转 base64 并附到 Ollama images 字段）
   */
  private async resolveMultimodalMessages(
    messages: ChatMessage[]
  ): Promise<Array<{ role: string; content: string; images?: string[] }>> {
    const resolved: Array<{ role: string; content: string; images?: string[] }> = [];

    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        resolved.push({ role: msg.role, content: msg.content });
        continue;
      }

      // content 是数组（多模态）
      const texts: string[] = [];
      const images: string[] = [];

      for (const part of msg.content) {
        if (part.type === 'text' && part.text) {
          texts.push(part.text);
        } else if (part.type === 'image_url' && part.image_url?.url) {
          const base64 = await this.loadImageAsBase64(part.image_url.url);
          if (base64) images.push(base64);
        }
      }

      resolved.push({
        role: msg.role,
        content: texts.join('\n'),
        ...(images.length > 0 ? { images } : {}),
      });
    }

    return resolved;
  }

  /**
   * 从 URL 加载图片并转为 base64（去掉 data:xxx;base64, 前缀）
   */
  private async loadImageAsBase64(url: string): Promise<string | null> {
    try {
      // data URL
      if (url.startsWith('data:')) {
        const commaIdx = url.indexOf(',');
        return commaIdx >= 0 ? url.substring(commaIdx + 1) : url;
      }
      // 本地文件路径
      if (url.startsWith('/') || url.startsWith('./')) {
        const fs = await import('fs/promises');
        const path = await import('path');
        const filePath = path.isAbsolute(url) ? url : path.join(process.cwd(), 'public', url);
        const buffer = await fs.readFile(filePath);
        return buffer.toString('base64');
      }
      // HTTP(S) URL
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (!res.ok) return null;
      const buffer = Buffer.from(await res.arrayBuffer());
      return buffer.toString('base64');
    } catch {
      return null;
    }
  }
}

// 别名导出，供路由文件用 `import { OllamaLLMClient as LLMClient }` 替换旧 SDK
export { OllamaLLMClient as LLMClient };
