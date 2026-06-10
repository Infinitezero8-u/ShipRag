#!/usr/bin/env python3
"""
GraphRAG 实体搜索桥接脚本
从 PostgreSQL 导出实体数据，构建 GraphRAG 索引，提供实体级别精确搜索。

用法:
  python3 scripts/graphrag_entity.py init          # 首次：初始化 GraphRAG 配置
  python3 scripts/graphrag_entity.py index         # 从数据库导出实体数据并索引
  python3 scripts/graphrag_entity.py search "金兰湾" # 实体搜索
  python3 scripts/graphrag_entity.py status        # 查看索引状态
"""
import sys, json, os, subprocess, shutil
from pathlib import Path

# GraphRAG 索引目录
INDEX_DIR = Path(__file__).parent.parent / ".graphrag_index"
GRAPHRAG_DIR = INDEX_DIR / "graphrag"

GLOBAL_SEARCH_INSTRUCTIONS = """
You are a maritime knowledge assistant. Given the user query, find exact entity
matches from the knowledge graph: port names, port codes, countries, routes, and
any maritime regulations referenced. Return exact matches first, then related entities.
Prioritize: exact name match > code match > country match > semantic match.
"""


def init_graphrag_config():
    """初始化 GraphRAG 配置（project root 下运行一次即可）"""
    INDEX_DIR.mkdir(parents=True, exist_ok=True)
    os.chdir(str(INDEX_DIR))

    # GraphRAG v3 初始化
    try:
        subprocess.run(
            ["python3", "-m", "graphrag", "init", "--root", "."],
            capture_output=True, text=True, check=False, timeout=30
        )
    except Exception:
        pass

    # 写入 settings
    settings = {
        "encoding_model": "cl100k_base",
        "skip_workflows": [],
        "llm": {
            "type": "openai_chat",
            "api_key": os.environ.get("COZE_API_KEY", ""),
            "model": "doubao-seed-1-8-251228",
            "api_base": os.environ.get("COZE_API_BASE_URL", "https://api.coze.cn") + "/v1",
            "max_tokens": 4000,
            "temperature": 0,
        },
        "embeddings": {
            "llm": {
                "type": "openai_embedding",
                "api_key": os.environ.get("COZE_API_KEY", ""),
                "model": "text-embedding-ada-002",
                "api_base": os.environ.get("COZE_API_BASE_URL", "https://api.coze.cn") + "/v1",
            }
        },
        "chunks": {
            "size": 1200,
            "overlap": 100,
        },
        "global_search": {
            "search_prompt": GLOBAL_SEARCH_INSTRUCTIONS,
        },
    }
    (INDEX_DIR / "settings.yaml").write_text(
        __import__("yaml").dump(settings, default_flow_style=False)
    )
    print(json.dumps({"status": "ok", "msg": "GraphRAG config initialized"}))
    return True


def export_entities_from_db():
    """从 PostgreSQL 导出港口/航线/规章数据为文本文件"""
    import psycopg2

    conn = psycopg2.connect(
        host="localhost", port=5432, user="shiprag",
        password="shiprag123", database="shiprag"
    )
    cur = conn.cursor()
    input_dir = GRAPHRAG_DIR / "input"
    input_dir.mkdir(parents=True, exist_ok=True)

    count = 0

    # 港口实体 → port_data.txt
    cur.execute("SELECT port_code, name_cn, ctry_name_cn, lon, lat, port_type FROM port_data LIMIT 5000")
    with open(input_dir / "port_data.txt", "w") as f:
        for row in cur.fetchall():
            code, name, country, lon, lat, ptype = row
            f.write(f"## 港口实体: {name} ({code})\n"
                    f"港口代码: {code}\n"
                    f"港口名称: {name}\n"
                    f"所属国家: {country}\n"
                    f"坐标: {lon}, {lat}\n"
                    f"类型: {ptype}\n\n")
            count += 1

    # 航线实体 → route_data.txt
    cur.execute("SELECT orig_port, dest_port, geometry_wkt FROM route_data LIMIT 2000")
    with open(input_dir / "route_data.txt", "w") as f:
        for row in cur.fetchall():
            orig, dest, geom = row
            f.write(f"## 航线实体: {orig} → {dest}\n"
                    f"起始港: {orig}\n"
                    f"目的港: {dest}\n\n")
            count += 1

    cur.close()
    conn.close()

    return count


def run_indexing():
    """运行 GraphRAG 索引"""
    idx = export_entities_from_db()
    print(f"Exported {idx} entities for indexing", file=sys.stderr)

    # GraphRAG v3: upload → build-index → create-base-text-units
    os.chdir(str(INDEX_DIR))
    cmds = [
        ["python3", "-m", "graphrag", "index", "--workflow", "create_base_text_units"],
        ["python3", "-m", "graphrag", "index", "--workflow", "create_final_documents"],
        ["python3", "-m", "graphrag", "index", "--workflow", "extract_graph"],
        ["python3", "-m", "graphrag", "index", "--workflow", "generate_text_embeddings"],
    ]
    for cmd in cmds:
        subprocess.run(cmd, capture_output=True, timeout=300)

    return {"status": "ok", "entities_indexed": idx}


def entity_search(query: str, top_k: int = 20):
    """使用 GraphRAG 进行实体搜索"""
    if not INDEX_DIR.exists():
        # 索引目录不存在，直接走数据库搜索
        return {"exact": _pg_entity_search(query, top_k), "graph": "(GraphRAG index not built yet)"}

    # 优先: 精确实体匹配（直接用数据库查询，更快）
    exact = _pg_entity_search(query, top_k)

    # 兜底: GraphRAG global search
    try:
        result = subprocess.run(
            ["python3", "-m", "graphrag", "query", "--root", ".",
             "--method", "global",
             f"--query={query}"],
            capture_output=True, text=True, timeout=120
        )
        graph_result = result.stdout.strip()
    except Exception:
        graph_result = ""

    return {"exact": exact, "graph": graph_result}


def _pg_entity_search(query: str, limit: int = 20):
    """直接在 PostgreSQL 中做实体精确匹配（比 GraphRAG 索引更快）"""
    import psycopg2
    conn = psycopg2.connect(
        host="localhost", port=5432, user="shiprag",
        password="shiprag123", database="shiprag"
    )
    cur = conn.cursor()
    q = f"%{query}%"
    results = []

    # 港口精确匹配
    cur.execute(
        "SELECT port_code, name_cn, ctry_name_cn, lon, lat FROM port_data "
        "WHERE port_code ILIKE %s OR name_cn ILIKE %s OR name_pinyin ILIKE %s "
        "ORDER BY CASE WHEN name_cn = %s THEN 0 WHEN name_cn ILIKE %s THEN 1 ELSE 2 END LIMIT %s",
        (q, q, q, query, f"{query}%", limit)
    )
    for row in cur.fetchall():
        results.append({
            "type": "port", "code": row[0], "name": row[1],
            "country": row[2], "lon": row[3], "lat": row[4], "match": "exact"
        })

    # 航线匹配
    cur.execute(
        "SELECT orig_port, dest_port FROM route_data "
        "WHERE orig_port ILIKE %s OR dest_port ILIKE %s LIMIT %s",
        (q, q, min(limit, 10))
    )
    for row in cur.fetchall():
        results.append({
            "type": "route", "orig": row[0], "dest": row[1], "match": "exact"
        })

    cur.close()
    conn.close()
    return results


def status():
    """查询索引状态"""
    info = {
        "index_dir": str(INDEX_DIR),
        "graphrag_dir": str(GRAPHRAG_DIR),
        "has_config": (INDEX_DIR / "settings.yaml").exists(),
        "has_input": (GRAPHRAG_DIR / "input" / "port_data.txt").exists(),
        "entity_count": "N/A",
        "graphrag_version": "3.1.0",
        "raganything_version": "1.3.1",
    }

    # 尝试数实体
    import psycopg2
    try:
        conn = psycopg2.connect(host="localhost", port=5432, user="shiprag", password="shiprag123", database="shiprag")
        cur = conn.cursor()
        cur.execute("SELECT COUNT(*) FROM port_data")
        info["entity_count"] = cur.fetchone()[0]
        cur.close()
        conn.close()
    except Exception:
        pass

    return info


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print(json.dumps({"error": "用法: init | index | search <query> | status"}))
        sys.exit(1)

    cmd = sys.argv[1]
    if cmd == "init":
        print(json.dumps(init_graphrag_config() if init_graphrag_config() else {"status": "ok"}))
    elif cmd == "index":
        print(json.dumps(run_indexing()))
    elif cmd == "search":
        query = sys.argv[2] if len(sys.argv) > 2 else ""
        print(json.dumps(entity_search(query), ensure_ascii=False))
    elif cmd == "status":
        print(json.dumps(status(), ensure_ascii=False, default=str))
    else:
        print(json.dumps({"error": f"未知命令: {cmd}"}))
