'use client';

import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Database, Trash2, Eye, Search, RefreshCw, CheckCircle, XCircle, Clock, Zap } from 'lucide-react';

// ═══════════════════════════════════════
// Types
// ═══════════════════════════════════════

interface PagInfo { page: number; pageSize: number; totalCount: number; totalPages: number; hasMore: boolean; }

interface DataRow {
  id: string;
  knowledge_item_id?: string;
  embedding_status?: string;
  [key: string]: any;
}

interface ModuleStats {
  total: number;
  embedded: number;
  pending: number;
}

interface ImportProgress {
  id: string;
  module: string;
  source_file: string;
  total_rows: string;
  processed_rows: string;
  status: string;
  error_message?: string;
}

const MODULES = [
  { key: 'sea_area', label: '海区' },
  { key: 'eez', label: '经济区' },
  { key: 'bridge', label: '桥梁' },
  { key: 'safety_incident', label: '事故' },
  { key: 'imdg', label: '危险品' },
  { key: 'freight', label: '运价' },
  { key: 'ais_synopsis', label: 'AIS摘要' },
  { key: 'ship_image', label: '船舶影像' },
];

const MODULE_LABELS: Record<string, string> = {
  sea_area: 'IHO 海区', eez: 'EEZ 经济区', bridge: '桥梁基础设施',
  safety_incident: '海事事故', imdg: 'IMDG 危险品', freight: '航运运价',
  ais_synopsis: 'AIS 摘要', ship_image: '船舶影像',
};

// ═══════════════════════════════════════
// Component
// ═══════════════════════════════════════

export function DataCenterPanel() {
  const [activeModule, setActiveModule] = useState('sea_area');
  const [activeTab, setActiveTab] = useState<'overview' | 'progress'>('overview');

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-6xl mx-auto p-3 md:p-4">
        {/* Header */}
        <div className="flex items-center gap-3 mb-4">
          <div className="flex items-center gap-1.5">
            <Database className="w-4 h-4 text-red-600" />
            <h1 className="text-sm font-medium text-slate-700">数据中台</h1>
          </div>
          <div className="h-3 w-px bg-slate-300" />
          <span className="text-[10px] text-slate-400">多源海事数据统一管理</span>
        </div>

        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'overview' | 'progress')}>
          <TabsList className="h-7 mb-3">
            <TabsTrigger value="overview" className="text-[10px] px-2">数据概览</TabsTrigger>
            <TabsTrigger value="progress" className="text-[10px] px-2">导入进度</TabsTrigger>
          </TabsList>

          <TabsContent value="overview">
            <StatsBar />
            <div className="flex gap-2 mt-3">
              {/* Module sidebar */}
              <Card className="w-36 shrink-0 bg-white/80 border-slate-200 self-start">
                <CardContent className="p-1.5">
                  {MODULES.map((m) => (
                    <button
                      key={m.key}
                      onClick={() => setActiveModule(m.key)}
                      className={`w-full text-left px-2 py-1 text-[10px] rounded transition-colors ${
                        activeModule === m.key ? 'bg-red-50 text-red-700 font-medium' : 'text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </CardContent>
              </Card>
              {/* Module detail */}
              <div className="flex-1">
                <ModulePanel module={activeModule} />
              </div>
            </div>
          </TabsContent>

          <TabsContent value="progress">
            <ImportProgressTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════
// Stats Bar
// ═══════════════════════════════════════

function StatsBar() {
  const [stats, setStats] = useState<Record<string, ModuleStats>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/data-center?action=stats')
      .then(r => r.json())
      .then(d => { setStats(d.stats || {}); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-[10px] text-slate-400">加载统计...</div>;

  const total = Object.values(stats).reduce((s, m) => s + m.total, 0);
  const embedded = Object.values(stats).reduce((s, m) => s + m.embedded, 0);

  return (
    <Card className="bg-white/80 border-slate-200">
      <CardContent className="p-2">
        <div className="grid grid-cols-4 md:grid-cols-8 gap-1">
          {MODULES.map(m => {
            const s = stats[m.key] || { total: 0, embedded: 0, pending: 0 };
            return (
              <div key={m.key} className="text-center py-1">
                <div className="text-lg font-bold text-slate-700">{s.total.toLocaleString()}</div>
                <div className="text-[9px] text-slate-400">{m.label}</div>
                {s.total > 0 && (
                  <Badge className={`text-[7px] h-3 px-0.5 mt-0.5 ${s.pending === 0 ? 'bg-green-100 text-green-600' : 'bg-amber-100 text-amber-600'}`}>
                    {s.embedded}/{s.total}
                  </Badge>
                )}
              </div>
            );
          })}
        </div>
        <div className="text-[9px] text-slate-400 mt-1 text-right">
          总计 {total.toLocaleString()} 条，已向量化 {embedded.toLocaleString()} 条
        </div>
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════
// Module Detail Panel
// ═══════════════════════════════════════

function ModulePanel({ module }: { module: string }) {
  const [data, setData] = useState<DataRow[]>([]);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [search, setSearch] = useState('');
  const [pagInfo, setPagInfo] = useState<PagInfo>({ page: 1, pageSize: 50, totalCount: 0, totalPages: 0, hasMore: false });
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [previewItem, setPreviewItem] = useState<DataRow | null>(null);
  const [vectorizing, setVectorizing] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        action: 'list', module, page: String(page), pageSize: String(pageSize),
      });
      if (search) params.set('search', search);
      const r = await fetch(`/api/data-center?${params}`);
      const d = await r.json();
      if (d.success) {
        setData(d.data || []);
        setPagInfo({ page: d.page, pageSize: d.pageSize, totalCount: d.totalCount, totalPages: d.totalPages, hasMore: d.hasMore });
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  }, [module, page, pageSize, search]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const handleSelectAll = () => {
    if (selectedIds.size === data.length) setSelectedIds(new Set());
    else setSelectedIds(new Set(data.map(r => r.id)));
  };

  const handleDelete = async () => {
    if (!confirm(`确定删除 ${selectedIds.size} 条记录？`)) return;
    const r = await fetch('/api/data-center', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'delete', module, ids: [...selectedIds] }),
    });
    const d = await r.json();
    if (d.success) { setSelectedIds(new Set()); fetchData(); }
    else alert(d.error || '删除失败');
  };

  const handleVectorize = async () => {
    if (!confirm(`确定为 ${selectedIds.size} 条创建向量化任务？`)) return;
    setVectorizing(true);
    const r = await fetch('/api/data-center', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'vectorize', module, ids: [...selectedIds] }),
    });
    const d = await r.json();
    if (d.success) alert(`已创建 ${d.tasksCreated} 个向量化任务`);
    else alert(d.error || '失败');
    setVectorizing(false);
  };

  const handleBatchVectorize = async () => {
    setVectorizing(true);
    const r = await fetch('/api/data-center', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'batch-vectorize', module, vectorizeAll: true }),
    });
    const d = await r.json();
    alert(d.message || `待向量化: ${d.pendingCount} 条`);
    setVectorizing(false);
  };

  const handlePreview = async (id: string) => {
    const r = await fetch(`/api/data-center?action=preview&module=${module}&id=${id}`);
    const d = await r.json();
    if (d.success) setPreviewItem(d.data);
  };

  const columns = getVisibleColumns(module, data);

  return (
    <Card className="bg-white/80 border-slate-200">
      <CardHeader className="pb-1 pt-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium">
            {MODULE_LABELS[module] || module} <span className="text-slate-400 font-normal">({pagInfo.totalCount.toLocaleString()} 条)</span>
          </CardTitle>
          <div className="flex gap-1">
            <Button variant="outline" size="sm" className="h-6 text-[9px]" onClick={handleBatchVectorize} disabled={vectorizing}>
              <Zap className="w-2.5 h-2.5 mr-0.5" />批量向量化
            </Button>
            {selectedIds.size > 0 && (
              <>
                <Button variant="outline" size="sm" className="h-6 text-[9px]" onClick={handleVectorize} disabled={vectorizing}>
                  <Database className="w-2.5 h-2.5 mr-0.5" />向量化({selectedIds.size})
                </Button>
                <Button variant="outline" size="sm" className="h-6 text-[9px] text-red-500 border-red-200 hover:bg-red-50" onClick={handleDelete}>
                  <Trash2 className="w-2.5 h-2.5 mr-0.5" />删除({selectedIds.size})
                </Button>
              </>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-2 pt-0">
        {/* Search */}
        <div className="flex items-center gap-2 mb-2">
          <Search className="w-3 h-3 text-slate-400" />
          <Input
            placeholder="搜索..."
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1); }}
            className="h-6 text-[10px] w-48"
          />
          <select
            value={pageSize}
            onChange={e => { setPageSize(Number(e.target.value)); setPage(1); }}
            className="h-6 text-[10px] border border-slate-200 rounded px-1"
          >
            {[20, 50, 100, 500].map(s => <option key={s} value={s}>{s}/页</option>)}
          </select>
          <Button variant="ghost" size="sm" className="h-6 w-6 p-0" onClick={fetchData}>
            <RefreshCw className="w-3 h-3" />
          </Button>
        </div>

        {/* Table */}
        {loading ? (
          <div className="text-center py-8 text-slate-400 text-[10px]">加载中...</div>
        ) : data.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-[10px]">
            <Database className="w-6 h-6 mx-auto mb-1 opacity-20" />
            暂无数据
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-[10px]">
                <thead>
                  <tr className="border-b border-slate-200">
                    <th className="text-left py-1 px-1 w-6">
                      <input type="checkbox" checked={selectedIds.size === data.length && data.length > 0} onChange={handleSelectAll} />
                    </th>
                    <th className="text-left py-1 px-1 w-8">状态</th>
                    {columns.map(c => (
                      <th key={c} className="text-left py-1 px-1 font-medium text-slate-500 whitespace-nowrap">{c}</th>
                    ))}
                    <th className="text-right py-1 px-1 w-12">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map(row => (
                    <tr key={row.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-1 px-1">
                        <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => handleSelect(row.id)} />
                      </td>
                      <td className="py-1 px-1">
                        <StatusIcon status={row.embedding_status || 'pending'} />
                      </td>
                      {columns.map(c => (
                        <td key={c} className="py-1 px-1 text-slate-600 max-w-[200px] truncate">
                          {typeof row[c] === 'object' ? JSON.stringify(row[c]).substring(0, 60) : String(row[c] || '-').substring(0, 120)}
                        </td>
                      ))}
                      <td className="py-1 px-1 text-right">
                        <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => handlePreview(row.id)}>
                          <Eye className="w-2.5 h-2.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between mt-2">
              <span className="text-[9px] text-slate-400">
                {(pagInfo.page - 1) * pagInfo.pageSize + 1}-{Math.min(pagInfo.page * pagInfo.pageSize, pagInfo.totalCount)} / {pagInfo.totalCount}
              </span>
              <div className="flex gap-0.5">
                <Button variant="outline" size="sm" className="h-5 text-[9px] px-1" disabled={page <= 1} onClick={() => setPage(1)}>首页</Button>
                <Button variant="outline" size="sm" className="h-5 text-[9px] px-1" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
                <Button variant="outline" size="sm" className="h-5 text-[9px] px-1" disabled={!pagInfo.hasMore} onClick={() => setPage(page + 1)}>下一页</Button>
                <Button variant="outline" size="sm" className="h-5 text-[9px] px-1" disabled={!pagInfo.hasMore} onClick={() => setPage(pagInfo.totalPages)}>末页</Button>
              </div>
            </div>
          </>
        )}
      </CardContent>

      {/* Preview Modal */}
      {previewItem && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={() => setPreviewItem(null)}>
          <Card className="w-full max-w-lg max-h-[80vh] shadow-xl overflow-hidden" onClick={e => e.stopPropagation()}>
            <CardHeader className="pb-1 pt-2 px-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xs">{MODULE_LABELS[module]} 详情</CardTitle>
                <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={() => setPreviewItem(null)}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 pt-0 overflow-auto max-h-[65vh]">
              <div className="space-y-1.5">
                {Object.entries(previewItem).filter(([k]) => k !== 'raw_fields').map(([key, value]) => (
                  <div key={key} className="border-b border-slate-100 pb-1">
                    <div className="text-[8px] text-slate-400 uppercase">{key}</div>
                    <div className="text-[10px] text-slate-700 break-all">
                      {value === null ? '(null)' : value === '' ? '(空)' : typeof value === 'object' ? JSON.stringify(value, null, 1) : String(value)}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </Card>
  );
}

// ═══════════════════════════════════════
// Import Progress Tab
// ═══════════════════════════════════════

function ImportProgressTab() {
  const [progress, setProgress] = useState<ImportProgress[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchProgress = useCallback(async () => {
    setLoading(true);
    try {
      const r = await fetch('/api/data-center?action=progress');
      const d = await r.json();
      if (d.success) setProgress(d.data || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  }, []);

  useEffect(() => { fetchProgress(); }, [fetchProgress]);

  return (
    <Card className="bg-white/80 border-slate-200">
      <CardHeader className="pb-1 pt-2 px-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs font-medium">导入进度追踪</CardTitle>
          <Button variant="ghost" size="sm" className="h-5 w-5 p-0" onClick={fetchProgress}><RefreshCw className="w-3 h-3" /></Button>
        </div>
      </CardHeader>
      <CardContent className="px-3 pb-2 pt-0">
        {loading ? (
          <div className="text-center py-4 text-slate-400 text-[10px]">加载中...</div>
        ) : progress.length === 0 ? (
          <div className="text-center py-8 text-slate-400 text-[10px]">
            <Clock className="w-6 h-6 mx-auto mb-1 opacity-20" />
            暂无导入任务
          </div>
        ) : (
          <table className="w-full text-[10px]">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left py-1 px-1">模块</th>
                <th className="text-left py-1 px-1">文件</th>
                <th className="text-center py-1 px-1">进度</th>
                <th className="text-center py-1 px-1">状态</th>
                <th className="text-left py-1 px-1">错误</th>
              </tr>
            </thead>
            <tbody>
              {progress.map(p => (
                <tr key={p.id} className="border-b border-slate-100">
                  <td className="py-1 px-1 font-medium">{MODULE_LABELS[p.module] || p.module}</td>
                  <td className="py-1 px-1 text-slate-500 max-w-[200px] truncate">{p.source_file}</td>
                  <td className="py-1 px-1 text-center">{p.processed_rows}{p.total_rows ? `/${p.total_rows}` : ''}</td>
                  <td className="py-1 px-1 text-center">
                    {p.status === 'completed' ? <Badge className="bg-green-100 text-green-600 text-[7px]">完成</Badge>
                      : p.status === 'processing' ? <Badge className="bg-blue-100 text-blue-600 text-[7px]">处理中</Badge>
                      : p.status === 'failed' ? <Badge className="bg-red-100 text-red-600 text-[7px]">失败</Badge>
                      : <Badge className="bg-slate-100 text-slate-500 text-[7px]">待处理</Badge>}
                  </td>
                  <td className="py-1 px-1 text-red-500 max-w-[150px] truncate">{p.error_message || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

// ═══════════════════════════════════════
// Helpers
// ═══════════════════════════════════════

function StatusIcon({ status }: { status: string }) {
  if (status === 'success') return <CheckCircle className="w-3 h-3 text-green-500" />;
  if (status === 'failed') return <XCircle className="w-3 h-3 text-red-400" />;
  if (status === 'processing') return <RefreshCw className="w-3 h-3 text-blue-400 animate-spin" />;
  return <Clock className="w-3 h-3 text-slate-300" />;
}

function getVisibleColumns(module: string, data: DataRow[]): string[] {
  const columnSets: Record<string, string[]> = {
    sea_area: ['name', 'sea_type'],
    eez: ['country', 'area_sqkm'],
    bridge: ['state_code', 'structure_number', 'facility_carried', 'location', 'year_built'],
    safety_incident: ['occurrence_id', 'severity', 'vessel_name', 'local_date', 'short_description'],
    imdg: ['un_class', 'goods_name', 'division'],
    freight: ['index_name', 'source', 'collection_time'],
    ais_synopsis: ['vessel_id_hash', 'lon', 'lat', 'heading', 'speed', 'source_file'],
    ship_image: ['filename', 'lon', 'lat', 'timestamp_str'],
  };

  const cols = columnSets[module] || [];
  // Add any additional text columns that appear in data
  if (data.length > 0) {
    const dataCols = Object.keys(data[0]).filter(k => k.endsWith('_name') || k === 'title' || k === 'content');
    for (const c of dataCols) {
      if (!cols.includes(c) && c !== 'id' && c !== 'raw_fields' && c !== 'metadata') cols.push(c);
    }
  }
  return cols;
}
