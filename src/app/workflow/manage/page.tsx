'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Copy, 
  Edit2, 
  Trash2, 
  Lock, 
  Unlock, 
  Check, 
  GitBranch,
  ArrowLeft,
  Layers,
  Clock
} from 'lucide-react';

interface Workflow {
  id: string;
  name: string;
  description: string;
  nodes: any[];
  edges: any[];
  is_locked: boolean;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// 默认工作流节点连线关系
const DEFAULT_EDGES = [
  { from: 0, to: 1 }, // 用户输入 -> 分类Prompt
  { from: 1, to: 2 }, // 分类Prompt -> 分类LLM
  { from: 2, to: 3 }, // 分类LLM -> 条件分支
  { from: 3, to: 4 }, // 条件分支 -> Query优化 (RAG分支)
  { from: 4, to: 5 }, // Query优化 -> 向量化
  { from: 5, to: 6 }, // 向量化 -> 向量检索
  { from: 6, to: 7 }, // 向量检索 -> 结果重排
  { from: 7, to: 8 }, // 结果重排 -> Prompt组装
  { from: 8, to: 9 }, // Prompt组装 -> LLM生成
  { from: 9, to: 13 }, // LLM生成 -> 输出汇总
  { from: 3, to: 10 }, // 条件分支 -> SQL生成 (SQL分支)
  { from: 10, to: 11 }, // SQL生成 -> 数据库执行
  { from: 11, to: 12 }, // 数据库执行 -> 结果润色
  { from: 12, to: 13 }, // 结果润色 -> 输出汇总
];

// 系统内置工作流（当前使用的 RAG+SQL 工作流）
const DEFAULT_WORKFLOW: Workflow = {
  id: 'default-rag-sql',
  name: '双分支 RAG+SQL 智能问答',
  description: '用户输入→意图分类→条件分支→RAG分支/SQL分支→结果汇总',
  nodes: [
    { type: 'chatInput', name: '用户输入' },
    { type: 'classifyPrompt', name: '分类Prompt' },
    { type: 'classifyLLM', name: '分类LLM' },
    { type: 'branchCondition', name: '条件分支' },
    { type: 'queryRewrite', name: 'Query优化' },
    { type: 'embedding', name: '向量化' },
    { type: 'vectorRetrieval', name: '向量检索' },
    { type: 'rerank', name: '结果重排' },
    { type: 'promptAssembly', name: 'Prompt组装' },
    { type: 'llm', name: 'LLM生成' },
    { type: 'sqlPrompt', name: 'SQL生成' },
    { type: 'sqlExecute', name: '数据库执行' },
    { type: 'sqlPolish', name: '结果润色' },
    { type: 'chatOutput', name: '输出汇总' },
  ],
  edges: DEFAULT_EDGES,
  is_locked: true,
  is_active: true,
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
};

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
  
  useEffect(() => {
    fetchWorkflows();
  }, []);
  
  // 合并内置工作流和用户工作流，内置工作流始终在第一位
  const allWorkflows = [DEFAULT_WORKFLOW, ...workflows];
  
  const handleCreate = async () => {
    if (!formData.name.trim()) return;
    
    try {
      const res = await fetch('/api/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: formData.name,
          description: formData.description,
          nodes: [],
          edges: [],
        }),
      });
      
      if (res.ok) {
        setShowCreate(false);
        setFormData({ name: '', description: '' });
        fetchWorkflows();
      }
    } catch (error) {
      console.error('创建失败:', error);
    }
  };
  
  const handleCopy = async (id: string) => {
    try {
      const res = await fetch('/api/workflow/copy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      
      if (res.ok) {
        fetchWorkflows();
      }
    } catch (error) {
      console.error('复制失败:', error);
    }
  };
  
  const handleCopyDefault = async (workflow: Workflow) => {
    try {
      // 复制内置工作流到数据库
      const res = await fetch('/api/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: workflow.name + '-副本',
          description: workflow.description,
          nodes: workflow.nodes,
          edges: workflow.edges,
        }),
      });
      
      if (res.ok) {
        fetchWorkflows();
      }
    } catch (error) {
      console.error('复制失败:', error);
    }
  };
  
  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此工作流吗？')) return;
    
    try {
      const res = await fetch('/api/workflow', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      
      const data = await res.json();
      
      if (res.ok && data.success) {
        fetchWorkflows();
      } else {
        alert(data.error || '删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
      alert('删除失败，请稍后重试');
    }
  };
  
  const handleUpdate = async () => {
    if (!editingWorkflow || !formData.name.trim()) return;
    
    try {
      const res = await fetch('/api/workflow', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          id: editingWorkflow.id, 
          name: formData.name, 
          description: formData.description 
        }),
      });
      
      if (res.ok) {
        setEditingWorkflow(null);
        setFormData({ name: '', description: '' });
        fetchWorkflows();
      }
    } catch (error) {
      console.error('更新失败:', error);
    }
  };
  
  const handleSetActive = async (id: string) => {
    try {
      const res = await fetch('/api/workflow', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_active: true }),
      });
      
      if (res.ok) {
        fetchWorkflows();
      }
    } catch (error) {
      console.error('设置激活失败:', error);
    }
  };
  
  const handleLock = async (id: string, lock: boolean) => {
    try {
      const res = await fetch('/api/workflow', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, is_locked: lock }),
      });
      
      if (res.ok) {
        fetchWorkflows();
      } else {
        const data = await res.json();
        alert(data.error || '操作失败');
      }
    } catch (error) {
      console.error('锁定操作失败:', error);
    }
  };
  
  const openEdit = (workflow: Workflow) => {
    setEditingWorkflow(workflow);
    setFormData({ name: workflow.name, description: workflow.description || '' });
  };
  
  const isDefaultWorkflow = (id: string) => id === DEFAULT_WORKFLOW.id;
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="max-w-5xl mx-auto p-3 md:p-4">
        {/* 顶部导航 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <a href="/" className="flex items-center gap-1 text-slate-500 hover:text-blue-600 transition-colors text-xs">
              <ArrowLeft className="w-3 h-3" />
              返回
            </a>
            <div className="h-3 w-px bg-slate-300" />
            <div className="flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-blue-600" />
              <h1 className="text-sm font-medium text-slate-700">工作流管理</h1>
            </div>
          </div>
          <Button onClick={() => setShowCreate(true)} size="sm" className="gap-1 shadow-sm h-7 text-xs">
            <Plus className="w-3 h-3" />
            新建
          </Button>
        </div>
        
        {/* 工作流列表 */}
        {loading ? (
          <div className="text-center py-8 text-slate-400 text-xs">加载中...</div>
        ) : (
          <div className="space-y-2">
            {allWorkflows.map((wf) => {
              const isDefault = isDefaultWorkflow(wf.id);
              
              return (
                <Card 
                  key={wf.id} 
                  className={`transition-all duration-200 ${
                    wf.is_active 
                      ? 'border-blue-400/50 shadow-sm shadow-blue-100/50 bg-white' 
                      : 'border-slate-200 bg-white/80 hover:shadow-sm'
                  } ${isDefault ? 'ring-1 ring-blue-200' : ''}`}
                >
                  <CardContent className="p-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        {/* 标题和标签 */}
                        <div className="flex items-center gap-1 flex-wrap">
                          <h3 className="font-medium text-slate-800 text-[10px] truncate">
                            {wf.name}
                          </h3>
                          {wf.is_active && (
                            <Badge variant="default" className="bg-blue-500 gap-0.5 h-3.5 px-1 text-[9px]">
                              <Check className="w-2 h-2" />
                              当前
                            </Badge>
                          )}
                          {isDefault && (
                            <Badge variant="secondary" className="bg-slate-100 text-slate-600 h-3.5 px-1 text-[9px]">
                              内置
                            </Badge>
                          )}
                          {wf.is_locked && !isDefault && (
                            <Badge variant="outline" className="border-amber-300 text-amber-600 gap-0.5 h-3.5 px-1 text-[9px]">
                              <Lock className="w-2 h-2" />
                            </Badge>
                          )}
                          {/* 元信息移到标题行 */}
                          <span className="text-[9px] text-slate-400 ml-1">
                            {wf.nodes?.length || 0}节点 {wf.edges?.length || 0}连线
                          </span>
                        </div>
                        
                        {/* 描述 */}
                        {wf.description && (
                          <p className="text-slate-500 text-[9px] mt-0.5 line-clamp-1">
                            {wf.description}
                          </p>
                        )}
                      </div>
                      
                      {/* 操作按钮 */}
                      <div className="flex items-center gap-0.5 flex-shrink-0">
                        {!wf.is_active && !isDefault && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSetActive(wf.id)}
                            className="text-blue-600 border-blue-200 hover:bg-blue-50 h-5 px-1.5 text-[9px]"
                          >
                            设为当前
                          </Button>
                        )}
                        
                        {!isDefault && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                              className="text-slate-500 hover:bg-slate-100 h-5 w-5 p-0"
                            >
                              <a href={`/workflow/edit?id=${wf.id}`}>
                                <Edit2 className="w-2.5 h-2.5" />
                              </a>
                            </Button>
                            
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopy(wf.id)}
                              className="text-slate-500 hover:bg-slate-100 h-5 w-5 p-0"
                            >
                              <Copy className="w-2.5 h-2.5" />
                            </Button>
                            
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleLock(wf.id, !wf.is_locked)}
                              className={`${wf.is_locked ? 'text-green-600 hover:bg-green-50' : 'text-slate-500 hover:bg-slate-100'} h-5 w-5 p-0`}
                            >
                              {wf.is_locked ? <Unlock className="w-2.5 h-2.5" /> : <Lock className="w-2.5 h-2.5" />}
                            </Button>
                            
                            {!wf.is_locked ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(wf.id)}
                                className="text-red-500 hover:bg-red-50 hover:text-red-600 h-5 w-5 p-0"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </Button>
                            ) : (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled
                                title="锁定的工作流不能删除，请先解锁"
                                className="text-slate-300 h-5 w-5 p-0 cursor-not-allowed"
                              >
                                <Trash2 className="w-2.5 h-2.5" />
                              </Button>
                            )}
                          </>
                        )}
                        
                        {/* 内置工作流：允许查看和复制，不允许删除和修改 */}
                        {isDefault && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              asChild
                              className="text-blue-600 border-blue-200 hover:bg-blue-50 h-5 px-1.5 text-[9px]"
                            >
                              <a href={`/workflow/edit?id=${wf.id}`}>
                                查看
                              </a>
                            </Button>
                            
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCopyDefault(wf)}
                              className="text-green-600 border-green-200 hover:bg-green-50 h-5 px-1.5 text-[9px]"
                            >
                              复制
                            </Button>
                            
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled
                              title="内置工作流不能删除"
                              className="text-slate-300 h-5 w-5 p-0 cursor-not-allowed"
                            >
                              <Trash2 className="w-2.5 h-2.5" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
        
        {/* 说明 */}
        <Card className="mt-4 bg-white/60 border-slate-200">
          <CardHeader className="pb-1 pt-2 px-3">
            <CardTitle className="text-xs font-medium text-slate-600">使用说明</CardTitle>
          </CardHeader>
          <CardContent className="px-3 pb-2 pt-0">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-slate-500">
              <div className="flex items-center gap-1">
                <Check className="w-2.5 h-2.5 text-blue-500" />
                <span><b>设为当前</b>：问答系统使用此工作流</span>
              </div>
              <div className="flex items-center gap-1">
                <Lock className="w-2.5 h-2.5 text-amber-500" />
                <span><b>锁定</b>：防止误操作修改删除</span>
              </div>
              <div className="flex items-center gap-1">
                <Copy className="w-2.5 h-2.5 text-slate-400" />
                <span><b>复制</b>：创建副本可自由编辑</span>
              </div>
              <div className="flex items-center gap-1">
                <Edit2 className="w-2.5 h-2.5 text-green-500" />
                <span><b>编辑</b>：进入画布编辑节点连线</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* 新建弹窗 */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm shadow-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">新建工作流</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="输入工作流名称"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs h-16 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                  placeholder="可选描述"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setShowCreate(false); setFormData({ name: '', description: '' }); }}
                  className="h-7 text-xs"
                >
                  取消
                </Button>
                <Button size="sm" onClick={handleCreate} disabled={!formData.name.trim()} className="h-7 text-xs">
                  创建
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
      
      {/* 编辑弹窗 */}
      {editingWorkflow && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm shadow-xl">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">编辑工作流</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-[10px] text-slate-500 block mb-1">描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-2 py-1.5 border border-slate-200 rounded text-xs h-16 resize-none focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => { setEditingWorkflow(null); setFormData({ name: '', description: '' }); }}
                  className="h-7 text-xs"
                >
                  取消
                </Button>
                <Button size="sm" onClick={handleUpdate} disabled={!formData.name.trim()} className="h-7 text-xs">
                  保存
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
