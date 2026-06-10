# ShipRag API 参考

> 完整 API 接口文档 — Base URL: `http://localhost:5000` / `http://101.32.186.47`

---

## 通用说明

### 响应格式

成功响应:
```json
{
  "success": true,
  "data": { ... }
}
```

错误响应:
```json
{
  "error": "错误描述信息"
}
```

### HTTP 状态码

| 状态码 | 含义 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 404 | 资源不存在 |
| 500 | 服务器内部错误 |

---

## 上传 API

### `POST /api/upload` — 上传文件

**Content-Type**: `multipart/form-data` 或 `application/json`

#### 文件上传 (FormData)

```http
POST /api/upload
Content-Type: multipart/form-data

file: (binary file)
```

**响应**:
```json
{
  "success": true,
  "uploadId": "uuid",
  "filename": "example.xlsx",
  "fileType": "excel",
  "itemCount": 10,
  "items": [
    {
      "id": "uuid",
      "modality": "excel",
      "title": "Sheet1-Row1",
      "content": "parsed content..."
    }
  ]
}
```

#### URL 抓取 (JSON)

```http
POST /api/upload
Content-Type: application/json

{
  "url": "https://example.com/article"
}
```

**响应**:
```json
{
  "success": true,
  "message": "网页解析成功: example.com",
  "fileId": "uuid",
  "itemCount": 1,
  "title": "Article Title",
  "contentLength": 8000
}
```

### `GET /api/upload` — 上传记录列表

```http
GET /api/upload
```

**响应**:
```json
{
  "success": true,
  "uploads": [
    {
      "id": "uuid",
      "filename": "file.xlsx",
      "file_type": "excel",
      "file_size": "102400",
      "storage_url": "...",
      "status": "completed",
      "item_count": "10",
      "created_at": "2026-06-09T00:00:00Z"
    }
  ]
}
```

### `DELETE /api/upload` — 删除上传

```http
DELETE /api/upload?id=<upload_id>
# 或
DELETE /api/upload?filename=<filename>
```

### `PATCH /api/upload` — 更新文件信息

```http
PATCH /api/upload?id=<upload_id>
Content-Type: application/json

{
  "filename": "new_name.xlsx"
}
```

---

## 向量化 API

### `POST /api/embed` — 执行向量化

```http
POST /api/embed
Content-Type: application/json

{
  "batchSize": 10,        // 每批处理数量，默认 10
  "skipDuplicate": true,  // 是否跳过重复内容，默认 true
  "itemId": "uuid"        // 可选：仅处理单条
}
```

**响应**:
```json
{
  "success": true,
  "processed": 8,
  "skipped": 1,
  "failed": 1,
  "total": 10,
  "errors": ["错误详情..."]
}
```

### `GET /api/embed` — 向量化状态统计

```http
GET /api/embed
```

**响应**:
```json
{
  "success": true,
  "total": 100,
  "embedded": 75,
  "pending": 25
}
```

### `PATCH /api/embed` — 重新向量化/重新打标签

```http
PATCH /api/embed
Content-Type: application/json

{
  "action": "reembed",
  "all": true,
  "keepOld": true
}
```

**action 可选值**:
| action | 说明 |
|--------|------|
| `reembed` | 重新向量化 |
| `retag` | 重新打标签 |
| `vectorizeTags` | 标签向量化 |

### `DELETE /api/embed` — 取消待向量化条目

```http
DELETE /api/embed
Content-Type: application/json

{
  "clearAll": true
  // 或
  "ids": ["uuid1", "uuid2"]
  // 或
  "singleId": "uuid"
}
```

---

## 搜索 API

### `GET /api/search` — 列表/标签/简单搜索

```http
GET /api/search
GET /api/search?modality=excel
GET /api/search?status=pending&page=1&limit=20
GET /api/search?q=港口&mode=fuzzy&topK=50&threshold=0.3
GET /api/search?action=tags
GET /api/search?search=关键词
GET /api/search?tag=日本
```

**参数**:
| 参数 | 类型 | 说明 |
|------|------|------|
| `q` | string | 搜索查询 |
| `mode` | `exact` \| `fuzzy` | 搜索模式 |
| `modality` | string | 模态过滤 |
| `topK` | int | 返回数量 (默认 100) |
| `threshold` | float | 向量相似度阈值 (默认 0.3) |
| `page` | int | 页码 |
| `limit` | int | 每页数量 |
| `tag` | string | 标签过滤 |
| `search` | string | 模糊关键词 |
| `action` | `tags` | 获取标签列表 |
| `source` | string | 来源过滤 |

### `POST /api/search` — 全文语义搜索

```http
POST /api/search
Content-Type: application/json

{
  "query": "日本的主要港口有哪些",
  "mode": "fuzzy",       // "exact" | "fuzzy"
  "modality": null,       // 可选过滤
  "topK": 20,
  "threshold": 0.3,
  "filter": {
    "tags": "日本"
  },
  "page": 1,
  "pageSize": 20
}
```

**响应**:
```json
{
  "success": true,
  "query": "日本的主要港口有哪些",
  "results": [
    {
      "id": "uuid",
      "title": "东京港",
      "content": "港口代码: JPTYO, ...",
      "source": "ports.xlsx",
      "similarity": 0.89,
      "modality": "port",
      "table": "port_data",
      "metadata": { ... }
    }
  ],
  "count": 5,
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "totalCount": 5,
    "totalPages": 1,
    "hasMore": false
  }
}
```

### `PATCH /api/search` — 更新条目/标签

```http
PATCH /api/search
Content-Type: application/json

// 更新条目
{ "id": "uuid", "title": "新标题", "content": "新内容", "tags": ["标签1", "标签2"] }

// 重命名标签
{ "action": "renameTag", "oldTag": "旧标签", "newTag": "新标签" }

// 删除标签
{ "action": "deleteTag", "tag": "要删除的标签" }
```

---

## RAG 问答 API

### `POST /api/rag` — 智能问答

```http
POST /api/rag
Content-Type: application/json

{
  "query": "东京港的水深是多少？",
  "modality": null,
  "topK": 100,
  "stream": true,
  "noLimit": false,
  "sessionId": "conversation-001",
  "history": [
    { "role": "user", "content": "日本有哪些港口？" },
    { "role": "assistant", "content": "日本主要港口包括..." }
  ],
  "lockContext": false,
  "clearContext": false,
  "responseMode": "detailed",
  "commandType": null
}
```

**参数详解**:
| 参数 | 类型 | 说明 |
|------|------|------|
| `query` | string | **必填**，用户问题 |
| `modality` | string | 限定检索模态 |
| `topK` | int | 检索数量 (默认 100) |
| `stream` | bool | 是否流式输出 (默认 true) |
| `sessionId` | string | 会话 ID，启用多轮对话 |
| `history` | array | 前端传递的历史消息 |
| `lockContext` | bool | 锁定当前上下文 |
| `clearContext` | bool | 清空历史上下文 |
| `responseMode` | `brief` \| `detailed` | 回答模式 |
| `commandType` | `chart_annotation` \| `channel_regulation` | 指令类型 |

**流式响应** (stream=true):
```
Content-Type: text/event-stream

data: 东京港的
data: 水深范围
data: ...
```

**非流式响应** (stream=false):
```json
{
  "success": true,
  "query": "东京港的水深是多少？",
  "answer": "根据海图数据，东京港...",
  "contextCount": 15,
  "sources": [
    {
      "title": "东京港海图",
      "source": "chart_12345.000",
      "similarity": 0.92,
      "type": "knowledge_base"
    }
  ],
  "ragQuality": {
    "resultCount": 15,
    "avgSimilarity": 0.78,
    "isInsufficient": false
  }
}
```

### `POST /api/rag/classify` — 问题分类

```http
POST /api/rag/classify
Content-Type: application/json

{
  "query": "一共有多少港口？"
}
```

**响应**:
```json
{
  "route": "SQL"
}
```

### `POST /api/rag/sql` — 自然语言 → SQL

```http
POST /api/rag/sql
Content-Type: application/json

{
  "query": "统计每个国家的港口数量"
}
```

**响应**:
```json
{
  "sql": "SELECT country, COUNT(*) FROM knowledge_items GROUP BY country",
  "result": [{"country": "日本", "count": 45}, ...]
}
```

---

## 航迹 API

### `GET /api/trajectory` — 航迹列表

```http
GET /api/trajectory?page=1&limit=20
GET /api/trajectory?id=<trajectory_id>
```

### `POST /api/trajectory` — 创建/批量操作

```http
POST /api/trajectory
Content-Type: application/json

{
  "mmsi": "123456789",
  "points": [...],
  "metadata": { ... }
}
```

### `POST /api/trajectory/import` — 导入航迹

```http
POST /api/trajectory/import
Content-Type: multipart/form-data

file: (CSV/JSON/航迹文件)
```

### `POST /api/trajectory/dedupe` — 去重

```http
POST /api/trajectory/dedupe
Content-Type: application/json

{
  "method": "spatial",
  "threshold": 0.001
}
```

### `POST /api/trajectory/split` — 分割

```http
POST /api/trajectory/split
Content-Type: application/json

{
  "id": "trajectory-uuid",
  "method": "time_gap",
  "gapMinutes": 30
}
```

### `POST /api/trajectory/label` — 标注

```http
POST /api/trajectory/label
Content-Type: application/json

{
  "id": "trajectory-uuid",
  "label": "cargo_transport",
  "metadata": { "confidence": 0.95 }
}
```

### `POST /api/trajectory/embed` — 向量化

```http
POST /api/trajectory/embed
Content-Type: application/json

{
  "ids": ["uuid1", "uuid2"]
}
```

### `POST /api/trajectory/search` — 相似航迹搜索

```http
POST /api/trajectory/search
Content-Type: application/json

{
  "query": "uuid-of-reference-trajectory",
  "topK": 10,
  "threshold": 0.5
}
```

---

## 航迹训练 API

### `GET/POST /api/trajectory/training/data` — 训练数据管理

### `POST /api/trajectory/training/train` — 启动训练

```http
POST /api/trajectory/training/train
Content-Type: application/json

{
  "modelType": "classification",
  "params": {
    "epochs": 100,
    "learningRate": 0.001
  }
}
```

### `GET /api/trajectory/training/versions` — 模型版本列表

### `POST /api/trajectory/training/versions/toggle` — 切换活跃版本

### `POST /api/trajectory/training/inference` — 推理

```http
POST /api/trajectory/training/inference
Content-Type: application/json

{
  "trajectoryId": "uuid",
  "modelVersion": "v1"
}
```

### `GET /api/trajectory/training/anomalies` — 异常检测结果

### `GET /api/trajectory/training/cluster` — 聚类分析

### `GET /api/trajectory/training/stats` — 训练统计

### `GET /api/trajectory/training/jobs` — 训练任务列表

### `GET /api/trajectory/training/logs` — 训练日志

---

## 规章制度 API

### `GET /api/regulations` — 规章列表

```http
GET /api/regulations
GET /api/regulations?category=maritime_rules
GET /api/regulations?vector_status=pending
```

### `POST /api/regulations` — 上传规章文档

```http
POST /api/regulations
Content-Type: multipart/form-data

file: (PDF/DOC/TXT)
categories: ["maritime_rules"]
```

### `PATCH /api/regulations` — 更新规章

### `DELETE /api/regulations` — 删除规章

---

## 其他 API

### `GET /api/stats` — 系统统计

```http
GET /api/stats
```

**响应**:
```json
{
  "success": true,
  "period": { "days": 7, "since": "2026-06-02T..." },
  "trajectories": { "total": 0, "labeled": 0, "vectorized": 0 },
  "training": { "total": 0, "labeled": 0, "train": 0, "val": 0 },
  "anomalies": { "total": 0, "corrected": 0, "pending": 0 },
  "uploads": { "total": 1, "success": 0, "pending": 0 },
  "knowledge": { "total": 0, "vectorized": 0 }
}
```

### `POST /api/context` — 上下文管理

```http
POST /api/context
Content-Type: application/json

{
  "sessionId": "session-001",
  "action": "get"
}
```

### `POST /api/sql` — 直接 SQL 查询

```http
POST /api/sql
Content-Type: application/json

{
  "sql": "SELECT COUNT(*) FROM knowledge_items WHERE modality = 'port'"
}
```

### `POST /api/auto-research` — 自动深度研究

```http
POST /api/auto-research
Content-Type: application/json

{
  "query": "分析东亚港口分布特征",
  "iterations": 3,
  "depth": "comprehensive"
}
```

### `GET/POST /api/data-maintain` — 数据维护

### `GET /api/settings/roles` — 角色列表

### `GET/POST /api/settings/port-mappings` — 港口代码映射

### `GET/POST /api/workflow` — 工作流管理

---

## 错误码速查

| 错误信息 | 原因 | 解决 |
|----------|------|------|
| `查询内容不能为空` | query 参数为空 | 提供有效的查询字符串 |
| `问题不能为空` | RAG 请求缺少 query | 添加非空 query |
| `文件不存在` | DELETE 时找不到记录 | 检查 ID 或文件名 |
| `vector_search function not found` | pgvector RPC 未创建 | 检查数据库扩展 |
| `条目不存在` | 指定的 itemId 无效 | 确认 UUID 正确 |
