'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Plus, Copy, Edit2, Trash2, Lock, Unlock,
  Check, GitBranch, ArrowLeft, Layers, Clock,
  Workflow, Eye, Cpu
} from 'lucide-react';

interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: any[];
  edges: any[];
  is_locked: boolean;
  is_active: boolean;
  engine?: string;        // 'langgraph' | 'legacy'
  created_at?: string;
  updated_at?: string;
}

const BUILTIN_WORKFLOW_IDS = ['rag-sql-dual', 'rag-only', 'search-only'];

export default function WorkflowManagePage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editingWorkflow, setEditingWorkflow] = useState<Workflow | null>(null);
  const [formData, setFormData] = useState({ name: '', description: '' });

  const fetchWorkflows = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/workflow');
      const data = await res.json();
      setWorkflows(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('获取工作流列表失败:', error);
    }
    setLoading(false);
  };

  useEffect(() => { fetchWorkflows(); }, []);

  const isBuiltin = (id: string) => BUILTIN_WORKFLOW_IDS.includes(id);

  const handleCreate = async () => {
    if (!formData.name.trim()) return;
    try {
      const res = await fetch('/api/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name, description: formData.description,
          nodes: [], edges: [], engine: 'langgraph',
        }),
      });
      if (res.ok) { setShowCreate(false); setFormData({ name: '', description: '' }); fetchWorkflows(); }
    } catch (e) { console.error('创建失败:', e); }
  };

  const handleCopy = async (id: string) => {
    try {
      const res = await fetch('/api/workflow/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (res.ok) fetchWorkflows();
    } catch (e) { console.error('复制失败:', e); }
  };

  const handleCopyBuiltin = async (wf: Workflow) => {
    try {
      const res = await fetch('/api/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${wf.name} (副本)`, description: wf.description,
          nodes: wf.nodes, edges: wf.edges, engine: 'langgraph',
        }),
      });
      if (res.ok) fetchWorkflows();
    } catch (e) { console.error('复制失败:', e); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此工作流吗？')) return;
    try {
      const res = await fetch(`/api/workflow?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok && data.success) fetchWorkflows();
      else alert(data.error || '删除失败');
    } catch (e) { console.error('删除失败:', e); }
  };

  const handleSetActive = async (id: string) => {
    try {
      await fetch('/api/workflow', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: true }),
      });
      fetchWorkflows();
    } catch (e) { console.error('设置失败:', e); }
  };

  const handleLock = async (id: string, lock: boolean) => {
    try {
      const res = await fetch('/api/workflow', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_locked: lock }),
      });
      if (!res.ok) { const d = await res.json(); alert(d.error || '操作失败'); }
      else fetchWorkflows();
    } catch (e) { console.error('锁定失败:', e); }
  };

  // 内置工作流与自定义分开
  const builtins = workflows.filter(w => isBuiltin(w.id));
  const customs = workflows.filter(w => !isBuiltin(w.id));

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-5xl mx-auto p-3 md:p-4">

        {/* 头部 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-1 text-slate-500 hover:text-blue-600 text-xs">
              <ArrowLeft className="w-3 h-3" /> 返回
            </a>
            <div className="h-3 w-px bg-slate-300" />
            <div className="flex items-center gap-1.5">
              <GitBranch className="w-4 h-4 text-blue-600" />
              <h1 className="text-sm font-medium text-slate-700">工作流管理</h1>
              <Badge className="bg-indigo-100 text-indigo-700 text-[9px] h-4 px-1">LangGraph</Badge>
            </div>
          </div>
          <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1 h-7 text-xs">
            <Plus className="w-3 h-3" /> 新建
          </Button>
        </div>

        {loading ? (
          <div className="text-center py-8 text-slate-400 text-xs">加载中...</div>
        ) : (
          <div className="space-y-4">
            {/* ── LangGraph 内置工作流 ── */}
            {builtins.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Cpu className="w-3 h-3 text-indigo-500" />
                  <span className="text-[10px] font-medium text-slate-500">LangGraph 内置工作流</span>
                  <Badge className="bg-indigo-100 text-indigo-600 text-[8px] h-3 px-1">只读</Badge>
                </div>
                <div className="grid gap-2 grid-cols-1 md:grid-cols-3">
                  {builtins.map(wf => (
                    <Card key={wf.id} className={`border-indigo-200 bg-white shadow-sm transition-shadow hover:shadow-md ${
                      wf.is_active ? 'ring-2 ring-blue-300' : ''
                    }`}>
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between mb-1">
                          <div className="flex items-center gap-1.5">
                            <div className="w-6 h-6 rounded bg-indigo-100 flex items-center justify-center text-xs">
                              {wf.id === 'rag-sql-dual' ? '🔀' : wf.id === 'rag-only' ? '📖' : '🔍'}
                            </div>
                            <h3 className="font-semibold text-slate-800 text-[11px]">{wf.name}</h3>
                          </div>
                          {wf.is_active && <Badge className="bg-blue-500 text-[8px] h-3.5 px-1">当前</Badge>}
                        </div>
                        <p className="text-[9px] text-slate-500 mb-2 line-clamp-2">{wf.description}</p>
                        <div className="flex items-center gap-0.5 text-[8px] text-slate-400 mb-2">
                          <Cpu className="w-2 h-2 text-indigo-400" />
                          <span>{wf.engine || 'langgraph'} · {wf.nodes?.length || 0}节点</span>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" asChild
                            className="text-blue-600 border-blue-200 hover:bg-blue-50 h-6 px-2 text-[9px] flex-1">
                            <a href={`/workflow/edit?id=${wf.id}&readonly=1`}>
                              <Eye className="w-2.5 h-2.5 mr-1" />查看图谱
                            </a>
                          </Button>
                          <Button size="sm" variant="outline"
                            onClick={() => handleCopyBuiltin(wf)}
                            className="text-green-600 border-green-200 hover:bg-green-50 h-6 px-2 text-[9px]">
                            <Copy className="w-2.5 h-2.5" />
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* ── 自定义工作流 ── */}
            {customs.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Workflow className="w-3 h-3 text-slate-500" />
                  <span className="text-[10px] font-medium text-slate-500">自定义工作流</span>
                </div>
                <div className="space-y-1.5">
                  {customs.map(wf => (
                    <Card key={wf.id}
                      className={`border-slate-200 bg-white/90 hover:shadow-sm transition-shadow ${
                        wf.is_active ? 'border-blue-400/50 shadow-sm' : ''
                      }`}>
                      <CardContent className="p-2">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <h3 className="font-medium text-slate-800 text-[10px] truncate">{wf.name}</h3>
                              {wf.is_active && <Badge className="bg-blue-500 text-[8px] h-3 px-1">当前</Badge>}
                              {wf.engine && <Badge variant="outline" className="border-indigo-200 text-indigo-600 text-[8px] h-3 px-1">{wf.engine}</Badge>}
                              {wf.is_locked && <Lock className="w-2 h-2 text-amber-500" />}
                              <span className="text-[8px] text-slate-400">{wf.nodes?.length || 0}节点</span>
                            </div>
                            {wf.description && (
                              <p className="text-slate-500 text-[9px] mt-0.5 line-clamp-1">{wf.description}</p>
                            )}
                          </div>
                          <div className="flex items-center gap-0.5">
                            {!wf.is_active && (
                              <Button variant="outline" size="sm" onClick={() => handleSetActive(wf.id)}
                                className="text-blue-600 border-blue-200 hover:bg-blue-50 h-5 px-1.5 text-[9px]">
                                设为当前
                              </Button>
                            )}
                            <Button variant="ghost" size="sm" asChild
                              className="text-slate-500 hover:bg-slate-100 h-5 w-5 p-0">
                              <a href={`/workflow/edit?id=${wf.id}`}><Edit2 className="w-2.5 h-2.5" /></a>
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleCopy(wf.id)}
                              className="text-slate-500 hover:bg-slate-100 h-5 w-5 p-0">
                              <Copy className="w-2.5 h-2.5" />
                            </Button>
                            <Button variant="ghost" size="sm"
                              onClick={() => handleLock(wf.id, !wf.is_locked)}
                              className={wf.is_locked ? 'text-green-600 hover:bg-green-50 h-5 w-5 p-0' : 'text-slate-500 hover:bg-slate-100 h-5 w-5 p-0'}>
                              {wf.is_locked ? <Unlock className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                            </Button>
                            {!wf.is_locked ? (
                              <Button variant="ghost" size="sm" onClick={() => handleDelete(wf.id)}
                                className="text-red-500 hover:bg-red-50 h-5 w-5 p-0">
                                <Trash2 className="w-2.5 h-2.5" />
                              </Button>
                            ) : (
                              <Button variant="ghost" size="sm" disabled title="请先解锁"
                                className="text-slate-300 h-5 w-5 p-0 cursor-not-allowed">
                                <Trash2 className="w-2.5 h-2.5" />
                              </Button>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {!loading && workflows.length === 0 && (
              <div className="text-center py-12 text-slate-400">
                <GitBranch className="w-8 h-8 mx-auto mb-2 opacity-20" />
                <p className="text-xs">暂无工作流，点击「新建」创建第一个</p>
              </div>
            )}
          </div>
        )}

        {/* 使用说明 */}
        <Card className="mt-4 bg-white/60 border-slate-200">
          <CardHeader className="pb-1 pt-2 px-3">
            <CardTitle className="text-xs font-medium text-slate-600">💡 使用说明</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-slate-500">
              <div><b>内置工作流</b>：LangGraph 引擎驱动，只读，可复制后自定义</div>
              <div><b>设为当前</b>：问答系统使用此工作流</div>
              <div><b>复制</b>：创建副本后可自由编辑节点连线</div>
              <div><b>编辑</b>：进入 ReactFlow 画布拖拽节点构建流程</div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 新建弹窗 */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm shadow-xl">
            <CardHeader className="pb-2"><CardTitle className="text-sm">新建 LangGraph 工作流</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">名称 *</label>
                <input type="text" value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="输入工作流名称" />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">描述</label>
                <textarea value={formData.description}
                  onChange={e => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs h-16 resize-none"
                  placeholder="描述此工作流的用途" />
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setShowCreate(false)} className="h-7 text-xs">取消</Button>
                <Button size="sm" onClick={handleCreate} className="h-7 text-xs">创建</Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
