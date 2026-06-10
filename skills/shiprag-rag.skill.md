# shiprag-rag

> 海图 RAG 问答 skill — 当用户问海图、港口、航线、海事相关问题时使用

## 触发条件

用户消息包含以下任意关键词时触发：
- 港口、port、harbor、dock
- 海图、chart、ENC
- 航道、channel、waterway
- 锚地、anchorage
- 航线、route、shipping lane
- 吃水、draft、水深、depth
- 航标、navigation aid、buoy、lighthouse
- 碍航物、obstruction
- 船舶、vessel、ship
- 海事、maritime、海上
- 规章制度（海事相关）
- 统计港口

## 工作流程

```
用户提问
    │
    ▼
[术语标准化] — 补充英文术语
    │
    ▼
[Query 拓展] — 根据问题类型追加隐含查询
    ├── 问港口 → 追加"港口代码 坐标"
    ├── 问航道 → 追加"水深 吃水 通航尺度"
    └── 问锚地 → 追加"水深 底质 坐标"
    │
    ▼
[调用 /api/rag] — stream=true
    │
    ▼
[格式化输出]
    ├── 标准海事术语
    ├── 来源标注
    └── 时效性提示
```

## 调用方式

```bash
curl -X POST http://localhost:5000/api/rag \
  -H 'Content-Type: application/json' \
  -d '{
    "query": "<用户问题>",
    "stream": true,
    "responseMode": "detailed",
    "sessionId": "<会话ID>"
  }'
```

## 输出规范

1. **术语标准化**: 航道(channel)、锚地(anchorage)、等深线(depth contour)
2. **来源标注**: 【来源】文档名 | 表名
3. **安全提示**: 海图数据具有时效性，请以最新版官方海图为准
4. **坐标格式**: WGS84 坐标系，"经度,纬度"

## 示例

**输入**: 东京港水深多少？
**处理**: 标准化 → "东京港 Tokyo port 水深 depth", 检索港口数据, LLM 回答
**输出**: 自动附带来源标注的详细回答

---

**维护者**: ShipRag Team | **版本**: 1.0.0
