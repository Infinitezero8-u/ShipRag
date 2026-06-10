# ShipRag 使用指南

> **跨模态 RAG 知识检索系统** — 海图知识智能问答平台

ShipRag (Ship RAG) 是一个支持多模态数据源的海事知识检索与智能问答系统。支持文本、Excel、Word、PDF、图片、JSON、航迹数据的上传、向量化、语义搜索和 AI 问答。

---

## 目录

- [系统概述](#系统概述)
- [快速开始](#快速开始)
- [页面导航](#页面导航)
- [核心工作流](#核心工作流)
- [API 接口速查](#api-接口速查)
- [数据库表结构](#数据库表结构)
- [工作原理](#工作原理)

---

## 系统概述

### 支持的数据类型

| 类型 | 扩展名 | 说明 |
|------|--------|------|
| 文本 | `.txt` | 纯文本文件 |
| Excel | `.xlsx` `.xls` `.csv` | 表格数据 |
| Word | `.docx` | 文档 |
| Markdown | `.md` | Markdown 文档 |
| JSON | `.json` | 结构化数据 |
| 图片 | `.png` `.jpg` `.gif` `.webp` | 使用 AI 生成描述后向量化 |
| 网页 | URL | 通过 URL 抓取并解析网页内容 |
| 航迹数据 | 自定义格式 | 海事航迹专用 |

### 技术栈

| 层级 | 技术 |
|------|------|
| 前端框架 | Next.js 16 (App Router) |
| UI 组件 | shadcn/ui + Radix UI |
| 样式 | Tailwind CSS v4 |
| 语言 | TypeScript 5 |
| 数据库 | PostgreSQL 17 + pgvector 0.8 |
| 包管理 | pnpm 9+ |
| AI 平台 | Coze Coding Dev SDK (豆包模型) |
| 图表 | ECharts 6 + Recharts |

---

## 快速开始

### 本地开发

```bash
# 安装依赖
pnpm install

# 启动开发服务器 (端口 5000)
pnpm dev

# 构建生产版本
pnpm build

# 启动生产服务
pnpm start
```

浏览器打开 `http://localhost:5000`

### 公网访问

当前系统通过云服务器 (`101.32.186.47`) 对外提供访问：

- **公网地址**: http://101.32.186.47
- **架构**: nginx 静态服务 + SSH 反向隧道 → 本地 Next.js

> 详见 [DEPLOYMENT.md](./DEPLOYMENT.md)

---

## 页面导航

### 主页 (`/`)
系统首页，提供各功能入口的快速导航。

### 仪表盘 (`/dashboard`)
系统运行统计概览：
- 知识库条目统计（总量/已向量化/待处理）
- 航迹数据统计
- 训练任务状态
- 上传记录

### 上传管理 (`/manage`)
文件上传与管理：
- 拖拽上传多种格式文件
- URL 网页内容抓取
- 查看上传历史
- 删除/重试上传

### 知识检索 (`/search`)
语义搜索知识库：
- **模糊搜索**：基于向量相似度的语义搜索
- **精确搜索**：关键词 + 字段匹配
- **标签过滤**：按已打标签筛选
- 搜索结果支持分页、按模态/来源过滤

### 智能问答 (`/rag`)
RAG 智能对话：
- 流式 AI 回答输出
- 支持多轮对话（会话上下文管理）
- 统计问题自动走 SQL 分支
- 回答模式可选：精简/详细
- 上下文锁定功能

### 规章制度 (`/regulations`)
规章文档管理：
- 上传海事规章制度文档
- 文档分片与向量化
- 按分类筛选（海事规章制度/平台运维规范/航迹标注准则/模型训练管理办法）

### 航迹标注 (`/trajectory`)
海图航迹数据管理：
- 航迹批量上传
- 航迹数据去重
- 航迹标注与行为意图分类
- 航迹分割与向量化

### 航迹训练 (`/trajectory-training`)
航迹模型训练与推理：
- 数据集管理（训练/验证/测试拆分）
- 训练任务配置与执行
- 模型版本管理
- 异常检测推理
- 聚类分析

### 海图 (`/sea-chart`)
交互式海图展示（Leaflet + NOAA S-57 集成）。

### 工作流 (`/workflow`)
可视化工作流编排与执行。

### 系统设置 (`/settings`)
- 港口代码映射配置
- 用户角色管理

---

## 核心工作流

### 工作流 1：上传 → 向量化 → 检索 → 问答

```
┌─────────┐    ┌──────────┐    ┌──────────┐    ┌─────────┐
│ 上传文件 │ → │ 自动标签  │ → │ 向量化   │ → │ 语义检索 │
│ /upload │    │ +解析    │    │ /embed   │    │ /search  │
└─────────┘    └──────────┘    └──────────┘    └─────────┘
                                                     │
                                                     ▼
                                              ┌──────────┐
                                              │ RAG 问答  │
                                              │ /rag      │
                                              └──────────┘
```

**步骤详解：**

1. **上传** (`POST /api/upload`) — 上传文件，系统自动解析并插入知识库
2. **向量化** (`POST /api/embed`) — 为未向量化的条目生成 Embedding 向量
3. **检索** (`POST /api/search`) — 用查询语句搜索相关知识
4. **问答** (`POST /api/rag`) — 基于检索结果由大模型生成回答

### 工作流 2：航迹数据处理

```
上传航迹 → 去重 → 分割 → 标注 → 向量化 → 训练推理
```

---

## API 接口速查

### 上传与数据管理

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/upload` | 上传文件 (FormData) 或 URL (JSON) |
| `GET` | `/api/upload` | 获取上传历史记录 |
| `DELETE` | `/api/upload` | 删除上传记录及相关条目 |
| `PATCH` | `/api/upload` | 更新文件信息 |

### 向量化

| 方法 | 路径 | 说明 |
|------|------|------|
| `POST` | `/api/embed` | 批量/单条向量化 |
| `GET` | `/api/embed` | 获取向量化统计 |
| `PATCH` | `/api/embed` | 重新向量化/重新打标签 |
| `DELETE` | `/api/embed` | 取消待向量化条目 |

### 检索与问答

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/search?q=xxx` | 关键词/语义搜索（列表） |
| `POST` | `/api/search` | 全文语义搜索（向量+关键词） |
| `PATCH` | `/api/search` | 更新条目/标签操作 |
| `POST` | `/api/rag` | RAG 智能问答（支持流式） |
| `POST` | `/api/rag/classify` | 问题分类（SQL vs RAG） |
| `POST` | `/api/rag/sql` | 自然语言 → SQL |
| `POST` | `/api/rag/sql-polish` | SQL 结果润色 |

### 航迹

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET/POST` | `/api/trajectory` | 航迹列表/批量操作 |
| `POST` | `/api/trajectory/import` | 导入航迹 |
| `POST` | `/api/trajectory/export` | 导出航迹 |
| `POST` | `/api/trajectory/dedupe` | 航迹去重 |
| `POST` | `/api/trajectory/split` | 航迹分割 |
| `POST` | `/api/trajectory/embed` | 航迹向量化 |
| `POST` | `/api/trajectory/label` | 航迹标注 |

### 规章

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET/POST` | `/api/regulations` | 规章文档 CRUD |

### 其他

| 方法 | 路径 | 说明 |
|------|------|------|
| `GET` | `/api/stats` | 系统统计 |
| `POST` | `/api/context` | 上下文管理 |
| `POST` | `/api/sql` | 直接 SQL 查询 |
| `POST` | `/api/auto-research` | 自动深度研究 |

> 完整 API 参考见 [API_REFERENCE.md](./API_REFERENCE.md)

---

## 数据库表结构

### 核心表

| 表名 | 说明 |
|------|------|
| `knowledge_items` | 知识库条目（含向量列） |
| `file_uploads` | 文件上传记录 |
| `regulations` | 规章制度文档 |
| `regulation_chunks` | 规章文档分片（含向量列） |
| `port_data` | 港口数据（含向量列） |
| `route_data` | 航线数据（含向量列） |
| `conversation_contexts` | 对话上下文 |
| `tag_vectors` | 标签向量表 |

### 航迹相关表

| 表名 | 说明 |
|------|------|
| `trajectories` | 航迹主表 |
| `trajectory_segments` | 航迹片段 |
| `trajectory_labels` | 航迹标注 |
| `trajectory_clusters` | 航迹聚类结果 |
| `trajectory_anomaly_samples` | 异常样本 |
| `trajectory_model_versions` | 模型版本 |
| `trajectory_training_data` | 训练数据集 |
| `trajectory_training_jobs` | 训练任务 |
| `segment_behaviors` | 行为分类 |
| `segment_intents` | 意图分类 |

---

## 工作原理

### RAG 问答流程

```
用户提问
    │
    ▼
[问题预处理] ─── 海事术语矫正 + 隐含问题拓展
    │
    ▼
[问题分类] ─── 统计类问题 → SQL 分支
    │               非统计类 → RAG 流程
    ▼
[Query 改写] ─── 根据对话历史还原代词、补全省略
    │
    ▼
[向量检索] ─── cos similarity 搜索 + PostgreSQL pgvector
    │
    ├── 结果充足 → 直接构建上下文
    ├── 结果不足 → 触发 SQL 兜底
    │
    ▼
[上下文构建] ─── 排序 + 截断 + 来源标注
    │
    ▼
[LLM 生成] ─── Stream 流式输出 / 非流式返回
    │
    ▼
[上下文更新] ─── 保存到 conversation_contexts 表
```

### 向量化流程

```
知识条目内容
    │
    ▼
[内容处理]
    ├── 文本 → 截断到 8000 字符
    ├── 图片 → MarkItDown OCR 描述 → 图片 Embedding API
    ├── Excel → 解析为结构化文本
    │
    ▼
[Embedding 生成]
    调用 Coze Embedding API → 1536 维向量
    │
    ▼
[判重检查]
    内容哈希比对 → 重复条目自动删除
    │
    ▼
[存储]
    PostgreSQL pgvector 列
    + 更新时间戳
```

### 自动标签

上传文件后系统自动根据内容生成标签：
- 基于文件类型（图片、表格、PDF 等）
- 基于关键词（港口、航运、日本、中国 等）
- 基于国家/地区识别
- 最多 5 个标签

---

## 常用操作

### 重新向量化已入库数据

```bash
curl -X PATCH http://localhost:5000/api/embed \
  -H 'Content-Type: application/json' \
  -d '{"action": "reembed", "all": true, "keepOld": true}'
```

### 重新打标签

```bash
curl -X PATCH http://localhost:5000/api/embed \
  -H 'Content-Type: application/json' \
  -d '{"action": "retag", "ids": ["item-uuid-here"]}'
```

### 上传并解析网页

```bash
curl -X POST http://localhost:5000/api/upload \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com/article"}'
```

### 语义搜索

```bash
# 模糊搜索
curl -X POST http://localhost:5000/api/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "日本港口", "topK": 20, "threshold": 0.3}'

# 精确搜索
curl -X POST http://localhost:5000/api/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "东京", "mode": "exact"}'

# 按国家过滤
curl -X POST http://localhost:5000/api/search \
  -H 'Content-Type: application/json' \
  -d '{"query": "港口", "mode": "exact", "filter": {"tags": "日本"}}'
```

### RAG 问答

```bash
curl -X POST http://localhost:5000/api/rag \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "日本有哪些主要港口？",
    "sessionId": "my-session",
    "responseMode": "detailed"
  }'
```

---

## 注意事项

1. **向量维度限制**: pgvector 要求固定 1536 维，Embedding 会自动截断
2. **内容长度限制**: 文本向量化截断至 8000 字符
3. **上传批次**: 知识条目每批插入 2 条，避免 Supabase 限制
4. **海图时效**: AI 回答会提示用户核实最新版海图数据
5. **pgvector 依赖**: 需要 PostgreSQL 安装 `vector` 扩展
6. **Mac 休眠**: 若使用远程隧道模式，Mac 休眠会导致 API 不可用

---

## 参考

- [部署运维文档](./DEPLOYMENT.md)
- [API 完整参考](./API_REFERENCE.md)
- [NOAA S-57 海图集成](./ENC_INTEGRATION.md)
- [Next.js 官方文档](https://nextjs.org/docs)
- [shadcn/ui](https://ui.shadcn.com)
