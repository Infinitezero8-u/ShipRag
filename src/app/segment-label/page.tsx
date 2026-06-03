'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  ArrowLeft, 
  Plus, 
  Edit2, 
  Trash2, 
  Save, 
  X,
  Activity,
  Target,
  ChevronUp,
  ChevronDown,
  Upload
} from 'lucide-react';
import Link from 'next/link';

interface Behavior {
  id: string;
  code: string;
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

interface Intent {
  id: string;
  code: string;
  name: string;
  description: string | null;
  color: string;
  icon: string | null;
  sort_order: number;
  is_active: boolean;
  created_at: string;
}

export default function SegmentLabelManagePage() {
  const router = useRouter();
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [intents, setIntents] = useState<Intent[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'behavior' | 'intent'>('behavior');
  const [editingItem, setEditingItem] = useState<Behavior | Intent | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const [behaviorsRes, intentsRes] = await Promise.all([
        fetch('/api/segment/behavior'),
        fetch('/api/segment/intent')
      ]);
      const behaviorsData = await behaviorsRes.json();
      const intentsData = await intentsRes.json();
      setBehaviors(behaviorsData || []);
      setIntents(intentsData || []);
    } catch (err) {
      console.error('获取数据失败:', err);
    }
    setLoading(false);
  };

  const handleSaveBehavior = async (item: Partial<Behavior>) => {
    try {
      const url = item.id ? `/api/segment/behavior/${item.id}` : '/api/segment/behavior';
      const method = item.id ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      if (res.ok) {
        fetchData();
        setEditingItem(null);
        setIsAdding(false);
      }
    } catch (err) {
      console.error('保存失败:', err);
    }
  };

  const handleSaveIntent = async (item: Partial<Intent>) => {
    try {
      const url = item.id ? `/api/segment/intent/${item.id}` : '/api/segment/intent';
      const method = item.id ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item)
      });
      if (res.ok) {
        fetchData();
        setEditingItem(null);
        setIsAdding(false);
      }
    } catch (err) {
      console.error('保存失败:', err);
    }
  };

  const handleDeleteBehavior = async (id: string) => {
    if (!confirm('确定要删除该行为类型吗？')) return;
    try {
      await fetch(`/api/segment/behavior/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {
      console.error('删除失败:', err);
    }
  };

  const handleDeleteIntent = async (id: string) => {
    if (!confirm('确定要删除该意图类型吗？')) return;
    try {
      await fetch(`/api/segment/intent/${id}`, { method: 'DELETE' });
      fetchData();
    } catch (err) {
      console.error('删除失败:', err);
    }
  };

  const handleMoveUp = async (type: 'behavior' | 'intent', id: string, currentOrder: number) => {
    if (currentOrder <= 1) return;
    try {
      const url = type === 'behavior' 
        ? `/api/segment/behavior/${id}/reorder`
        : `/api/segment/intent/${id}/reorder`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: 'up' })
      });
      fetchData();
    } catch (err) {
      console.error('排序失败:', err);
    }
  };

  const handleMoveDown = async (type: 'behavior' | 'intent', id: string, currentOrder: number, maxOrder: number) => {
    if (currentOrder >= maxOrder) return;
    try {
      const url = type === 'behavior' 
        ? `/api/segment/behavior/${id}/reorder`
        : `/api/segment/intent/${id}/reorder`;
      await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ direction: 'down' })
      });
      fetchData();
    } catch (err) {
      console.error('排序失败:', err);
    }
  };

  const EditForm = ({ type, item, onSave, onCancel }: {
    type: 'behavior' | 'intent';
    item: Partial<Behavior | Intent>;
    onSave: (item: Partial<Behavior | Intent>) => void;
    onCancel: () => void;
  }) => {
    const [form, setForm] = useState(item);

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-md">
          <div className="p-4 border-b flex justify-between items-center">
            <h3 className="font-semibold">
              {item.id ? '编辑' : '新增'}{type === 'behavior' ? '行为' : '意图'}类型
            </h3>
            <button onClick={onCancel} className="text-gray-500 hover:text-gray-700">
              <X size={20} />
            </button>
          </div>
          <div className="p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">编码 *</label>
              <input
                type="text"
                value={form.code || ''}
                onChange={(e) => setForm({ ...form, code: e.target.value.toUpperCase() })}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="如：DOCKING"
                disabled={!!item.id}
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">名称 *</label>
              <input
                type="text"
                value={form.name || ''}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
                placeholder="如：码头靠泊"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">描述</label>
              <textarea
                value={form.description || ''}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full px-3 py-2 border rounded-md"
                rows={2}
                placeholder="行为/意图的详细描述"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">颜色</label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.color || '#3B82F6'}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="w-10 h-10 rounded cursor-pointer"
                />
                <input
                  type="text"
                  value={form.color || '#3B82F6'}
                  onChange={(e) => setForm({ ...form, color: e.target.value })}
                  className="flex-1 px-3 py-2 border rounded-md"
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_active !== false}
                onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                id="is_active"
              />
              <label htmlFor="is_active" className="text-sm">启用</label>
            </div>
          </div>
          <div className="p-4 border-t flex justify-end gap-2">
            <button
              onClick={onCancel}
              className="px-4 py-2 border rounded-md hover:bg-gray-50"
            >
              取消
            </button>
            <button
              onClick={() => onSave(form)}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
            >
              保存
            </button>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 头部 */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center gap-4">
          <button
            onClick={() => router.push('/trajectory')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowLeft size={20} />
          </button>
          <h1 className="text-xl font-semibold">航段行为与意图管理</h1>
          <div className="flex items-center gap-2 ml-auto">
            <Link
              href="/trajectory-training"
              className="px-3 py-1.5 bg-purple-600 text-white rounded-md hover:bg-purple-700 flex items-center gap-1.5 text-sm"
            >
              <Upload size={16} />
              训练平台
            </Link>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {/* 标签切换 */}
        <div className="bg-white rounded-lg shadow mb-6">
          <div className="flex border-b">
            <button
              onClick={() => setActiveTab('behavior')}
              className={`flex-1 px-6 py-3 font-medium flex items-center justify-center gap-2 ${
                activeTab === 'behavior'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Activity size={18} />
              行为类型 ({behaviors.length})
            </button>
            <button
              onClick={() => setActiveTab('intent')}
              className={`flex-1 px-6 py-3 font-medium flex items-center justify-center gap-2 ${
                activeTab === 'intent'
                  ? 'text-green-600 border-b-2 border-green-600 bg-green-50'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Target size={18} />
              意图类型 ({intents.length})
            </button>
          </div>

          {/* 操作栏 */}
          <div className="p-4 border-b flex justify-between items-center">
            <p className="text-sm text-gray-500">
              {activeTab === 'behavior' 
                ? '行为类型用于标注航段的具体航行行为'
                : '意图类型用于标注航段的航行目的'}
            </p>
            <button
              onClick={() => {
                setEditingItem({
                  code: '',
                  name: '',
                  color: activeTab === 'behavior' ? '#3B82F6' : '#10B981',
                  is_active: true,
                  sort_order: (activeTab === 'behavior' ? behaviors : intents).length + 1
                } as Behavior | Intent);
                setIsAdding(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
            >
              <Plus size={18} />
              新增
            </button>
          </div>

          {/* 列表 */}
          <div className="divide-y">
            {loading ? (
              <div className="p-8 text-center text-gray-500">加载中...</div>
            ) : activeTab === 'behavior' ? (
              behaviors.length === 0 ? (
                <div className="p-8 text-center text-gray-500">暂无行为类型</div>
              ) : (
                behaviors.map((item, index) => (
                  <div
                    key={item.id}
                    className="p-4 hover:bg-gray-50 flex items-center gap-4"
                  >
                    {/* 排序按钮 */}
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleMoveUp('behavior', item.id, item.sort_order)}
                        className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"
                        disabled={index === 0}
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        onClick={() => handleMoveDown('behavior', item.id, item.sort_order, behaviors.length)}
                        className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"
                        disabled={index === behaviors.length - 1}
                      >
                        <ChevronDown size={16} />
                      </button>
                    </div>

                    {/* 颜色标记 */}
                    <div
                      className="w-10 h-10 rounded-lg flex-shrink-0"
                      style={{ backgroundColor: item.color }}
                    />

                    {/* 信息 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                          {item.code}
                        </span>
                        {!item.is_active && (
                          <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded">
                            已禁用
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-sm text-gray-500 truncate">{item.description}</p>
                      )}
                    </div>

                    {/* 操作按钮 */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingItem(item);
                          setIsAdding(false);
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteBehavior(item.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )
            ) : (
              intents.length === 0 ? (
                <div className="p-8 text-center text-gray-500">暂无意图类型</div>
              ) : (
                intents.map((item, index) => (
                  <div
                    key={item.id}
                    className="p-4 hover:bg-gray-50 flex items-center gap-4"
                  >
                    <div className="flex flex-col gap-1">
                      <button
                        onClick={() => handleMoveUp('intent', item.id, item.sort_order)}
                        className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"
                        disabled={index === 0}
                      >
                        <ChevronUp size={16} />
                      </button>
                      <button
                        onClick={() => handleMoveDown('intent', item.id, item.sort_order, intents.length)}
                        className="p-1 hover:bg-gray-200 rounded disabled:opacity-30"
                        disabled={index === intents.length - 1}
                      >
                        <ChevronDown size={16} />
                      </button>
                    </div>

                    <div
                      className="w-10 h-10 rounded-lg flex-shrink-0"
                      style={{ backgroundColor: item.color }}
                    />

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{item.name}</span>
                        <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                          {item.code}
                        </span>
                        {!item.is_active && (
                          <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded">
                            已禁用
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <p className="text-sm text-gray-500 truncate">{item.description}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingItem(item);
                          setIsAdding(false);
                        }}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Edit2 size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteIntent(item.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))
              )
            )}
          </div>
        </div>

        {/* 说明 */}
        <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800">
          <p className="font-medium mb-2">使用说明：</p>
          <ul className="list-disc list-inside space-y-1 text-blue-700">
            <li>行为类型用于标注航段的具体航行行为（如：锚泊、匀速直航等）</li>
            <li>意图类型用于标注航段的航行目的（如：船舶进港、跨港运输等）</li>
            <li>可在海图页面点击航段进行标注，或通过航迹管理批量标注</li>
            <li>颜色用于在地图上区分不同行为/意图的航段</li>
          </ul>
        </div>
      </main>

      {/* 编辑弹窗 */}
      {editingItem && (
        <EditForm
          type={activeTab}
          item={editingItem}
          onSave={(item) => {
            if (activeTab === 'behavior') {
              handleSaveBehavior(item as Partial<Behavior>);
            } else {
              handleSaveIntent(item as Partial<Intent>);
            }
          }}
          onCancel={() => {
            setEditingItem(null);
            setIsAdding(false);
          }}
        />
      )}
    </div>
  );
}
