/**
 * 本地嵌入模块 — 替代 coze-coding-dev-sdk 的 EmbeddingClient
 * 通过调用 Python 脚本在本地生成向量，无需 Coze 平台运行时
 *
 * 使用异步 spawn 以免阻塞 Node.js 事件循环
 */
import { spawn } from 'child_process';
import path from 'path';
import fs from 'fs';

const EMBED_DIM = 1536;

const SCRIPT_PATH = path.join(process.cwd(), 'scripts', 'embed_text.py');

/** 运行 Python 脚本并返回 JSON */
function runScript(args: string[], input?: string, timeoutMs = 120000): Promise<any> {
  return new Promise((resolve, reject) => {
    const child = spawn('python3', [SCRIPT_PATH, ...args], {
      stdio: input ? ['pipe', 'pipe', 'pipe'] : ['ignore', 'pipe', 'pipe'],
      timeout: timeoutMs,
    });

    let stdout = '';
    let stderr = '';

    child.stdout?.on('data', (d: Buffer) => { stdout += d.toString(); });
    child.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });

    if (input && child.stdin) {
      child.stdin.write(input);
      child.stdin.end();
    }

    child.on('close', (code) => {
      if (code !== 0) {
        // 首次模型下载提示
        if (stderr.includes('Downloading') || stderr.includes('Progress')) {
          console.log('[local-embed] 正在下载嵌入模型（首次运行，约 120MB）...');
        }
        reject(new Error(`嵌入脚本 exit code ${code}: ${stderr.slice(-200)}`));
        return;
      }
      try {
        const parsed = JSON.parse(stdout.trim());
        if (parsed.error) {
          reject(new Error(parsed.error));
        } else {
          resolve(parsed);
        }
      } catch {
        reject(new Error(`无法解析嵌入脚本输出: ${stdout.slice(-200)}`));
      }
    });

    child.on('error', (err) => {
      reject(new Error(`无法启动嵌入脚本: ${err.message}`));
    });
  });
}

/** 嵌入文本，返回 1536 维向量 */
export async function embedText(text: string): Promise<number[]> {
  if (!fs.existsSync(SCRIPT_PATH)) {
    throw new Error(`嵌入脚本不存在: ${SCRIPT_PATH}`);
  }
  const result = await runScript([], text, 90000);
  return result.embedding;
}

/** 批量嵌入文本 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!fs.existsSync(SCRIPT_PATH)) {
    throw new Error(`嵌入脚本不存在: ${SCRIPT_PATH}`);
  }
  const result = await runScript(['--batch', ...texts], undefined, 180000);
  return result.embeddings;
}

/** 用 markitdown 解析文件并嵌入文本内容 */
export async function embedFile(filePath: string): Promise<number[]> {
  if (!fs.existsSync(SCRIPT_PATH)) {
    throw new Error(`嵌入脚本不存在: ${SCRIPT_PATH}`);
  }
  const result = await runScript(['--file', filePath], undefined, 180000);
  return result.embedding;
}

/** 嵌入图片 URL（markitdown OCR → 文本 → 向量） */
export async function embedImage(url: string): Promise<number[]> {
  if (!fs.existsSync(SCRIPT_PATH)) {
    throw new Error(`嵌入脚本不存在: ${SCRIPT_PATH}`);
  }
  const result = await runScript(['--image-url', url], undefined, 180000);
  return result.embedding;
}

/** 余弦相似度 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dotProduct = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
