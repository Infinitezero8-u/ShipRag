#!/usr/bin/env python3
"""
RAGAnything document parser - MinerU engine
Only for PDF/PPTX/DOCX/images with complex layouts.
Other formats: use markitdown_converter.py.
Output: content_list JSON (text/image/table/equation)
Usage:
  python3 raganything_parser.py <file_path>
  python3 raganything_parser.py --stdin <filename>
"""

import sys
import json
import os
import tempfile
import base64
import asyncio

WORKING_DIR = os.environ.get("RAGANYTHING_WORKING_DIR", "/Volumes/Data/raganything_storage")
PARSER = os.environ.get("RAGANYTHING_PARSER", "mineru")
PARSE_METHOD = os.environ.get("RAGANYTHING_PARSE_METHOD", "auto")
OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY", "")

# 默认使用 ModelScope (国内可访问)，HuggingFace 被墙
if "MINERU_MODEL_SOURCE" not in os.environ:
    os.environ["MINERU_MODEL_SOURCE"] = "modelscope"

SUPPORTED_EXTS = {".pdf", ".pptx", ".ppt", ".docx", ".doc", ".png", ".jpg", ".jpeg"}


def check_file_supported(filepath):
    ext = os.path.splitext(filepath)[1].lower()
    if ext not in SUPPORTED_EXTS:
        return {"success": False, "error": f"Unsupported format '{ext}' for RAGAnything - use MarkItDown fallback"}
    return None  # supported


async def parse_with_raganything(file_path, original_filename):
    from raganything import RAGAnything, RAGAnythingConfig

    output_dir = os.path.join(WORKING_DIR, "parsed_output")
    os.makedirs(output_dir, exist_ok=True)

    config = RAGAnythingConfig(
        working_dir=WORKING_DIR,
        parser=PARSER,
        parse_method=PARSE_METHOD,
        parser_output_dir=output_dir,
        enable_image_processing=True,
        enable_table_processing=True,
        enable_equation_processing=True,
        display_content_stats=False,
    )

    if OPENAI_API_KEY:
        from lightrag.llm.openai import openai_complete_if_cache

        async def vision_func(prompt, img=None, **kw):
            return await openai_complete_if_cache("gpt-4o", prompt, api_key=OPENAI_API_KEY, **kw)

        async def llm_func(prompt, **kw):
            return await openai_complete_if_cache("gpt-4o-mini", prompt, api_key=OPENAI_API_KEY, **kw)
    else:
        vision_func = None
        llm_func = None

    rag = RAGAnything(
        config=config,
        llm_model_func=llm_func,
        vision_model_func=vision_func,
        embedding_func=None,
    )

    try:
        content_list, doc_id = await rag.parse_document(file_path=file_path, output_dir=output_dir)
    except Exception as e:
        return {"success": False, "error": f"parse_document failed: {str(e)}"}

    # Count pages
    page_indices = set()
    for item in content_list:
        if isinstance(item, dict) and "page_idx" in item:
            page_indices.add(item["page_idx"])

    # Normalize image paths to absolute
    for item in content_list:
        if isinstance(item, dict) and item.get("type") == "image":
            img_path = item.get("img_path", "")
            if img_path and not os.path.isabs(img_path):
                item["img_path"] = os.path.join(output_dir, img_path)
        if isinstance(item, dict):
            for k in list(item.keys()):
                if isinstance(item[k], bytes):
                    try:
                        item[k] = item[k].decode("utf-8", errors="replace")
                    except Exception:
                        item[k] = str(item[k])

    return {
        "success": True,
        "filename": original_filename,
        "content_list": content_list,
        "doc_id": doc_id,
        "page_count": len(page_indices) if page_indices else 1,
        "parser_used": PARSER,
    }


def process_stdin(filename):
    try:
        data = sys.stdin.buffer.read()
        if not data:
            return {"success": False, "error": "No data on stdin"}
        try:
            decoded = base64.b64decode(data)
        except Exception:
            decoded = data

        ext = os.path.splitext(filename)[1] or ".pdf"
        # Check format before temp file
        unsupported = check_file_supported("x" + ext)
        if unsupported:
            return unsupported

        with tempfile.NamedTemporaryFile(delete=False, suffix=ext) as tmp:
            tmp.write(decoded)
            tmp_path = tmp.name
        try:
            return asyncio.run(parse_with_raganything(tmp_path, filename))
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
    except Exception as e:
        return {"success": False, "error": f"stdin failed: {str(e)}"}


def process_file(file_path):
    filename = os.path.basename(file_path)
    unsupported = check_file_supported(file_path)
    if unsupported:
        return unsupported
    if not os.path.exists(file_path):
        return {"success": False, "error": f"File not found: {file_path}"}
    return asyncio.run(parse_with_raganything(file_path, filename))


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"success": False, "error": "Usage: raganything_parser.py <file> | --stdin <filename>"}))
        sys.exit(1)

    arg1 = sys.argv[1]
    if arg1 == "--stdin" and len(sys.argv) >= 3:
        result = process_stdin(sys.argv[2])
    else:
        result = process_file(arg1)

    print(json.dumps(result, ensure_ascii=False))
    sys.exit(0 if result.get("success") else 1)
