import { NextRequest, NextResponse } from 'next/server';
import { LLMClient } from '@/lib/ollama/llm';
import { Config } from '@/lib/ollama/config';

// 问题分类 API - 支持三分类：RAG / SQL / ALL
export async function POST(request: NextRequest) {
  try {
    const { query, prompt } = await request.json();
    
    if (!query) {
      return NextResponse.json({ error: '缺少查询内容' }, { status: 400 });
    }

    const classifyPrompt = prompt || `你是意图判断专家，分析用户问题，输出标签：
【RAG】：需要查阅文档、条款、规则、说明类文本知识；
【SQL】：需要对数据库做求和、计数、汇总、明细查询；
【ALL】：既需要文档资料，又需要统计数据，两条链路都要执行。
仅输出标签文本：RAG / SQL / ALL，不要多余内容。
用户提问：${query}`;

    const customHeaders: Record<string, string> = {};
    const llmClient = new LLMClient(new Config(), customHeaders);
    
    const response = await llmClient.invoke(
      [{ role: 'user', content: classifyPrompt }],
      { model: 'qwen2.5:3b', temperature: 0 }
    );

    const result = response.content || 'RAG';
    const trimmed = result.trim().toUpperCase();
    
    // 解析三分类结果
    let route = 'RAG';
    if (trimmed.includes('ALL')) {
      route = 'ALL';
    } else if (trimmed.includes('SQL')) {
      route = 'SQL';
    }

    return NextResponse.json({
      route,
      raw: result.trim(),
      query,
    });
  } catch (error) {
    console.error('分类失败:', error);
    return NextResponse.json({ 
      error: '分类失败', 
      route: 'RAG' // 默认走 RAG
    }, { status: 500 });
  }
}
