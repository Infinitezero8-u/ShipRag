'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  Tag, Brain, Database, Search, Loader2, RefreshCw,
  Ship, MapPin, Upload, Download, Eye, Plus, Trash2,
  Filter, ListChecks, FileJson, Check, X, ChevronRight
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
  geometry_wkt: string;
  ai_description: string;
  behavior_code: string | null;
  intent_code: string | null;
  confidence_score: number | null;
  label_reasoning: string | null;
  created_at: string;
}

interface LabelResult {
  primaryBehavior: string;
  primaryIntent: string;
  alternateBehaviors: string[];
  alternateIntents: string[];
  confidence: number;
  reasoning: string;
  sqlHistoryCount?: number;
  vectorRecallCount?: number;
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
  
  // 过滤条件
  const [filterMmsi, setFilterMmsi] = useState('');
  const [filterUnlabeled, setFilterUnlabeled] = useState(false);
  
  // 当前选中航迹
  const [currentTrajectory, setCurrentTrajectory] = useState<TrajectoryItem | null>(null);
  
  // 导入相关
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 预览相关
  const [previewTrajectory, setPreviewTrajectory] = useState<TrajectoryItem | null>(null);

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
      const res = await fetch('/api/trajectory/label?limit=200');
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
    if (selectedIds.size === 0) return;
    
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
        setLabelingResult(null);
        fetchTrajectories();
      }
    } catch (err) {
      console.error('保存失败:', err);
    }
  };

  // 导入航迹
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    setImporting(true);
    try {
      const text = await file.text();
      let data: Record<string, unknown>[] = [];
      
      if (file.name.endsWith('.json')) {
        data = JSON.parse(text);
      } else if (file.name.endsWith('.csv')) {
        const lines = text.split('\n');
        const headers = lines[0].split(',').map(h => h.trim());
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(',');
          if (values.length === headers.length) {
            const row: Record<string, unknown> = {};
            headers.forEach((h, idx) => row[h] = values[idx].trim());
            data.push(row);
          }
        }
      }
      
      // 批量插入
      const res = await fetch('/api/trajectory/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'import', data })
      });
      
      if (res.ok) {
        fetchTrajectories();
      }
    } catch (err) {
      console.error('导入失败:', err);
    } finally {
      setImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  // 导出航迹
  const handleExport = () => {
    const dataToExport = selectedIds.size > 0 
      ? trajectories.filter(t => selectedIds.has(t.id))
      : trajectories;
    
    const json = JSON.stringify(dataToExport, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trajectories_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 导出为CSV
  const handleExportCSV = () => {
    const dataToExport = selectedIds.size > 0 
      ? trajectories.filter(t => selectedIds.has(t.id))
      : trajectories;
    
    const headers = ['id', 'mmsi', 'start_port', 'end_port', 'behavior_code', 'intent_code', 'ai_description'];
    const rows = dataToExport.map(t => headers.map(h => `"${t[h as keyof TrajectoryItem] || ''}"`).join(','));
    const csv = [headers.join(','), ...rows].join('\n');
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trajectories_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 选择切换
  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
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

  // 简易坐标解析
  const parseWKT = (wkt: string) => {
    if (!wkt) return [];
    const match = wkt.match(/\(([^)]+)\)/);
    if (!match) return [];
    return match[1].split(',').map(pair => {
      const [lon, lat] = pair.trim().split(/\s+/).map(Number);
      return [lon, lat];
    });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* 头部 */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Tag className="w-5 h-5 text-blue-600" />
            <h1 className="text-base font-semibold text-slate-800">航迹智能标注平台</h1>
            <span className="text-xs text-slate-400 ml-2">行为({behaviors.length}) / 意图({intents.length})</span>
          </div>
          
          {/* 操作按钮 */}
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept=".json,.csv"
              onChange={handleImport}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={importing}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded transition"
            >
              {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
              导入
            </button>
            <button
              onClick={handleExport}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded transition"
            >
              <Download className="w-3 h-3" />
              JSON
            </button>
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-slate-100 hover:bg-slate-200 rounded transition"
            >
              <FileJson className="w-3 h-3" />
              CSV
            </button>
          </div>
        </div>
      </header>

      <div className="flex h-[calc(100vh-45px)]">
        {/* 左侧：航迹列表 */}
        <div className="w-80 border-r border-slate-200 bg-white flex flex-col">
          {/* 过滤器 */}
          <div className="p-2 border-b border-slate-100 space-y-2">
            <div className="flex items-center gap-2">
              <Search className="w-3 h-3 text-slate-400" />
              <input
                type="text"
                placeholder="MMSI筛选..."
                value={filterMmsi}
                onChange={(e) => setFilterMmsi(e.target.value)}
                className="flex-1 px-2 py-1 border border-slate-200 rounded text-xs"
              />
            </div>
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-1 text-xs text-slate-600">
                <input
                  type="checkbox"
                  checked={filterUnlabeled}
                  onChange={(e) => setFilterUnlabeled(e.target.checked)}
                  className="rounded scale-75"
                />
                仅未标注
              </label>
              <button
                onClick={fetchTrajectories}
                className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700"
              >
                <RefreshCw className="w-3 h-3" />
                刷新
              </button>
            </div>
          </div>
          
          {/* 批量操作 */}
          <div className="p-2 border-b border-slate-100 flex items-center justify-between">
            <label className="flex items-center gap-1 text-xs text-slate-600">
              <input
                type="checkbox"
                checked={selectedIds.size === filteredTrajectories.length && filteredTrajectories.length > 0}
                onChange={toggleSelectAll}
                className="rounded scale-75"
              />
              全选 ({selectedIds.size})
            </label>
            <button
              onClick={handleBatchLabel}
              disabled={batchLoading || selectedIds.size === 0}
              className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
            >
              {batchLoading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
              批量标注
            </button>
          </div>
          
          {/* 航迹列表 */}
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-slate-400 text-xs">
                <Loader2 className="w-4 h-4 animate-spin mx-auto mb-1" />
                加载中...
              </div>
            ) : filteredTrajectories.length === 0 ? (
              <div className="p-4 text-center text-slate-400 text-xs">
                暂无航迹数据，请导入
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {filteredTrajectories.map((t) => (
                  <div
                    key={t.id}
                    className={`p-2 hover:bg-slate-50 cursor-pointer ${currentTrajectory?.id === t.id ? 'bg-blue-50' : ''}`}
                    onClick={() => setCurrentTrajectory(t)}
                  >
                    <div className="flex items-start gap-2">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(t.id)}
                        onChange={(e) => { e.stopPropagation(); toggleSelect(t.id); }}
                        onClick={(e) => e.stopPropagation()}
                        className="rounded scale-75 mt-0.5"
                      />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1">
                          <Ship className="w-3 h-3 text-slate-400" />
                          <span className="text-xs font-mono text-slate-700">{t.mmsi || '-'}</span>
                        </div>
                        <div className="text-xs text-slate-500 truncate mt-0.5">
                          {t.start_port || '?'} → {t.end_port || '?'}
                        </div>
                        <div className="flex gap-1 mt-1">
                          {t.behavior_code ? (
                            <span className="px-1 py-0.5 bg-blue-100 text-blue-700 rounded text-[10px]">
                              {getBehaviorName(t.behavior_code)}
                            </span>
                          ) : null}
                          {t.intent_code ? (
                            <span className="px-1 py-0.5 bg-green-100 text-green-700 rounded text-[10px]">
                              {getIntentName(t.intent_code)}
                            </span>
                          ) : null}
                          {!t.behavior_code && !t.intent_code && (
                            <span className="text-[10px] text-slate-400">未标注</span>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-col gap-1">
                        <button
                          onClick={(e) => { e.stopPropagation(); handleIntelligentLabel(t.id); }}
                          disabled={loading}
                          className="p-1 text-blue-600 hover:bg-blue-100 rounded"
                          title="智能标注"
                        >
                          <Brain className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setPreviewTrajectory(t); }}
                          className="p-1 text-slate-600 hover:bg-slate-100 rounded"
                          title="预览"
                        >
                          <Eye className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          
          {/* 底部统计 */}
          <div className="p-2 border-t border-slate-100 text-[10px] text-slate-400">
            共 {trajectories.length} 条，已标注 {trajectories.filter(t => t.behavior_code).length} 条
          </div>
        </div>
        
        {/* 中间：航迹详情与预览 */}
        <div className="flex-1 flex flex-col bg-slate-100">
          {currentTrajectory ? (
            <>
              {/* 航迹详情 */}
              <div className="p-3 bg-white border-b border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-sm font-medium text-slate-800">航迹详情</h2>
                  <div className="flex gap-1">
                    <button
                      onClick={() => handleIntelligentLabel(currentTrajectory.id)}
                      disabled={loading}
                      className="flex items-center gap-1 px-2 py-1 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 disabled:opacity-50"
                    >
                      {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <Brain className="w-3 h-3" />}
                      智能标注
                    </button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400">MMSI:</span>
                    <span className="ml-1 font-mono">{currentTrajectory.mmsi || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">起点:</span>
                    <span className="ml-1 text-blue-600">{currentTrajectory.start_port || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">终点:</span>
                    <span className="ml-1 text-green-600">{currentTrajectory.end_port || '-'}</span>
                  </div>
                  <div>
                    <span className="text-slate-400">行为:</span>
                    {currentTrajectory.behavior_code ? (
                      <span className="ml-1 px-1 py-0.5 bg-blue-100 text-blue-700 rounded">{getBehaviorName(currentTrajectory.behavior_code)}</span>
                    ) : <span className="ml-1 text-slate-400">-</span>}
                  </div>
                </div>
                {currentTrajectory.ai_description && (
                  <div className="mt-2 text-xs text-slate-600 bg-slate-50 p-2 rounded">
                    {currentTrajectory.ai_description}
                  </div>
                )}
              </div>
              
              {/* 地图预览 */}
              <div className="flex-1 relative">
                <div className="absolute inset-0 bg-slate-200 flex items-center justify-center">
                  {currentTrajectory.geometry_wkt ? (
                    <svg viewBox="0 0 400 300" className="w-full h-full max-w-lg">
                      <rect width="400" height="300" fill="#e2e8f0" />
                      {(() => {
                        const coords = parseWKT(currentTrajectory.geometry_wkt);
                        if (coords.length < 2) return null;
                        const lons = coords.map(c => c[0]);
                        const lats = coords.map(c => c[1]);
                        const minLon = Math.min(...lons), maxLon = Math.max(...lons);
                        const minLat = Math.min(...lats), maxLat = Math.max(...lats);
                        const scale = Math.min(360 / (maxLon - minLon || 1), 260 / (maxLat - minLat || 1));
                        const offsetX = 20, offsetY = 20;
                        const points = coords.map(([lon, lat]) => 
                          `${offsetX + (lon - minLon) * scale},${280 - (lat - minLat) * scale}`
                        ).join(' ');
                        return (
                          <>
                            <polyline points={points} fill="none" stroke="#3b82f6" strokeWidth="2" />
                            <circle cx={parseFloat(points.split(' ')[0].split(',')[0])} cy={parseFloat(points.split(' ')[0].split(',')[1])} r="5" fill="#22c55e" />
                            <circle cx={parseFloat(points.split(' ').pop()?.split(',')[0] || '0')} cy={parseFloat(points.split(' ').pop()?.split(',')[1] || '0')} r="5" fill="#ef4444" />
                          </>
                        );
                      })()}
                    </svg>
                  ) : (
                    <div className="text-slate-400 text-sm">无航线数据</div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
              选择航迹查看详情
            </div>
          )}
        </div>
        
        {/* 右侧：标注结果与标签池 */}
        <div className="w-72 border-l border-slate-200 bg-white flex flex-col">
          {/* 标签池 */}
          <div className="p-2 border-b border-slate-100">
            <h3 className="text-xs font-medium text-slate-600 mb-2 flex items-center gap-1">
              <ListChecks className="w-3 h-3" />
              标签池
            </h3>
            <div className="space-y-2">
              <div>
                <p className="text-[10px] text-slate-400 mb-1">行为标签</p>
                <div className="flex flex-wrap gap-0.5">
                  {behaviors.map(b => (
                    <span key={b.code} className="px-1 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px]" title={b.description}>
                      {b.name}
                    </span>
                  ))}
                </div>
              </div>
              <div>
                <p className="text-[10px] text-slate-400 mb-1">意图标签</p>
                <div className="flex flex-wrap gap-0.5">
                  {intents.map(i => (
                    <span key={i.code} className="px-1 py-0.5 bg-green-50 text-green-700 rounded text-[10px]" title={i.description}>
                      {i.name}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>
          
          {/* 智能标注结果 */}
          {labelingResult ? (
            <div className="flex-1 p-2 overflow-y-auto">
              <h3 className="text-xs font-medium text-slate-600 mb-2 flex items-center gap-1">
                <Brain className="w-3 h-3 text-purple-600" />
                标注结果
              </h3>
              
              {/* 辅助参考统计 */}
              <div className="flex gap-2 mb-2">
                <div className="flex-1 bg-slate-50 rounded p-1.5 text-center">
                  <Database className="w-3 h-3 text-slate-400 mx-auto" />
                  <div className="text-[10px] text-slate-600">SQL历史</div>
                  <div className="text-sm font-medium">{labelingResult.sqlHistoryCount || 0}</div>
                </div>
                <div className="flex-1 bg-slate-50 rounded p-1.5 text-center">
                  <Search className="w-3 h-3 text-slate-400 mx-auto" />
                  <div className="text-[10px] text-slate-600">向量召回</div>
                  <div className="text-sm font-medium">{labelingResult.vectorRecallCount || 0}</div>
                </div>
              </div>
              
              {/* 置信度 */}
              <div className="mb-2">
                <div className="flex items-center justify-between text-[10px] text-slate-500 mb-1">
                  <span>置信度</span>
                  <span>{((labelingResult.confidence || 0) * 100).toFixed(0)}%</span>
                </div>
                <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-gradient-to-r from-blue-500 to-purple-500"
                    style={{ width: `${(labelingResult.confidence || 0) * 100}%` }}
                  />
                </div>
              </div>
              
              {/* 主标签 */}
              <div className="space-y-1.5 mb-2">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 w-8">行为:</span>
                  <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                    {getBehaviorName(labelingResult.primaryBehavior)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-slate-400 w-8">意图:</span>
                  <span className="px-1.5 py-0.5 bg-green-100 text-green-700 rounded text-xs font-medium">
                    {getIntentName(labelingResult.primaryIntent)}
                  </span>
                </div>
              </div>
              
              {/* 备选标签 */}
              {(labelingResult.alternateBehaviors?.length > 0 || labelingResult.alternateIntents?.length > 0) && (
                <div className="mb-2 p-1.5 bg-slate-50 rounded">
                  <p className="text-[10px] text-slate-400 mb-1">备选标签</p>
                  <div className="flex flex-wrap gap-0.5">
                    {labelingResult.alternateBehaviors?.map(code => (
                      <span key={code} className="px-1 py-0.5 bg-blue-50 text-blue-600 rounded text-[10px]">
                        {getBehaviorName(code)}
                      </span>
                    ))}
                    {labelingResult.alternateIntents?.map(code => (
                      <span key={code} className="px-1 py-0.5 bg-green-50 text-green-600 rounded text-[10px]">
                        {getIntentName(code)}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              
              {/* 判定依据 */}
              {labelingResult.reasoning && (
                <div className="mb-2 p-1.5 bg-slate-50 rounded">
                  <p className="text-[10px] text-slate-400 mb-1">判定依据</p>
                  <p className="text-xs text-slate-600">{labelingResult.reasoning}</p>
                </div>
              )}
              
              {/* 操作按钮 */}
              {currentTrajectory && (
                <button
                  onClick={() => handleSaveLabel(
                    currentTrajectory.id,
                    labelingResult.primaryBehavior,
                    labelingResult.primaryIntent
                  )}
                  className="w-full py-1.5 bg-blue-600 text-white rounded text-xs hover:bg-blue-700 flex items-center justify-center gap-1"
                >
                  <Check className="w-3 h-3" />
                  保存标注
                </button>
              )}
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 text-xs p-4 text-center">
              点击"智能标注"分析航迹
            </div>
          )}
        </div>
      </div>
      
      {/* 预览弹窗 */}
      {previewTrajectory && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setPreviewTrajectory(null)}>
          <div className="bg-white rounded-lg w-[600px] max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="p-3 border-b flex items-center justify-between">
              <h3 className="text-sm font-medium">航迹预览</h3>
              <button onClick={() => setPreviewTrajectory(null)} className="p-1 hover:bg-slate-100 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-3 space-y-2">
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-slate-400">MMSI:</span> {previewTrajectory.mmsi}</div>
                <div><span className="text-slate-400">起点:</span> {previewTrajectory.start_port}</div>
                <div><span className="text-slate-400">终点:</span> {previewTrajectory.end_port}</div>
                <div><span className="text-slate-400">行为:</span> {previewTrajectory.behavior_code ? getBehaviorName(previewTrajectory.behavior_code) : '-'}</div>
              </div>
              {previewTrajectory.geometry_wkt && (
                <div className="bg-slate-50 p-2 rounded text-[10px] font-mono break-all max-h-20 overflow-y-auto">
                  {previewTrajectory.geometry_wkt}
                </div>
              )}
              {previewTrajectory.ai_description && (
                <div className="bg-blue-50 p-2 rounded text-xs text-slate-600">
                  {previewTrajectory.ai_description}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
