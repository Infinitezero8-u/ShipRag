#!/usr/bin/env python3
"""
MarkItDown 文档转换脚本
支持 PDF、Word、Excel、PPT、图片、音频等 15+ 格式转 Markdown
"""

import sys
import json
import os
import tempfile
import base64
import urllib.request

try:
    from markitdown import MarkItDown
except ImportError:
    print(json.dumps({"error": "markitdown not installed. Run: pip install markitdown[all]"}))
    sys.exit(1)


def convert_file(file_path: str) -> dict:
    """将文件转换为 Markdown"""
    try:
        md = MarkItDown()
        result = md.convert(file_path)
        
        return {
            "success": True,
            "content": result.text_content,
            "title": result.title if hasattr(result, 'title') else None,
        }
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


def convert_url(url: str) -> dict:
    """从 URL 下载并转换"""
    try:
        # 下载文件
        with tempfile.NamedTemporaryFile(delete=False, suffix='.tmp') as tmp:
            tmp_path = tmp.name
        
        urllib.request.urlretrieve(url, tmp_path)
        
        # 转换
        result = convert_file(tmp_path)
        
        # 清理
        os.unlink(tmp_path)
        
        return result
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


def convert_base64(content_base64: str, filename: str) -> dict:
    """将 Base64 编码的文件内容转换为 Markdown"""
    try:
        # 创建临时文件
        with tempfile.NamedTemporaryFile(delete=False, suffix=os.path.splitext(filename)[1]) as tmp:
            tmp.write(base64.b64decode(content_base64))
            tmp_path = tmp.name
        
        # 转换
        result = convert_file(tmp_path)
        
        # 清理临时文件
        os.unlink(tmp_path)
        
        return result
    except Exception as e:
        return {
            "success": False,
            "error": str(e)
        }


def main():
    if len(sys.argv) < 2:
        print(json.dumps({"error": "Usage: python markitdown_converter.py <file_path> or --base64 <content> <filename> or --url <url>"}))
        sys.exit(1)
    
    if sys.argv[1] == "--base64":
        if len(sys.argv) < 4:
            print(json.dumps({"error": "Usage: python markitdown_converter.py --base64 <base64_content> <filename>"}))
            sys.exit(1)
        result = convert_base64(sys.argv[2], sys.argv[3])
    elif sys.argv[1] == "--url":
        if len(sys.argv) < 3:
            print(json.dumps({"error": "Usage: python markitdown_converter.py --url <url>"}))
            sys.exit(1)
        result = convert_url(sys.argv[2])
    else:
        file_path = sys.argv[1]
        result = convert_file(file_path)
    
    print(json.dumps(result, ensure_ascii=False))


if __name__ == "__main__":
    main()
