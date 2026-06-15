/**
 * OllamaEmbeddingClient — 基于 Ollama HTTP API 的 Embedding 客户端。
 * 替换原 coze-coding-dev-sdk 的 EmbeddingClient。
 *
 * 与旧 SDK 兼容的 API:
 *   embedText(text: string)                → Promise<number[]>
 *   embedTexts(texts: string[])            → Promise<number[][]>
 *   embedImage(imageUrl: string)           → Promise<number[]>  (两步: vision → text → embed)
 *
 * 默认使用 bge-m3 (1024 维)，可通过 OllamaConfig.embeddingModel 覆盖。
 */

import { OllamaConfig } from './config';
import { OllamaLLMClient } from './llm';

export class OllamaEmbeddingClient {
  private config: OllamaConfig;
  private embeddingModel: string;
  private _availableModels: Set<string> | null = null;

  constructor(config?: OllamaConfig, _customHeaders?: Record<string, string>) {
    this.config = config || new OllamaConfig();
    this.embeddingModel = this.config.embeddingModel;
  }

  /**
   * 单文本向量化
   */
  async embedText(text: string): Promise<number[]> {
    if (!text || text.trim().length === 0) {
      throw new Error('embedText: 文本内容为空');
    }

    const res = await fetch(`${this.config.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.embeddingModel, input: text }),
      signal: AbortSignal.timeout(60_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(
        `Ollama embed error ${res.status}: ${errText}. ` +
        `请确认模型 "${this.embeddingModel}" 已安装 (ollama pull ${this.embeddingModel})`
      );
    }

    const data = await res.json();
    const embedding = data.embeddings?.[0];
    if (!embedding || embedding.length === 0) {
      throw new Error('Ollama embed 返回空向量');
    }
    return embedding;
  }

  /**
   * 批量文本向量化
   */
  async embedTexts(texts: string[]): Promise<number[][]> {
    if (!texts || texts.length === 0) {
      throw new Error('embedTexts: 文本列表为空');
    }

    const res = await fetch(`${this.config.baseUrl}/api/embed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: this.embeddingModel, input: texts }),
      signal: AbortSignal.timeout(120_000),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(
        `Ollama embed error ${res.status}: ${errText}. ` +
        `请确认模型 "${this.embeddingModel}" 已安装 (ollama pull ${this.embeddingModel})`
      );
    }

    const data = await res.json();
    return data.embeddings || [];
  }

  /**
   * 图片向量化 — Ollama /api/embed 不支持图片直接嵌入。
   * 策略: 用 vision LLM 生成图片描述, 再对描述文本做 embedText。
   *
   * imageUrl 支持:
   *   - 本地文件路径 (/uploads/xxx.jpg)
   *   - HTTP(S) URL
   *   - data: URL
   */
  async embedImage(imageUrl: string): Promise<number[]> {
    if (!imageUrl) {
      throw new Error('embedImage: imageUrl 为空');
    }

    // 1. 读取图片为 base64
    let base64: string;
    if (imageUrl.startsWith('data:')) {
      const commaIdx = imageUrl.indexOf(',');
      base64 = commaIdx >= 0 ? imageUrl.substring(commaIdx + 1) : imageUrl;
    } else if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
      try {
        const res = await fetch(imageUrl, { signal: AbortSignal.timeout(30_000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const buffer = Buffer.from(await res.arrayBuffer());
        base64 = buffer.toString('base64');
      } catch (e) {
        throw new Error(`embedImage: 无法下载图片 ${imageUrl}: ${e instanceof Error ? e.message : e}`);
      }
    } else {
      // 本地文件
      try {
        const fs = await import('fs/promises');
        const path = await import('path');
        const filePath = path.isAbsolute(imageUrl)
          ? imageUrl
          : path.join(process.cwd(), 'public', imageUrl);
        const buffer = await fs.readFile(filePath);
        base64 = buffer.toString('base64');
      } catch (e) {
        throw new Error(`embedImage: 无法读取文件 ${imageUrl}: ${e instanceof Error ? e.message : e}`);
      }
    }

    // 2. 用 vision LLM 生成中文描述
    const llm = new OllamaLLMClient(this.config);
    const mimeType = this.detectMimeType(imageUrl);
    const result = await llm.invoke([
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: '请用中文详细描述这张图片的内容，包括关键信息、文字、数字、图表数据等。如果图片中包含表格或数据，请逐行描述。',
          },
          {
            type: 'image_url',
            image_url: { url: `data:${mimeType};base64,${base64}` },
          },
        ],
      },
    ]);

    const description = result.content || '无法识别的图片内容';

    // 3. 对描述文本做向量化
    return this.embedText(description);
  }

  // ── 私有方法 ──────────────────────────────────────────────

  private detectMimeType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase()?.split('?')[0]; // 去掉 query string
    const map: Record<string, string> = {
      png: 'image/png',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      gif: 'image/gif',
      webp: 'image/webp',
      bmp: 'image/bmp',
      svg: 'image/svg+xml',
      tiff: 'image/tiff',
    };
    return map[ext || ''] || 'image/jpeg';
  }
}

// 别名导出，供路由文件用 `import { OllamaEmbeddingClient as EmbeddingClient }` 替换旧 SDK
export { OllamaEmbeddingClient as EmbeddingClient };
