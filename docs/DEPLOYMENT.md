# ShipRag 部署运维文档

## 部署架构

```
┌─────────────────────────────────────────────────────┐
│                    用户浏览器/手机                     │
│                  http://101.32.186.47                │
└─────────────────────┬───────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────┐
│             ☁️ 腾讯云香港 (Tencent Cloud HK)          │
│      Ubuntu 24.04 LTS — 2核/2GB — 101.32.186.47     │
│                                                       │
│  ┌───────────────────────────────────────────────┐  │
│  │                  nginx :80                      │  │
│  │  ├── 静态页面 (HTML/JS/CSS) → 本机硬盘 <1ms     │  │
│  │  ├── _next/static/         → 本机硬盘 <1ms     │  │
│  │  └── /api/* (动态请求)     → SSH 隧道 → Mac    │  │
│  └───────────────────────────────────────────────┘  │
│                         │                            │
│              SSH Reverse Tunnel :17001               │
│                         │                            │
│  ┌──────────────────────────────────────────────┐  │
│  │              frps (备用) :17000                │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
                      │ SSH Tunnel
                      ▼
┌─────────────────────────────────────────────────────┐
│                💻 本地 Mac (开发机)                    │
│                                                       │
│  ┌──────────────────────────────────────────────┐  │
│  │           Next.js Server :5000                 │  │
│  │           node dist/server.js                  │  │
│  └──────────────┬───────────────────────────────┘  │
│                 │                                     │
│  ┌──────────────▼───────────────────────────────┐  │
│  │       PostgreSQL 17 + pgvector                │  │
│  │       localhost:5432 / database: shiprag      │  │
│  └──────────────────────────────────────────────┘  │
│                                                       │
│  ┌──────────────────────────────────────────────┐  │
│  │       autossh (SSH 隧道守护进程)                │  │
│  │       -R 127.0.0.1:17001 → 127.0.0.1:5000     │  │
│  └──────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────┘
```

---

## 环境要求

### 云服务器

- Ubuntu 24.04 LTS
- nginx 1.24+
- SSH 服务 + GatewayPorts 启用
- 防火墙放行: `80/tcp`, `443/tcp`

### 本地开发机 (Mac)

- Node.js ≥ 20
- pnpm ≥ 9
- PostgreSQL 17 + pgvector 扩展
- autossh (隧道自动重连)
- frpc v0.61+ (备用)

---

## 首次部署步骤

### 1. 数据库准备

```bash
# 启动 PostgreSQL
brew services start postgresql@17

# 创建数据库和用户
psql -U eonl -d postgres <<SQL
CREATE USER shiprag WITH PASSWORD 'shiprag123';
CREATE DATABASE shiprag OWNER shiprag;
GRANT ALL PRIVILEGES ON DATABASE shiprag TO shiprag;
SQL

# 启用 pgvector 扩展
psql -U eonl -d shiprag -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

### 2. 安装依赖

```bash
cd /path/to/workspace
pnpm install
```

### 3. 构建项目

```bash
# 完整构建 (依赖安装 + Next.js + tsup)
bash scripts/build.sh

# 或分步执行
pnpm install
pnpm next build
pnpm tsup src/server.ts --format cjs --platform node --target node20 --outDir dist --no-splitting --no-minify
```

### 4. 启动服务

```bash
# 生产模式
PORT=5000 COZE_PROJECT_ENV=PROD node dist/server.js &

# 开发模式
pnpm dev
```

### 5. 部署到云服务器

```bash
# 1. 配置 SSH 免密登录
ssh-copy-id ubuntu@101.32.186.47

# 2. 拷贝构建产物到云服务器
rsync -avz .next/ ubuntu@101.32.186.47:/tmp/shiprag-next/
rsync -avz public/ ubuntu@101.32.186.47:/tmp/shiprag-public/

# 3. 配置云服务器 nginx
cat > /tmp/shiprag-nginx.conf << 'EOF'
server {
    listen 80 default_server;
    root /tmp/shiprag-next/server/app;
    index index.html;

    location /_next/static/ {
        alias /tmp/shiprag-next/static/;
        expires 30d;
        add_header Cache-Control "public, immutable";
    }

    location /api/ {
        proxy_pass http://127.0.0.1:17001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_read_timeout 120s;
    }

    location ~ \.rsc$ {
        proxy_pass http://127.0.0.1:17001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
    }

    location / {
        try_files $uri $uri.html $uri/index.html @tunnel;
    }

    location @tunnel {
        proxy_pass http://127.0.0.1:17001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
EOF

scp /tmp/shiprag-nginx.conf ubuntu@101.32.186.47:/tmp/
ssh ubuntu@101.32.186.47 "
  sudo cp /tmp/shiprag-nginx.conf /etc/nginx/sites-available/shiprag
  sudo ln -sf /etc/nginx/sites-available/shiprag /etc/nginx/sites-enabled/
  sudo nginx -t && sudo systemctl reload nginx
"

# 4. 建立 SSH 反向隧道
autossh -M 0 -f \
  -o "ServerAliveInterval=30" -o "ServerAliveCountMax=3" \
  -o "StrictHostKeyChecking=no" -o "ExitOnForwardFailure=yes" \
  -N -R 127.0.0.1:17001:127.0.0.1:5000 \
  ubuntu@101.32.186.47
```

---

## 运维命令

### 检查服务状态

```bash
# 本地 Next.js
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1:5000

# SSH 隧道
ps aux | grep 'autossh.*17001'

# 云服务器 nginx
ssh ubuntu@101.32.186.47 'curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1/'

# 公网访问
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://101.32.186.47/
```

### 重启隧道

```bash
# 杀掉旧隧道
pkill -f 'autossh.*17001'
pkill -f 'ssh.*17001.*5000'

# 重新建立
autossh -M 0 -f \
  -o "ServerAliveInterval=30" -o "ServerAliveCountMax=3" \
  -o "StrictHostKeyChecking=no" -o "ExitOnForwardFailure=yes" \
  -N -R 127.0.0.1:17001:127.0.0.1:5000 \
  ubuntu@101.32.186.47
```

### 更新云服务器静态文件

```bash
# 重新构建本地项目后
pnpm build

# 同步到云服务器
rsync -avz --exclude='cache' \
  .next/ ubuntu@101.32.186.47:/tmp/shiprag-next/
rsync -avz \
  public/ ubuntu@101.32.186.47:/tmp/shiprag-public/
```

### 查看日志

```bash
# Next.js 日志
tail -f /tmp/shiprag-server.log

# 云服务器 nginx 访问日志
ssh ubuntu@101.32.186.47 'sudo tail -f /var/log/nginx/access.log'

# 云服务器 nginx 错误日志
ssh ubuntu@101.32.186.47 'sudo tail -f /var/log/nginx/error.log'
```

### 数据库备份

```bash
pg_dump -U shiprag -h localhost shiprag > shiprag_backup_$(date +%Y%m%d).sql
```

### 数据库恢复

```bash
psql -U shiprag -h localhost shiprag < shiprag_backup_20260609.sql
```

---

## 故障排查

### 手机无法访问

```bash
# 1. 检查本地服务
curl http://127.0.0.1:5000    # 应返回 HTTP 200

# 2. 检查 SSH 隧道
ssh ubuntu@101.32.186.47 'sudo ss -tlnp | grep 17001'
# 应显示 sshed 在 :17001 监听

# 3. 检查 nginx
ssh ubuntu@101.32.186.47 'curl -s -o /dev/null -w "HTTP %{http_code}\n" http://127.0.0.1/'
# 应返回 HTTP 200

# 4. 测试外部访问
curl -s -o /dev/null -w "HTTP %{http_code}\n" http://101.32.186.47/
```

### 隧道断开

```bash
# 检查 autossh 进程
ps aux | grep autossh

# 如果不在运行，手动重建
autossh -M 0 -f \
  -o "ServerAliveInterval=30" \
  -o "ExitOnForwardFailure=yes" \
  -N -R 127.0.0.1:17001:127.0.0.1:5000 \
  ubuntu@101.32.186.47
```

### 端口被占用

```bash
# 本地
lsof -i :5000    # 查看
kill -9 <PID>    # 释放

# 云服务器
ssh ubuntu@101.32.186.47 'sudo lsof -i :17001'
ssh ubuntu@101.32.186.47 'sudo fuser -k 17001/tcp'
```

### nginx 配置问题

```bash
ssh ubuntu@101.32.186.47 '
  sudo nginx -t                        # 测试配置
  sudo systemctl reload nginx          # 重载
  sudo systemctl restart nginx         # 重启
  sudo journalctl -u nginx -f          # 查看日志
'
```

---

## 安全建议

1. **SSH 密钥认证**: 使用 Ed25519 密钥，禁用密码登录
2. **防火墙**: 仅开放必要的端口 (80, 443, 22)
3. **HTTPS**: 建议添加 Let's Encrypt SSL 证书
4. **数据库**: 限制 PostgreSQL 仅监听 localhost
5. **环境变量**: `.env.local` 不要提交到版本控制

---

## 云服务器信息

| 项目 | 值 |
|------|-----|
| 公网 IP | 101.32.186.47 |
| 系统 | Ubuntu 24.04 LTS |
| 配置 | 2核 / 2GB |
| 地域 | 香港 (Tencent Cloud) |
| SSH 用户 | ubuntu |
| nginx 配置 | /etc/nginx/sites-available/shiprag |
| 静态文件 | /tmp/shiprag-next/ /tmp/shiprag-public/ |
| 隧道侦听 | 127.0.0.1:17001 → Mac:5000 |
