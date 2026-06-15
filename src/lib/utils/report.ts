/**
 * Report 工具 — no-op 替换原来的 coze-coding-dev-sdk 遥测/报告函数。
 * 原 SDK 用 getReportBuffer 和 createWrappedFetch 监控 Supabase 请求。
 * 本地 Ollama 模式下不需要这些遥测能力。
 */

/**
 * 返回 null，原调用方在 supabase-client.ts 中已有 try/catch 保护。
 * 原方法签名：getReportBuffer(): ReportBuffer | null
 */
export function getReportBuffer(): null {
  return null;
}

/**
 * 返回原生 fetch，不进行任何包装。
 * 原方法签名：createWrappedFetch(buffer: ReportBuffer, label: string): typeof fetch
 */
export function createWrappedFetch(
  _buffer: unknown,
  _label: string
): typeof fetch {
  return fetch;
}
