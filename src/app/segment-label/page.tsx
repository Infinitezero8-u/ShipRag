'use client';

import { useState, useEffect } from 'react';
import { 
  Tag, Brain, Database, Search, Loader2, Check, X, RefreshCw,
  Ship, MapPin, Clock, AlertCircle, ChevronDown, ChevronUp,
  Filter, Settings, ListChecks
} from 'lucide-react';

// 标签类型定义
interface Label {
  code: string;
  name: string;
  description: string;
}

interface TrajectoryItem {
  id: string;
  mmsi: string;
  start_port: string;
  end_port: string;
  ai_description: string;
  behavior_code: string | null;
  intent_code: string | null;
  created_at: string;
}

interface LabelResult {
  primaryBehavior: string;
  primaryIntent: string;
  alternateBehaviors: string[];
  alternateIntents: string[];
  confidence: number;
  reasoning: string;
}

export default function TrajectoryLabelingPage() {
  // 状态
  const [behaviors, setBehaviors] = useState<Label[]>([]);
  const [intents, setIntents] = useState<Label[]>([]);
  const [trajectories, setTrajectories] = useState<TrajectoryItem[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [labelingResult, setLabelingResult] = useState<LabelResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [batchLoading, setBatchLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'label' | 'manage'>('label');
  
  // 过滤条件
  const [filterMmsi, setFilterMmsi] = useState('');
  const [filterUnlabeled, setFilterUnlabeled] = useState(false);
  
  // 当前选中航迹
  const [currentTrajectory, setCurrentTrajectory] = useState<TrajectoryItem | null>(null);

  // 加载标签池
  useEffect(() => {
    fetchLabels();
    fetchTrajectories();
  }, []);

  const fetchLabels = async () => {
    try {
      const res = await fetch('/api/trajectory/label?action=labels');
      const data = await res.json();
      setBehaviors(data.behaviors || []);
      setIntents(data.intents || []);
    } catch (err) {
      console.error('加载标签失败:', err);
    }
  };

  const fetchTrajectories = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trajectory/label?limit=100');
      const data = await res.json();
      setTrajectories(data.items || []);
    } catch (err) {
      console.error('加载航迹失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // 智能标注单条航迹
  const handleIntelligentLabel = async (trajectoryId: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/trajectory/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          trajectoryId,
          action: 'label'
        })
      });
      const data = await res.json();
      
      if (data.success) {
        setLabelingResult(data);
        setCurrentTrajectory(trajectories.find(t => t.id === trajectoryId) || null);
      }
    } catch (err) {
      console.error('智能标注失败:', err);
    } finally {
      setLoading(false);
    }
  };

  // 批量智能标注
  const handleBatchLabel = async () => {
    if (selectedIds.size === 0) {
      alert('请先选择要标注的航迹');
      return;
    }
    
    setBatchLoading(true);
    try {
      const res = await fetch('/api/trajectory/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'batch',
          trajectoryIds: Array.from(selectedIds)
        })
      });
      const data = await res.json();
      
      if (data.success) {
        alert(`批量标注完成，共 ${data.count} 条`);
        setSelectedIds(new Set());
        fetchTrajectories();
      }
    } catch (err) {
      console.error('批量标注失败:', err);
    } finally {
      setBatchLoading(false);
    }
  };

  // 保存标注结果
  const handleSaveLabel = async (trajectoryId: string, behaviorCode: string, intentCode: string) => {
    try {
      const res = await fetch('/api/trajectory/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'save',
          trajectoryId,
          behaviorCode,
          intentCode,
          confidence: labelingResult?.confidence,
          reasoning: labelingResult?.reasoning
        })
      });
      
      if (res.ok) {
        alert('保存成功');
        setLabelingResult(null);
        fetchTrajectories();
      }
    } catch (err) {
      console.error('保存失败:', err);
    }
  };

  // 选择切换
  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  // 全选/取消
  const toggleSelectAll = () => {
    if (selectedIds.size === filteredTrajectories.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTrajectories.map(t => t.id)));
    }
  };

  // 过滤航迹
  const filteredTrajectories = trajectories.filter(t => {
    if (filterMmsi && !t.mmsi?.includes(filterMmsi)) return false;
    if (filterUnlabeled && (t.behavior_code || t.intent_code)) return false;
    return true;
  });

  // 获取标签名称
  const getBehaviorName = (code: string) => behaviors.find(b => b.code === code)?.name || code;
  const getIntentName = (code: string) => intents.find(i => i.code === code)?.name || code;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 头部 */}
      <header className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Tag className="w-6 h-6 text-blue-600" />
              <h1 className="text-xl font-bold">航迹智能标注平台</h1>
            </div>
            
            {/* Tab切换 */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setActiveTab('label')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                  activeTab === 'label' ? 'bg-white shadow text-blue-600' : 'text-gray-600'
                }`}
              >
                智能标注
              </button>
              <button
                onClick={() => setActiveTab('manage')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition ${
                  activeTab === 'manage' ? 'bg-white shadow text-blue-600' : 'text-gray-600'
                }`}
              >
                标签管理
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-6">
        {activeTab === 'label' ? (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* 左侧：航迹列表 */}
            <div className="lg:col-span-2 space-y-4">
              {/* 过滤器 */}
              <div className="bg-white rounded-lg p-4 flex flex-wrap gap-4 items-center">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-gray-400" />
                  <input
                    type="text"
                    placeholder="MMSI筛选"
                    value={filterMmsi}
                    onChange={(e) => setFilterMmsi(e.target.value)}
                    className="px-3 py-1.5 border rounded-md text-sm w-32"
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={filterUnlabeled}
                    onChange={(e) => setFilterUnlabeled(e.target.checked)}
                    className="rounded"
                  />
                  仅显示未标注
                </label>
                <button
                  onClick={fetchTrajectories}
                  className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                >
                  <RefreshCw className="w-4 h-4" />
                  刷新
                </button>
              </div>

              {/* 批量操作栏 */}
              <div className="bg-white rounded-lg p-4 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={selectedIds.size === filteredTrajectories.length && filteredTrajectories.length > 0}
                      onChange={toggleSelectAll}
                      className="rounded"
                    />
                    全选
                  </label>
                  <span className="text-sm text-gray-500">
                    已选择 {selectedIds.size} 条
                  </span>
                </div>
                <button
                  onClick={handleBatchLabel}
                  disabled={batchLoading || selectedIds.size === 0}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {batchLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Brain className="w-4 h-4" />}
                  批量智能标注
                </button>
              </div>

              {/* 航迹列表 */}
              <div className="bg-white rounded-lg overflow-hidden">
                {loading ? (
                  <div className="p-8 text-center text-gray-500">
                    <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                    加载中...
                  </div>
                ) : filteredTrajectories.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">
                    暂无航迹数据
                  </div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 w-10"></th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">MMSI</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">起止港口</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">行为标签</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">意图标签</th>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredTrajectories.map((t) => (
                        <tr key={t.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3">
                            <input
                              type="checkbox"
                              checked={selectedIds.has(t.id)}
                              onChange={() => toggleSelect(t.id)}
                              className="rounded"
                            />
                          </td>
                          <td className="px-4 py-3 text-sm font-mono">{t.mmsi}</td>
                          <td className="px-4 py-3 text-sm">
                            <span className="text-blue-600">{t.start_port || '-'}</span>
                            <span className="text-gray-400 mx-1">→</span>
                            <span className="text-green-600">{t.end_port || '-'}</span>
                          </td>
                          <td className="px-4 py-3">
                            {t.behavior_code ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700">
                                {getBehaviorName(t.behavior_code)}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">未标注</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            {t.intent_code ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-green-100 text-green-700">
                                {getIntentName(t.intent_code)}
                              </span>
                            ) : (
                              <span className="text-xs text-gray-400">未标注</span>
                            )}
                          </td>
                          <td className="px-4 py-3">
                            <button
                              onClick={() => handleIntelligentLabel(t.id)}
                              disabled={loading}
                              className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700"
                            >
                              <Brain className="w-4 h-4" />
                              智能标注
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            {/* 右侧：标注结果面板 */}
            <div className="space-y-4">
              {/* 标签池展示 */}
              <div className="bg-white rounded-lg p-4">
                <h3 className="font-medium mb-3 flex items-center gap-2">
                  <ListChecks className="w-4 h-4 text-blue-600" />
                  标签池
                </h3>
                <div className="space-y-3">
                  <div>
                    <p className="text-xs text-gray-500 mb-2">行为标签（{behaviors.length}项）</p>
                    <div className="flex flex-wrap gap-1">
                      {behaviors.slice(0, 7).map(b => (
                        <span key={b.code} className="text-xs px-2 py-1 bg-blue-50 text-blue-700 rounded">
                          {b.name}
                        </span>
                      ))}
                      {behaviors.length > 7 && (
                        <span className="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded">
                          +{behaviors.length - 7}
                        </span>
                      )}
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-gray-500 mb-2">意图标签（{intents.length}项）</p>
                    <div className="flex flex-wrap gap-1">
                      {intents.slice(0, 6).map(i => (
                        <span key={i.code} className="text-xs px-2 py-1 bg-green-50 text-green-700 rounded">
                          {i.name}
                        </span>
                      ))}
                      {intents.length > 6 && (
                        <span className="text-xs px-2 py-1 bg-gray-100 text-gray-500 rounded">
                          +{intents.length - 6}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* 智能标注结果 */}
              {labelingResult && (
                <div className="bg-white rounded-lg p-4 space-y-4">
                  <h3 className="font-medium flex items-center gap-2">
                    <Brain className="w-4 h-4 text-purple-600" />
                    智能标注结果
                  </h3>
                  
                  {/* 置信度 */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">置信度：</span>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                        style={{ width: `${(labelingResult.confidence || 0) * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium">
                      {((labelingResult.confidence || 0) * 100).toFixed(0)}%
                    </span>
                  </div>

                  {/* 主标签 */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 bg-blue-50 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">主行为</p>
                      <p className="font-medium text-blue-700">
                        {getBehaviorName(labelingResult.primaryBehavior)}
                      </p>
                    </div>
                    <div className="p-3 bg-green-50 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">主意图</p>
                      <p className="font-medium text-green-700">
                        {getIntentName(labelingResult.primaryIntent)}
                      </p>
                    </div>
                  </div>

                  {/* 备选标签 */}
                  {(labelingResult.alternateBehaviors?.length > 0 || labelingResult.alternateIntents?.length > 0) && (
                    <div className="text-sm">
                      <p className="text-gray-500 mb-2">备选标签：</p>
                      <div className="flex flex-wrap gap-1">
                        {labelingResult.alternateBehaviors?.map(b => (
                          <span key={b} className="px-2 py-1 bg-gray-100 rounded text-xs">
                            {getBehaviorName(b)}
                          </span>
                        ))}
                        {labelingResult.alternateIntents?.map(i => (
                          <span key={i} className="px-2 py-1 bg-gray-100 rounded text-xs">
                            {getIntentName(i)}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* 判定依据 */}
                  {labelingResult.reasoning && (
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-xs text-gray-500 mb-1">判定依据：</p>
                      <p className="text-sm text-gray-700">{labelingResult.reasoning}</p>
                    </div>
                  )}

                  {/* 辅助参考信息 */}
                  {'reference' in labelingResult && (
                    <div className="flex items-center gap-4 text-xs text-gray-500">
                      <span className="flex items-center gap-1">
                        <Database className="w-3 h-3" />
                        SQL历史: {(labelingResult as any).reference?.historyCount || 0}条
                      </span>
                      <span className="flex items-center gap-1">
                        <Search className="w-3 h-3" />
                        向量召回: {(labelingResult as any).reference?.similarCount || 0}条
                      </span>
                    </div>
                  )}

                  {/* 保存按钮 */}
                  {currentTrajectory && (
                    <button
                      onClick={() => handleSaveLabel(
                        currentTrajectory.id,
                        labelingResult.primaryBehavior,
                        labelingResult.primaryIntent
                      )}
                      className="w-full py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center justify-center gap-2"
                    >
                      <Check className="w-4 h-4" />
                      保存标注结果
                    </button>
                  )}
                </div>
              )}

              {/* 使用说明 */}
              <div className="bg-blue-50 rounded-lg p-4 text-sm">
                <p className="font-medium text-blue-800 mb-2">智能标注流程：</p>
                <ol className="list-decimal list-inside space-y-1 text-blue-700">
                  <li>选择待标注航迹，点击"智能标注"</li>
                  <li>系统自动查询SQL历史记录</li>
                  <li>向量检索相似航迹案例</li>
                  <li>LLM综合分析给出标签建议</li>
                  <li>确认后保存标注结果</li>
                </ol>
              </div>
            </div>
          </div>
        ) : (
          /* 标签管理Tab */
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* 行为标签管理 */}
            <div className="bg-white rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium flex items-center gap-2">
                  <Ship className="w-4 h-4 text-blue-600" />
                  行为标签 ({behaviors.length}项)
                </h3>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {behaviors.map((b, idx) => (
                  <div key={b.code} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">{b.name}</span>
                        <span className="text-xs text-gray-400 ml-2">({b.code})</span>
                      </div>
                      <span className="text-xs text-gray-500">#{idx + 1}</span>
                    </div>
                    {b.description && (
                      <p className="text-sm text-gray-500 mt-1">{b.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* 意图标签管理 */}
            <div className="bg-white rounded-lg p-4">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-medium flex items-center gap-2">
                  <MapPin className="w-4 h-4 text-green-600" />
                  意图标签 ({intents.length}项)
                </h3>
              </div>
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {intents.map((i, idx) => (
                  <div key={i.code} className="p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-medium">{i.name}</span>
                        <span className="text-xs text-gray-400 ml-2">({i.code})</span>
                      </div>
                      <span className="text-xs text-gray-500">#{idx + 1}</span>
                    </div>
                    {i.description && (
                      <p className="text-sm text-gray-500 mt-1">{i.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
