'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';

type FileUpload = {
  id: string;
  filename: string;
  file_type: string;
  file_size: string;
  storage_url: string | null;
  status: string;
  item_count: string;
  created_at: string;
};

type KnowledgeItem = {
  id: string;
  modality: string;
  title: string;
  content: string;
  source: string;
  metadata: Record<string, unknown>;
  status: string;
  created_at: string;
};

export default function ManagePage() {
  const [activeTab, setActiveTab] = useState<'files' | 'items'>('files');
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  
  // 编辑状态
  const [editingItem, setEditingItem] = useState<KnowledgeItem | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  
  // 文件编辑状态
  const [editingFile, setEditingFile] = useState<FileUpload | null>(null);
  const [editFilename, setEditFilename] = useState('');
  
  // 分页状态
  const [itemPage, setItemPage] = useState(1);
  const [itemTotal, setItemTotal] = useState(0);
  const pageSize = 20;

  // 筛选状态
  const [filterModality, setFilterModality] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterSource, setFilterSource] = useState<string>('all');

  useEffect(() => {
    fetchFiles();
    fetchItems();
  }, []);

  useEffect(() => {
    fetchItems();
  }, [itemPage, filterModality, filterStatus, filterSource]);

  const fetchFiles = async () => {
    try {
      const res = await fetch('/api/upload');
      const data = await res.json();
      setFiles(data.uploads || []);
    } catch (e) {
      console.error('获取文件列表失败:', e);
    }
  };

  const fetchItems = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type: 'all',
        limit: String(pageSize),
        offset: String((itemPage - 1) * pageSize),
      });
      if (filterModality !== 'all') params.append('modality', filterModality);
      if (filterStatus !== 'all') params.append('status', filterStatus);
      if (filterSource !== 'all') params.append('source', filterSource);
      
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      setItems(data.items || []);
      setItemTotal(data.total || 0);
    } catch (e) {
      console.error('获取条目列表失败:', e);
    } finally {
      setLoading(false);
    }
  };

  const deleteFile = async (id: string) => {
    if (!confirm('确定删除此文件？相关条目也会被删除。')) return;
    try {
      await fetch(`/api/upload?id=${id}`, { method: 'DELETE' });
      fetchFiles();
      fetchItems();
    } catch (e) {
      console.error('删除失败:', e);
    }
  };

  const deleteItems = async () => {
    if (selectedItems.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedItems.size} 条目？`)) return;
    try {
      await fetch('/api/embed', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemIds: Array.from(selectedItems) }),
      });
      setSelectedItems(new Set());
      fetchItems();
    } catch (e) {
      console.error('删除失败:', e);
    }
  };

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

  // 文件编辑功能
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
      const res = await fetch(`/api/upload?id=${editingFile.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: editFilename }),
      });
      if (res.ok) {
        closeFileEdit();
        fetchFiles();
      } else {
        alert('保存失败');
      }
    } catch (e) {
      console.error('保存失败:', e);
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 编辑功能
  const openEdit = (item: KnowledgeItem) => {
    setEditingItem(item);
    setEditTitle(item.title);
    setEditContent(item.content || '');
  };

  const closeEdit = () => {
    setEditingItem(null);
    setEditTitle('');
    setEditContent('');
  };

  const saveEdit = async () => {
    if (!editingItem) return;
    setSaving(true);
    try {
      const res = await fetch('/api/search', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: editingItem.id,
          title: editTitle,
          content: editContent,
        }),
      });
      const data = await res.json();
      if (data.success) {
        closeEdit();
        fetchItems();
      } else {
        alert('保存失败: ' + data.error);
      }
    } catch (e) {
      console.error('保存失败:', e);
      alert('保存失败');
    } finally {
      setSaving(false);
    }
  };

  // 获取唯一的来源列表
  const sources = Array.from(new Set(items.map(i => i.source)));
  
  // 统计信息
  const stats = {
    totalFiles: files.length,
    totalItems: itemTotal,
    embedded: items.filter(i => i.status === 'embedded').length,
    pending: items.filter(i => i.status === 'pending').length,
  };

  const formatFileSize = (bytes: string) => {
    const num = parseInt(bytes);
    if (num < 1024) return num + ' B';
    if (num < 1024 * 1024) return (num / 1024).toFixed(1) + ' KB';
    return (num / 1024 / 1024).toFixed(1) + ' MB';
  };

  const totalPages = Math.ceil(itemTotal / pageSize);

  return (
    <div className="min-h-screen bg-gray-50 p-3">
      <div className="max-w-4xl mx-auto">
        {/* 头部 */}
        <div className="bg-white rounded-lg shadow p-4 mb-3">
          <div className="flex items-center justify-between">
            <h1 className="text-lg font-bold text-gray-800">📚 知识库管理</h1>
            <Link href="/" className="text-sm text-blue-600 hover:underline">← 返回主页</Link>
          </div>
          
          {/* 统计 */}
          <div className="grid grid-cols-4 gap-2 mt-3">
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
            onClick={() => setActiveTab('files')}
            className={`flex-1 py-2 rounded-lg font-medium ${
              activeTab === 'files' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'
            }`}
          >
            📁 文件列表 ({files.length})
          </button>
          <button
            onClick={() => setActiveTab('items')}
            className={`flex-1 py-2 rounded-lg font-medium ${
              activeTab === 'items' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600'
            }`}
          >
            📝 条目列表 ({itemTotal})
          </button>
        </div>

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
                         file.file_type === 'pdf' ? '📕' : '📄'}
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
                  <option value="all">全部来源</option>
                  {sources.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                {selectedItems.size > 0 && (
                  <button
                    onClick={deleteItems}
                    className="px-3 py-1 bg-red-600 text-white rounded text-sm"
                  >
                    删除选中 ({selectedItems.size})
                  </button>
                )}
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
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-gray-800">{item.title}</span>
                            <span className={`text-xs px-1 rounded ${
                              item.status === 'embedded' ? 'bg-green-100 text-green-600' : 'bg-orange-100 text-orange-600'
                            }`}>
                              {item.status === 'embedded' ? '已向量化' : '待处理'}
                            </span>
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
      </div>

      {/* 编辑弹窗 */}
      {editingItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-lg w-full max-w-lg max-h-[90vh] overflow-auto">
            <div className="p-4 border-b flex items-center justify-between">
              <h2 className="font-bold text-lg">编辑条目</h2>
              <button onClick={closeEdit} className="text-gray-500 hover:text-gray-700">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">标题</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">内容</label>
                <textarea
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  rows={8}
                  className="w-full px-3 py-2 border rounded-lg text-sm resize-none"
                />
              </div>
              <div className="text-xs text-gray-500">
                类型: {editingItem.modality} · 来源: {editingItem.source}
              </div>
            </div>
            <div className="p-4 border-t flex gap-2 justify-end">
              <button
                onClick={closeEdit}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={saveEdit}
                disabled={saving}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? '保存中...' : '保存'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 文件编辑弹窗 */}
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
    </div>
  );
}
