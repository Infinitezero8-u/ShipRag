/**
 * SimpleFetchClient — 简单网页抓取客户端，替换原 coze-coding-dev-sdk 的 FetchClient。
 *
 * 用原生 fetch + 简单 HTML 去标签提取文本，不需要浏览器渲染引擎。
 *
 * 与原 FetchClient 兼容:
 *   fetch(url: string) → Promise<{ status_code, status_message, content, title, publish_time, filetype }>
 */

export interface FetchResponse {
  status_code: number;
  status_message: string;
  content: Array<{ type: 'text'; text: string }>;
  title?: string;
  publish_time?: string;
  filetype?: string;
}

export class SimpleFetchClient {
  private headers: Record<string, string>;

  constructor(_config?: unknown, headers?: Record<string, string>) {
    this.headers = headers || {};
  }

  async fetch(url: string): Promise<FetchResponse> {
    try {
      const res = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
          ...this.headers,
        },
        signal: AbortSignal.timeout(30_000),
      });

      if (!res.ok) {
        return {
          status_code: res.status,
          status_message: res.statusText,
          content: [],
        };
      }

      const html = await res.text();

      // 提取 <title>
      const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const title = titleMatch?.[1]?.trim();

      // 简单去标签提取文本
      const text = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s+/g, ' ')
        .trim()
        .substring(0, 100_000);

      return {
        status_code: 0,
        status_message: 'OK',
        content: [{ type: 'text', text }],
        title,
        filetype: 'html',
      };
    } catch (error) {
      return {
        status_code: -1,
        status_message: error instanceof Error ? error.message : 'Unknown error',
        content: [],
      };
    }
  }
}

// 别名导出
export { SimpleFetchClient as FetchClient };
