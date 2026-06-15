/**
 * HeaderUtils — no-op 替换原来的 coze-coding-dev-sdk HeaderUtils。
 * 原 SDK 用于提取 Coze 平台专用的追踪/转发头，本地 Ollama 不需要。
 */
export class HeaderUtils {
  /**
   * 返回空对象，保持与原 API 兼容。
   * 原方法签名：extractForwardHeaders(headers: Headers): Record<string, string>
   */
  static extractForwardHeaders(_headers?: Headers): Record<string, string> {
    return {};
  }
}
