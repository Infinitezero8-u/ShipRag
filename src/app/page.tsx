'use client';

import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { DataMaintainPanel } from '@/components/data-maintain-panel';
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
type Panel = 'home' | 'rag' | 'search' | 'upload' | 'maintain' | 'chart' | 'trajectory' | 'training' | 'inference' | 'workflow' | 'dashboard' | 'settings' | 'label' | 'autoresearch';
interface KnowItem { id: string; modality: string; title: string; content: string; source: string; similarity?: number; status: string; metadata?: Record<string, unknown>; }
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
    { id: 'chart' as Panel,     label: '海图',     icon: '🗺️', color: '#f43f5e' },
    { id: 'dashboard' as Panel, label: '仪表盘',   icon: '📊', color: '#14b8a6' },
  ]},
  { title: '系统管理', items: [
    { id: 'workflow' as Panel,  label: '工作流',   icon: '⚙️', color: '#64748b' },
    { id: 'settings' as Panel,  label: '系统设置', icon: '⚡', color: '#78716c' },
  ]},
];

// ── 问答面板（含历史）────────────────────────
function RagPanel({ back }: { back: () => void }) {
  const [q, setQ] = useState('');
  const [ans, setAns] = useState('');
  const [src, setSrc] = useState<{ title?: string; content?: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [sid, setSid] = useState(() => 'rag-' + Date.now());
  const [history, setHistory] = useState<{ session_id: string; title: string; time: string }[]>([]);
  const [showHistory, setShowHistory] = useState(true);

  // 进入面板时自动加载历史
  useEffect(() => { loadHistory(); }, []);

  // 加载历史
  const loadHistory = async () => {
    try {
      const r = await fetch('/api/context?action=list');
      const d = await r.json();
      if (d.success) {
        setHistory((d.conversations || []).map((c: any) => ({
          session_id: c.session_id,
          title: (c.context_data?.title || c.context_data?.messages?.[0]?.content || '对话').substring(0, 30),
          time: c.updated_at ? new Date(c.updated_at).toLocaleString('zh-CN') : '',
        })));
      }
    } catch { /* ignore */ }
  };

  // 发送问题
  const ask = async () => {
    if (!q.trim()) return;
    setLoading(true); setAns(''); setSrc([]);
    setShowHistory(false);
    try {
      const r = await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: q, stream: false, sessionId: sid }),
      });
      const d = await r.json();
      setAns(d.answer || d.error || '无结果');
      setSrc(d.sources || []);
    } catch { setAns('请求失败'); }
    setLoading(false);
  };

  // 加载历史对话
  const loadConversation = async (id: string) => {
    setSid(id);
    setShowHistory(false);
    try {
      const r = await fetch('/api/context?session_id=' + id);
      const d = await r.json();
      if (d.success && d.context?.context_data?.messages) {
        const msgs = d.context.context_data.messages;
        setQ(msgs.filter((m: any) => m.role === 'user').pop()?.content || '');
      }
    } catch { /* ignore */ }
  };

  // 新对话
  const newChat = () => {
    setSid('rag-' + Date.now());
    setQ(''); setAns(''); setSrc([]); setShowHistory(false);
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={back} className="text-slate-500">
            <ChevronLeft className="w-4 h-4 mr-1" />返回
          </Button>
          <h2 className="font-bold text-sm">💬 智能问答</h2>
        </div>
        <div className="flex gap-1">
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={() => { loadHistory(); setShowHistory(!showHistory); }}>
            📋 {showHistory ? '关闭' : '历史'}
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[10px]" onClick={newChat}>➕ 新建</Button>
        </div>
      </div>

      {/* 历史面板 */}
      {showHistory && (
        <div className="bg-slate-50 rounded-lg p-3 max-h-64 overflow-y-auto space-y-1">
          {history.length === 0 && <div className="text-xs text-slate-400 text-center py-4">暂无对话记录</div>}
          {history.map(h => (
            <button key={h.session_id} onClick={() => loadConversation(h.session_id)}
              className={`w-full text-left p-2 rounded text-xs hover:bg-slate-200 flex items-center justify-between ${h.session_id === sid ? 'bg-blue-50' : ''}`}>
              <span className="truncate">{h.title}</span>
              <span className="text-[10px] text-slate-400 shrink-0 ml-2">{h.time}</span>
            </button>
          ))}
        </div>
      )}

      {/* 输入区 */}
      <div className="flex gap-2">
        <Textarea value={q} onChange={e => setQ(e.target.value)} placeholder="输入问题..." className="flex-1 text-sm" rows={3}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(); } }} />
        <Button onClick={ask} disabled={loading} size="sm" className="h-auto"><Send className="w-4 h-4" /></Button>
      </div>

      {/* 回答 */}
      {loading && <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="w-4 h-4 animate-spin" />思考中...</div>}
      {ans && <div className="bg-white border rounded-lg p-3 text-sm whitespace-pre-wrap">{ans}</div>}
      {src.length > 0 && (
        <details className="text-xs text-slate-400">
          <summary className="cursor-pointer">📎 引用来源 ({src.length})</summary>
          <ul className="mt-1 space-y-1">{src.map((s, i) => <li key={i} className="truncate">{s.title || '未知'}</li>)}</ul>
        </details>
      )}
    </div>
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

  // RAG
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
              <h2 className="font-bold text-lg">🔍 知识检索</h2>
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
                {sResults.map((r, i) => (
                  <div key={r.id || i} className="p-2 bg-slate-50 rounded hover:bg-slate-100 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1">
                        <Badge variant="outline" className="text-[10px]">{r.modality}</Badge>
                        <span className="font-medium truncate max-w-[200px]">{r.title?.substring(0, 40)}</span>
                      </span>
                      <span className="flex items-center gap-1">
                        {r.similarity !== undefined && <span className="text-green-600 font-bold">{(r.similarity * 100).toFixed(0)}%</span>}
                        <Trash2 className="w-3 h-3 text-red-400 cursor-pointer hover:text-red-600" onClick={() => delItem(r.id, r.title)} />
                      </span>
                    </div>
                    <p className="text-slate-500 truncate mt-1">{r.content?.substring(0, 80)}</p>
                  </div>
                ))}
              </div>
              {sPage && sPage.totalPages > 1 && (
                <div className="flex gap-1 justify-center">
                  <Button size="sm" variant="outline" className="h-6 text-xs" disabled={sPageNum <= 1} onClick={() => doSearch(sPageNum - 1)}>上一页</Button>
                  <span className="text-xs px-2 py-1">{sPageNum}/{sPage.totalPages}</span>
                  <Button size="sm" variant="outline" className="h-6 text-xs" disabled={sPageNum >= sPage.totalPages} onClick={() => doSearch(sPageNum + 1)}>下一页</Button>
                </div>
              )}
            </CardContent></Card>
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
                  <div className="grid grid-cols-3 gap-2 mt-3">
                    <div className="bg-slate-50 p-2 rounded text-center"><div className="font-bold text-lg">{embedStatus.total}</div><div className="text-[10px] text-slate-400">总条目</div></div>
                    <div className="bg-green-50 p-2 rounded text-center"><div className="font-bold text-lg text-green-700">{embedStatus.embedded}</div><div className="text-[10px] text-green-600">已向量化</div></div>
                    <div className="bg-yellow-50 p-2 rounded text-center"><div className="font-bold text-lg text-yellow-700">{embedStatus.pending}</div><div className="text-[10px] text-yellow-600">待处理</div></div>
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
      // =================== 其他功能（跳转子页面） ===================
      case 'trajectory':  return <IframePanel title="航迹分析" src="/trajectory" back={() => setPanel('home')} />;
      case 'training':    return <IframePanel title="航迹训练" src="/trajectory-training" back={() => setPanel('home')} />;
      case 'inference':   return <IframePanel title="航迹推理" src="/trajectory-inference" back={() => setPanel('home')} />;
      case 'workflow':    return <IframePanel title="工作流" src="/workflow" back={() => setPanel('home')} />;
      case 'dashboard':   return <IframePanel title="仪表盘" src="/dashboard" back={() => setPanel('home')} />;
      case 'settings':    return <IframePanel title="设置" src="/settings" back={() => setPanel('home')} />;
      case 'label':        return <IframePanel title="标注" src="/segment-label" back={() => setPanel('home')} />;
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
    </main>
  );
}
