# shiprag-upload

> 海图数据上传 skill — 当用户需要上传文件到知识库时使用

## 触发条件

用户消息包含以下关键词时触发：
- 上传、导入、upload、import
- 添加数据、录入数据
- 提交文件

## 支持的文件类型

| 类型 | 扩展名 |
|------|--------|
| Excel | .xlsx .xls .csv |
| Word | .docx |
| 文本 | .txt |
| Markdown | .md |
| JSON | .json |
| 图片 | .png .jpg .jpeg .gif .webp |
| 网页 | URL |

## 调用方式

### 文件上传
```bash
curl -X POST http://localhost:5000/api/upload \
  -F "file=@/path/to/file.xlsx"
```

### URL 抓取
```bash
curl -X POST http://localhost:5000/api/upload \
  -H 'Content-Type: application/json' \
  -d '{"url": "https://example.com/page"}'
```

## 上传后流程

1. 文件自动解析入库
2. 自动生成标签 (基于内容和文件类型)
3. 图片自动 OCR 生成描述
4. 提示用户执行向量化: `POST /api/embed`

## 注意事项

- 上传后条目默认为"待向量化"状态
- 需要执行向量化才能启用语义搜索
- 重复内容会被自动检测并删除

---

**维护者**: ShipRag Team | **版本**: 1.0.0
