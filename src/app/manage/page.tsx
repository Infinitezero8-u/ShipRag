'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';

interface FileUpload {
  id: string;
  filename: string;
  file_type: string;
  file_size: string;
  item_count: string;
  status: string;
  created_at: string;
}

interface KnowledgeItem {
  id: string;
  title: string;
  content: string;
  modality: string;
  source: string;
  status: string;
  tags?: string[];
  created_at: string;
}

interface Tag {
  name: string;
  count: number;
}

interface VectorizeTask {
  id: string;
  task_type: string;
  target_id: string;
  target_name: string;
  action: string;
  status: string;
  priority: number;
  total_count: number;
  processed_count: number;
  progress: number;
  error_message: string;
  created_at: string;
  updated_at: string;
  completed_at: string;
}

export default function ManagePage() {
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [tasks, setTasks] = useState<VectorizeTask[]>([]);
  const [stats, setStats] = useState({ totalFiles: 0, totalItems: 0, embedded: 0, pending: 0 });
  const [activeTab, setActiveTab] = useState<'tasks' | 'files' | 'items' | 'tags'>('tasks');
  const [loading, setLoading] = useState(false);
  const [tasksLoading, setTasksLoading] = useState(false);
  
  // 任务详情弹窗
  const [viewingTask, setViewingTask] = useState<VectorizeTask | null>(null);
  const [taskDetailData, setTaskDetailData] = useState<any[]>([]);
  const [taskDetailLoading, setTaskDetailLoading] = useState(false);
  const [taskDetailPage, setTaskDetailPage] = useState(1);
  const [taskDetailTotal, setTaskDetailTotal] = useState(0);
  const [taskDetailPageSize, setTaskDetailPageSize] = useState(20);
  
  // 删除确认弹窗
  const [deleteConfirmTask, setDeleteConfirmTask] = useState<VectorizeTask | null>(null);

  // 筛选
  const [filterModality, setFilterModality] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [filterTag, setFilterTag] = useState('all');
  const [filterSearch, setFilterSearch] = useState(''); // 模糊搜索
  const [sources, setSources] = useState<string[]>([]);

  // 分页
  const [itemPage, setItemPage] = useState(1);
  const [itemTotal, setItemTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // 批量操作
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  // 自动向量化状态
  const [autoEmbedding, setAutoEmbedding] = useState(false);
  const autoEmbeddingRef = useRef(false);
  const [embedProgress, setEmbedProgress] = useState({ processed: 0, failed: 0 });

  // 编辑条目
  const [editingItem, setEditingItem] = useState<KnowledgeItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState('');
  const [saving, setSaving] = useState(false);

  // 编辑文件
  const [editingFile, setEditingFile] = useState<FileUpload | null>(null);
  const [editFilename, setEditFilename] = useState('');

  // 编辑标签
  const [editingTagName, setEditingTagName] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState('');
  
  // 查看文档原文
  const [viewingDoc, setViewingDoc] = useState<{ title: string; content: string; source: string; filename?: string; storage_url?: string; file_type?: string } | null>(null);

  useEffect(() => {
    fetchData();
    fetchTags();
    fetchTasks();
  }, []);

  useEffect(() => {
    fetchItems();
  }, [itemPage, filterModality, filterStatus, filterSource, filterTag, filterSearch]);

  const fetchData = async () => {
    try {
      const res = await fetch('/api/upload');
      const data = await res.json();
      if (data.success) {
        setFiles(data.uploads || []);
        setStats({
          totalFiles: data.uploads?.length || 0,
          totalItems: 0,
          embedded: 0,
          pending: 0,
        });
      }
    } catch (err) {
      console.error('获取数据失败:', err);
    }
  };

  const fetchItems = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('type', 'all');
      params.set('limit', '20');
      params.set('offset', String((itemPage - 1) * 20));
      if (filterModality !== 'all') params.set('modality', filterModality);
      if (filterStatus !== 'all') params.set('status', filterStatus);
      if (filterSource !== 'all') params.set('source', filterSource);
      if (filterTag !== 'all') params.set('tag', filterTag);
      if (filterSearch.trim()) params.set('search', filterSearch.trim());

      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.items || []);
        setItemTotal(data.total || 0);
        setTotalPages(Math.ceil((data.total || 0) / 20));
        setSources(data.sources || []);
        
        const embedded = (data.items || []).filter((i: KnowledgeItem) => i.status === 'embedded').length;
        setStats(prev => ({
          ...prev,
          totalItems: data.total || 0,
          embedded: prev.embedded || embedded,
          pending: (data.total || 0) - embedded,
        }));
      }
    } catch (err) {
      console.error('获取条目失败:', err);
    }
    setLoading(false);
  };

  const fetchTags = async () => {
    try {
      const res = await fetch('/api/search?action=tags');
      const data = await res.json();
      if (data.success) {
        setTags(data.tags || []);
      }
    } catch (err) {
      console.error('获取标签失败:', err);
    }
  };

  const fetchTasks = async () => {
    setTasksLoading(true);
    try {
      const res = await fetch('/api/data-maintain?action=tasks');
      const data = await res.json();
      if (data.success) {
        setTasks(data.tasks || []);
      }
    } catch (err) {
      console.error('获取任务失败:', err);
    }
    setTasksLoading(false);
  };

  const formatFileSize = (size: string) => {
    const bytes = parseInt(size);
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / 1024 / 1024).toFixed(1) + ' MB';
  };

  // 文件操作
  const deleteFile = async (id: string) => {
    if (!confirm('确定删除此文件？相关条目也会被删除。')) return;
    try {
      await fetch(`/api/upload?id=${id}`, { method: 'DELETE' });
      fetchData();
      fetchItems();
    } catch (err) {
      console.error('删除失败:', err);
    }
  };

  const openFileEdit = (file: FileUpload) => {
    setEditingFile(file);
    setEditFilename(file.filename);
  };

  const closeFileEdit = () => {
    setEditingFile(null);
    setEditFilename('');
  };

  const saveFileEdit = async () => {
    if (!editingFile) return;
    setSaving(true);
    try {
      await fetch('/api/upload', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingFile.id, filename: editFilename }),
      });
      closeFileEdit();
      fetchData();
    } catch (err) {
      console.error('保存失败:', err);
    }
    setSaving(false);
  };

  // 条目操作
  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedItems);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedItems(newSet);
  };

  const toggleSelectAll = () => {
    if (selectedItems.size === items.length) {
      setSelectedItems(new Set());
    } else {
      setSelectedItems(new Set(items.map(i => i.id)));
    }
  };

  const deleteItems = async () => {
    if (!confirm(`确定删除 ${selectedItems.size} 个条目？`)) return;
    try {
      await fetch('/api/search', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedItems) }),
      });
      setSelectedItems(new Set());
      fetchItems();
      fetchTags();
    } catch (err) {
      console.error('删除失败:', err);
    }
  };

  const openEdit = (item: KnowledgeItem) => {
    setEditingItem(item);
    setEditTitle(item.title);
    setEditContent(item.content);
    setEditTags(item.tags || []);
  };

  const closeEdit = () => {
    setEditingItem(null);
    setEditTitle('');
    setEditContent('');
    setEditTags([]);
    setNewTag('');
  };

  const addTag = () => {
    if (newTag.trim() && !editTags.includes(newTag.trim())) {
      setEditTags([...editTags, newTag.trim()]);
      setNewTag('');
    }
  };

  const removeTag = (tag: string) => {
    setEditTags(editTags.filter(t => t !== tag));
  };

  const saveEdit = async () => {
    if (!editingItem) return;
    setSaving(true);
    try {
      await fetch('/api/search', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editingItem.id, title: editTitle, content: editContent, tags: editTags }),
      });
      closeEdit();
      fetchItems();
      fetchTags();
    } catch (err) {
      console.error('保存失败:', err);
    }
    setSaving(false);
  };

  // 标签操作
  const renameTag = async (oldName: string, newName: string) => {
    if (!newName.trim() || oldName === newName) return;
    
    // 检查新标签是否已存在
    const existingTag = tags.find(t => t.name === newName);
    if (existingTag) {
      const confirmMerge = confirm(`标签 "${newName}" 已存在。是否合并这两个标签？\n\n选择"确定"：将 "${oldName}" 的条目合并到 "${newName}"\n选择"取消"：取消操作`);
      if (!confirmMerge) {
        setEditingTagName(null);
        return;
      }
    }
    
    try {
      const res = await fetch('/api/search', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'renameTag', oldTag: oldName, newTag: newName }),
      });
      const data = await res.json();
      
      if (data.merged) {
        alert(`标签已合并！影响了 ${data.affectedCount} 个条目。`);
      }
      
      setEditingTagName(null);
      fetchTags();
      fetchItems();
    } catch (err) {
      console.error('重命名失败:', err);
    }
  };

  const deleteTag = async (name: string) => {
    if (!confirm(`确定删除标签 "${name}"？此操作不会删除条目。`)) return;
    try {
      await fetch('/api/search', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteTag', tag: name }),
      });
      fetchTags();
      fetchItems();
    } catch (err) {
      console.error('删除失败:', err);
    }
  };

  // 重新向量化选中的条目
  const reEmbedSelected = async () => {
    const selectedCount = selectedItems.size;
    
    // 询问是否保留原向量化结果
    const keepOld = confirm(
      `即将重新向量化 ${selectedCount} 个条目。\n\n` +
      `选择"确定"：保留原向量化结果，生成新的向量覆盖\n` +
      `选择"取消"：清除原向量后重新生成（条目会变为待处理状态）\n\n` +
      `是否保留原向量化结果？`
    );
    
    try {
      const res = await fetch('/api/embed', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'reembed', 
          ids: Array.from(selectedItems),
          keepOld 
        })
      });
      const data = await res.json();
      
      if (keepOld) {
        // 保留原结果：直接执行向量化
        alert(`已将 ${data.processced || selectedCount} 个条目标记为待重新向量化，请点击"执行向量化"按钮处理。`);
      } else {
        alert(`已清除 ${data.processed || selectedCount} 个条目的向量，请点击"执行向量化"按钮重新生成。`);
      }
      
      fetchItems();
    } catch (err) {
      console.error('重新向量化失败:', err);
    }
  };

  // 重新向量化全部
  const reEmbedAll = async () => {
    // 询问是否保留原向量化结果
    const keepOld = confirm(
      `即将重新向量化全部条目。\n\n` +
      `选择"确定"：保留原向量化结果，生成新的向量覆盖\n` +
      `选择"取消"：清除原向量后重新生成（条目会变为待处理状态）\n\n` +
      `是否保留原向量化结果？`
    );
    
    try {
      const res = await fetch('/api/embed', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'reembed', 
          all: true,
          keepOld 
        })
      });
      const data = await res.json();
      
      if (keepOld) {
        alert(`已将 ${data.processed || 0} 个条目标记为待重新向量化，请点击"执行向量化"按钮处理。`);
      } else {
        alert(`已清除 ${data.processed || 0} 个条目的向量，请点击"执行向量化"按钮重新生成。`);
      }
      
      fetchItems();
    } catch (err) {
      console.error('重新向量化失败:', err);
    }
  };

  // 重新打标签选中的条目
  const reTagSelected = async () => {
    if (!confirm(`确定要重新打标签 ${selectedItems.size} 个条目吗？`)) return;
    try {
      const res = await fetch('/api/embed', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedItems), action: 're-tag' })
      });
      const data = await res.json();
      alert(`打标签完成: 处理 ${data.processed} 条`);
      fetchTags();
      fetchItems();
    } catch (err) {
      console.error('重新打标签失败:', err);
    }
  };

  // 任务操作
  const handleTaskAction = async (taskId: string, action: string) => {
    try {
      const res = await fetch('/api/data-maintain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'task-control', taskId, taskAction: action })
      });
      const data = await res.json();
      if (data.success) {
        fetchTasks();
      } else {
        alert(data.error || '操作失败');
      }
    } catch (err) {
      console.error('任务操作失败:', err);
    }
  };

  const handleViewTask = async (task: VectorizeTask) => {
    setViewingTask(task);
    setTaskDetailLoading(true);
    setTaskDetailPage(1);
    try {
      const res = await fetch(`/api/data-maintain?action=task-detail&taskId=${task.id}&page=1&pageSize=${taskDetailPageSize}`);
      const data = await res.json();
      if (data.success) {
        setTaskDetailData(data.items || []);
        setTaskDetailTotal(data.total || 0);
      }
    } catch (err) {
      console.error('获取任务详情失败:', err);
    }
    setTaskDetailLoading(false);
  };

  const fetchTaskDetailPage = async (page: number, pageSize: number) => {
    if (!viewingTask) return;
    setTaskDetailLoading(true);
    try {
      const res = await fetch(`/api/data-maintain?action=task-detail&taskId=${viewingTask.id}&page=${page}&pageSize=${pageSize}`);
      const data = await res.json();
      if (data.success) {
        setTaskDetailData(data.items || []);
        setTaskDetailTotal(data.total || 0);
        setTaskDetailPage(page);
        setTaskDetailPageSize(pageSize);
      }
    } catch (err) {
      console.error('获取任务详情失败:', err);
    }
    setTaskDetailLoading(false);
  };

  const handleDeleteTask = async () => {
    if (!deleteConfirmTask) return;
    try {
      const res = await fetch('/api/data-maintain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete-task', taskId: deleteConfirmTask.id })
      });
      const data = await res.json();
      if (data.success) {
        setDeleteConfirmTask(null);
        fetchTasks();
      } else {
        alert(data.error || '删除失败');
      }
    } catch (err) {
      console.error('删除任务失败:', err);
    }
  };

  const deleteTaskDetailItem = async (itemId: string) => {
    if (!viewingTask) return;
    if (!confirm('确定删除此条目？')) return;
    try {
      const res = await fetch('/api/data-maintain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'delete-task-item', 
          taskId: viewingTask.id, 
          itemId,
          taskType: viewingTask.task_type
        })
      });
      const data = await res.json();
      if (data.success) {
        fetchTaskDetailPage(taskDetailPage, taskDetailPageSize);
      } else {
        alert(data.error || '删除失败');
      }
    } catch (err) {
      console.error('删除条目失败:', err);
    }
  };

  // 开始/停止自动向量化
  const toggleAutoEmbed = async () => {
    if (autoEmbedding) {
      // 停止
      autoEmbeddingRef.current = false;
      setAutoEmbedding(false);
      return;
    }

    // 开始
    autoEmbeddingRef.current = true;
    setAutoEmbedding(true);
    setEmbedProgress({ processed: 0, failed: 0 });

    while (autoEmbeddingRef.current) {
      try {
        const res = await fetch('/api/embed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchSize: 5 })
        });
        const data = await res.json();
        
        if (data.processed === 0 || !autoEmbeddingRef.current) {
          break;
        }
        
        setEmbedProgress(prev => ({
          processed: prev.processed + data.processed,
          failed: prev.failed + (data.failed || 0)
        }));
        
        // 更新统计
        fetchData();
      } catch (err) {
        console.error('向量化失败:', err);
        break;
      }
      
      // 短暂暂停
      await new Promise(resolve => setTimeout(resolve, 500));
    }

    autoEmbeddingRef.current = false;
    setAutoEmbedding(false);
    fetchData();
    fetchItems();
  };

  // 重新打标签全部
  const reTagAll = async () => {
    if (!confirm('确定要重新打标签全部条目吗？')) return;
    try {
      const res = await fetch('/api/embed', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 're-tag-all' })
      });
      const data = await res.json();
      alert(`打标签完成: 处理 ${data.processed} 条`);
      fetchTags();
      fetchItems();
    } catch (err) {
      console.error('重新打标签失败:', err);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-2xl mx-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-4">
          <a href="/" className="hover:opacity-80 transition-opacity"><h1 className="text-xl font-bold text-gray-800">知识库管理</h1></a>
          <Link href="/" className="text-blue-600 text-sm">← 返回首页</Link>
        </div>

        {/* 统计 */}
        <div className="bg-white rounded-lg shadow p-3 mb-3">
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-blue-50 rounded p-2 text-center">
              <div className="text-xl font-bold text-blue-600">{stats.totalFiles}</div>
              <div className="text-xs text-gray-500">文件</div>
            </div>
            <div className="bg-green-50 rounded p-2 text-center">
              <div className="text-xl font-bold text-green-600">{stats.totalItems}</div>
              <div className="text-xs text-gray-500">条目</div>
            </div>
            <div className="bg-purple-50 rounded p-2 text-center">
              <div className="text-xl font-bold text-purple-600">{stats.embedded}</div>
              <div className="text-xs text-gray-500">已向量化</div>
            </div>
            <div className="bg-orange-50 rounded p-2 text-center">
              <div className="text-xl font-bold text-orange-600">{stats.pending}</div>
              <div className="text-xs text-gray-500">待处理</div>
            </div>
          </div>
        </div>

        {/* Tab 切换 */}
        <div className="flex gap-2 mb-3">
          <button
            onClick={() => setActiveTab('tasks')}
            className={`flex-1 py-2 rounded-lg font-medium ${
              activeTab === 'tasks' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'
            }`}
          >
            📋 任务 ({tasks.length})
          </button>
          <button
            onClick={() => setActiveTab('files')}
            className={`flex-1 py-2 rounded-lg font-medium ${
              activeTab === 'files' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'
            }`}
          >
            📁 文件 ({files.length})
          </button>
          <button
            onClick={() => setActiveTab('items')}
            className={`flex-1 py-2 rounded-lg font-medium ${
              activeTab === 'items' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'
            }`}
          >
            📝 条目 ({itemTotal})
          </button>
          <button
            onClick={() => setActiveTab('tags')}
            className={`flex-1 py-2 rounded-lg font-medium ${
              activeTab === 'tags' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'
            }`}
          >
            🏷️ 标签 ({tags.length})
          </button>
        </div>

        {/* 任务列表 */}
        {activeTab === 'tasks' && (
          <div className="bg-white rounded-lg shadow">
            {tasksLoading ? (
              <div className="p-8 text-center text-gray-500">加载中...</div>
            ) : tasks.length === 0 ? (
              <div className="p-8 text-center text-gray-500">暂无任务</div>
            ) : (
              <div className="divide-y">
                {tasks.map((task) => (
                  <div key={task.id} className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-2xl">
                        {task.task_type === 'file' ? '📄' : 
                         task.task_type === 'database' ? '🗄️' : '📋'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-gray-800 truncate">
                          {task.target_name || task.target_id}
                        </div>
                        <div className="text-xs text-gray-500 flex items-center gap-2">
                          <span className={`px-1.5 py-0.5 rounded text-xs ${
                            task.status === 'completed' ? 'bg-green-100 text-green-700' :
                            task.status === 'running' ? 'bg-blue-100 text-blue-700' :
                            task.status === 'paused' ? 'bg-yellow-100 text-yellow-700' :
                            task.status === 'failed' ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-700'
                          }`}>
                            {task.status === 'completed' ? '已完成' :
                             task.status === 'running' ? '进行中' :
                             task.status === 'paused' ? '已暂停' :
                             task.status === 'failed' ? '失败' : '待处理'}
                          </span>
                          <span>{task.processed_count}/{task.total_count}</span>
                          {task.progress > 0 && (
                            <span className="text-blue-600">{task.progress}%</span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => handleViewTask(task)}
                        className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
                      >
                        查看
                      </button>
                      {task.status === 'pending' && (
                        <button
                          onClick={() => handleTaskAction(task.id, 'start')}
                          className="px-3 py-1 text-sm text-green-600 hover:bg-green-50 rounded"
                        >
                          开始
                        </button>
                      )}
                      {task.status === 'running' && (
                        <button
                          onClick={() => handleTaskAction(task.id, 'pause')}
                          className="px-3 py-1 text-sm text-yellow-600 hover:bg-yellow-50 rounded"
                        >
                          暂停
                        </button>
                      )}
                      {task.status === 'paused' && (
                        <button
                          onClick={() => handleTaskAction(task.id, 'resume')}
                          className="px-3 py-1 text-sm text-green-600 hover:bg-green-50 rounded"
                        >
                          继续
                        </button>
                      )}
                      <button
                        onClick={() => setDeleteConfirmTask(task)}
                        className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 文件列表 */}
        {activeTab === 'files' && (
          <div className="bg-white rounded-lg shadow">
            {files.length === 0 ? (
              <div className="p-8 text-center text-gray-500">暂无文件</div>
            ) : (
              <div className="divide-y">
                {files.map((file) => (
                  <div key={file.id} className="p-3 flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <span className="text-2xl">
                        {file.file_type === 'image' ? '📷' : 
                         file.file_type === 'excel' ? '📊' : 
                         file.file_type === 'pdf' ? '📕' : 
                         file.file_type === 'url' ? '🌐' : '📄'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-gray-800 truncate">{file.filename}</div>
                        <div className="text-xs text-gray-500">
                          {formatFileSize(file.file_size)} · {file.item_count} 条目 · {file.status}
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      <button
                        onClick={() => openFileEdit(file)}
                        className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
                      >
                        编辑
                      </button>
                      <button
                        onClick={() => deleteFile(file.id)}
                        className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* 条目列表 */}
        {activeTab === 'items' && (
          <>
            {/* 筛选器 */}
            <div className="bg-white rounded-lg shadow p-3 mb-3">
              <div className="flex flex-wrap gap-2">
                <select
                  value={filterModality}
                  onChange={(e) => { setFilterModality(e.target.value); setItemPage(1); }}
                  className="px-2 py-1 border rounded text-sm"
                >
                  <option value="all">全部类型</option>
                  <option value="excel">Excel</option>
                  <option value="image">图片</option>
                  <option value="text">文本</option>
                  <option value="pdf">PDF</option>
                  <option value="json">JSON</option>
                  <option value="url">网页</option>
                </select>
                <select
                  value={filterStatus}
                  onChange={(e) => { setFilterStatus(e.target.value); setItemPage(1); }}
                  className="px-2 py-1 border rounded text-sm"
                >
                  <option value="all">全部状态</option>
                  <option value="embedded">已向量化</option>
                  <option value="pending">待处理</option>
                </select>
                <select
                  value={filterSource}
                  onChange={(e) => { setFilterSource(e.target.value); setItemPage(1); }}
                  className="px-2 py-1 border rounded text-sm"
                >
                  <option value="all">全部来源文档</option>
                  {sources.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <input
                  type="text"
                  value={filterSearch}
                  onChange={(e) => { setFilterSearch(e.target.value); setItemPage(1); }}
                  placeholder="模糊搜索..."
                  className="px-2 py-1 border rounded text-sm w-40"
                />
                <select
                  value={filterTag}
                  onChange={(e) => { setFilterTag(e.target.value); setItemPage(1); }}
                  className="px-2 py-1 border rounded text-sm"
                >
                  <option value="all">全部标签</option>
                  {tags.map(t => (
                    <option key={t.name} value={t.name}>{t.name} ({t.count})</option>
                  ))}
                </select>
                {selectedItems.size > 0 && (
                  <>
                    <button
                      onClick={deleteItems}
                      className="px-3 py-1 bg-red-600 text-white rounded text-sm"
                    >
                      删除 ({selectedItems.size})
                    </button>
                    <button
                      onClick={reEmbedSelected}
                      className="px-3 py-1 bg-purple-600 text-white rounded text-sm"
                    >
                      重新向量化 ({selectedItems.size})
                    </button>
                    <button
                      onClick={reTagSelected}
                      className="px-3 py-1 bg-green-600 text-white rounded text-sm"
                    >
                      重新打标签 ({selectedItems.size})
                    </button>
                  </>
                )}
                <button
                  onClick={reEmbedAll}
                  className="px-3 py-1 bg-purple-100 text-purple-700 rounded text-sm"
                >
                  全部重新向量化
                </button>
                <button
                  onClick={toggleAutoEmbed}
                  className={`px-3 py-1 rounded text-sm font-medium ${
                    autoEmbedding
                      ? 'bg-red-500 text-white'
                      : 'bg-blue-500 text-white'
                  }`}
                >
                  {autoEmbedding ? (
                    <span>⏹ 停止向量化 ({embedProgress.processed})</span>
                  ) : (
                    <span>▶ 自动向量化 ({stats.pending})</span>
                  )}
                </button>
                <button
                  onClick={reTagAll}
                  className="px-3 py-1 bg-green-100 text-green-700 rounded text-sm"
                >
                  全部重新打标签
                </button>
              </div>
            </div>

            {/* 条目列表 */}
            <div className="bg-white rounded-lg shadow">
              {loading ? (
                <div className="p-8 text-center text-gray-500">加载中...</div>
              ) : items.length === 0 ? (
                <div className="p-8 text-center text-gray-500">暂无条目</div>
              ) : (
                <>
                  {/* 全选 */}
                  <div className="p-2 border-b bg-gray-50 flex items-center">
                    <input
                      type="checkbox"
                      checked={selectedItems.size === items.length && items.length > 0}
                      onChange={toggleSelectAll}
                      className="mr-2"
                    />
                    <span className="text-sm text-gray-600">全选</span>
                  </div>
                  
                  {/* 列表 */}
                  <div className="divide-y">
                    {items.map((item) => (
                      <div key={item.id} className="p-3 flex items-start gap-2">
                        <input
                          type="checkbox"
                          checked={selectedItems.has(item.id)}
                          onChange={() => toggleSelect(item.id)}
                          className="mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-gray-800">{item.title}</span>
                            <span className={`text-xs px-1 rounded ${
                              item.status === 'embedded' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'
                            }`}>
                              {item.status === 'embedded' ? '已向量化' : '待处理'}
                            </span>
                            {(item.tags || []).map(tag => (
                              <span key={tag} className="text-xs px-1 rounded bg-blue-100 text-blue-600">
                                {tag}
                              </span>
                            ))}
                          </div>
                          <div className="text-xs text-gray-500 mt-1">
                            {item.modality} · {item.source}
                          </div>
                          <div className="text-sm text-gray-600 mt-1 line-clamp-2">
                            {item.content?.substring(0, 150)}...
                          </div>
                        </div>
                        <button
                          onClick={() => openEdit(item)}
                          className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                        >
                          编辑
                        </button>
                      </div>
                    ))}
                  </div>

                  {/* 分页 */}
                  {totalPages > 1 && (
                    <div className="p-3 border-t flex items-center justify-between">
                      <span className="text-sm text-gray-500">
                        第 {itemPage} / {totalPages} 页
                      </span>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setItemPage(p => Math.max(1, p - 1))}
                          disabled={itemPage === 1}
                          className="px-3 py-1 border rounded text-sm disabled:opacity-50"
                        >
                          上一页
                        </button>
                        <button
                          onClick={() => setItemPage(p => Math.min(totalPages, p + 1))}
                          disabled={itemPage === totalPages}
                          className="px-3 py-1 border rounded text-sm disabled:opacity-50"
                        >
                          下一页
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </>
        )}

        {/* 标签管理 */}
        {activeTab === 'tags' && (
          <div className="bg-white rounded-lg shadow">
            {tags.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                暂无标签<br/>
                <span className="text-xs">上传文件时会自动生成标签，或手动为条目添加标签</span>
              </div>
            ) : (
              <div className="divide-y">
                {tags.map((tag) => (
                  <div key={tag.name} className="p-3 flex items-center justify-between">
                    {editingTagName === tag.name ? (
                      <input
                        type="text"
                        defaultValue={tag.name}
                        autoFocus
                        onBlur={(e) => renameTag(tag.name, e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') renameTag(tag.name, (e.target as HTMLInputElement).value);
                          if (e.key === 'Escape') setEditingTagName(null);
                        }}
                        className="flex-1 px-2 py-1 border rounded text-sm mr-2"
                      />
                    ) : (
                      <div 
                        className="flex-1 cursor-pointer"
                        onClick={() => {
                          setFilterTag(tag.name);
                          setActiveTab('items');
                        }}
                      >
                        <span className="font-medium text-gray-800">{tag.name}</span>
                        <span className="text-sm text-gray-500 ml-2">({tag.count} 条目)</span>
                      </div>
                    )}
                    <div className="flex gap-1">
                      <button
                        onClick={() => setEditingTagName(tag.name)}
                        className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                      >
                        重命名
                      </button>
                      <button
                        onClick={() => deleteTag(tag.name)}
                        className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                      >
                        删除
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 编辑条目弹窗 */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-3xl max-h-[92vh] overflow-auto">
            {/* 头部：类型图标 + 标题行 */}
            <div className="p-4 border-b flex items-center justify-between bg-gray-50 sticky top-0 z-10">
              <div className="flex items-center gap-3">
                {/* 类型图标 */}
                <span className="text-3xl">
                  {editingItem.modality === 'image' ? '🖼️' :
                   editingItem.modality === 'text' ? '📝' :
                   editingItem.modality === 'pdf' ? '📕' :
                   editingItem.modality === 'excel' ? '📊' :
                   editingItem.modality === 'json' ? '💾' :
                   editingItem.modality === 'url' ? '🌐' :
                   editingItem.modality === 'port' ? '⚓' :
                   editingItem.modality === 'route' ? '🗺️' : '📄'}
                </span>
                <div>
                  <h2 className="font-bold text-lg text-gray-800">
                    编辑{editingItem.modality === 'image' ? '图片' :
                         editingItem.modality === 'text' ? '文本' :
                         editingItem.modality === 'pdf' ? 'PDF文档' :
                         editingItem.modality === 'excel' ? 'Excel表格' :
                         editingItem.modality === 'json' ? 'JSON数据' :
                         editingItem.modality === 'url' ? '网页链接' :
                         editingItem.modality === 'port' ? '港口数据' :
                         editingItem.modality === 'route' ? '航线数据' : '知识'}条目
                  </h2>
                  <p className="text-xs text-gray-500">
                    ID: {editingItem.id?.substring(0, 8)}... | 来源文件: {editingItem.source || '无'} | 创建时间: {new Date(editingItem.created_at).toLocaleString('zh-CN')}
                  </p>
                </div>
              </div>
              <button onClick={closeEdit} className="text-gray-400 hover:text-gray-700 text-xl leading-none" title="关闭">✕</button>
            </div>

            <div className="p-5 space-y-5">
              {/* ====== 图片条目：左侧预览 + 右侧表单双栏布局 ====== */}
              {editingItem.modality === 'image' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {/* 左栏：图片预览 */}
                  <div className="space-y-3">
                    <label className="block text-sm font-semibold text-gray-700">
                      🖼️ 原始图片预览
                      <span className="text-xs text-gray-400 font-normal ml-2">（用于对照查看，不可修改）</span>
                    </label>
                    <div className="border rounded-lg overflow-hidden bg-gray-100 min-h-[200px] flex items-center justify-center">
                      {editingItem.content?.match(/\.(png|jpg|jpeg|gif|webp|bmp|svg)(\?|$)/i) ? (
                        <img
                          src={editingItem.content}
                          alt={editingItem.title}
                          className="max-w-full max-h-[400px] object-contain"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                            (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
                          }}
                        />
                      ) : null}
                      <div className={`p-8 text-center text-gray-400 ${editingItem.content?.match(/\.(png|jpg|jpeg|gif|webp|bmp|svg)(\?|$)/i) ? 'hidden' : ''}`}>
                        <div className="text-5xl mb-3">🖼️</div>
                        <div className="text-sm">图片预览不可用</div>
                        <div className="text-xs mt-1">（图片链接可能已过期或无有效URL）</div>
                      </div>
                    </div>

                    {/* 图片元信息 */}
                    <div className="bg-blue-50 rounded-lg p-3 text-xs space-y-1">
                      <div className="font-semibold text-blue-800 mb-1">📋 图片条目的内容填写指南</div>
                      <p className="text-blue-700">图片条目的「标题」和「内容」字段共同构成该图片的可检索信息。</p>
                      <ul className="list-disc list-inside text-blue-600 space-y-0.5 mt-1">
                        <li><strong>标题：</strong>简洁概括图片主题，建议格式「[场景]-[主体]-[关键信息]」。例如：「港口全景-洋山港-2024年6月集装箱码头作业」</li>
                        <li><strong>内容：</strong>对图片的详细文字描述，越详尽越好。描述越丰富，RAG检索时命中率越高。建议包含以下维度：</li>
                      </ul>
                    </div>
                  </div>

                  {/* 右栏：编辑表单 */}
                  <div className="space-y-4">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        标题 <span className="text-red-500">*</span>
                        <span className="text-xs text-gray-400 font-normal ml-2">（必填，建议 10-80 字）</span>
                      </label>
                      <input
                        type="text"
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        placeholder="例如：上海洋山深水港集装箱码头全景-2024年6月繁忙作业场景"
                        className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                      <div className="flex justify-between mt-1">
                        <span className="text-xs text-gray-400">简明扼要地概括图片主题，方便列表浏览时快速识别</span>
                        <span className={`text-xs ${editTitle.length < 5 ? 'text-red-500' : editTitle.length > 120 ? 'text-orange-500' : 'text-green-600'}`}>
                          {editTitle.length} 字 {editTitle.length < 5 ? '（标题偏短，不利于检索）' : editTitle.length > 120 ? '（标题偏长，建议精简）' : '✓'}
                        </span>
                      </div>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        详细描述 <span className="text-red-500">*</span>
                        <span className="text-xs text-gray-400 font-normal ml-2">（必填，建议 200-2000 字，描述越详细检索效果越好）</span>
                      </label>
                      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-2 mb-2 text-xs text-yellow-800">
                        💡 <strong>提示：</strong>请对照左侧图片，从以下维度尽可能详细地描述图片内容——
                        ① 拍摄场景/地点（港口/航道/锚地/码头 + 具体名称）；② 画面主体（船舶/设施/人物/事件 + 数量/类型/特征）；③ 关键细节（船名/MMSI/集装箱编号/航标/天气/时间等可见信息）；
                        ④ 业务上下文（该图片展示的业务环节/流程阶段/对应的操作规程）；⑤ 技术参数（如已知的拍摄参数/图像来源/分辨率）。
                      </div>
                      <textarea
                        value={editContent}
                        onChange={(e) => setEditContent(e.target.value)}
                        rows={12}
                        placeholder={`请对照图片，详细描述以下内容：

【拍摄场景】说明拍摄地点（港口/码头/航道名称）、拍摄角度、天气状况、时间（白天/夜间/黄昏）
【画面主体】描述图片中的主要对象：船舶（船型/船名/MMSI/颜色/大小）、港口设施（泊位/岸桥/堆场/仓库）、人员（岗位/活动）
【关键细节】标注可见的关键信息：船体标识、集装箱编号、航标灯质、信号旗、缆绳状态
【业务上下文】该图片所处的业务环节（靠泊作业/装卸作业/危险品检查/维修保养/应急响应）、对应的操作规程或规章制度
【技术参数】如已知：图片来源（无人机/摄像头/手机拍摄）、分辨率、拍摄设备型号`}
                        className="w-full px-3 py-2 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-sans leading-relaxed"
                      />
                      <div className="flex justify-between mt-1">
                        <span className="text-xs text-gray-400">
                          详细描述将直接影响RAG语义检索的召回精度，请勿留空或仅填写简短内容
                        </span>
                        <span className={`text-xs ${editContent.length < 50 ? 'text-red-500 font-bold' : editContent.length < 200 ? 'text-orange-500' : editContent.length > 5000 ? 'text-orange-500' : 'text-green-600'}`}>
                          {editContent.length} 字
                          {editContent.length < 50 ? ' ⚠️ 描述过短，向量检索命中率极低' :
                           editContent.length < 200 ? ' ⚡ 描述偏短，建议补充更多细节' :
                           editContent.length > 5000 ? ' 📝 内容充足' : ' ✅ 内容充实'}
                        </span>
                      </div>
                    </div>

                    {/* 标签 */}
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">
                        标签
                        <span className="text-xs text-gray-400 font-normal ml-2">（用于分类筛选，按 Enter 添加）</span>
                      </label>
                      <div className="flex flex-wrap gap-2 mb-2">
                        {editTags.map(tag => (
                          <span key={tag} className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full text-sm flex items-center gap-1.5">
                            <span className="text-blue-400">#</span>{tag}
                            <button onClick={() => removeTag(tag)} className="text-blue-400 hover:text-red-600 ml-0.5" title="移除标签">×</button>
                          </span>
                        ))}
                        {editTags.length === 0 && (
                          <span className="text-xs text-gray-400 italic">尚未添加标签，建议添加 2-5 个标签以提升检索效果</span>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <input
                          type="text"
                          value={newTag}
                          onChange={(e) => setNewTag(e.target.value)}
                          placeholder="输入标签名后按回车（如：集装箱船、洋山港、夜间作业）"
                          className="flex-1 px-3 py-2 border rounded-lg text-sm"
                          onKeyDown={(e) => e.key === 'Enter' && addTag()}
                        />
                        <button onClick={addTag} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">添加</button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* ====== 非图片条目：单栏布局 ====== */
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      标题 <span className="text-red-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder={
                        editingItem.modality === 'port' ? '港口名称，如：上海港' :
                        editingItem.modality === 'route' ? '航线名称，如：上海→新加坡' :
                        editingItem.modality === 'text' ? '文档标题，如：2024年度港口安全操作规程' :
                        editingItem.modality === 'pdf' ? 'PDF文档标题' :
                        editingItem.modality === 'excel' ? '表格标题，如：2024年Q1港口吞吐量统计' :
                        editingItem.modality === 'url' ? '网页标题' : '条目标题'
                      }
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-gray-400">简明扼要概括本条目的核心内容</span>
                      <span className={`text-xs ${editTitle.length < 3 ? 'text-red-500' : editTitle.length > 150 ? 'text-orange-500' : 'text-green-600'}`}>
                        {editTitle.length} 字 {editTitle.length < 3 ? '（太短）' : '✓'}
                      </span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      内容 <span className="text-red-500">*</span>
                    </label>
                    <textarea
                      value={editContent}
                      onChange={(e) => setEditContent(e.target.value)}
                      rows={editingItem.modality === 'text' || editingItem.modality === 'pdf' ? 15 : 8}
                      placeholder={
                        editingItem.modality === 'port'
                          ? '港口名称、所属国家/地区、经纬度坐标、港口类型（海港/河港/内河港）、主要货种、码头设施、航道水深等信息'
                          : editingItem.modality === 'route'
                          ? '航线起点、终点、途经主要港口、航线距离（海里）、通常航速、适用船型等信息'
                          : editingItem.modality === 'text' || editingItem.modality === 'pdf'
                          ? '请在此粘贴或编辑文档的完整文本内容。内容将用于向量化检索，请确保内容准确完整。'
                          : editingItem.modality === 'excel'
                          ? '请在此粘贴或编辑表格的结构化数据内容。建议保留列名和关键数据行。'
                          : editingItem.modality === 'json'
                          ? '请在此编辑 JSON 数据内容。注意保持合法的 JSON 格式。'
                          : editingItem.modality === 'url'
                          ? '请在此编辑网页的正文内容（已自动提取）。如果内容不完整，可手动补充。'
                          : '请在此编辑条目的正文内容'
                      }
                      className="w-full px-3 py-2 border rounded-lg text-sm resize-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                    <div className="flex justify-between mt-1">
                      <span className="text-xs text-gray-400">
                        {editingItem.modality === 'image'
                          ? '图片描述将影响RAG语义检索精度'
                          : '内容将作为向量化检索的主要数据源'}
                      </span>
                      <span className={`text-xs ${editContent.length < 20 ? 'text-red-500 font-bold' : editContent.length < 100 ? 'text-orange-500' : 'text-green-600'}`}>
                        {editContent.length} 字
                        {editContent.length < 20 ? ' ⚠️ 过短' : editContent.length < 100 ? ' ⚡ 偏短' : ' ✅'}
                      </span>
                    </div>
                  </div>
                  {/* 标签 */}
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1">
                      标签
                      <span className="text-xs text-gray-400 font-normal ml-2">（用于分类筛选，按 Enter 添加）</span>
                    </label>
                    <div className="flex flex-wrap gap-2 mb-2">
                      {editTags.map(tag => (
                        <span key={tag} className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full text-sm flex items-center gap-1.5">
                          <span className="text-blue-400">#</span>{tag}
                          <button onClick={() => removeTag(tag)} className="text-blue-400 hover:text-red-600 ml-0.5" title="移除标签">×</button>
                        </span>
                      ))}
                      {editTags.length === 0 && (
                        <span className="text-xs text-gray-400 italic">尚未添加标签</span>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={newTag}
                        onChange={(e) => setNewTag(e.target.value)}
                        placeholder="输入标签名后按回车"
                        className="flex-1 px-3 py-2 border rounded-lg text-sm"
                        onKeyDown={(e) => e.key === 'Enter' && addTag()}
                      />
                      <button onClick={addTag} className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700">添加</button>
                    </div>
                  </div>
                </div>
              )}

              {/* 底部：条目元信息 + 操作按钮 */}
              <div className="flex items-center justify-between pt-3 border-t">
                <div className="flex items-center gap-4 text-xs text-gray-500">
                  <span className={`px-2 py-0.5 rounded ${editingItem.status === 'embedded' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'}`}>
                    {editingItem.status === 'embedded' ? '已向量化 ✓' : '待向量化'}
                  </span>
                  <span>类型: <strong>{editingItem.modality}</strong></span>
                  <span>来源: <strong>{editingItem.source || '未知'}</strong></span>
                  <span>ID: <code className="text-gray-400 text-xs">{editingItem.id?.substring(0, 12)}...</code></span>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={closeEdit}
                    className="px-5 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50 font-medium"
                  >
                    取消
                  </button>
                  <button
                    onClick={saveEdit}
                    disabled={saving || editTitle.trim().length === 0 || editContent.trim().length === 0}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed font-medium shadow-sm"
                    title={
                      editTitle.trim().length === 0 ? '标题不能为空' :
                      editContent.trim().length === 0 ? '内容不能为空' :
                      saving ? '正在保存...' : '保存修改'
                    }
                  >
                    {saving ? '⏳ 保存中...' : '💾 保存修改'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 编辑文件弹窗 */}
      {editingFile && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
            <div className="p-4 border-b">
              <h3 className="font-medium text-gray-800">编辑文件</h3>
            </div>
            <div className="p-4 space-y-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">文件名</label>
                <input
                  type="text"
                  value={editFilename}
                  onChange={(e) => setEditFilename(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div className="text-xs text-gray-500">
                类型: {editingFile.file_type} · 大小: {formatFileSize(editingFile.file_size)} · 条目数: {editingFile.item_count}
              </div>
            </div>
            <div className="p-4 border-t flex gap-2 justify-end">
              <button
                onClick={closeFileEdit}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={saveFileEdit}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 任务详情弹窗 */}
      {viewingTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-2" onClick={() => setViewingTask(null)}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-[95vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-3 border-b flex items-center justify-between sticky top-0 bg-white z-10">
              <h3 className="font-medium text-gray-800 text-sm">
                任务详情 - {viewingTask.target_name?.substring(0, 30) || viewingTask.task_type}
              </h3>
              <button onClick={() => setViewingTask(null)} className="text-gray-500 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="p-3 overflow-auto flex-1">
              {taskDetailLoading ? (
                <div className="text-center py-8 text-gray-500">加载中...</div>
              ) : (
                <>
                  <div className="mb-3 p-2 bg-gray-50 rounded text-xs text-gray-600">
                    <div className="flex flex-wrap gap-2">
                      <span>类型: {viewingTask.task_type === 'file' ? '文件' : '数据库'}</span>
                      <span>|</span>
                      <span>状态: {viewingTask.status}</span>
                      <span>|</span>
                      <span>条目: {taskDetailTotal}</span>
                    </div>
                  </div>
                  
                  {/* 卡片式列表布局 */}
                  <div className="space-y-2">
                    {taskDetailData.map((item, idx) => (
                      <div key={item.id} className="border rounded-lg p-2 bg-white shadow-sm">
                        {viewingTask.task_type === 'database' ? (
                          <>
                            <div className="flex justify-between items-start mb-1">
                              <div className="font-medium text-sm truncate flex-1">{item.name || item.code || item.port_code || '-'}</div>
                              <span className={`text-xs px-2 py-0.5 rounded ml-2 ${item.has_embedding ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-gray-600'}`}>
                                {item.has_embedding ? '已向量' : '未向量'}
                              </span>
                            </div>
                            <div className="text-xs text-gray-500 mb-2">类型: {item.data_type || '-'}</div>
                            <button
                              onClick={() => deleteTaskDetailItem(item.id)}
                              className="text-red-600 hover:text-red-800 text-xs"
                            >
                              删除
                            </button>
                          </>
                        ) : (
                          <>
                            <div className="font-medium text-sm mb-1 truncate" title={item.filename || item.title}>
                              {item.filename || item.title || '-'}
                            </div>
                            <div className="text-xs text-gray-500 mb-2 space-y-1">
                              <div className="flex gap-2 flex-wrap">
                                <span>类型: {item.file_type?.split('/').pop() || '-'}</span>
                                <span>大小: {formatFileSize(item.file_size || 0)}</span>
                              </div>
                              {item.category && <div>分类: {item.category}</div>}
                            </div>
                            <div className="flex gap-3">
                              <button
                                onClick={() => setViewingDoc(item)}
                                className="text-blue-600 hover:text-blue-800 text-xs"
                              >
                                查看
                              </button>
                              <button
                                onClick={() => deleteTaskDetailItem(item.id)}
                                className="text-red-600 hover:text-red-800 text-xs"
                              >
                                删除
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  
                  {/* 分页 */}
                  <div className="mt-4 p-2 bg-gray-50 rounded flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600">每页:</span>
                      <select
                        value={taskDetailPageSize}
                        onChange={(e) => fetchTaskDetailPage(1, parseInt(e.target.value))}
                        className="border rounded px-2 py-1 text-xs"
                      >
                        <option value="10">10</option>
                        <option value="20">20</option>
                        <option value="50">50</option>
                      </select>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-gray-600">
                        {taskDetailPage}/{Math.ceil(taskDetailTotal / taskDetailPageSize) || 1}
                      </span>
                      <button
                        onClick={() => fetchTaskDetailPage(taskDetailPage - 1, taskDetailPageSize)}
                        disabled={taskDetailPage === 1}
                        className="px-2 py-1 border rounded text-xs disabled:opacity-50"
                      >
                        上页
                      </button>
                      <button
                        onClick={() => fetchTaskDetailPage(taskDetailPage + 1, taskDetailPageSize)}
                        disabled={taskDetailPage >= Math.ceil(taskDetailTotal / taskDetailPageSize)}
                        className="px-2 py-1 border rounded text-xs disabled:opacity-50"
                      >
                        下页
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 文档预览弹窗 */}
      {viewingDoc && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" onClick={() => setViewingDoc(null)}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="p-4 border-b flex items-center justify-between">
              <h3 className="font-medium text-gray-800">{viewingDoc.filename || viewingDoc.title}</h3>
              <button onClick={() => setViewingDoc(null)} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <div className="p-4 overflow-auto flex-1">
              {viewingDoc.storage_url ? (
                viewingDoc.file_type === 'application/pdf' ? (
                  <iframe src={viewingDoc.storage_url} className="w-full h-[70vh]" />
                ) : (
                  <pre className="whitespace-pre-wrap text-sm">{viewingDoc.content || '无内容'}</pre>
                )
              ) : (
                <pre className="whitespace-pre-wrap text-sm">{viewingDoc.content || '无内容'}</pre>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 删除确认弹窗 */}
      {deleteConfirmTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-md p-4">
            <h3 className="font-medium text-gray-800 mb-4">确认删除</h3>
            <p className="text-sm text-gray-600 mb-4">
              删除该任务将同时删除关联的文档及数据库条目，确认删除吗？
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setDeleteConfirmTask(null)}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleDeleteTask}
                className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700"
              >
                确认删除
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
