'use client';

import { useState, useEffect } from 'react';
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

export default function ManagePage() {
  const [files, setFiles] = useState<FileUpload[]>([]);
  const [items, setItems] = useState<KnowledgeItem[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [stats, setStats] = useState({ totalFiles: 0, totalItems: 0, embedded: 0, pending: 0 });
  const [activeTab, setActiveTab] = useState<'files' | 'items' | 'tags'>('files');
  const [loading, setLoading] = useState(false);

  // 筛选
  const [filterModality, setFilterModality] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [filterSource, setFilterSource] = useState('all');
  const [filterTag, setFilterTag] = useState('all');
  const [sources, setSources] = useState<string[]>([]);

  // 分页
  const [itemPage, setItemPage] = useState(1);
  const [itemTotal, setItemTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);

  // 批量操作
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

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

  useEffect(() => {
    fetchData();
    fetchTags();
  }, []);

  useEffect(() => {
    fetchItems();
  }, [itemPage, filterModality, filterStatus, filterSource, filterTag]);

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
    try {
      await fetch('/api/search', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'renameTag', oldTag: oldName, newTag: newName }),
      });
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

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <div className="max-w-2xl mx-auto">
        {/* 头部 */}
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-xl font-bold text-gray-800">知识库管理</h1>
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
                  <option value="all">全部来源</option>
                  {sources.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
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
                  rows={6}
                  className="w-full px-3 py-2 border rounded-lg text-sm resize-none"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">标签</label>
                <div className="flex flex-wrap gap-2 mb-2">
                  {editTags.map(tag => (
                    <span key={tag} className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-sm flex items-center gap-1">
                      {tag}
                      <button onClick={() => removeTag(tag)} className="text-blue-500 hover:text-blue-700">×</button>
                    </span>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="输入新标签"
                    className="flex-1 px-3 py-2 border rounded-lg text-sm"
                    onKeyDown={(e) => e.key === 'Enter' && addTag()}
                  />
                  <button
                    onClick={addTag}
                    className="px-3 py-2 bg-blue-600 text-white rounded-lg text-sm"
                  >
                    添加
                  </button>
                </div>
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
    </div>
  );
}
