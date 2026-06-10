import { config } from 'dotenv';
import { readFileSync } from 'fs';
import { homedir } from 'os';
import { join } from 'path';

// 优先加载.env.local，然后加载.env
config({ path: '.env.local', override: true });
config({ override: false });

// 尝试从 Coze 配置文件加载 API 凭据（用于 Embedding/LLM 调用）
function loadCozeCredentials() {
  // 如果已配置则跳过
  if (process.env.COZE_API_BASE_URL && process.env.COZE_API_KEY) return;

  try {
    const cozeConfigPath = join(homedir(), '.coze', 'config.json');
    const cozeConfig = JSON.parse(readFileSync(cozeConfigPath, 'utf-8'));
    if (cozeConfig.accessToken && !process.env.COZE_API_KEY) {
      process.env.COZE_API_KEY = cozeConfig.accessToken;
      console.log('[Server] Loaded Coze API key from ~/.coze/config.json');
    }
  } catch {}

  if (!process.env.COZE_API_BASE_URL) {
    process.env.COZE_API_BASE_URL = 'https://api.coze.cn';
  }
}
loadCozeCredentials();

// 强制使用本地PostgreSQL配置（覆盖外部环境变量）
// 删除云数据库配置，强制使用本地
delete process.env.DATABASE_URL;
delete process.env.PGDATABASE_URL;
process.env.FORCE_LOCAL_PG = 'true';  // 强制标志
process.env.PGHOST = 'localhost';
process.env.PGPORT = '5432';
process.env.PGUSER = 'shiprag';
process.env.PGPASSWORD = 'shiprag123';
process.env.PGDATABASE = 'shiprag';
console.log('[DB] Force local PostgreSQL:', process.env.PGHOST, process.env.PGDATABASE);

import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';

const dev = process.env.COZE_PROJECT_ENV !== 'PROD';
const hostname = process.env.HOSTNAME || 'localhost';
const port = parseInt(process.env.PORT || '5000', 10);

// Create Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('Internal server error');
    }
  });
  server.once('error', err => {
    console.error(err);
    process.exit(1);
  });
  server.listen(port, () => {
    console.log(
      `> Server listening at http://${hostname}:${port} as ${
        dev ? 'development' : process.env.COZE_PROJECT_ENV
      }`,
    );
  });
});
