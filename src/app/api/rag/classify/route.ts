import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils } from 'coze-coding-dev-sdk';

// 问题分类 API
export async function POST(request: NextRequest) {
  try {
    const { query } = await request.json();
    
    if (!query) {
      return NextResponse.json({ error: '缺少查询内容' }, { status: 400 });
    }

    const classifyPrompt = `你只允许输出两个单词：RAG 或者 SQL
规则：
1. 用户问题需要统计、求和、计数、平均值、分组、月度汇总、查数据数值 → 输出SQL
2. 用户是查文档内容、条款、规则、文字解释，不需要查数据库数字 → 输出RAG
用户提问：${query}`;

    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);
    const llmClient = new LLMClient(new Config(), customHeaders);
    
    const response = await llmClient.invoke(
      [{ role: 'user', content: classifyPrompt }],
      { model: 'doubao-seed-2-0-lite-260215' }
    );

    const result = response.content || 'RAG';
    const route = result.trim().toUpperCase().includes('SQL') ? 'SQL' : 'RAG';

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
