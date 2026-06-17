'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { truncateMiddle } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { DataMaintainPanel } from '@/components/data-maintain-panel';
// HistoryPanel inlined below
import {
  Upload, Search, MessageSquare, FileText, Image, FileSpreadsheet,
  Loader2, Send, Play, Pause, X, ChevronLeft, ChevronRight, Eye, Trash2,
  Database, BarChart3, Map, Settings, Download, FileUp, Filter
} from 'lucide-react';
import dynamic from 'next/dynamic';

// 海图组件（懒加载）
const SeaMapComponent = dynamic(() => import('@/app/sea-chart/SeaMap'), {
  ssr: false,
  loading: () => <div className="h-64 flex items-center justify-center bg-slate-100 rounded-lg text-slate-400 text-sm">海图加载中...</div>,
});

// ── 类型定义 ──────────────────────────────────
type Modality = 'text' | 'image' | 'excel' | 'doc' | 'md' | 'json';
type Panel = 'home' | 'rag' | 'search' | 'upload' | 'maintain' | 'chart' | 'trajectory' | 'training' | 'inference' | 'workflow' | 'dashboard' | 'settings' | 'label' | 'autoresearch' | 'overview';
interface KnowItem { id: string; modality: string; title: string; content: string; source: string; similarity?: number; status?: string; metadata?: Record<string, unknown>; }
interface PagInfo { page: number; pageSize: number; totalCount: number; totalPages: number; hasMore: boolean; }

// ── 模块卡片（按分类分组）───────────────
const CATEGORIES = [
  { title: '知识引擎', items: [
    { id: 'rag' as Panel,       label: '智能问答', icon: '💬', color: '#8b5cf6' },
    { id: 'search' as Panel,    label: '知识检索', icon: '🔍', color: '#0ea5e9' },
    { id: 'upload' as Panel,    label: '文件上传', icon: '📤', color: '#10b981' },
    { id: 'maintain' as Panel,  label: '数据维护', icon: '🗄️', color: '#f59e0b' },
    { id: 'autoresearch' as Panel, label: '知识管理', icon: '📋', color: '#f97316' },
  ]},
  { title: '航迹平台', items: [
    { id: 'trajectory' as Panel,label: '航迹分析', icon: '📈', color: '#06b6d4' },
    { id: 'training' as Panel,  label: '航迹训练', icon: '🧠', color: '#ec4899' },
    { id: 'inference' as Panel, label: '航迹推理', icon: '🎯', color: '#a855f7' },
    { id: 'label' as Panel,     label: '航迹标注', icon: '🏷️', color: '#eab308' },
  ]},
  { title: '数据视图', items: [
    { id: 'overview' as Panel,  label: '数据概览', icon: '📊', color: '#14b8a6' },
    { id: 'chart' as Panel,     label: '海图',     icon: '🗺️', color: '#f43f5e' },
    { id: 'dashboard' as Panel, label: '仪表盘',   icon: '📉', color: '#8b5cf6' },
  ]},
  { title: '系统管理', items: [
    { id: 'workflow' as Panel,  label: '工作流',   icon: '⚙️', color: '#64748b' },
    { id: 'settings' as Panel,  label: '系统设置', icon: '⚡', color: '#78716c' },
  ]},
];


// ── 历史记录弹窗（内联）──────────────────
function HistoryModal({ type, onClose, onLoad }: {
  type: 'rag' | 'search';
  onClose: () => void;
  onLoad: (query: string) => void;
}) {
  const [list, setList] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 15;

  useEffect(() => {
    setLoading(true);
    fetch('/api/history?type=' + type + '&page=' + page + '&pageSize=' + pageSize)
      .then(r => r.json())
      .then(d => { if (d.success) { setList(d.history || []); setTotal(d.pagination?.totalCount || 0); }})
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [page, type]);

  const doExport = async () => {
    const r = await fetch('/api/history?action=export&type=' + type);
    if (!r.ok) return alert('导出失败');
    const blob = await r.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '历史记录_' + type + '_' + new Date().toISOString().slice(0,10) + '.xlsx';
    a.click();
  };

  const doDelete = async (id: string) => {
    if (!confirm('删除此条记录？')) return;
    await fetch('/api/history?id=' + id, { method: 'DELETE' });
    setList(list.filter((item: any) => item.id !== id));
  };

  const doClear = async () => {
    if (!confirm('确认清空所有记录？此操作不可恢复。')) return;
    await fetch('/api/history?action=clear&type=' + type, { method: 'DELETE' });
    setList([]); setTotal(0);
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="bg-white rounded-lg shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
        onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between p-3 border-b shrink-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold">{type === 'rag' ? '💬 智能问答' : '🔍 智能检索'}</span>
            <span className="text-xs text-slate-400">共 {total} 条记录</span>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={doExport} disabled={total === 0}
              className="px-3 py-1 bg-green-600 text-white rounded text-xs hover:bg-green-700 disabled:opacity-30">
              导出Excel
            </button>
            <button onClick={doClear} disabled={total === 0}
              className="px-3 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600 disabled:opacity-30">
              清空
            </button>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-700 text-lg">✕</button>
          </div>
        </div>
        {/* List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="text-center py-8 text-slate-400 text-sm">加载中...</div>
          ) : list.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">暂无记录</div>
          ) : (
            list.map((item: any) => (
              <div key={item.id} className="p-3 border-b hover:bg-slate-50 cursor-pointer group"
                onClick={() => onLoad(item.query)}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-xs font-medium text-slate-700 flex-1 line-clamp-2">{item.query}</p>
                  <button onClick={(e) => { e.stopPropagation(); doDelete(item.id); }}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 text-xs shrink-0">
                    🗑
                  </button>
                </div>
                {item.answer && (
                  <p className="text-[11px] text-slate-400 line-clamp-1 mt-1">{item.answer?.substring(0, 100)}</p>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-slate-400">
                    {item.created_at ? new Date(item.created_at).toLocaleString('zh-CN') : ''}
                  </span>
                  {item.result_count > 0 && <span className="text-[10px] text-slate-400">{item.result_count}条结果</span>}
                </div>
              </div>
            ))
          )}
        </div>
        {/* Pagination */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-2 py-2 border-t shrink-0">
            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)}
              className="px-2 py-1 text-xs border rounded disabled:opacity-30">上一页</button>
            <span className="text-xs text-slate-500">{page} / {totalPages}</span>
            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)}
              className="px-2 py-1 text-xs border rounded disabled:opacity-30">下一页</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ── 微信风格对话面板 ──────────────────────────
function RagPanel({ back }: { back: () => void }) {
  const [q, setQ] = useState('');
  const [messages, setMessages] = useState<{ role: 'user' | 'assistant'; content: string; time: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [sid, setSid] = useState(() => 'rag-' + Date.now());
  const [convList, setConvList] = useState<{ session_id: string; title: string; time: string }[]>([]);
  const [showSidebar, setShowSidebar] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const msgEndRef = useRef<HTMLDivElement>(null);

  // 加载对话列表
  const loadConvList = async () => {
    try {
      const r = await fetch('/api/context?action=list');
      const d = await r.json();
      if (d.success) {
        setConvList((d.conversations || []).map((c: any) => {
          const msgs = c.context_data?.messages || [];
          const q = msgs.filter((m: any) => m.role === 'user').pop();
          return {
            session_id: c.session_id,
            title: (q?.content || '对话').substring(0, 40),
            time: c.updated_at ? new Date(c.updated_at).toLocaleString('zh-CN') : '',
          };
        }));
      }
    } catch { /* ignore */ }
  };
  useEffect(() => { loadConvList(); }, []);

  // 自动滚动到底部
  useEffect(() => { msgEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages]);

  // 发送
  const ask = async () => {
    if (!q.trim()) return;
    const curQ = q; setQ('');
    const now = new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
    setMessages(prev => [...prev, { role: 'user', content: curQ, time: now }]);
    setLoading(true);
    try {
      const r = await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: curQ, stream: false, sessionId: sid }),
      });
      const d = await r.json();
      const curA = d.answer || d.error || '无结果';
      setMessages(prev => [...prev, { role: 'assistant', content: curA, time: new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) }]);
      loadConvList();
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: '请求失败', time: now }]);
    }
    setLoading(false);
  };

  // 加载历史对话
  const loadConv = async (id: string) => {
    setSid(id);
    setMessages([]);
    try {
      const r = await fetch('/api/context?session_id=' + id);
      const d = await r.json();
      if (d.success && d.context?.context_data?.messages) {
        const msgs = d.context.context_data.messages;
        setMessages(msgs.map((m: any) => ({
          role: m.role,
          content: m.content,
          time: m.time ? new Date(m.time).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' }) : '',
        })));
      }
    } catch { /* ignore */ }
  };

  const newChat = () => {
    setSid('rag-' + Date.now());
    setMessages([]);
  };

  return (
    <div className="flex" style={{ height: 'calc(100vh - 6rem)' }}>
      {/* 左侧对话列表 */}
      {showSidebar && (
        <div className="w-[140px] shrink-0 border-r bg-slate-50 flex flex-col mr-3">
          <div className="p-2 border-b flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-600">对话列表</span>
            <div className="flex gap-1">
              <button onClick={newChat} className="text-[10px] text-blue-500 hover:text-blue-700" title="新建">+</button>
              <button onClick={() => setShowSidebar(false)} className="text-[10px] text-slate-400 hover:text-slate-600" title="收起">✕</button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-1 space-y-0.5">
            {convList.length === 0 && <div className="text-[10px] text-slate-400 text-center py-4">暂无对话</div>}
            {convList.map(c => (
              <button key={c.session_id} onClick={() => loadConv(c.session_id)}
                className={`w-full text-left p-1.5 rounded text-[10px] truncate whitespace-nowrap leading-tight hover:bg-slate-200 ${c.session_id === sid ? 'bg-blue-100 font-medium' : ''}`}>
                <div className="truncate whitespace-nowrap">{c.title}</div>
                <div className="text-[9px] text-slate-400">{c.time.split(' ')[0] || c.time}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* 右侧主聊天区 */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* 顶栏 */}
        <div className="flex items-center justify-between mb-2 shrink-0">
          <div className="flex items-center gap-2">
            {!showSidebar && (
              <Button variant="ghost" size="sm" onClick={() => { setShowSidebar(true); loadConvList(); }} className="text-slate-400" title="展开列表">☰</Button>
            )}
            <Button variant="ghost" size="sm" onClick={back} className="text-slate-500">
              <ChevronLeft className="w-4 h-4 mr-1" />返回
            </Button>
            <h2 className="font-bold text-sm">💬 智能问答</h2>
          </div>
          {!showSidebar && <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => { setShowSidebar(true); loadConvList(); }}>📋 对话</Button>}
          <Button size="sm" variant="outline" className="h-7 text-[10px] text-indigo-600" onClick={async () => {
      const r = await fetch('/api/history?type=rag&page=1&pageSize=20');
      const d = await r.json();
      const items = d.history || [];
      if (items.length === 0) { alert('暂无智能问答历史记录'); return; }
      const text = items.slice(0, 20).map((h: any, i: number) =>
        `${i+1}. [${new Date(h.created_at).toLocaleString('zh-CN')}] ${h.query?.substring(0,80)}`
      ).join('\n\n');
      alert('智能问答历史 (最近20条):\n\n' + text);
    }}>📜 历史</Button>
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={newChat}>➕ 新建</Button>
        </div>

        {/* 消息区 */}
        <div className="flex-1 overflow-y-auto px-1 space-y-3 min-h-0">
          {messages.length === 0 && !loading && (
            <div className="text-center text-slate-400 text-xs py-8">开始新的对话吧</div>
          )}
          {messages.map((m, i) => (
            <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              {/* 头像 */}
              <div className={`w-7 h-7 rounded-full shrink-0 flex items-center justify-center text-white text-[11px] font-bold ${m.role === 'user' ? 'order-2 ml-2 bg-blue-400' : 'order-1 mr-2 bg-emerald-400'}`}>
                {m.role === 'user' ? '我' : 'AI'}
              </div>
              {/* 气泡 */}
              <div className={`max-w-[85%] ${m.role === 'user' ? 'order-1' : 'order-2'}`}>
                <div className={`text-[10px] mb-0.5 ${m.role === 'user' ? 'text-right text-blue-500' : 'text-left text-emerald-600'}`}>
                  {m.role === 'user' ? '我' : 'ShipRag AI'}
                  {m.time && <span className="text-slate-400 ml-1">{m.time}</span>}
                </div>
                <div className={`px-3 py-2 rounded-2xl text-sm whitespace-pre-wrap break-words ${
                  m.role === 'user'
                    ? 'bg-blue-500 text-white rounded-tr-md'
                    : 'bg-slate-100 text-slate-800 rounded-tl-md'
                }`}>
                  {m.content}
                </div>
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="w-7 h-7 rounded-full bg-emerald-400 flex items-center justify-center text-white text-[11px] font-bold mr-2">AI</div>
              <div className="bg-slate-100 px-3 py-2 rounded-2xl rounded-tl-md text-sm text-slate-500">
                <Loader2 className="w-4 h-4 inline animate-spin mr-1" />思考中...
              </div>
            </div>
          )}
          <div ref={msgEndRef} />
        </div>

        {/* 输入区 */}
        <div className="flex gap-2 shrink-0 pt-2 border-t mt-2">
          <Textarea value={q} onChange={e => setQ(e.target.value)}
            placeholder="输入问题..."
            className="flex-1 text-sm resize-none" rows={2}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }} />
          <Button onClick={ask} disabled={loading} size="sm" className="h-auto shrink-0 self-end">
            <Send className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* ── 历史记录浮窗 ── */}
      {showHistory && <HistoryModal type="rag" onClose={() => setShowHistory(false)}
        onLoad={(query) => { setQ(query); setShowHistory(false); }} />}
    </div>
  );
}

// ── 条目预览浮窗 ─────────────────────────────
function PreviewModal({ item, tab, onClose, onTab, onSaved }: {
  item: { id: string; modality: string; title: string; content: string; source: string; similarity?: number; status?: string; metadata?: Record<string, unknown> };
  tab: string; onClose: () => void; onTab: (t: 'preview' | 'raw' | 'edit') => void;
  onSaved?: () => void;
}) {
  const imgUrl = (item.metadata?.imageUrl as string) || (item.metadata?.localUrl as string) || (item.metadata?.localPath as string);
  const isImage = item.modality === 'image';
  const imgSrc = imgUrl ? (imgUrl.startsWith('/') ? imgUrl : '/api/search?action=preview-image&path=' + encodeURIComponent(imgUrl)) : '';
  const rawData = item.content ? (item.modality === 'json' ? (function(){ try { return JSON.stringify(JSON.parse(item.content), null, 2); } catch { return item.content; } })() : item.content) : JSON.stringify(item, null, 2);

  // 编辑表单状态
  const [editTitle, setEditTitle] = useState(item.title || '');
  const [editContent, setEditContent] = useState(item.content || '');
  const [editMetadata, setEditMetadata] = useState(JSON.stringify(item.metadata || {}, null, 2));
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [generatingDesc, setGeneratingDesc] = useState(false);

  // 用 Ollama 视觉模型重新生成图片描述
  const handleGenerateDescription = async () => {
    const imgPath = (item.metadata?.localPath as string) || (item.metadata?.imageUrl as string);
    if (!imgPath) { setSaveMsg('❌ 无本地图片路径'); return; }
    setGeneratingDesc(true); setSaveMsg('');
    try {
      // 读取本地文件转 base64
      let base64: string;
      if (imgPath.startsWith('/')) {
        const r = await fetch('/api/search?action=preview-image&path=' + encodeURIComponent(imgPath));
        const buf = await r.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = '';
        for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
        base64 = btoa(binary);
      } else if (imgPath.startsWith('http')) {
        const r = await fetch(imgPath);
        const buf = await r.arrayBuffer();
        base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
      } else { setSaveMsg('❌ 无法读取图片'); setGeneratingDesc(false); return; }

      const mime = imgPath.endsWith('.png') ? 'image/png' : 'image/jpeg';
      const r = await fetch('http://localhost:11434/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'qwen3.5:9b', stream: false,
          messages: [{ role: 'user', content: '请用中文详细描述这张图片的全部内容。要求：\n1. 提取图片中所有可见文字，逐条列出\n2. 描述图片中的界面元素、按钮、表格、图表\n3. 标注关键数字、日期、名称等\n4. 尽量详尽，不限字数',
            images: ['data:' + mime + ';base64,' + base64] }],
        }),
      });
      const d = await r.json();
      const desc = d.message?.content || '无法识别图片内容';
      setEditContent(desc);
      setSaveMsg('✅ 描述已生成');
    } catch (e) { setSaveMsg('❌ 生成失败: ' + (e instanceof Error ? e.message : String(e))); }
    setGeneratingDesc(false);
  };

  const handleSave = async () => {
    setSaving(true); setSaveMsg('');
    try {
      let metaObj: Record<string, unknown> = {};
      try { metaObj = JSON.parse(editMetadata); } catch { metaObj = item.metadata || {}; }
      const r = await fetch('/api/search', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, title: editTitle, content: editContent, metadata: metaObj }),
      });
      const d = await r.json();
      if (d.success) { setSaveMsg('✅ 保存成功'); if (onSaved) onSaved(); }
      else { setSaveMsg('❌ ' + (d.error || '保存失败')); }
    } catch (e) { setSaveMsg('❌ 网络错误'); }
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[85vh] flex flex-col shadow-2xl" onClick={e => e.stopPropagation()}>
        {/* 标题栏 */}
        <div className="p-2.5 border-b flex items-center justify-between shrink-0 gap-2">
          <h3 className="font-semibold text-[13px] truncate whitespace-nowrap flex-1 min-w-0" title={item.title}>{truncateMiddle(item.title || '', 30)}</h3>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 shrink-0" onClick={onClose}>✕</Button>
        </div>
        {/* Tab 栏 */}
        <div className="flex border-b shrink-0">
          <button onClick={() => onTab('preview')} className={`flex-1 py-2 text-xs font-medium ${tab === 'preview' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`}>预览</button>
          <button onClick={() => onTab('edit')}    className={`flex-1 py-2 text-xs font-medium ${tab === 'edit'   ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`}>编辑</button>
          <button onClick={() => onTab('raw')}     className={`flex-1 py-2 text-xs font-medium ${tab === 'raw'     ? 'text-blue-600 border-b-2 border-blue-600' : 'text-slate-400'}`}>原始</button>
        </div>
        {/* 内容 */}
        <div className="flex-1 overflow-y-auto p-3">
          {tab === 'preview' ? (
            <div className="text-sm">
              <div className="flex gap-1 text-[10px] text-slate-400 mb-2">
                <span>{item.modality}</span><span>·</span><span>{item.source?.substring(0, 30) || '-'}</span>
                {item.similarity !== undefined && <><span>·</span><span>{(item.similarity * 100).toFixed(0)}%</span></>}
              </div>
              {isImage && imgSrc ? (
                <img src={imgSrc} alt={item.title} className="w-full rounded-lg border max-h-48 object-contain mb-2" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : isImage && !imgSrc ? (
                <div className="text-center text-slate-400 py-4 text-xs">📷 图片预览不可用<br/><span className="text-[10px]">无本地存储路径</span></div>
              ) : (
                <div className="whitespace-pre-wrap text-xs break-words bg-slate-50 p-2 rounded mb-2">{item.content?.substring(0, 1500) || '无内容'}</div>
              )}
            </div>
          ) : tab === 'edit' ? (
            <div className="flex flex-col" style={{ minHeight: 0 }}>
              <div className="overflow-y-auto space-y-2" style={{ maxHeight: 'calc(100vh - 280px)' }}>
                {isImage && (imgSrc ? (
                  <img src={imgSrc} alt={item.title} className="w-full rounded-lg border max-h-28 object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <div className="text-center text-slate-400 py-1.5 text-[10px] bg-slate-50 rounded">📷 无本地存储路径</div>
                ))}
                {/* 向量化状态 + 类型 */}
                <div className="flex gap-3 text-[10px] text-slate-500 bg-slate-50 rounded px-2 py-1.5">
                  <span>类型: {item.modality}</span>
                  <span>向量化: {item.status === 'embedded' ? '✅ 已完成' : '⏳ 待处理'}</span>
                </div>
                {/* 来源文件 */}
                <div>
                  <label className="text-[10px] font-medium text-slate-500">来源文件</label>
                  <Input value={item.source || ''} readOnly className="w-full text-[10px] h-7 mt-0.5 bg-slate-50 text-slate-500 truncate" style={{ maxWidth: '100%' }} />
                </div>
                {/* 标题 */}
                <div>
                  <label className="text-[10px] font-medium text-slate-500">标题</label>
                  <Input value={editTitle} onChange={e => setEditTitle(e.target.value)} className="text-xs h-8 mt-0.5" />
                </div>
                {/* 内容 + 语义识别按钮 */}
                <div>
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-medium text-slate-500">内容</label>
                    {isImage && (
                      <Button size="sm" variant="outline" className="h-6 text-[10px] px-1.5" onClick={handleGenerateDescription} disabled={generatingDesc}>
                        {generatingDesc ? <Loader2 className="w-3 h-3 mr-0.5 animate-spin" /> : null}🤖 语义识别
                      </Button>
                    )}
                  </div>
                  <Textarea value={editContent} onChange={e => setEditContent(e.target.value)} className="text-xs mt-0.5" rows={4} />
                </div>
                <div>
                  <label className="text-[10px] font-medium text-slate-500">元数据 (JSON)</label>
                  <Textarea value={editMetadata} onChange={e => setEditMetadata(e.target.value)} className="text-[10px] font-mono mt-0.5" rows={3} />
                </div>
                {saveMsg && <div className={`text-[10px] ${saveMsg.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>{saveMsg}</div>}
              </div>
              <div className="flex gap-2 pt-2 mt-2 border-t shrink-0">
                <Button size="sm" className="flex-1 h-8 text-xs" onClick={handleSave} disabled={saving}>
                  {saving ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}保存
                </Button>
                <Button size="sm" variant="outline" className="h-8 text-xs px-3" onClick={onClose}>关闭</Button>
              </div>
            </div>
          ) : (
            <pre className="text-[10px] whitespace-pre-wrap break-all bg-slate-50 p-2 rounded">{rawData.substring(0, 5000)}</pre>
          )}
        </div>
      </div>
    </div>
  );
}

// ── 数据概览组件 ─────────────────────────────
function OverviewPanel() {
  const [data, setData] = useState<{ ports: any[]; routes: any[]; regs: any[] }>({ ports: [], routes: [], regs: [] });
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<'port' | 'route' | 'regulation'>('port');

  useEffect(() => {
    (async () => {
      try {
        const [pr, rr, gr] = await Promise.all([
          fetch('/api/data-maintain?action=list&type=port&pageSize=5000'),
          fetch('/api/data-maintain?action=list&type=route&pageSize=5000'),
          fetch('/api/regulations?pageSize=200'),
        ]);
        const pd = await pr.json(), rd = await rr.json(), gd = await gr.json();
        setData({ ports: pd.items || [], routes: rd.items || [], regs: gd.items || [] });
      } catch {}
      setLoading(false);
    })();
  }, []);

  if (loading) return <div className="text-center text-slate-400 text-sm py-8">加载数据中...</div>;

  const REGIONS = [
    { key: 'global', name: '全球', range: null as null | { lonMin: number; lonMax: number; latMin: number; latMax: number } },
    { key: 'asia_pacific', name: '亚太', range: { lonMin: 100, lonMax: 180, latMin: -50, latMax: 60 } },
    { key: 'middle_east', name: '中东', range: { lonMin: 35, lonMax: 60, latMin: 12, latMax: 40 } },
    { key: 'red_sea_east_africa', name: '红海东非', range: { lonMin: 30, lonMax: 55, latMin: -30, latMax: 30 } },
    { key: 'west_africa', name: '西非', range: { lonMin: -20, lonMax: 20, latMin: -35, latMax: 20 } },
    { key: 'europe', name: '欧洲', range: { lonMin: -10, lonMax: 40, latMin: 35, latMax: 70 } },
    { key: 'north_america', name: '北美', range: { lonMin: -180, lonMax: -60, latMin: 25, latMax: 70 } },
    { key: 'central_south_america', name: '中南美', range: { lonMin: -120, lonMax: -30, latMin: -60, latMax: 25 } },
  ];
  const getRegion = (lon: number, lat: number) => {
    for (const r of REGIONS) { if (r.range && lon >= r.range.lonMin && lon <= r.range.lonMax && lat >= r.range.latMin && lat <= r.range.latMax) return r.key; }
    return 'global';
  };

  // 港口按区域统计
  const portCounts: Record<string, number> = {}; REGIONS.forEach(r => portCounts[r.key] = 0);
  data.ports.forEach((p: any) => { if (!isNaN(p.lon) && !isNaN(p.lat)) portCounts[getRegion(p.lon, p.lat)]++; });
  portCounts['global'] = data.ports.length;

  // 航线按起点统计
  const routeCounts: Record<string, number> = {}; REGIONS.forEach(r => routeCounts[r.key] = 0);
  const portMap: Record<string, { lon: number; lat: number }> = {};
  data.ports.forEach((p: any) => { portMap[p.port_code] = { lon: p.lon, lat: p.lat }; });
  data.routes.forEach((r: any) => {
    const pos = portMap[r.orig_port];
    if (pos && !isNaN(pos.lon) && !isNaN(pos.lat)) routeCounts[getRegion(pos.lon, pos.lat)]++;
    else routeCounts['global']++;
  });
  routeCounts['global'] = data.routes.length;

  // 规章制度按分类统计
  const CAT_LABELS: Record<string, string> = { maritime_rules: '海事规章制度', platform_ops: '平台运维规范', trajectory_annotation: '航迹标注准则', model_training: '模型训练管理办法', other: '其他资料' };
  const regCatCounts: Record<string, number> = {};
  data.regs.forEach((r: any) => {
    const cats = r.categories && Array.isArray(r.categories) ? r.categories : ['other'];
    cats.forEach((c: string) => regCatCounts[c] = (regCatCounts[c] || 0) + 1);
  });

  const current = tab === 'port'
    ? REGIONS.map(r => ({ name: r.name, count: portCounts[r.key] || 0 }))
    : tab === 'route'
    ? REGIONS.map(r => ({ name: r.name, count: routeCounts[r.key] || 0 }))
    : Object.entries(regCatCounts).map(([k, v]) => ({ name: CAT_LABELS[k] || k, count: v }));

  const maxVal = Math.max(...current.map(c => c.count), 1);

  return (
    <Card><CardContent className="p-4">
      <h2 className="font-bold text-sm mb-3">📊 数据概览</h2>
      <div className="grid grid-cols-3 gap-2 mb-4 text-center">
        <div className="bg-blue-50 rounded-lg p-2">
          <div className="text-lg font-bold text-blue-700">{data.ports.length}</div>
          <div className="text-[10px] text-blue-500">港口</div>
        </div>
        <div className="bg-emerald-50 rounded-lg p-2">
          <div className="text-lg font-bold text-emerald-700">{data.routes.length}</div>
          <div className="text-[10px] text-emerald-500">航线</div>
        </div>
        <div className="bg-purple-50 rounded-lg p-2">
          <div className="text-lg font-bold text-purple-700">{data.regs.length}</div>
          <div className="text-[10px] text-purple-500">规章</div>
        </div>
      </div>
      <div className="flex gap-1 mb-3">
        <Button size="sm" variant={tab === 'port' ? 'default' : 'outline'} className="h-7 text-[10px] flex-1" onClick={() => setTab('port')}>港口</Button>
        <Button size="sm" variant={tab === 'route' ? 'default' : 'outline'} className="h-7 text-[10px] flex-1" onClick={() => setTab('route')}>航线</Button>
        <Button size="sm" variant={tab === 'regulation' ? 'default' : 'outline'} className="h-7 text-[10px] flex-1" onClick={() => setTab('regulation')}>规章</Button>
      </div>
      <div className="flex gap-1 mb-3">
        <Button size="sm" variant={tab === 'port' ? 'default' : 'outline'} className="h-7 text-[10px] flex-1" onClick={() => setTab('port')}>港口分布</Button>
        <Button size="sm" variant={tab === 'route' ? 'default' : 'outline'} className="h-7 text-[10px] flex-1" onClick={() => setTab('route')}>航线分布</Button>
      </div>
      <div className="space-y-1.5">
        {current.filter(c => c.count > 0).map(c => (
          <div key={c.name} className="flex items-center gap-2">
            <span className="text-[10px] text-slate-500 w-14 shrink-0">{c.name}</span>
            <div className="flex-1 h-4 bg-slate-100 rounded-full overflow-hidden">
              <div className="h-full bg-blue-500 rounded-full transition-all" style={{ width: ((c.count / maxVal) * 100).toFixed(0) + '%' }} />
            </div>
            <span className="text-[10px] text-slate-600 font-medium w-10 text-right">{c.count}</span>
          </div>
        ))}
      </div>
    </CardContent></Card>
  );
}

// ── 子页面内嵌组件 ───────────────────────────
function IframePanel({ title, src, back }: { title: string; src: string; back: () => void }) {
  return (
    <div className="space-y-3 flex flex-col h-[calc(100vh-2rem)]">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={back}>
          <ChevronLeft className="w-4 h-4 mr-1" />返回
        </Button>
        <span className="font-bold text-sm">{title}</span>
      </div>
      <iframe src={src} className="flex-1 w-full border-0 rounded-lg" title={title} />
    </div>
  );
}

// ── 主页面 ────────────────────────────────────
export default function RagPage() {
  const [panel, setPanel] = useState<Panel>('home');
  const [embedStatus, setEmbedStatus] = useState<{ total: number; embedded: number; pending: number } | null>(null);

  // 上传
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  // 搜索
  const [sq, setSq] = useState('');
  const [sMode, setSMode] = useState<'fuzzy' | 'exact'>('fuzzy');
  const [sResults, setSResults] = useState<KnowItem[]>([]);
  const [sPage, setSPage] = useState<PagInfo | null>(null);
  const [sLoading, setSLoading] = useState(false);
  const [sPageNum, setSPageNum] = useState(1);
  const [showSearchHistory, setShowSearchHistory] = useState(false);

  // 知识库条目
  const [kbItems, setKbItems] = useState<KnowItem[]>([]);
  const [kbType, setKbType] = useState<'all' | 'embedded' | 'pending'>('all');
  const [kbLoading, setKbLoading] = useState(false);
  const [showKb, setShowKb] = useState(false);

  // ── 加载知识库条目 ──
  const loadKb = async (type: 'all' | 'embedded' | 'pending') => {
    setKbLoading(true); setKbType(type); setShowKb(true);
    try {
      const r = await fetch('/api/search?type=' + type + '&limit=50');
      const d = await r.json();
      setKbItems(d.items || []);
    } catch { setKbItems([]); }
    setKbLoading(false);
  };

  // 预览（共用）
  const [previewItem, setPreviewItem] = useState<KnowItem | null>(null);
  const [previewTab, setPreviewTab] = useState<'preview' | 'raw' | 'edit'>('preview');
  const [rQuery, setRQuery] = useState('');
  const [rAnswer, setRAnswer] = useState('');
  const [rSources, setRSources] = useState<{ title?: string; content?: string }[]>([]);
  const [rLoading, setRLoading] = useState(false);

  // 嵌入
  const [embedding, setEmbedding] = useState(false);
  const [eProgress, setEProgress] = useState({ done: 0, fail: 0 });

  // 港口/航线数据（海图用）
  const [chartData, setChartData] = useState<{ ports: any[]; routes: any[] }>({ ports: [], routes: [] });

  // ── 加载嵌入状态 ──
  const loadStatus = async () => {
    try {
      const r = await fetch('/api/embed');
      const d = await r.json();
      if (d.success) setEmbedStatus({ total: d.total, embedded: d.embedded, pending: d.pending });
    } catch { /* ignore */ }
  };
  useEffect(() => { loadStatus(); }, []);

  // ── 上传 ──
  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploading(true); setUploadMsg('');
    const fd = new FormData(); fd.append('file', f);
    try {
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      const d = await r.json();
      setUploadMsg(d.error ? `❌ ${d.error}` : `✅ ${f.name} (${d.itemCount || 0} 条)`);
      loadStatus();
    } catch { setUploadMsg('❌ 上传失败'); }
    setUploading(false);
  };

  // ── 搜索 ──
  const doSearch = async (page = 1) => {
    if (!sq.trim()) return;
    setSLoading(true);
    try {
      const r = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: sq, mode: sMode, topK: 30, page, pageSize: 10 }),
      });
      const d = await r.json();
      setSResults(d.results || []);
      setSPage(d.pagination);
      setSPageNum(page);
    } catch { /* ignore */ }
    setSLoading(false);
  };

  // ── RAG 问答 ──
  const doRag = async () => {
    if (!rQuery.trim()) return;
    setRLoading(true); setRAnswer(''); setRSources([]);
    try {
      const r = await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: rQuery, stream: false }),
      });
      const d = await r.json();
      setRAnswer(d.answer || d.error || '无结果');
      setRSources(d.sources || []);
    } catch { setRAnswer('问答请求失败'); }
    setRLoading(false);
  };

  // ── 嵌入 ──
  const batchEmbed = async () => {
    setEmbedding(true); setEProgress({ done: 0, fail: 0 });
    let totalDone = 0, totalFail = 0;
    while (true) {
      try {
        const r = await fetch('/api/embed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchSize: 200, skipDuplicate: false }),
        });
        const d = await r.json();
        totalDone += d.processed || 0;
        totalFail += d.failed || 0;
        setEProgress({ done: totalDone, fail: totalFail });
        if (d.pending === 0) break;
      } catch { totalFail++; break; }
    }
    setEmbedding(false);
    loadStatus();
  };

  // ── 删除条目 ──
  const delItem = async (id: string, title: string) => {
    if (!confirm(`删除 "${title}"？`)) return;
    await fetch('/api/embed', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ singleId: id }) });
    setSResults(p => p.filter(x => x.id !== id));
    loadStatus();
  };

  // ── 加载海图数据 ──
  const loadChart = async () => {
    if (chartData.ports.length > 0) return;
    try {
      const [pr, rr] = await Promise.all([
        fetch('/api/data-maintain?action=list&type=port&pageSize=5000'),
        fetch('/api/data-maintain?action=list&type=route&pageSize=5000'),
      ]);
      const pd = await pr.json();
      const rd = await rr.json();
      setChartData({
        ports: (pd.items || []).map((p: any) => ({ id: p.port_code, name: p.name_cn, lat: p.lat, lng: p.lon, country: p.ctry_name_cn, ctryCode: p.ctry_code })).filter((p: any) => p.lat && p.lng),
        routes: (rd.items || []).filter((r: any) => r.geometry_wkt).map((r: any) => {
          const m = r.geometry_wkt.match(/LINESTRING\s*\((.*)\)/i);
          if (!m) return null;
          return { id: r.id, coordinates: m[1].split(',').map((p: string) => p.trim().split(/\s+/).map(Number) as [number, number]) };
        }).filter(Boolean),
      });
    } catch { /* ignore */ }
  };

  // ── 返回箭头 ──
  const BackBtn = () => (
    <Button variant="ghost" size="sm" onClick={() => setPanel('home')} className="text-slate-500">
      <ChevronLeft className="w-4 h-4 mr-1" />返回
    </Button>
  );

  // ── 渲染面板 ──
  const renderPanel = () => {
    switch (panel) {
      // =================== 智能问答 ===================
      case 'rag':
        return <RagPanel back={() => setPanel('home')} />;
      // =================== 知识检索 ===================
      case 'search':
        return (
          <div className="space-y-4">
            <BackBtn />
            <Card><CardContent className="p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="font-bold text-lg">🔍 知识检索</h2>
                <Button size="sm" variant="outline" className="h-7 text-[10px] text-indigo-600" onClick={async () => {
      const r = await fetch('/api/history?type=search&page=1&pageSize=20');
      const d = await r.json();
      const items = d.history || [];
      if (items.length === 0) { alert('暂无智能检索历史记录'); return; }
      const text = items.slice(0, 20).map((h: any, i: number) =>
        `${i+1}. [${new Date(h.created_at).toLocaleString('zh-CN')}] ${h.query?.substring(0,80)}`
      ).join('\n\n');
      alert('智能检索历史 (最近20条):\n\n' + text);
    }}>📜 历史</Button>
              </div>
              <div className="flex gap-2">
                <Input value={sq} onChange={e => setSq(e.target.value)} placeholder="搜索知识库..." className="text-sm" onKeyDown={e => e.key === 'Enter' && doSearch()} />
                <select value={sMode} onChange={e => setSMode(e.target.value as any)} className="text-xs border rounded px-2">
                  <option value="fuzzy">语义</option><option value="exact">精确</option>
                </select>
                <Button size="sm" onClick={() => doSearch()} disabled={sLoading}><Search className="w-4 h-4" /></Button>
              </div>
              {sLoading && <div className="text-sm text-slate-400">搜索中...</div>}
              {sPage && <div className="text-xs text-slate-400">共 {sPage.totalCount} 条，第 {sPage.page}/{sPage.totalPages} 页</div>}
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {sResults.map((r, i) => {
                  const imgUrl = (r.metadata?.imageUrl as string) || (r.metadata?.localUrl as string) || (r.metadata?.localPath as string);
                  const isImage = r.modality === 'image';
                  return (
                  <div key={r.id || i} className="p-2 bg-slate-50 rounded hover:bg-slate-100 text-xs cursor-pointer" onClick={() => { setPreviewItem(r); setPreviewTab('preview'); }}>
                    <div className="flex gap-2">
                      {isImage && (
                        imgUrl ? (
                          <img src={imgUrl.startsWith('/') ? imgUrl : '/api/search?action=preview-image&path=' + encodeURIComponent(imgUrl)}
                            className="w-12 h-12 object-cover rounded shrink-0" alt={r.title}
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        ) : (
                          <div className="w-12 h-12 bg-slate-200 rounded shrink-0 flex items-center justify-center text-slate-400 text-lg">🖼️</div>
                        )
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between">
                          <span className="flex items-center gap-1">
                            <Badge variant="outline" className="text-[10px]">{r.modality}</Badge>
                            <span className="font-medium truncate whitespace-nowrap max-w-[200px]" title={r.title}>{truncateMiddle(r.title || '', 28)}</span>
                          </span>
                          <span className="flex items-center gap-1">
                            {r.similarity !== undefined && <span className="text-green-600 font-bold">{(r.similarity * 100).toFixed(0)}%</span>}
                            <Trash2 className="w-3 h-3 text-red-400 cursor-pointer hover:text-red-600" onClick={() => delItem(r.id, r.title)} />
                          </span>
                        </div>
                        <p className="text-slate-500 truncate mt-1">{r.content?.substring(0, 80)}</p>
                      </div>
                    </div>
                  </div>
                  );
                })}
              </div>
              {sPage && sPage.totalPages > 1 && (
                <div className="flex gap-1 justify-center">
                  <Button size="sm" variant="outline" className="h-6 text-xs" disabled={sPageNum <= 1} onClick={() => doSearch(sPageNum - 1)}>上一页</Button>
                  <span className="text-xs px-2 py-1">{sPageNum}/{sPage.totalPages}</span>
                  <Button size="sm" variant="outline" className="h-6 text-xs" disabled={sPageNum >= sPage.totalPages} onClick={() => doSearch(sPageNum + 1)}>下一页</Button>
                </div>
              )}
            </CardContent></Card>

            {/* ── 搜索历史浮窗 ── */}
            {showSearchHistory && <HistoryModal type="search" onClose={() => setShowSearchHistory(false)}
              onLoad={(query) => { setSq(query); setShowSearchHistory(false); doSearch(1); }} />}
          </div>
        );
      // =================== 文件上传 ===================
      case 'upload':
        return (
          <div className="space-y-4">
            <BackBtn />
            <Card><CardContent className="p-4 space-y-3">
              <h2 className="font-bold text-lg">📤 文件上传</h2>
              <input type="file" ref={fileRef} onChange={handleUpload} accept=".txt,.md,.json,.xlsx,.xls,.csv,.docx,.pdf,.pptx,.jpg,.jpeg,.png,.gif,.webp,.mp3,.wav,.m4a" className="hidden" />
              <Button onClick={() => fileRef.current?.click()} disabled={uploading} className="w-full h-12 text-sm">
                {uploading ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />上传中...</> : <><Upload className="w-4 h-4 mr-2" />选择文件</>}
              </Button>
              <p className="text-xs text-slate-400 text-center">Excel / Word / PDF / PPT / 图片 / 音频 / JSON / MD</p>
              {uploadMsg && <div className={`text-xs text-center ${uploadMsg.startsWith('✅') ? 'text-green-600' : 'text-red-500'}`}>{uploadMsg}</div>}
              <div className="border-t pt-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-slate-500">向量化状态</span>
                  <Button size="sm" variant="outline" className="h-7 text-xs" onClick={batchEmbed} disabled={embedding}>
                    {embedding ? <><Loader2 className="w-3 h-3 mr-1 animate-spin" />向量化中</> : <><Database className="w-3 h-3 mr-1" />执行向量化</>}
                  </Button>
                </div>
                {embedStatus && (
                  <div>
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <button className="bg-slate-50 p-2 rounded text-center cursor-pointer hover:bg-slate-200" onClick={() => loadKb('all')}><div className="font-bold text-lg">{embedStatus.total}</div><div className="text-[10px] text-slate-400">总条目</div></button>
                    <button className="bg-green-50 p-2 rounded text-center cursor-pointer hover:bg-green-200" onClick={() => loadKb('embedded')}><div className="font-bold text-lg text-green-700">{embedStatus.embedded}</div><div className="text-[10px] text-green-600">已向量化</div></button>
                    <button className="bg-yellow-50 p-2 rounded text-center cursor-pointer hover:bg-yellow-200" onClick={() => loadKb('pending')}><div className="font-bold text-lg text-yellow-700">{embedStatus.pending}</div><div className="text-[10px] text-yellow-600">待处理</div></button>
                  </div>
                  {/* 知识库条目列表 */}
                  {showKb && (
                    <div className="mt-2 border rounded-lg max-h-64 overflow-y-auto">
                      <div className="p-1.5 border-b bg-slate-50 flex items-center justify-between text-xs">
                        <span>条目列表 ({kbType === 'all' ? '全部' : kbType === 'embedded' ? '已向量化' : '待处理'})</span>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-slate-400" onClick={() => setShowKb(false)}>✕</Button>
                      </div>
                      {kbLoading ? <div className="text-xs text-slate-400 text-center py-4">加载中...</div> :
                       kbItems.length === 0 ? <div className="text-xs text-slate-400 text-center py-4">暂无数据</div> :
                       kbItems.map((item, i) => (
                        <div key={item.id || i} className="p-1.5 border-b text-xs hover:bg-slate-50 cursor-pointer flex items-center gap-2" onClick={() => { setPreviewItem(item); setPreviewTab('raw'); }}>
                          <Badge variant="outline" className="text-[9px] shrink-0">{item.modality}</Badge>
                          <span className="truncate whitespace-nowrap flex-1" title={item.title}>{truncateMiddle(item.title || '', 28)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  </div>
                )}
                {embedding && <Progress value={embedStatus ? (embedStatus.embedded / embedStatus.total) * 100 : 0} className="mt-2" />}
              </div>
            </CardContent></Card>
          </div>
        );
      // =================== 数据维护 ===================
      case 'maintain':
        return (
          <div className="space-y-4">
            <BackBtn />
            <DataMaintainPanel />
          </div>
        );
      // =================== 海图 ===================
      case 'chart':
        return (
          <div className="space-y-4">
            <BackBtn />
            <Card><CardContent className="p-2">
              <div className="h-64 w-full rounded-lg overflow-hidden">
                <SeaMapComponent
                  mapCenter={[20, 110]} mapZoom={3}
                  showSeaMap={true} showPorts={true} showTrack={false} showTrajectories={true}
                  allPorts={chartData.ports}
                  selectedCountries={['CN', 'US', 'OTHER']}
                  mockTrack={[]} customTrack={[]}
                  trajectories={chartData.routes.map((r: any) => ({ id: r.id, segment_id: r.id, start_port: null, end_port: null, wkt_route: null, sea_area: null, ai_description: null, coordinates: r.coordinates }))}
                  selectedTrajectory={null}
                  onMapClick={() => {}}
                />
              </div>
            </CardContent></Card>
          </div>
        );
      // =================== 数据概览 ===================
      case 'overview':
        return (
          <div className="space-y-4">
            <BackBtn />
            <OverviewPanel />
          </div>
        );
      // =================== 其他功能（跳转子页面） ===================
      case 'trajectory':  return <IframePanel title="航迹分析" src="/trajectory" back={() => setPanel('home')} />;
      case 'training':    return <IframePanel title="航迹训练" src="/trajectory-training" back={() => setPanel('home')} />;
      case 'inference':   return <IframePanel title="航迹推理" src="/trajectory-inference" back={() => setPanel('home')} />;
      case 'workflow':    return <IframePanel title="工作流" src="/workflow" back={() => setPanel('home')} />;
      case 'dashboard':   return <IframePanel title="仪表盘" src="/dashboard" back={() => setPanel('home')} />;
      case 'settings':    return <IframePanel title="系统设置" src="/settings" back={() => setPanel('home')} />;
      case 'label':        return <IframePanel title="航迹标注" src="/segment-label" back={() => setPanel('home')} />;
      case 'autoresearch': return <IframePanel title="知识管理" src="/manage" back={() => setPanel('home')} />;
      // =================== 首页 ===================
      default:
        return (
          <div className="space-y-6">
            {/* 标题 */}
            <div className="text-center">
              <h1 className="text-2xl font-bold text-slate-800">ShipRag</h1>
              <p className="text-sm text-slate-400 mt-1">跨模态 RAG 知识检索系统</p>
            </div>
            {/* 统计条 */}
            {embedStatus && (
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-50 rounded-lg p-2 text-center"><div className="font-bold">{embedStatus.total}</div><div className="text-[10px] text-slate-400">总条目</div></div>
                <div className="bg-green-50 rounded-lg p-2 text-center"><div className="font-bold text-green-700">{embedStatus.embedded}</div><div className="text-[10px] text-green-500">已向量化</div></div>
                <div className="bg-yellow-50 rounded-lg p-2 text-center"><div className="font-bold text-yellow-700">{embedStatus.pending}</div><div className="text-[10px] text-yellow-500">待处理</div></div>
              </div>
            )}
            {/* 功能卡片（按分类分组） */}
            {CATEGORIES.map(cat => (
              <div key={cat.title} className="space-y-1.5">
                <h3 className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider pl-1">{cat.title}</h3>
                <div className="grid grid-cols-4 gap-1.5">
                  {cat.items.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { setPanel(m.id as Panel); if (m.id === 'chart') loadChart(); }}
                      className="rounded-lg shadow-sm active:scale-95 transition-all flex flex-col items-center justify-center gap-1 py-3 text-white"
                      style={{ background: m.color }}
                    >
                      <span className="text-lg">{m.icon}</span>
                      <span className="font-medium text-[10px]">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
            {/* 一键向量化 */}
            {embedStatus && embedStatus.pending > 0 && (
              <Button onClick={batchEmbed} disabled={embedding} className="w-full h-10 text-sm bg-indigo-500 hover:bg-indigo-600">
                {embedding ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />向量化中...</> : <><Database className="w-4 h-4 mr-2" />一键向量化 ({embedStatus.pending} 条)</>}
              </Button>
            )}
          </div>
        );
    }
  };

  return (
    <main className="max-w-lg mx-auto p-4 min-h-screen bg-white">
      {renderPanel()}
      {previewItem && <PreviewModal item={previewItem} tab={previewTab} onClose={() => setPreviewItem(null)} onTab={setPreviewTab} onSaved={() => { loadKb(kbType); loadStatus(); }} />}
    </main>
  );
}
