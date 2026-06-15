import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/local-db';
import { LLMClient } from '@/lib/ollama/llm';

const supabase = getSupabaseClient();

// 128k tokens 阈值
const MAX_TOKENS = 128 * 1024;

// 估算文本 token 数（简单估算：中文约 0.5 token/字，英文约 0.25 token/字）
function estimateTokens(text: string): number {
  const chineseChars = (text.match(/[\u4e00-\u9fa5]/g) || []).length;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars * 2 + otherChars * 0.25);
}

// 获取上下文
async function getContext(sessionId: string) {
  const { data, error } = await supabase
    .from('conversation_contexts')
    .select('*')
    .eq('session_id', sessionId)
    .single();
  
  if (error && error.code !== 'PGRST116') {
    throw error;
  }
  
  return data || {
    session_id: sessionId,
    messages: [],
    summary: null,
    total_tokens: 0,
    is_compressed: false
  };
}

// 保存上下文
async function saveContext(context: {
  session_id: string;
  messages: any[];
  summary: string | null;
  total_tokens: number;
  is_compressed: boolean;
}) {
  const { error } = await supabase
    .from('conversation_contexts')
    .upsert({
      session_id: context.session_id,
      messages: context.messages,
      summary: context.summary,
      total_tokens: context.total_tokens,
      is_compressed: context.is_compressed,
      updated_at: new Date().toISOString()
    }, { onConflict: 'session_id' });
  
  if (error) throw error;
}

// 压缩上下文（调用 LLM 总结）
async function compressContext(messages: any[]): Promise<string> {
  const llm = new LLMClient();
  
  // 构建对话历史文本
  const historyText = messages.map(m => 
    `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`
  ).join('\n\n');
  
  const prompt = `请对以下对话历史进行总结压缩，保留关键信息、用户意图和重要上下文，压缩至原体积约1/3。只输出摘要内容，不要其他说明。

对话历史：
${historyText}`;

  try {
    const response = await llm.invoke([
      { role: 'user', content: prompt }
    ]);
    
    return response.content || '';
  } catch (error) {
    console.error('压缩上下文失败:', error);
    // 压缩失败时返回最后几轮对话
    return messages.slice(-6).map(m => 
      `${m.role === 'user' ? '用户' : 'AI'}: ${m.content}`
    ).join('\n\n');
  }
}

// GET: 获取上下文列表或单个上下文
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const sessionId = searchParams.get('session_id');
    const action = searchParams.get('action');

    // 列出所有对话历史
    if (action === 'list') {
      const { data, error } = await supabase
        .from('conversation_contexts')
        .select('session_id, context_data, tokens_used, created_at, updated_at')
        .eq('context_type', 'rag')
        .order('updated_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return NextResponse.json({ success: true, conversations: data || [] });
    }

    if (!sessionId) {
      return NextResponse.json({ error: '缺少 session_id' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('conversation_contexts')
      .select('*')
      .eq('session_id', sessionId)
      .single();
    if (error) return NextResponse.json({ success: true, context: null });
    return NextResponse.json({ success: true, context: data });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: 更新上下文
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { session_id, sessionId, userMessage, aiResponse, action } = body;
    const sid = session_id || sessionId;
    
    if (!sid) {
      return NextResponse.json({ error: '缺少 session_id' }, { status: 400 });
    }
    
    // 获取当前上下文
    let context = await getContext(sid);
    
    if (action === 'add') {
      // 添加新的一问一答
      const newUserMessage = { role: 'user', content: userMessage, timestamp: Date.now() };
      const newAiMessage = { role: 'assistant', content: aiResponse, timestamp: Date.now() };
      
      context.messages = [...(context.messages || []), newUserMessage, newAiMessage];
      
      // 估算当前总 token 数
      const messageTokens = context.messages.reduce((sum: number, m: any) => 
        sum + estimateTokens(m.content), 0);
      const summaryTokens = context.summary ? estimateTokens(context.summary) : 0;
      context.total_tokens = messageTokens + summaryTokens;
      
      // 检查是否需要压缩
      if (context.total_tokens > MAX_TOKENS) {
        console.log(`上下文超限 (${context.total_tokens} > ${MAX_TOKENS})，开始压缩...`);
        context.summary = await compressContext(context.messages);
        context.is_compressed = true;
        // 压缩后保留最近 2 轮对话
        context.messages = context.messages.slice(-4);
        context.total_tokens = estimateTokens(context.summary) + 
          context.messages.reduce((sum: number, m: any) => sum + estimateTokens(m.content), 0);
      }
      
      await saveContext(context);
    } else if (action === 'clear') {
      // 清空上下文
      context = {
        session_id: sid,
        messages: [],
        summary: null,
        total_tokens: 0,
        is_compressed: false
      };
      await saveContext(context);
    } else if (action === 'get' || !action) {
      // 默认返回上下文（get操作）
      return NextResponse.json({ success: true, context });
    }
    
    return NextResponse.json({ success: true, context });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 构建用于问答的完整上下文
export async function buildPromptContext(sessionId: string, newQuestion: string): Promise<string> {
  const context = await getContext(sessionId);
  
  let fullContext = '';
  
  // 如果有压缩摘要，先添加摘要
  if (context.summary) {
    fullContext += `[历史对话摘要]\n${context.summary}\n\n`;
  }
  
  // 添加最近的对话
  if (context.messages && context.messages.length > 0) {
    fullContext += '[最近对话]\n';
    for (const msg of context.messages) {
      fullContext += `${msg.role === 'user' ? '用户' : 'AI'}: ${msg.content}\n`;
    }
    fullContext += '\n';
  }
  
  // 添加当前问题
  fullContext += `[当前问题]\n${newQuestion}`;
  
  return fullContext;
}
