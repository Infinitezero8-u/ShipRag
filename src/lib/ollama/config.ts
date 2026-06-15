/**
 * OllamaConfig — 本地 Ollama 配置, 替换原 coze-coding-dev-sdk 的 Config 类。
 *
 * 构造器与旧 `new Config()` 完全兼容（无参调用即可使用默认值）。
 * 可通过环境变量 OLLAMA_BASE_URL 自定义 Ollama 服务地址。
 */

export interface OllamaConfigOptions {
  baseUrl?: string;
  defaultModel?: string;
  fallbackModel?: string;
  embeddingModel?: string;
}

export class OllamaConfig {
  readonly baseUrl: string;
  readonly defaultModel: string;
  readonly fallbackModel: string;
  readonly embeddingModel: string;

  constructor(options?: OllamaConfigOptions) {
    this.baseUrl = options?.baseUrl
      || process.env.OLLAMA_BASE_URL
      || 'http://localhost:11434';
    this.defaultModel = options?.defaultModel
      || process.env.OLLAMA_DEFAULT_MODEL
      || 'qwen2.5:7b';
    this.fallbackModel = options?.fallbackModel
      || process.env.OLLAMA_FALLBACK_MODEL
      || 'qwen2.5:3b';
    this.embeddingModel = options?.embeddingModel
      || process.env.OLLAMA_EMBEDDING_MODEL
      || 'bge-m3';
  }
}

// 别名导出，让路由文件可以用 `import { OllamaConfig as Config }` 替换原 SDK
export { OllamaConfig as Config };
