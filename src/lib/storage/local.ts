/**
 * LocalStorage — 本地文件系统存储，替换原 coze-coding-dev-sdk 的 S3Storage。
 *
 * 文件存储在 public/uploads/ 下，可通过 Next.js 静态文件服务直接访问。
 *
 * 与旧 S3Storage 兼容的 API:
 *   uploadFile({ fileContent, fileName, contentType }) → Promise<string> (key)
 *   generatePresignedUrl({ key, expireTime })         → Promise<string> (URL)
 *   deleteFile({ fileKey })                           → Promise<void>
 */

import { promises as fs } from 'fs';
import path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch {
    // 忽略已存在错误
  }
}

export class LocalStorage {
  // 接受并忽略原 S3Storage 配置参数，保持构造器兼容
  constructor(_config?: Record<string, unknown>) {
    // no-op: 本地存储不需要 endpoint / accessKey 等
  }

  /**
   * 上传文件到 public/uploads/
   * @returns 文件相对路径 (key)
   */
  async uploadFile(params: {
    fileContent: Buffer;
    fileName: string;
    contentType?: string;
  }): Promise<string> {
    const destDir = path.join(UPLOAD_DIR, path.dirname(params.fileName));
    await ensureDir(destDir);

    const destPath = path.join(UPLOAD_DIR, params.fileName);
    await fs.writeFile(destPath, params.fileContent);

    // 返回相对路径作为 key
    return params.fileName;
  }

  /**
   * 生成预签名 URL — 本地模式下直接返回静态文件路径。
   * expireTime 参数被忽略（本地文件无过期机制）。
   */
  async generatePresignedUrl(params: {
    key: string;
    expireTime?: number;
  }): Promise<string> {
    return `/uploads/${params.key}`;
  }

  /**
   * 删除文件
   */
  async deleteFile(params: { fileKey: string }): Promise<void> {
    const filePath = path.join(UPLOAD_DIR, params.fileKey);
    try {
      await fs.unlink(filePath);
    } catch {
      // 文件可能不存在，忽略
    }
  }
}

// 别名导出
export { LocalStorage as S3Storage };
