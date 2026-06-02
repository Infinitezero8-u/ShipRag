# 跨模态 RAG 知识检索系统

## 项目概述

这是一个支持多种数据格式的智能检索与问答系统（RAG），支持：
- **文本** (.txt)
- **Excel** (.xlsx, .xls, .csv)
- **Word 文档** (.docx)
- **Markdown** (.md)
- **JSON** (.json)
- **图片** (.png, .jpg, .jpeg, .gif, .webp)
- **航迹数据**（需自定义编码）

## 技术栈

- **Framework**: Next.js 16 (App Router)
- **Core**: React 19
- **Language**: TypeScript 5
- **UI Components**: shadcn/ui
- **Styling**: Tailwind CSS 4
- **Database**: Supabase (PostgreSQL + pgvector)
- **AI**: coze-coding-dev-sdk (Embedding + LLM)

## 目录结构

```
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── upload/route.ts    # 文件上传与解析
│   │   │   ├── embed/route.ts     # 向量化处理
│   │   │   ├── search/route.ts    # 语义检索
│   │   │   └── rag/route.ts       # RAG 问答
│   │   ├── layout.tsx
│   │   └── page.tsx               # 主界面
│   ├── components/ui/             # Shadcn UI 组件
│   ├── lib/
│   │   ├── parsers.ts             # 文件解析模块
│   │   └── utils.ts
│   └── storage/database/
│       └── supabase-client.ts     # Supabase 客户端
└── package.json
```

## API 接口

### POST /api/upload
上传并解析文件，返回解析出的知识条目。

### GET/POST /api/embed
- GET: 获取向量化状态统计
- POST: 执行向量化处理

### GET/POST /api/search
- GET: 获取知识条目列表
- POST: 语义检索（向量相似度搜索）

### POST /api/rag
RAG 智能问答，支持流式输出。

## 数据库表

### knowledge_items
存储所有知识条目，包含向量列。

### file_uploads
记录文件上传历史。

## 使用方式

1. **上传文件**：在"文件上传"标签页上传文件
2. **执行向量化**：点击"执行向量化"按钮
3. **检索**：在"知识检索"标签页输入查询
4. **问答**：在"智能问答"标签页提问

## 构建与运行

```bash
# 安装依赖
pnpm install

# 开发模式
pnpm dev

# 构建
pnpm build

# 生产模式
pnpm start
```
