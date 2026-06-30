# ShipRag — 跨模态 RAG 海事知识检索系统

## 项目定位

面向海事航运领域的跨模态 RAG（检索增强生成）平台。核心能力：
- 多模态文件上传与解析（PDF/Word/Excel/Markdown/JSON/图片）
- 知识库向量化与语义检索（Supabase pgvector + Ollama embedding）
- LangGraph 驱动的可编排工作流引擎（ReactFlow 可视化编辑）
- 船舶航迹管理与智能标注（行为/意图码）
- 全球港口海图可视化（Leaflet）
- 混合检索问答（向量 + 关键词 + SQL 三路路由）

## 技术栈

| 层 | 选型 |
|---|---|
| 框架 | Next.js 16.1 (App Router) + React 19.2 |
| 语言 | TypeScript 5 |
| UI | shadcn/ui (Radix UI) + Tailwind CSS 4 |
| 数据库 | Supabase (PostgreSQL + pgvector) |
| ORM | Drizzle ORM (drizzle-orm, drizzle-kit) |
| AI 编排 | LangChain 1.4 + LangGraph 1.4 |
| 本地 LLM | Ollama (ChatOllama + OllamaEmbeddings) |
| 地图 | Leaflet + React-Leaflet |
| 图表 | ECharts, Recharts |
| 工作流 UI | ReactFlow |
| 包管理 | pnpm 9+（强制，`preinstall` 脚本拦截 npm/yarn） |
| 端口 | 5000（默认） |

## 目录结构

```
src/
├── app/                              # Next.js App Router
│   ├── page.tsx                      # 首页 — 模块卡片导航
│   ├── layout.tsx                    # 根布局
│   ├── globals.css                   # Tailwind + shadcn 主题变量
│   ├── api/
│   │   ├── rag/route.ts              # RAG 问答 (LangGraph 工作流)
│   │   ├── embed/route.ts            # 向量化处理
│   │   ├── search/route.ts            # 语义检索
│   │   ├── upload/route.ts           # 文件上传与解析
│   │   ├── workflow/                 # 工作流 CRUD
│   │   │   ├── route.ts
│   │   │   └── copy/route.ts
│   │   ├── trajectory/               # 航迹核心 API
│   │   │   ├── route.ts              # 列表/筛选
│   │   │   ├── [id]/label/route.ts   # 单条标注
│   │   │   ├── batch/route.ts        # 批量操作
│   │   │   ├── buffer/route.ts       # 缓冲导入
│   │   │   ├── cache/route.ts        # 缓存
│   │   │   ├── dedupe/route.ts       # 空间去重 (Haversine)
│   │   │   ├── export/route.ts       # 导出
│   │   │   ├── import/route.ts       # 导入
│   │   │   ├── split/route.ts        # 航段切分
│   │   │   └── training/             # 训练子模块
│   │   │       ├── data/route.ts
│   │   │       ├── train/route.ts
│   │   │       ├── stats/route.ts
│   │   │       ├── split/route.ts
│   │   │       ├── anomalies/route.ts
│   │   │       ├── jobs/route.ts
│   │   │       ├── versions/route.ts
│   │   │       ├── import/route.ts
│   │   │       └── incremental/route.ts
│   │   ├── segment/                  # 航段标注
│   │   │   ├── behavior/route.ts
│   │   │   └── intent/route.ts
│   │   ├── settings/
│   │   │   ├── port-mappings/route.ts
│   │   │   └── roles/route.ts
│   │   ├── stats/route.ts
│   │   └── auto-research/route.ts
│   ├── dashboard/                    # 仪表盘页面
│   ├── workflow/                     # 工作流页面
│   │   ├── manage/page.tsx           # 工作流管理
│   │   └── edit/page.tsx             # ReactFlow 编辑器
│   ├── trajectory/                   # 航迹列表页
│   ├── trajectory-training/          # 训练管理页
│   ├── trajectory-inference/         # 推理页
│   ├── segment-label/                # 航段标注页
│   ├── sea-chart/                    # 海图可视化页
│   │   ├── page.tsx                  # 海图页面
│   │   └── SeaMap.tsx                # Leaflet 地图组件
│   ├── settings/                     # 设置页
│   └── manage/                       # 管理页
├── components/
│   ├── ui/                           # 50+ shadcn 组件
│   │   ├── button.tsx, card.tsx, input.tsx, dialog.tsx, ...
│   │   ├── chart.tsx                 # Recharts 封装
│   │   ├── item.tsx                  # Item 复合组件 (ItemGroup/ItemMedia/ItemContent/...)
│   │   └── field.tsx                 # 表单字段封装
│   ├── rag-panel.tsx                 # RAG 问答面板
│   ├── search-panel.tsx              # 检索面板
│   ├── upload-panel.tsx              # 上传面板
│   ├── data-maintain-panel.tsx       # 数据维护面板
│   └── auto-research-panel.tsx       # 自动研究面板
├── lib/
│   ├── utils.ts                      # cn() 工具函数
│   ├── parsers.ts                    # 文件解析器（Excel/Word/MD/JSON 等）
│   ├── ollama/
│   │   ├── config.ts                 # Ollama 模型配置
│   │   ├── embedding.ts              # 向量化 (embedText/embedImage)
│   │   └── llm.ts                    # LLM 调用封装
│   ├── fetch/client.ts               # HTTP 客户端
│   ├── storage/local.ts              # 本地存储
│   ├── utils/headers.ts              # 请求头工具
│   └── workflow/                     # LangGraph 工作流引擎
│       ├── graph.ts                  # StateGraph 定义
│       ├── state.ts                  # RAGState 类型
│       ├── nodes.ts                  # 所有节点实现
│       └── skills/                   # 可插拔技能模块
│           ├── semantic-expansion.ts  # 语义扩展（口语→术语）
│           ├── entity-extraction.ts   # 实体提取
│           ├── spatial-query.ts       # 空间查询检测
│           └── route-cache.ts         # 路由缓存
└── storage/
    └── database/
        ├── supabase-client.ts        # Supabase 客户端
        └── shared/
            ├── schema.ts             # Drizzle schema 定义
            └── relations.ts          # 表关系定义
```

## 数据库 Schema（核心表）

所有表定义在 `src/storage/database/shared/schema.ts`：

| 表名 | 用途 | 关键列 |
|---|---|---|
| `knowledge_items` | 多模态知识条目（含向量） | id, modality, title, content, source, metadata, embedding |
| `file_uploads` | 文件上传记录 | id, filename, file_type, storage_url, status, item_count |
| `regulations` | 规章制度文档 | id, filename, categories(JSONB), is_valid, vector_status, chunk_count |
| `regulation_chunks` | 法规切片（含向量） | id, regulation_id, chunk_index, chapter, clause, content |
| `health_check` | 健康检查 | id, updated_at |

数据库名: `shiprag`，默认连接 `postgresql://localhost:5432/shiprag`。

## LangGraph 工作流引擎 (`src/lib/workflow/`)

核心 RAG pipeline，支持动态路由：

```
UserInput → Classify → ├─ CHAT → llmGenerate
                        ├─ SQL/LIST → sqlGenerate → sqlExecute → sqlPolish
                        └─ RAG → queryRewrite → embedding → hybridRetrieval
                                    → rerank → promptAssembly → llmGenerate
                                                              → hallucinationCheck(禁用)
                                                              → finalOutput
```

**节点详情**（`src/lib/workflow/nodes.ts`）：
1. **userInputNode** — 校验用户输入
2. **classifyNode** — 意图分类（关键词优先 + LLM 兜底）：CHAT / SQL / LIST / RAG
3. **queryRewriteNode** — Query 改写 + 记忆压缩（>6轮自动摘要）
4. **embeddingNode** — OllamaEmbeddings 向量化
5. **hybridRetrievalNode** — 混合检索 RRF 融合：向量检索 (match_knowledge_items RPC) + 关键词 ILIKE 滑动窗口
6. **rerankNode** — 启发式精排（标题匹配加分、关键词密度加权）
7. **llmGenerateNode** — ShipRag 身份 LLM 生成（严格引用）
8. **sqlGenerateNode** — LLM 生成 SQL（自动路由表名：port_data / knowledge_items）
9. **sqlExecuteNode** — 执行 SQL，支持 COUNT/WHERE
10. **sqlPolishNode** — 港口列表格式化、Haversine 距离排序、空间查询

**技能模块**（`src/lib/workflow/skills/`）：
- `semantic-expansion` — 口语→法律术语映射
- `entity-extraction` — 实体提取
- `spatial-query` — "距离XX最近的N个港口"空间查询检测

## API 接口速查

| 方法 | 路由 | 说明 |
|---|---|---|
| POST | `/api/rag` | RAG 问答，流式输出 |
| GET/POST | `/api/embed` | 向量化状态/执行向量化 |
| GET/POST | `/api/search` | 知识条目列表/语义检索 |
| POST | `/api/upload` | 文件上传解析 |
| CRUD | `/api/workflow` | 工作流 CRUD + 激活/锁定 |
| CRUD | `/api/trajectory` | 航迹 CRUD |
| POST | `/api/trajectory/batch` | 批量操作 |
| POST | `/api/trajectory/dedupe` | 空间去重 |
| POST | `/api/trajectory/split` | 航段切分 |
| GET/POST | `/api/trajectory/training/*` | 训练数据/任务/版本管理 |
| CRUD | `/api/segment/behavior` | 行为码标注 |
| CRUD | `/api/segment/intent` | 意图码标注 |
| POST | `/api/auto-research` | 自动研究 |
| GET | `/api/stats` | 统计概览 |

## 关键约定

1. **包管理**: 强制 pnpm（`preinstall` 脚本 + `packageManager` 字段）
2. **路径别名**: `@/` → `src/`
3. **启动方式**: `coze dev`（开发）、`coze build`（构建）、`coze start`（生产）
4. **样式**: Tailwind CSS 4 + shadcn 主题变量（`--background`, `--primary` 等）
5. **表单**: react-hook-form + zod（推荐）
6. **图标**: Lucide React
7. **LLM 配置**: 环境变量 `OLLAMA_BASE_URL`（默认 `http://localhost:11434`），模型通过 `src/lib/ollama/config.ts` 配置
8. **向量化**: 使用 Ollama 本地 embedding 模型（`nomic-embed-text` 或 `mxbai-embed-large`），图片向量化通过 `nomic-embed-vision`
9. **航迹去重**: Haversine 空间距离算法（阈值 1km），按起止港分组
10. **工作流**: 三种内置 LangGraph 工作流（`rag-sql-dual`, `rag-only`, `search-only`），只读，可复制后自定义
11. **Python 脚本**: `scripts/markitdown_converter.py` 用于 PDF/Word/PPT 等多格式转 Markdown，需 `pip install markitdown[all]`
