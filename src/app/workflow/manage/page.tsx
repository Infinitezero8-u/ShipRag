'use client';

import { useState, useEffect } from 'react';

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
  
  return (
    <div className="min-h-screen bg-gray-50 p-4">
      {/* 顶部导航 */}
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <a href="/" className="text-blue-600 hover:underline text-sm">← 返回</a>
            <h1 className="text-lg font-medium">工作流管理</h1>
          </div>
          <button
            onClick={() => setShowCreate(true)}
            className="px-3 py-1.5 bg-blue-500 text-white rounded text-sm"
          >
            + 新建工作流
          </button>
        </div>
        
        {/* 工作流列表 */}
        {loading ? (
          <div className="text-center py-8 text-gray-400">加载中...</div>
        ) : workflows.length === 0 ? (
          <div className="text-center py-8 text-gray-400">
            暂无工作流，点击右上角新建
          </div>
        ) : (
          <div className="space-y-3">
            {workflows.map((wf) => (
              <div
                key={wf.id}
                className={`bg-white rounded-lg border p-4 ${
                  wf.is_active ? 'border-blue-500 ring-1 ring-blue-500' : 'border-gray-200'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{wf.name}</span>
                      {wf.is_active && (
                        <span className="px-1.5 py-0.5 bg-blue-100 text-blue-600 text-xs rounded">
                          当前使用
                        </span>
                      )}
                      {wf.is_locked && (
                        <span className="px-1.5 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">
                          🔒 锁定
                        </span>
                      )}
                    </div>
                    {wf.description && (
                      <p className="text-gray-500 text-sm mt-1">{wf.description}</p>
                    )}
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      <span>{wf.nodes?.length || 0} 个节点</span>
                      <span>{wf.edges?.length || 0} 条连线</span>
                      <span>更新: {new Date(wf.updated_at).toLocaleString()}</span>
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2 ml-4">
                    {!wf.is_active && (
                      <button
                        onClick={() => handleSetActive(wf.id)}
                        className="px-2 py-1 text-xs bg-blue-50 text-blue-600 rounded hover:bg-blue-100"
                      >
                        设为当前
                      </button>
                    )}
                    <a
                      href={`/workflow/edit?id=${wf.id}`}
                      className="px-2 py-1 text-xs bg-gray-50 text-gray-600 rounded hover:bg-gray-100"
                    >
                      编辑
                    </a>
                    <button
                      onClick={() => handleCopy(wf.id)}
                      className="px-2 py-1 text-xs bg-gray-50 text-gray-600 rounded hover:bg-gray-100"
                    >
                      复制
                    </button>
                    <button
                      onClick={() => handleLock(wf.id, !wf.is_locked)}
                      className={`px-2 py-1 text-xs rounded ${
                        wf.is_locked
                          ? 'bg-green-50 text-green-600 hover:bg-green-100'
                          : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                      }`}
                    >
                      {wf.is_locked ? '解锁' : '锁定'}
                    </button>
                    {!wf.is_locked && (
                      <button
                        onClick={() => handleDelete(wf.id)}
                        className="px-2 py-1 text-xs bg-red-50 text-red-600 rounded hover:bg-red-100"
                      >
                        删除
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        
        {/* 说明 */}
        <div className="mt-8 p-4 bg-white rounded-lg border text-sm text-gray-600">
          <h3 className="font-medium mb-2">说明</h3>
          <ul className="list-disc list-inside space-y-1">
            <li><strong>设为当前</strong>：将此工作流设为问答系统使用的工作流</li>
            <li><strong>锁定</strong>：锁定后不可修改和删除，防止误操作</li>
            <li><strong>复制</strong>：创建工作流副本，副本默认不锁定</li>
            <li><strong>编辑</strong>：进入工作流画布编辑节点和连线</li>
          </ul>
        </div>
      </div>
      
      {/* 新建弹窗 */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md p-4">
            <h3 className="font-medium mb-4">新建工作流</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-500 block mb-1">名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded text-sm"
                  placeholder="输入工作流名称"
                />
              </div>
              <div>
                <label className="text-sm text-gray-500 block mb-1">描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded text-sm h-20"
                  placeholder="可选描述"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setShowCreate(false); setFormData({ name: '', description: '' }); }}
                className="px-3 py-1.5 bg-gray-100 rounded text-sm"
              >
                取消
              </button>
              <button
                onClick={handleCreate}
                className="px-3 py-1.5 bg-blue-500 text-white rounded text-sm"
              >
                创建
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* 编辑弹窗 */}
      {editingWorkflow && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg w-full max-w-md p-4">
            <h3 className="font-medium mb-4">编辑工作流</h3>
            <div className="space-y-3">
              <div>
                <label className="text-sm text-gray-500 block mb-1">名称 *</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded text-sm"
                />
              </div>
              <div>
                <label className="text-sm text-gray-500 block mb-1">描述</label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border rounded text-sm h-20"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button
                onClick={() => { setEditingWorkflow(null); setFormData({ name: '', description: '' }); }}
                className="px-3 py-1.5 bg-gray-100 rounded text-sm"
              >
                取消
              </button>
              <button
                onClick={handleUpdate}
                className="px-3 py-1.5 bg-blue-500 text-white rounded text-sm"
              >
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
