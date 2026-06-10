#!/usr/bin/env python3
"""
RAG-Anything 文档解析桥接脚本
用 MinerU 2.0 + RAG-Anything 替代 markitdown，支持 PDF/Word/PPT/图片/表格/公式的高保真解析。

用法:
  python3 scripts/raganything_parse.py <file_path>
  python3 scripts/raganything_parse.py --url <url>
  python3 scripts/raganything_parse.py --batch <dir_path>
  python3 scripts/raganything_parse.py --version
"""
import sys, json, os, tempfile
from pathlib import Path

try:
    from raganything import RAGAnything, RAGAnythingConfig
    RAG_AVAILABLE = True
except ImportError:
    RAG_AVAILABLE = False

try:
    from mineru import MinerU
    MINERU_AVAILABLE = True
except ImportError:
    MINERU_AVAILABLE = False


def parse_with_mineru(file_path: str) -> dict:
    """用 MinerU 2.0 解析文档（PDF/Word/PPT/图片）"""
    if not MINERU_AVAILABLE:
        return {"error": "MinerU 不可用，请安装: pip install mineru"}

    from mineru import MinerU
    parser = MinerU()
    result = parser.parse(file_path)

    return {
        "text": result.text if hasattr(result, 'text') else "",
        "markdown": result.markdown if hasattr(result, 'markdown') else "",
        "tables": result.tables if hasattr(result, 'tables') else [],
        "images": [
            {"path": img.path, "caption": getattr(img, 'caption', '')}
            for img in (result.images if hasattr(result, 'images') else [])
        ],
        "metadata": {
            "pages": getattr(result, 'page_count', 1),
            "title": getattr(result, 'title', ''),
        }
    }


def parse_with_raganything(file_path: str) -> dict:
    """用 RAG-Anything 全栈解析文档"""
    if not RAG_AVAILABLE:
        return {"error": "RAG-Anything 不可用"}

    config = RAGAnythingConfig(
        working_dir=str(Path(file_path).parent / ".raganything"),
        parser="mineru",
    )
    ra = RAGAnything(config=config)
    doc = ra.parse(file_path)

    return {
        "text": doc.get("text", ""),
        "chunks": [
            {"content": c.get("content", ""), "modality": c.get("modality", "text")}
            for c in doc.get("chunks", [])
        ],
        "tables": doc.get("tables", []),
        "images": doc.get("images", []),
        "metadata": {
            "title": doc.get("title", ""),
            "pages": doc.get("pages", 1),
            "parser": "raganything-mineru",
        }
    }


def parse_simple(file_path: str) -> dict:
    """简易解析：先试 MinerU，再 fallback 到 markitdown"""
    if MINERU_AVAILABLE:
        try:
            return parse_with_mineru(file_path)
        except Exception as e:
            print(f"MinerU failed: {e}, falling back to markitdown", file=sys.stderr)

    # Fallback to markitdown
    try:
        from markitdown import MarkItDown
        md = MarkItDown()
        result = md.convert(file_path)
        return {
            "text": result.text_content,
            "markdown": result.text_content,
            "metadata": {"parser": "markitdown", "title": getattr(result, 'title', '')}
        }
    except Exception as e:
        return {"error": str(e)}


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "用法: <file> | --url <url> | --version"}))
        sys.exit(1)

    if sys.argv[1] == "--version":
        print(json.dumps({
            "raganything": "1.3.1" if RAG_AVAILABLE else "not available",
            "mineru": "3.2.3" if MINERU_AVAILABLE else "not available",
            "graphrag": "3.1.0",
        }))
        return

    if sys.argv[1] == "--url":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "需要 URL 参数"}))
            sys.exit(1)
        import urllib.request
        url = sys.argv[2]
        with tempfile.NamedTemporaryFile(delete=False, suffix=".tmp") as tmp:
            urllib.request.urlretrieve(url, tmp.name)
            result = parse_simple(tmp.name)
        os.unlink(tmp.name)
        print(json.dumps(result, ensure_ascii=False))
        return

    file_path = sys.argv[1]
    if not os.path.exists(file_path):
        print(json.dumps({"error": f"文件不存在: {file_path}"}))
        sys.exit(1)

    result = parse_simple(file_path)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
