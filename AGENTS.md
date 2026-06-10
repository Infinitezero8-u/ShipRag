# ShipRag — 跨模态 RAG 知识检索系统

## 项目概述

ShipRag (Ship RAG) 是一个面向海事领域的跨模态知识检索与智能问答系统。支持文本、Excel、Word、PDF、Markdown、JSON、图片、网页、航迹数据的上传、解析、向量化、语义搜索和 AI 问答。

## 技术栈

- **Framework**: Next.js 16 (App Router) + React 19
- **Language**: TypeScript 5
- **UI**: shadcn/ui + Radix UI + Tailwind CSS v4
- **Database**: PostgreSQL 17 + pgvector 0.8 (向量扩展)
- **AI SDK**: coze-coding-dev-sdk (豆包 LLM + Embedding)
- **Package Manager**: pnpm 9+

## 目录结构

```
├── src/
│   ├── app/                           # Next.js App Router
│   │   ├── api/
│   │   │   ├── upload/route.ts        # 文件上传与解析
│   │   │   ├── embed/route.ts         # 向量化处理
│   │   │   ├── search/route.ts        # 语义检索
│   │   │   ├── rag/                   # RAG 问答体系
│   │   │   │   ├── route.ts           # 核心问答流水线
│   │   │   │   ├── classify/route.ts  # 问题分类 (SQL vs RAG)
│   │   │   │   ├── sql/route.ts       # NL → SQL 转换
│   │   │   │   └── sql-polish/route.ts # SQL 结果润色
│   │   │   ├── trajectory/            # 航迹数据 API
│   │   │   ├── regulations/route.ts   # 规章文档管理
│   │   │   ├── context/route.ts       # 对话上下文
│   │   │   ├── auto-research/route.ts # 自动深度研究
│   │   │   ├── workflow/              # 工作流编排
│   │   │   ├── settings/              # 系统设置
│   │   │   └── stats/route.ts         # 系统统计
│   │   ├── page.tsx                   # 主页
│   │   ├── dashboard/                 # 仪表盘
│   │   ├── manage/                    # 上传管理
│   │   ├── trajectory/                # 航迹标注
│   │   ├── trajectory-training/       # 航迹模型训练
│   │   ├── trajectory-inference/      # 航迹推理
│   │   ├── segment-label/             # 航段标注
│   │   ├── sea-chart/                 # 海图展示
│   │   ├── workflow/                  # 工作流
│   │   └── settings/                  # 系统设置
│   ├── components/ui/                 # shadcn/ui 组件 (50+)
│   ├── lib/
│   │   ├── parsers.ts                 # 文件解析模块
│   │   └── utils.ts                   # 工具函数
│   ├── storage/database/
│   │   ├── supabase-client.ts         # PostgreSQL 客户端
│   │   └── shared/
│   │       ├── schema.ts              # Drizzle ORM 表结构
│   │       └── relations.ts           # 表关系定义
│   ├── hooks/                         # 自定义 React Hooks
│   └── types/                         # TypeScript 类型定义
├── scripts/
│   ├── build.sh                       # 构建脚本
│   ├── dev.sh                         # 开发服务器
│   ├── start.sh                       # 生产服务器
│   ├── prepare.sh                     # 依赖安装
│   ├── validate.sh                    # 校验
│   ├── markitdown_converter.py        # MarkItDown 图片 OCR
│   └── ds-code.py                     # 深度学习工具
├── docs/
│   ├── SHIPRAG_GUIDE.md               # 使用指南
│   ├── DEPLOYMENT.md                  # 部署运维
│   ├── API_REFERENCE.md               # API 参考
│   └── ENC_INTEGRATION.md             # NOAA S-57 海图集成
├── public/                            # 静态资源
├── assets/                            # 项目资源
├── .env.local                         # 本地环境变量
├── package.json
├── next.config.ts
└── tsconfig.json
```

## 核心功能

### 1. 多模态文件上传
- 支持 .txt, .xlsx, .xls, .csv, .docx, .md, .json, .png, .jpg, .webp
- 网页 URL 抓取解析
- 图片自动 OCR 描述生成（MarkItDown + 豆包视觉模型）
- 内容自动标签生成

### 2. 向量化流水线
- Coze Embedding API → 1536 维向量
- 内容判重自动删除
- 支持图片向量化（MarkItDown → text → Embedding）
- 支持航迹数据向量化
- 批量/单条/重新向量化

### 3. 语义搜索
- 向量相似度搜索 (pgvector cos similarity)
- 精确关键词搜索（跨表 LIKE 查询）
- 标签过滤搜索
- 支持分页、模态/来源过滤
- 跨表联合搜索（knowledge_items + port_data + route_data + regulation_chunks）

### 4. RAG 智能问答
- **流式输出** (Server-Sent Events)
- **多轮对话** (会话上下文管理 + 128k token 自动压缩)
- **问题分类** → 统计类走 SQL，知识类走 RAG
- **Query 改写** → 代词还原 + 省略补全
- **检索不足兜底** → RAG 结果 < 3 条或平均相似度 < 0.6 时自动触发 SQL 补充
- **上下文锁定** → 支持锁定海域/海图范围
- **回答模式** → 精简/详细可切换
- **强制溯源** → 所有输出标注来源

### 5. 航迹数据处理
- 批量上传/去重/分割
- 行为分类 & 意图标注
- 航迹向量化
- 模型训练与推理
- 异常检测 & 聚类分析

### 6. 规章制度管理
- 文档上传与分片
- 按类别组织（海事规章/平台运维/航迹标注/模型训练）
- 分片向量化与检索

## 数据库核心表

| 表 | 用途 |
|---|------|
| `knowledge_items` | 知识库条目（含 embedding 向量列）|
| `file_uploads` | 文件上传记录 |
| `regulations` + `regulation_chunks` | 规章文档与分片（含向量）|
| `port_data` | 港口数据（含向量）|
| `route_data` | 航线数据（含向量）|
| `conversation_contexts` | 对话上下文 |
| `trajectories` + 相关表 | 航迹数据生态 |
| `tag_vectors` | 标签向量表 |

## 构建与运行

```bash
pnpm install              # 安装依赖
pnpm dev                  # 开发模式 (http://localhost:5000)
pnpm build                # 生产构建
pnpm start                # 生产启动
```

## 部署架构

本地 Mac (Next.js + PostgreSQL) ← SSH 反向隧道 → 腾讯云香港 (nginx + frps)

公网访问: `http://101.32.186.47`

详细部署说明见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## API 接口

| 模块 | 路径前缀 | 说明 |
|------|----------|------|
| 上传 | `/api/upload` | 文件上传、URL 解析 |
| 向量化 | `/api/embed` | 批量/单条向量化 |
| 搜索 | `/api/search` | 语义搜索、精确搜索 |
| 问答 | `/api/rag` | RAG 智能问答 + SQL 分支 |
| 航迹 | `/api/trajectory*` | 航迹全生命周期 |
| 规章 | `/api/regulations` | 规章文档 CRUD |
| 统计 | `/api/stats` | 系统运行统计 |

完整 API 文档见 [docs/API_REFERENCE.md](docs/API_REFERENCE.md)

## 参考文档

- [使用指南](docs/SHIPRAG_GUIDE.md)
- [部署运维](docs/DEPLOYMENT.md)
- [API 参考](docs/API_REFERENCE.md)
- [NOAA S-57 海图集成](docs/ENC_INTEGRATION.md)
