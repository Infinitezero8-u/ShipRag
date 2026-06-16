import { NextRequest, NextResponse } from 'next/server';
import { LLMClient } from '@/lib/ollama/llm';
import { Config } from '@/lib/ollama/config';

// 问题分类 API — 五分类：LIST / SQL / ALL / RAG / CHAT
export async function POST(request: NextRequest) {
  try {
    const { query, prompt } = await request.json();

    if (!query) {
      return NextResponse.json({ error: '缺少查询内容' }, { status: 400 });
    }

    const classifyPrompt = prompt || `你是意图判断专家，分析用户问题，输出标签：
【LIST】：询问"有哪些/列出全部/清单/目录/所有/一览"等需要完整列表的问题（如"美国港口有哪些""规章制度列表"），需要SELECT查询返回多行结果；
【SQL】：需要对数据库做求和、计数、汇总、统计；
【ALL】：既需要文档资料，又需要统计数据，两条链路都要执行；
【RAG】：需要查阅文档、条款、规则、说明类文本知识，返回相关片段即可；
【CHAT】：纯闲聊、对话历史询问、元问题，不需要知识库检索。
仅输出标签文本：LIST / SQL / ALL / RAG / CHAT，不要多余内容。
用户提问：${query}`;

    const customHeaders: Record<string, string> = {};
    const llmClient = new LLMClient(new Config(), customHeaders);

    const response = await llmClient.invoke(
      [{ role: 'user', content: classifyPrompt }],
      { model: 'qwen2.5:3b', temperature: 0 }
    );

    const result = response.content || 'RAG';
    const trimmed = result.trim().toUpperCase();

    // 解析五分类结果（CHAT 优先级最高，避免误判）
    let route = 'RAG';
    if (trimmed.includes('CHAT')) {
      route = 'CHAT';
    } else if (trimmed.includes('LIST')) {
      route = 'LIST';
    } else if (trimmed.includes('ALL')) {
      route = 'ALL';
    } else if (trimmed.includes('SQL')) {
      route = 'SQL';
    }

    // 关键词兜底：LLM 漏判时，正则强制修正
    const listKeywords = /有哪些|哪些|列出|清单|目录|列表|全部|一览|所有/;
    const portKeywords = /港口|港/;
    const regulationKeywords = /规章|法规|条例|制度/;
    if (route !== 'LIST' && route !== 'CHAT' && listKeywords.test(query)
        && (portKeywords.test(query) || regulationKeywords.test(query))) {
      route = 'LIST';
    }

    return NextResponse.json({ route, raw: result.trim(), query });
  } catch (error) {
    console.error('分类失败:', error);
    return NextResponse.json({ error: '分类失败', route: 'RAG' }, { status: 500 });
  }
}
