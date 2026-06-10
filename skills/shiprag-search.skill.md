# shiprag-search

> 海图知识库检索 skill — 当用户需要精确搜索港口、航线或海图数据时使用

## 触发条件

用户消息包含以下关键词时触发：
- 搜索、检索、查找、查询、find、search
- 关键词匹配、精确查找
- 按国家/地区过滤

## 调用方式

### 语义搜索 (默认)
```bash
curl -X POST http://localhost:5000/api/search \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "<搜索内容>",
    "mode": "fuzzy",
    "topK": 20,
    "threshold": 0.3
  }'
```

### 精确搜索
```bash
curl -X POST http://localhost:5000/api/search \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "<关键词>",
    "mode": "exact"
  }'
```

### 按标签过滤
```bash
curl -X POST http://localhost:5000/api/search \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "<搜索内容>",
    "mode": "exact",
    "filter": { "tags": "<标签名>" }
  }'
```

## 输出规范

结果按相似度降序排列，每条包含：
- 标题、内容预览
- 相似度分数
- 数据来源表
- 模态类型

---

**维护者**: ShipRag Team | **版本**: 1.0.0
