'use client';

import { useState, useEffect } from 'react';
import { Play, History, Download, RefreshCw, StopCircle, RotateCcw, BarChart3, CheckCircle, XCircle, Clock } from 'lucide-react';

interface Experiment {
  id: string;
  name: string;
  sea_area: string;
  ship_type: string;
  optimize_metrics: string[];
  status: string;
  best_score: number | null;
  version: number;
  total_iterations: number;
  training_data_count: number;
  validation_data_count: number;
  experiment_report: string | null;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
}

interface Iteration {
  id: string;
  iteration: number;
  score: number | null;
  is_better: boolean;
  status: string;
  params: Record<string, unknown>;
}

interface Model {
  id: string;
  version: number;
  model_name: string;
  score: number | null;
  is_active: boolean;
}

export default function AutoResearchPanel() {
  const [experiments, setExperiments] = useState<Experiment[]>([]);
  const [selectedExp, setSelectedExp] = useState<Experiment | null>(null);
  const [iterations, setIterations] = useState<Iteration[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'list' | 'new' | 'detail'>('list');
  
  // 新建实验表单
  const [newExp, setNewExp] = useState({
    name: '',
    seaArea: '',
    shipType: '',
    optimizeMetrics: ['accuracy', 'f1_score']
  });

  // 数据集统计
  const [datasetStats, setDatasetStats] = useState({ total: 0, labeled: 0, training: 0, validation: 0 });

  useEffect(() => {
    loadExperiments();
    loadDatasetStats();
  }, []);

  const loadExperiments = async () => {
    try {
      const res = await fetch('/api/auto-research?action=list');
      const data = await res.json();
      if (data.success) {
        setExperiments(data.experiments);
      }
    } catch (error) {
      console.error('加载实验列表失败:', error);
    }
  };

  const loadDatasetStats = async () => {
    try {
      const res = await fetch('/api/auto-research?action=dataset-stats');
      const data = await res.json();
      if (data.success) {
        setDatasetStats(data);
      }
    } catch (error) {
      console.error('加载数据集统计失败:', error);
    }
  };

  const loadExperimentDetail = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/auto-research?action=detail&id=${id}`);
      const data = await res.json();
      if (data.success) {
        setSelectedExp(data.experiment);
        setIterations(data.iterations || []);
        setModels(data.models || []);
        setActiveTab('detail');
      }
    } catch (error) {
      console.error('加载实验详情失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const startExperiment = async () => {
    if (!newExp.name || !newExp.seaArea || !newExp.shipType) {
      alert('请填写完整信息');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auto-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'start',
          name: newExp.name,
          seaArea: newExp.seaArea,
          shipType: newExp.shipType,
          optimizeMetrics: newExp.optimizeMetrics
        })
      });
      const data = await res.json();
      if (data.success) {
        alert('实验已启动');
        setActiveTab('list');
        loadExperiments();
        setNewExp({ name: '', seaArea: '', shipType: '', optimizeMetrics: ['accuracy', 'f1_score'] });
      } else {
        alert(data.error || '启动失败');
      }
    } catch (error) {
      console.error('启动实验失败:', error);
      alert('启动失败');
    } finally {
      setLoading(false);
    }
  };

  const stopExperiment = async (id: string) => {
    if (!confirm('确定停止实验？')) return;
    
    try {
      const res = await fetch('/api/auto-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop', id })
      });
      const data = await res.json();
      if (data.success) {
        loadExperiments();
        if (selectedExp?.id === id) {
          setSelectedExp(data.experiment);
        }
      }
    } catch (error) {
      console.error('停止实验失败:', error);
    }
  };

  const rollbackModel = async (version: number) => {
    if (!selectedExp || !confirm(`确定回滚到版本 ${version}？`)) return;
    
    try {
      const res = await fetch('/api/auto-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'rollback', experimentId: selectedExp.id, version })
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        loadExperimentDetail(selectedExp.id);
      }
    } catch (error) {
      console.error('回滚失败:', error);
    }
  };

  const exportScript = async () => {
    if (!selectedExp) return;
    
    try {
      const res = await fetch(`/api/auto-research?action=export-script&id=${selectedExp.id}`);
      const data = await res.json();
      if (data.success) {
        // 下载脚本
        const blob = new Blob([data.script], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `train_${data.experimentName}.py`;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('导出失败:', error);
    }
  };

  const syncIncremental = async () => {
    try {
      const res = await fetch('/api/auto-research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync-incremental' })
      });
      const data = await res.json();
      if (data.success) {
        alert(`已同步 ${data.syncedCount} 条新数据`);
        loadDatasetStats();
      }
    } catch (error) {
      console.error('同步失败:', error);
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed': return <CheckCircle className="w-3 h-3 text-green-500" />;
      case 'running': return <RefreshCw className="w-3 h-3 text-blue-500 animate-spin" />;
      case 'stopped': return <StopCircle className="w-3 h-3 text-orange-500" />;
      default: return <Clock className="w-3 h-3 text-gray-400" />;
    }
  };

  return (
    <div className="space-y-3">
      {/* Tab切换 */}
      <div className="flex gap-1 border-b border-gray-200 pb-2">
        <button
          onClick={() => setActiveTab('list')}
          className={`px-2 py-1 text-[10px] rounded ${activeTab === 'list' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
        >
          实验列表
        </button>
        <button
          onClick={() => setActiveTab('new')}
          className={`px-2 py-1 text-[10px] rounded ${activeTab === 'new' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
        >
          自主调优
        </button>
        {selectedExp && (
          <button
            onClick={() => setActiveTab('detail')}
            className={`px-2 py-1 text-[10px] rounded ${activeTab === 'detail' ? 'bg-blue-500 text-white' : 'bg-gray-100'}`}
          >
            实验详情
          </button>
        )}
      </div>

      {/* 数据集统计 */}
      <div className="bg-gray-50 p-2 rounded text-[10px]">
        <div className="flex justify-between items-center mb-1">
          <span className="font-medium">数据集统计</span>
          <button onClick={syncIncremental} className="text-blue-500 flex items-center gap-0.5">
            <RefreshCw className="w-2.5 h-2.5" />
            同步增量
          </button>
        </div>
        <div className="grid grid-cols-4 gap-2 text-center">
          <div>
            <div className="text-lg font-bold">{datasetStats.total}</div>
            <div className="text-gray-500">总航迹</div>
          </div>
          <div>
            <div className="text-lg font-bold text-green-600">{datasetStats.labeled}</div>
            <div className="text-gray-500">已标注</div>
          </div>
          <div>
            <div className="text-lg font-bold text-blue-600">{datasetStats.training}</div>
            <div className="text-gray-500">训练集</div>
          </div>
          <div>
            <div className="text-lg font-bold text-purple-600">{datasetStats.validation}</div>
            <div className="text-gray-500">验证集</div>
          </div>
        </div>
      </div>

      {/* 实验列表 */}
      {activeTab === 'list' && (
        <div className="space-y-2">
          {experiments.length === 0 ? (
            <div className="text-center text-gray-400 py-4 text-[10px]">
              暂无实验记录
            </div>
          ) : (
            experiments.map(exp => (
              <div key={exp.id} className="border rounded p-2 text-[10px]">
                <div className="flex justify-between items-start mb-1">
                  <div className="flex items-center gap-1">
                    {getStatusIcon(exp.status)}
                    <span className="font-medium">{exp.name}</span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => loadExperimentDetail(exp.id)}
                      className="p-1 bg-blue-50 text-blue-600 rounded"
                    >
                      <History className="w-3 h-3" />
                    </button>
                    {exp.status === 'running' && (
                      <button
                        onClick={() => stopExperiment(exp.id)}
                        className="p-1 bg-red-50 text-red-600 rounded"
                      >
                        <StopCircle className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
                <div className="text-gray-500 mb-1">
                  海域: {exp.sea_area} | 船型: {exp.ship_type}
                </div>
                <div className="flex justify-between text-gray-400">
                  <span>迭代: {exp.total_iterations}次</span>
                  <span>最优得分: {exp.best_score?.toFixed(2) || '-'}</span>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* 新建实验 */}
      {activeTab === 'new' && (
        <div className="space-y-2">
          <div>
            <label className="text-[10px] text-gray-500">实验名称</label>
            <input
              type="text"
              value={newExp.name}
              onChange={e => setNewExp({ ...newExp, name: e.target.value })}
              className="w-full border rounded px-2 py-1 text-xs"
              placeholder="如: 东海货船航迹分类优化"
            />
          </div>
          <div>
            <label className="text-[10px] text-gray-500">海域</label>
            <select
              value={newExp.seaArea}
              onChange={e => setNewExp({ ...newExp, seaArea: e.target.value })}
              className="w-full border rounded px-2 py-1 text-xs"
            >
              <option value="">选择海域</option>
              <option value="东海">东海</option>
              <option value="南海">南海</option>
              <option value="渤海">渤海</option>
              <option value="黄海">黄海</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500">船型</label>
            <select
              value={newExp.shipType}
              onChange={e => setNewExp({ ...newExp, shipType: e.target.value })}
              className="w-full border rounded px-2 py-1 text-xs"
            >
              <option value="">选择船型</option>
              <option value="货船">货船</option>
              <option value="油轮">油轮</option>
              <option value="集装箱船">集装箱船</option>
              <option value="渔船">渔船</option>
            </select>
          </div>
          <div>
            <label className="text-[10px] text-gray-500">优化指标</label>
            <div className="flex gap-1 flex-wrap">
              {['accuracy', 'f1_score', 'precision', 'recall'].map(m => (
                <label key={m} className="flex items-center gap-0.5 text-[10px]">
                  <input
                    type="checkbox"
                    checked={newExp.optimizeMetrics.includes(m)}
                    onChange={e => {
                      if (e.target.checked) {
                        setNewExp({ ...newExp, optimizeMetrics: [...newExp.optimizeMetrics, m] });
                      } else {
                        setNewExp({ ...newExp, optimizeMetrics: newExp.optimizeMetrics.filter(x => x !== m) });
                      }
                    }}
                    className="w-3 h-3"
                  />
                  {m}
                </label>
              ))}
            </div>
          </div>
          <button
            onClick={startExperiment}
            disabled={loading}
            className="w-full bg-blue-500 text-white py-1.5 rounded text-xs flex items-center justify-center gap-1"
          >
            <Play className="w-3 h-3" />
            {loading ? '启动中...' : '启动自主调优'}
          </button>
        </div>
      )}

      {/* 实验详情 */}
      {activeTab === 'detail' && selectedExp && (
        <div className="space-y-2">
          {/* 基本信息 */}
          <div className="border rounded p-2 text-[10px]">
            <div className="flex justify-between items-center mb-1">
              <div className="flex items-center gap-1">
                {getStatusIcon(selectedExp.status)}
                <span className="font-medium">{selectedExp.name}</span>
              </div>
              <button
                onClick={exportScript}
                className="px-2 py-0.5 bg-green-50 text-green-600 rounded flex items-center gap-0.5"
              >
                <Download className="w-2.5 h-2.5" />
                导出脚本
              </button>
            </div>
            <div className="text-gray-500">
              海域: {selectedExp.sea_area} | 船型: {selectedExp.ship_type}
            </div>
            <div className="text-gray-500">
              最优得分: {selectedExp.best_score?.toFixed(4) || '-'} | 版本: v{selectedExp.version}
            </div>
          </div>

          {/* 迭代记录 */}
          <div className="border rounded p-2">
            <div className="font-medium text-[10px] mb-1 flex items-center gap-1">
              <BarChart3 className="w-3 h-3" />
              迭代记录 ({iterations.length})
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {iterations.map(iter => (
                <div key={iter.id} className="flex justify-between text-[9px] p-1 bg-gray-50 rounded">
                  <span>第{iter.iteration}轮</span>
                  <span className={iter.is_better ? 'text-green-600' : ''}>
                    得分: {iter.score?.toFixed(4) || '-'}
                    {iter.is_better && ' ✓'}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* 模型版本 */}
          <div className="border rounded p-2">
            <div className="font-medium text-[10px] mb-1 flex items-center gap-1">
              <History className="w-3 h-3" />
              模型版本 ({models.length})
            </div>
            <div className="space-y-1 max-h-32 overflow-y-auto">
              {models.map(model => (
                <div key={model.id} className="flex justify-between items-center text-[9px] p-1 bg-gray-50 rounded">
                  <div className="flex items-center gap-1">
                    <span>v{model.version}</span>
                    {model.is_active && <span className="text-green-500">●</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <span>得分: {model.score?.toFixed(4) || '-'}</span>
                    {!model.is_active && (
                      <button
                        onClick={() => rollbackModel(model.version)}
                        className="px-1 py-0.5 bg-orange-50 text-orange-600 rounded flex items-center gap-0.5"
                      >
                        <RotateCcw className="w-2 h-2" />
                        回滚
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 实验报告 */}
          {selectedExp.experiment_report && (
            <div className="border rounded p-2">
              <div className="font-medium text-[10px] mb-1">实验报告</div>
              <div className="text-[9px] text-gray-600 whitespace-pre-wrap">
                {selectedExp.experiment_report}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
