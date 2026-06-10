#!/usr/bin/env python3
"""
本地文本嵌入脚本 — 替代 Coze EmbeddingClient
使用 sentence-transformers 在本地生成向量，无需外部 API

首次运行会自动下载模型 (~80MB)，之后使用本地缓存。

用法:
  echo "要向量化的文本" | python3 scripts/embed_text.py
  python3 scripts/embed_text.py "要向量化的文本"
  python3 scripts/embed_text.py --batch "文本1" "文本2" "文本3"
  python3 scripts/embed_text.py --file /path/to/file.txt
  python3 scripts/embed_text.py --image-url https://example.com/image.jpg
"""

import sys
import json
import os
import hashlib
import subprocess

# pgvector 兼容的目标维度
TARGET_DIM = 1536

# 缓存已加载的模型
_model = None
_model_name = None


def get_model():
    """懒加载 sentence-transformers 模型"""
    global _model, _model_name
    if _model is not None:
        return _model

    # 使用国内镜像加速下载
    if not os.environ.get("HF_ENDPOINT"):
        os.environ["HF_ENDPOINT"] = "https://hf-mirror.com"
        print("[embed] 使用 HuggingFace 镜像: hf-mirror.com", file=sys.stderr)

    # 优先使用体积小、效果好的多语言模型
    candidates = [
        "paraphrase-multilingual-MiniLM-L12-v2",  # 384维, ~120MB, 多语言
        "all-MiniLM-L6-v2",                        # 384维, ~80MB
    ]

    for name in candidates:
        try:
            from sentence_transformers import SentenceTransformer
            _model = SentenceTransformer(name)
            _model_name = name
            dim = _model.get_sentence_embedding_dimension()
            print(f"[embed] 模型已加载: {name} (维度: {dim})", file=sys.stderr)
            return _model
        except Exception as e:
            print(f"[embed] 模型 {name} 加载失败: {e}", file=sys.stderr)
            continue

    # 如果 sentence-transformers 不可用，尝试用 sklearn TF-IDF + SVD 作为 fallback
    try:
        print("[embed] sentence-transformers 不可用，使用 TF-IDF fallback", file=sys.stderr)
        return _create_fallback_model()
    except Exception:
        raise RuntimeError(
            "无法加载任何嵌入模型。请安装: pip install sentence-transformers"
        )


def _create_fallback_model():
    """创建 sklearn TF-IDF + TruncatedSVD 作为 fallback（不推荐，仅应急）"""
    from sklearn.feature_extraction.text import TfidfVectorizer
    from sklearn.decomposition import TruncatedSVD

    class FallbackEmbedder:
        def __init__(self):
            self.vectorizer = TfidfVectorizer(max_features=5000)
            self.svd = TruncatedSVD(n_components=TARGET_DIM)
            self._fitted = False
            self._corpus = []

        def encode(self, texts, **kwargs):
            if not self._fitted:
                self._corpus = list(texts)
                X = self.vectorizer.fit_transform(texts)
                if X.shape[1] < TARGET_DIM:
                    # 特征不够，直接返回截断的TF-IDF
                    import numpy as np
                    result = np.zeros((len(texts), TARGET_DIM))
                    dense = X.toarray()
                    result[:, :dense.shape[1]] = dense
                    return result
                self.svd.fit(X)
                self._fitted = True

            X = self.vectorizer.transform(texts)
            result = self.svd.transform(X)
            return result.astype('float32')

        def get_sentence_embedding_dimension(self):
            return TARGET_DIM

    print("[embed] 警告: 使用 TF-IDF fallback，相似度质量会降低", file=sys.stderr)
    return FallbackEmbedder()


def pad_embedding(embedding, target_dim=TARGET_DIM):
    """将向量填充/截断到目标维度"""
    import numpy as np
    vec = np.array(embedding, dtype='float32')
    if vec.shape[0] == target_dim:
        return vec.tolist()
    if vec.shape[0] > target_dim:
        return vec[:target_dim].tolist()
    # 填充零
    padded = np.zeros(target_dim, dtype='float32')
    padded[:vec.shape[0]] = vec
    return padded.tolist()


def embed_text(text):
    """嵌入单段文本"""
    model = get_model()
    embedding = model.encode([text], show_progress_bar=False)[0]
    return pad_embedding(embedding)


def embed_texts(texts):
    """批量嵌入"""
    model = get_model()
    embeddings = model.encode(texts, show_progress_bar=False)
    return [pad_embedding(e) for e in embeddings]


def embed_image_from_url(url):
    """
    从 URL 下载图片并用 markitdown 转文本后嵌入。
    如果需要真正的图片嵌入，需要 CLIP 模型。
    """
    try:
        from markitdown import MarkItDown
        md = MarkItDown()
        result = md.convert(url)
        text = result.text_content.strip()
        if not text:
            return None
        return embed_text(text)
    except ImportError:
        raise RuntimeError("需要安装 markitdown: pip install 'markitdown[all]'")


def embed_file(filepath):
    """
    用 markitdown 将文件转为文本后嵌入。
    支持 PDF, Word, Excel, PPT, 图片, HTML 等。
    """
    try:
        from markitdown import MarkItDown
        md = MarkItDown()
        result = md.convert(filepath)
        text = result.text_content.strip()
        if not text:
            raise ValueError(f"文件 {filepath} 无法提取文本内容")
        return embed_text(text)
    except ImportError:
        raise RuntimeError("需要安装 markitdown: pip install 'markitdown[all]'")


def main():
    import argparse

    parser = argparse.ArgumentParser(description="本地文本嵌入")
    parser.add_argument("text", nargs="*", help="要嵌入的文本")
    parser.add_argument("--batch", nargs="*", help="批量嵌入")
    parser.add_argument("--file", help="从文件嵌入（使用 markitdown 解析）")
    parser.add_argument("--image-url", help="从图片 URL 嵌入")
    parser.add_argument("--stdin", action="store_true", help="从 stdin 读取文本")
    parser.add_argument("--dim", type=int, default=TARGET_DIM, help=f"目标维度（默认 {TARGET_DIM}）")

    args = parser.parse_args()

    try:
        if args.file:
            result = embed_file(args.file)
            print(json.dumps({"embedding": result}))
        elif args.image_url:
            result = embed_image_from_url(args.image_url)
            if result is None:
                print(json.dumps({"error": "无法从图片提取文本"}))
                sys.exit(1)
            print(json.dumps({"embedding": result}))
        elif args.batch:
            results = embed_texts(args.batch)
            print(json.dumps({"embeddings": results}))
        elif args.stdin:
            text = sys.stdin.read().strip()
            if not text:
                print(json.dumps({"error": "stdin 为空"}))
                sys.exit(1)
            result = embed_text(text)
            print(json.dumps({"embedding": result}))
        elif args.text:
            text = " ".join(args.text)
            result = embed_text(text)
            print(json.dumps({"embedding": result}))
        else:
            # 默认从 stdin 读取
            text = sys.stdin.read().strip()
            if not text:
                print(json.dumps({"error": "无输入文本"}))
                sys.exit(1)
            result = embed_text(text)
            print(json.dumps({"embedding": result}))

    except Exception as e:
        print(json.dumps({"error": str(e)}))
        sys.exit(1)


if __name__ == "__main__":
    main()
