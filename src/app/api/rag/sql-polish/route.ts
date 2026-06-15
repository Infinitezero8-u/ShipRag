import { NextRequest, NextResponse } from 'next/server';
import { LLMClient } from '@/lib/ollama/llm';
import { Config } from '@/lib/ollama/config';

// SQL 结果润色 API
export async function POST(request: NextRequest) {
  try {
    const { query, data } = await request.json();
    
    if (!query) {
      return NextResponse.json({ error: '缺少查询内容' }, { status: 400 });
    }

    const polishPrompt = `根据下面数据库查询出来的数据，用通顺中文回答用户问题，不要编造额外内容。
原始提问：${query}
查询数据：${JSON.stringify(data, null, 2)}`;

    const customHeaders: Record<string, string> = {};
    const llmClient = new LLMClient(new Config(), customHeaders);
    
    const response = await llmClient.invoke(
      [{ role: 'user', content: polishPrompt }],
      { model: 'qwen2.5:3b' }
    );

    const answer = response.content || '无法生成回答';

    return NextResponse.json({
      answer,
      query,
      data,
    });
  } catch (error) {
    console.error('润色失败:', error);
    return NextResponse.json({ 
      error: '润色失败',
      answer: '无法润色结果'
    }, { status: 500 });
  }
}
