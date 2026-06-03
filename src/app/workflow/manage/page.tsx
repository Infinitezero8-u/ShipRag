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

// 系统内置工作流（当前使用的 RAG+SQL 工作流）
const DEFAULT_WORKFLOW: Workflow = {
  id: 'default-rag-sql',
  name: '双分支 RAG+SQL 智能问答',
  description: '标准双分支工作流：用户输入 → 意图分类 → 条件分支 → RAG分支/SQL分支/双分支并行 → 结果汇总输出。支持三路路由：RAG(文档查询)、SQL(统计查询)、ALL(双分支并行)',
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
  edges: [],
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
  
  const handleUpdate = async () => {
    if (!editingWorkflow || !formData.name.trim()) return;
    
    try {
      const res = await fetch('/api/workflow', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingWorkflow.id,
          name: formData.name,
          description: formData.description,
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
  
  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此工作流？')) return;
    
    try {
      const res = await fetch(`/api/workflow?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        fetchWorkflows();
      } else {
        const data = await res.json();
        alert(data.error || '删除失败');
      }
    } catch (error) {
      console.error('删除失败:', error);
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
  
  // 复制内置工作流
  const handleCopyDefault = async (wf: Workflow) => {
    try {
      const res = await fetch('/api/workflow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: `${wf.name} (副本)`,
          description: wf.description,
          nodes: wf.nodes,
          edges: wf.edges,
        }),
      });
      
      if (res.ok) {
        fetchWorkflows();
      } else {
        const data = await res.json();
        alert(data.error || '复制失败');
      }
    } catch (error) {
      console.error('复制失败:', error);
    }
  };
  
  const handleSetActive = async (id: string) => {
    // 内置工作流已经是激活状态
    if (id === DEFAULT_WORKFLOW.id) return;
    
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
      <div className="max-w-5xl mx-auto p-4 md:p-6">
        {/* 顶部导航 */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <a href="/" className="flex items-center gap-1 text-slate-600 hover:text-blue-600 transition-colors text-sm">
              <ArrowLeft className="w-4 h-4" />
              返回
            </a>
            <div className="h-4 w-px bg-slate-300" />
            <div className="flex items-center gap-2">
              <Layers className="w-5 h-5 text-blue-600" />
              <h1 className="text-xl font-semibold text-slate-800">工作流管理</h1>
            </div>
          </div>
          <Button onClick={() => setShowCreate(true)} className="gap-1.5 shadow-sm">
            <Plus className="w-4 h-4" />
            新建工作流
          </Button>
        </div>
        
        {/* 工作流列表 */}
        {loading ? (
          <div className="text-center py-12 text-slate-400">加载中...</div>
        ) : (
          <div className="space-y-4">
            {allWorkflows.map((wf) => {
              const isDefault = isDefaultWorkflow(wf.id);
              
              return (
                <Card 
                  key={wf.id} 
                  className={`transition-all duration-200 ${
                    wf.is_active 
                      ? 'border-blue-500/50 shadow-lg shadow-blue-100/50 bg-white' 
                      : 'border-slate-200 bg-white/80 hover:shadow-md'
                  } ${isDefault ? 'ring-1 ring-blue-200' : ''}`}
                >
                  <CardContent className="p-5">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* 标题和标签 */}
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-slate-800 text-lg truncate">
                            {wf.name}
                          </h3>
                          {wf.is_active && (
                            <Badge variant="default" className="bg-blue-500 gap-1">
                              <Check className="w-3 h-3" />
                              当前使用
                            </Badge>
                          )}
                          {isDefault && (
                            <Badge variant="secondary" className="bg-slate-100 text-slate-600">
                              系统内置
                            </Badge>
                          )}
                          {wf.is_locked && !isDefault && (
                            <Badge variant="outline" className="border-amber-300 text-amber-600 gap-1">
                              <Lock className="w-3 h-3" />
                              已锁定
                            </Badge>
                          )}
                        </div>
                        
                        {/* 描述 */}
                        {wf.description && (
                          <p className="text-slate-500 text-sm mt-2 line-clamp-2">
                            {wf.description}
                          </p>
                        )}
                        
                        {/* 元信息 */}
                        <div className="flex items-center gap-4 mt-3 text-xs text-slate-400">
                          <span className="flex items-center gap-1">
                            <GitBranch className="w-3 h-3" />
                            {wf.nodes?.length || 0} 个节点
                          </span>
                          <span>{wf.edges?.length || 0} 条连线</span>
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {new Date(wf.updated_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>
                      
                      {/* 操作按钮 */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {!wf.is_active && !isDefault && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleSetActive(wf.id)}
                            className="text-blue-600 border-blue-200 hover:bg-blue-50"
                          >
                            <Check className="w-3 h-3 mr-1" />
                            设为当前
                          </Button>
                        )}
                        
                        {!isDefault && (
                          <>
                            <Button
                              variant="ghost"
                              size="sm"
                              asChild
                              className="text-slate-600 hover:bg-slate-100"
                            >
                              <a href={`/workflow/edit?id=${wf.id}`}>
                                <Edit2 className="w-4 h-4" />
                              </a>
                            </Button>
                            
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleCopy(wf.id)}
                              className="text-slate-600 hover:bg-slate-100"
                            >
                              <Copy className="w-4 h-4" />
                            </Button>
                            
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleLock(wf.id, !wf.is_locked)}
                              className={`${wf.is_locked ? 'text-green-600 hover:bg-green-50' : 'text-slate-600 hover:bg-slate-100'}`}
                            >
                              {wf.is_locked ? <Unlock className="w-4 h-4" /> : <Lock className="w-4 h-4" />}
                            </Button>
                            
                            {!wf.is_locked && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDelete(wf.id)}
                                className="text-red-500 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="w-4 h-4" />
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
                              className="text-blue-600 border-blue-200 hover:bg-blue-50"
                            >
                              <a href="/workflow">
                                <Edit2 className="w-3 h-3 mr-1" />
                                查看
                              </a>
                            </Button>
                            
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleCopyDefault(wf)}
                              className="text-green-600 border-green-200 hover:bg-green-50"
                            >
                              <Copy className="w-3 h-3 mr-1" />
                              复制
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
        <Card className="mt-8 bg-white/60 border-slate-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-slate-700">使用说明</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-slate-600">
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <Check className="w-3 h-3 text-blue-600" />
                </div>
                <span><strong>设为当前</strong>：将此工作流设为问答系统使用的工作流</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0">
                  <Lock className="w-3 h-3 text-amber-600" />
                </div>
                <span><strong>锁定</strong>：锁定后不可修改和删除，防止误操作</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-slate-100 flex items-center justify-center flex-shrink-0">
                  <Copy className="w-3 h-3 text-slate-600" />
                </div>
                <span><strong>复制</strong>：创建工作流副本，副本默认不锁定</span>
              </div>
              <div className="flex items-start gap-2">
                <div className="w-6 h-6 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                  <Edit2 className="w-3 h-3 text-green-600" />
                </div>
                <span><strong>编辑</strong>：进入工作流画布编辑节点和连线</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
      
      {/* 新建弹窗 */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md shadow-xl">
            <CardHeader>
              <CardTitle>新建工作流</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-slate-500 block mb-1.5">名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="输入工作流名称"
                />
              </div>
              <div>
                <label className="text-sm text-slate-500 block mb-1.5">描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm h-24 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="可选描述"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => { setShowCreate(false); setFormData({ name: '', description: '' }); }}
                >
                  取消
                </Button>
                <Button onClick={handleCreate} disabled={!formData.name.trim()}>
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
          <Card className="w-full max-w-md shadow-xl">
            <CardHeader>
              <CardTitle>编辑工作流</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="text-sm text-slate-500 block mb-1.5">名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="text-sm text-slate-500 block mb-1.5">描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm h-24 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  variant="outline"
                  onClick={() => { setEditingWorkflow(null); setFormData({ name: '', description: '' }); }}
                >
                  取消
                </Button>
                <Button onClick={handleUpdate} disabled={!formData.name.trim()}>
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
