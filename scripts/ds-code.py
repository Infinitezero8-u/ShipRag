#!/usr/bin/env python3
"""
DeepSeek 编程助手 CLI
使用 DeepSeek API 协助编程任务
"""

import os
import sys
import json
import argparse
import requests
from pathlib import Path

# DeepSeek API 配置
DEEPSEEK_API_KEY = os.environ.get("DEEPSEEK_API_KEY", "sk-ae3ce6b347ae409b9e417346779828e3")
DEEPSEEK_API_URL = "https://api.deepseek.com/v1/chat/completions"

def get_file_context(file_path: str) -> str:
    """读取文件内容作为上下文"""
    try:
        path = Path(file_path)
        if path.exists():
            return path.read_text(encoding='utf-8')
        return f"文件不存在: {file_path}"
    except Exception as e:
        return f"读取文件失败: {e}"

def get_project_context() -> str:
    """获取项目上下文"""
    context_parts = []
    
    # 读取关键文件
    key_files = [
        "package.json",
        "tsconfig.json",
        "AGENTS.md",
        "src/app/page.tsx",
    ]
    
    for file in key_files:
        path = Path(file)
        if path.exists():
            content = path.read_text(encoding='utf-8')
            context_parts.append(f"\n--- {file} ---\n{content[:2000]}...")
    
    return "\n".join(context_parts)

def call_deepseek(prompt: str, system: str = None, stream: bool = True) -> str:
    """调用 DeepSeek API"""
    headers = {
        "Authorization": f"Bearer {DEEPSEEK_API_KEY}",
        "Content-Type": "application/json"
    }
    
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    
    payload = {
        "model": "deepseek-coder",
        "messages": messages,
        "stream": stream,
        "temperature": 0.7,
        "max_tokens": 4096
    }
    
    try:
        response = requests.post(
            DEEPSEEK_API_URL,
            headers=headers,
            json=payload,
            stream=stream,
            timeout=60
        )
        
        if response.status_code != 200:
            return f"API 错误: {response.status_code} - {response.text}"
        
        if stream:
            result = []
            for line in response.iter_lines():
                if line:
                    line = line.decode('utf-8')
                    if line.startswith('data: '):
                        data = line[6:]
                        if data == '[DONE]':
                            break
                        try:
                            chunk = json.loads(data)
                            if chunk.get('choices'):
                                delta = chunk['choices'][0].get('delta', {})
                                content = delta.get('content', '')
                                if content:
                                    print(content, end='', flush=True)
                                    result.append(content)
                        except json.JSONDecodeError:
                            continue
            print()
            return ''.join(result)
        else:
            return response.json()['choices'][0]['message']['content']
            
    except Exception as e:
        return f"调用失败: {e}"

def main():
    parser = argparse.ArgumentParser(
        description="DeepSeek 编程助手",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  ds-code "写一个React按钮组件"
  ds-code "解释 src/app/page.tsx 的功能" -f src/app/page.tsx
  ds-code "优化这个函数" -f src/lib/utils.ts
  ds-code "帮我实现用户登录功能" --context
        """
    )
    parser.add_argument("prompt", help="编程问题或任务")
    parser.add_argument("-f", "--file", help="指定文件作为上下文")
    parser.add_argument("--context", action="store_true", help="包含项目上下文")
    parser.add_argument("--no-stream", action="store_true", help="禁用流式输出")
    parser.add_argument("-m", "--model", default="deepseek-coder", help="模型名称")
    
    args = parser.parse_args()
    
    # 构建系统提示
    system_prompt = """你是一个专业的编程助手，精通 TypeScript、React、Next.js、Node.js 等技术栈。
你的任务是帮助用户：
1. 编写高质量、可维护的代码
2. 解释代码逻辑和最佳实践
3. 重构和优化现有代码
4. 解决编程问题和 bug
5. 提供架构设计建议

请用中文回答，代码使用代码块格式输出。"""

    # 构建用户提示
    user_prompt = args.prompt
    
    # 添加文件上下文
    if args.file:
        file_content = get_file_context(args.file)
        user_prompt = f"文件内容:\n```\n{file_content}\n```\n\n问题: {args.prompt}"
    
    # 添加项目上下文
    if args.context:
        project_ctx = get_project_context()
        user_prompt = f"项目上下文:\n{project_ctx}\n\n{user_prompt}"
    
    print(f"\n🤖 DeepSeek 编程助手 (模型: {args.model})")
    print("=" * 50)
    print()
    
    result = call_deepseek(
        user_prompt,
        system=system_prompt,
        stream=not args.no_stream
    )

if __name__ == "__main__":
    main()
