'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Plus, Edit2, Trash2, Eye, Database, Search, Upload, 
  CheckCircle, XCircle, Clock, FileText, Route, Anchor, BookOpen, ExternalLink,
  Layers, Zap, Map as MapIcon, BarChart3
} from 'lucide-react';
import dynamic from 'next/dynamic';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

// 动态导入地图组件（避免SSR问题）
const MapContainer = dynamic(
  () => import('react-leaflet').then(mod => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import('react-leaflet').then(mod => mod.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import('react-leaflet').then(mod => mod.Marker),
  { ssr: false }
);
const Popup = dynamic(
  () => import('react-leaflet').then(mod => mod.Popup),
  { ssr: false }
);
const Polyline = dynamic(
  () => import('react-leaflet').then(mod => mod.Polyline),
  { ssr: false }
);

interface PortData {
  id: string;
  port_code: string;
  name_cn: string;
  ctry_code: string;
  ctry_name_cn: string;
  ctry_name_en: string;
  name_pinyin: string;
  name_py: string;
  tz_offset: number;
  port_type: string;
  lon: number;
  lat: number;
  continent_code: string;
  continent_name_cn: string;
  continent_name_en: string;
  vector_status: string;
}

interface RouteData {
  id: string;
  orig_port: string;
  dest_port: string;
  geometry_wkt: string;
  vector_status: string;
}

interface RegulationData {
  id: string;
  filename: string;
  description?: string;
  categories: string[];
  is_valid: boolean;
  vector_status: string;
  version?: string;
  publish_date?: string;
  publish_org?: string;
  created_at: string;
  file_size?: number;
  file_type?: string;
}

interface RegulationChunk {
  id: string;
  regulation_id: string;
  chunk_index: number;
  content: string;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export function DataMaintainPanel() {
  const [activeTab, setActiveTab] = useState<'port' | 'route' | 'regulation' | 'chart'>('port');
  const [ports, setPorts] = useState<PortData[]>([]);
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [regulations, setRegulations] = useState<RegulationData[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchCode, setSearchCode] = useState('');
  const [searchResults, setSearchResults] = useState<PortData[]>([]);
  
  // 弹窗状态
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PortData | RouteData | RegulationData | null>(null);
  const [message, setMessage] = useState<string>('');
  // 批量选中状态
  const [selectedPorts, setSelectedPorts] = useState<string[]>([]);
  const [selectedRoutes, setSelectedRoutes] = useState<{origPort: string, destPort: string}[]>([]);
  const [selectedRegulations, setSelectedRegulations] = useState<string[]>([]);
  // 向量化状态
  const [isVectorizing, setIsVectorizing] = useState(false);
  const [vectorizeProgress, setVectorizeProgress] = useState({ current: 0, total: 0 });
  // 规章制度切分查看
  const [showChunksModal, setShowChunksModal] = useState(false);
  const [selectedRegulationChunks, setSelectedRegulationChunks] = useState<RegulationChunk[]>([]);
  // 规章制度编辑弹窗
  const [showRegEditModal, setShowRegEditModal] = useState(false);

  // 加载数据（支持大数据集）
  const loadPorts = async () => {
    setLoading(true);
    try {
      // 先获取总数，然后分批加载
      const res = await fetch('/api/data-maintain?action=list&type=port&pageSize=1000');
      const data = await res.json();
      const total = data.total || 0;
      let allItems = data.items || [];
      
      // 如果还有更多数据，继续加载
      if (total > 1000) {
        const totalPages = Math.ceil(total / 1000);
        for (let page = 2; page <= totalPages; page++) {
          const resPage = await fetch(`/api/data-maintain?action=list&type=port&pageSize=1000&page=${page}`);
          const dataPage = await resPage.json();
          allItems = [...allItems, ...(dataPage.items || [])];
        }
      }
      
      setPorts(allItems);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const loadRoutes = async () => {
    setLoading(true);
    try {
      // 先获取总数，然后分批加载
      const res = await fetch('/api/data-maintain?action=list&type=route&pageSize=1000');
      const data = await res.json();
      const total = data.total || 0;
      let allItems = data.items || [];
      
      // 如果还有更多数据，继续加载
      if (total > 1000) {
        const totalPages = Math.ceil(total / 1000);
        for (let page = 2; page <= totalPages; page++) {
          const resPage = await fetch(`/api/data-maintain?action=list&type=route&pageSize=1000&page=${page}`);
          const dataPage = await resPage.json();
          allItems = [...allItems, ...(dataPage.items || [])];
        }
      }
      
      setRoutes(allItems);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const loadRegulations = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/regulations?page=1&pageSize=50');
      const data = await res.json();
      setRegulations(data.items || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  // 规章制度操作函数
  const handleRegulationDelete = async (reg: RegulationData) => {
    if (!confirm(`确认删除文档"${reg.filename}"？此操作将同时删除所有相关切片数据。`)) return;
    
    try {
      const res = await fetch('/api/regulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ids: [reg.id] })
      });
      const data = await res.json();
      setMessage(data.message || '删除成功');
      loadRegulations();
    } catch (e) {
      setMessage('删除失败');
    }
  };

  const handleRegulationVectorize = async (reg: RegulationData) => {
    setMessage(`正在向量化: ${reg.filename}`);
    try {
      const res = await fetch('/api/regulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revectorize', id: reg.id })
      });
      const data = await res.json();
      setMessage(data.message || '向量化完成');
      loadRegulations();
    } catch (e) {
      setMessage('向量化失败');
    }
  };

  const handleRegulationBatchVectorize = async () => {
    if (selectedRegulations.length === 0) {
      setMessage('请先选择要向量化的文档');
      return;
    }
    
    setIsVectorizing(true);
    setMessage(`正在批量向量化 ${selectedRegulations.length} 个文档...`);
    try {
      const res = await fetch('/api/regulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'batch-vectorize', ids: selectedRegulations })
      });
      const data = await res.json();
      setMessage(data.message || '批量向量化完成');
      setSelectedRegulations([]);
      loadRegulations();
    } catch (e) {
      setMessage('批量向量化失败');
    } finally {
      setIsVectorizing(false);
    }
  };

  const handleViewChunks = async (reg: RegulationData) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/regulations?action=detail&id=${reg.id}`);
      const data = await res.json();
      setSelectedItem(reg);
      setSelectedRegulationChunks(data.chunks || []);
      setShowChunksModal(true);
    } catch (e) {
      setMessage('获取切分数据失败');
    }
    setLoading(false);
  };

  // 分类标签显示
  const getCategoryLabel = (key: string) => {
    const labels: Record<string, string> = {
      'maritime_rules': '海事',
      'platform_ops': '运维',
      'trajectory_annotation': '标注',
      'model_training': '训练',
      'other': '其他'
    };
    return labels[key] || key;
  };

  useEffect(() => {
    if (activeTab === 'port') loadPorts();
    else if (activeTab === 'route') loadRoutes();
    else loadRegulations();
  }, [activeTab]);

  // 编码检索
  const handleSearch = async () => {
    if (!searchCode) return;
    const res = await fetch(`/api/data-maintain?action=search&code=${encodeURIComponent(searchCode)}`);
    const data = await res.json();
    setSearchResults(data.ports || []);
  };

  // 预览
  const handlePreview = async (type: 'port' | 'route', code: string) => {
    const res = await fetch(`/api/data-maintain?action=preview&type=${type}&code=${code}`);
    const data = await res.json();
    setSelectedItem(data.data);
    setShowPreviewModal(true);
  };

  // 删除
  const handleDelete = async (type: 'port' | 'route', item: PortData | RouteData) => {
    if (!confirm('确认删除？')) return;
    
    const body = type === 'port' 
      ? { action: 'delete', type: 'port', portCode: (item as PortData).port_code }
      : { action: 'delete', type: 'route', OrigPort: (item as RouteData).orig_port, DestPort: (item as RouteData).dest_port };
    
    const res = await fetch('/api/data-maintain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    setMessage(data.message);
    if (data.success) {
      if (type === 'port') loadPorts();
      else loadRoutes();
    }
  };

  // 向量化
  const handleVectorize = async (type: 'port' | 'route', item: PortData | RouteData) => {
    const body = type === 'port'
      ? { action: 'vectorize', type: 'port', portCode: (item as PortData).port_code }
      : { action: 'vectorize', type: 'route', OrigPort: (item as RouteData).orig_port, DestPort: (item as RouteData).dest_port };
    
    const res = await fetch('/api/data-maintain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const data = await res.json();
    setMessage(data.message);
    if (type === 'port') loadPorts();
    else loadRoutes();
  };

  // 批量向量化（选中的）
  const handleBatchVectorize = async () => {
    if (activeTab === 'port') {
      if (selectedPorts.length === 0) {
        setMessage('请先选择要向量化的港口数据');
        return;
      }
      setIsVectorizing(true);
      setVectorizeProgress({ current: 0, total: selectedPorts.length });
      setMessage(`正在向量化 0/${selectedPorts.length}...`);
      try {
        const res = await fetch('/api/data-maintain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'batch-vectorize', 
            type: 'port', 
            portCodes: selectedPorts 
          })
        });
        const data = await res.json();
        setMessage(data.message);
        setSelectedPorts([]);
        loadPorts();
      } catch (e) {
        setMessage('向量化失败');
      } finally {
        setIsVectorizing(false);
        setVectorizeProgress({ current: 0, total: 0 });
      }
    } else if (activeTab === 'route') {
      if (selectedRoutes.length === 0) {
        setMessage('请先选择要向量化的航线数据');
        return;
      }
      setIsVectorizing(true);
      setVectorizeProgress({ current: 0, total: selectedRoutes.length });
      setMessage(`正在向量化 0/${selectedRoutes.length}...`);
      try {
        const res = await fetch('/api/data-maintain', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'batch-vectorize', 
            type: 'route', 
            OrigPorts: selectedRoutes.map(r => r.origPort),
            DestPorts: selectedRoutes.map(r => r.destPort)
          })
        });
        const data = await res.json();
        setMessage(data.message);
        setSelectedRoutes([]);
        loadRoutes();
      } catch (e) {
        setMessage('向量化失败');
      } finally {
        setIsVectorizing(false);
        setVectorizeProgress({ current: 0, total: 0 });
      }
    }
  };

  // 全部向量化
  const handleVectorizeAll = async () => {
    if (!confirm('确认对全部未向量化的数据进行向量化？')) return;
    
    setIsVectorizing(true);
    setMessage('正在全部向量化...');
    try {
      const res = await fetch('/api/data-maintain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'batch-vectorize', 
          type: activeTab, 
          vectorizeAll: true 
        })
      });
      const data = await res.json();
      setMessage(data.message);
      if (activeTab === 'port') loadPorts();
      else loadRoutes();
    } catch (e) {
      setMessage('向量化失败');
    } finally {
      setIsVectorizing(false);
    }
  };

  // 取消向量化
  const handleCancelVectorize = async () => {
    if (!confirm('确认取消向量化任务？')) return;
    
    try {
      const res = await fetch('/api/data-maintain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          action: 'cancel-vectorize', 
          type: activeTab,
          portCodes: activeTab === 'port' ? selectedPorts : undefined,
          OrigPorts: activeTab === 'route' ? selectedRoutes.map(r => r.origPort) : undefined,
          DestPorts: activeTab === 'route' ? selectedRoutes.map(r => r.destPort) : undefined
        })
      });
      const data = await res.json();
      setMessage(data.message || '已取消向量化任务');
      setIsVectorizing(false);
      setVectorizeProgress({ current: 0, total: 0 });
      if (activeTab === 'port') loadPorts();
      else loadRoutes();
    } catch (e) {
      setMessage('取消失败');
    }
  };

  // 状态图标
  const StatusIcon = ({ status }: { status: string }) => {
    if (status === '向量化成功') return <CheckCircle className="w-3 h-3 text-green-500" />;
    if (status === '向量化失败') return <XCircle className="w-3 h-3 text-red-500" />;
    return <Clock className="w-3 h-3 text-gray-400" />;
  };

  return (
    <div className="space-y-3">
      {/* 标题和统计 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Database className="w-4 h-4" />
          <span className="text-sm font-medium">数据维护</span>
          <span className="text-xs text-muted-foreground">
            港口: {ports.length} | 航线: {routes.length} | 规章: {regulations.length}
          </span>
        </div>
        <div className="flex gap-1 flex-wrap">
          <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setShowBatchModal(true)} disabled={isVectorizing}>
            <Upload className="w-3 h-3 mr-1" />批量导入
          </Button>
          <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={handleBatchVectorize} disabled={isVectorizing}>
            <Layers className="w-3 h-3 mr-1" />批量向量化
          </Button>
          <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={handleVectorizeAll} disabled={isVectorizing}>
            <Zap className="w-3 h-3 mr-1" />全部向量化
          </Button>
          {isVectorizing && (
            <Button size="sm" variant="destructive" className="h-6 text-[10px]" onClick={handleCancelVectorize}>
              <XCircle className="w-3 h-3 mr-1" />取消
            </Button>
          )}
          <Button size="sm" variant="outline" className="h-6 text-[10px]" onClick={() => setShowAddModal(true)} disabled={isVectorizing}>
            <Plus className="w-3 h-3 mr-1" />新增
          </Button>
        </div>
      </div>

      {/* 编码检索 */}
      <div className="flex gap-2">
        <Input 
          placeholder="输入港口代码或中文名检索..."
          value={searchCode}
          onChange={(e) => setSearchCode(e.target.value)}
          className="h-7 text-xs"
        />
        <Button size="sm" className="h-7 text-xs" onClick={handleSearch}>
          <Search className="w-3 h-3 mr-1" />检索
        </Button>
      </div>

      {/* 检索结果 */}
      {searchResults.length > 0 && (
        <div className="p-2 bg-muted/30 rounded text-xs">
          <div className="font-medium mb-1">检索结果:</div>
          {searchResults.map((p, i) => (
            <div key={i} className="flex items-center gap-2 py-0.5">
              <StatusIcon status={p.vector_status} />
              <span>{p.port_code}</span>
              <span className="text-muted-foreground">{p.name_cn}</span>
              <span className="text-muted-foreground">({p.vector_status})</span>
            </div>
          ))}
        </div>
      )}

      {/* 消息提示 */}
      {message && (
        <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded text-xs whitespace-pre-wrap">{message}</div>
      )}

      {/* 数据Tab */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'port' | 'route' | 'regulation' | 'chart')}>
        <TabsList className="h-7">
          <TabsTrigger value="port" className="h-6 text-xs">
            <Anchor className="w-3 h-3 mr-1" />港口数据
          </TabsTrigger>
          <TabsTrigger value="route" className="h-6 text-xs">
            <Route className="w-3 h-3 mr-1" />航线数据
          </TabsTrigger>
          <TabsTrigger value="regulation" className="h-6 text-xs">
            <BookOpen className="w-3 h-3 mr-1" />规章制度
          </TabsTrigger>
          <TabsTrigger value="chart" className="h-6 text-xs">
            <BarChart3 className="w-3 h-3 mr-1" />海图统计
          </TabsTrigger>
          <TabsTrigger value="tasks" className="h-6 text-xs">
            <Layers className="w-3 h-3 mr-1" />向量化任务
          </TabsTrigger>
        </TabsList>

        <TabsContent value="port" className="mt-2">
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="text-xs text-center py-4 text-muted-foreground">加载中...</div>
            ) : ports.length === 0 ? (
              <div className="text-xs text-center py-4 text-muted-foreground">暂无数据</div>
            ) : (
              ports.map((port) => (
                <div key={port.id} className="flex items-center justify-between p-2 bg-muted/20 rounded hover:bg-muted/40">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      checked={selectedPorts.includes(port.port_code)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedPorts([...selectedPorts, port.port_code]);
                        } else {
                          setSelectedPorts(selectedPorts.filter(p => p !== port.port_code));
                        }
                      }}
                      className="w-3 h-3"
                    />
                    <StatusIcon status={port.vector_status} />
                    <span className="text-xs font-mono">{port.port_code}</span>
                    <span className="text-xs text-muted-foreground">{port.name_cn}</span>
                    <span className="text-[10px] text-muted-foreground">({port.ctry_name_cn})</span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => handlePreview('port', port.port_code)}>
                      <Eye className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => { setSelectedItem(port); setShowEditModal(true); }}>
                      <Edit2 className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => handleVectorize('port', port)}>
                      <Database className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-500" onClick={() => handleDelete('port', port)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="route" className="mt-2">
          <div className="space-y-1 max-h-[400px] overflow-y-auto">
            {loading ? (
              <div className="text-xs text-center py-4 text-muted-foreground">加载中...</div>
            ) : routes.length === 0 ? (
              <div className="text-xs text-center py-4 text-muted-foreground">暂无数据</div>
            ) : (
              routes.map((route) => (
                <div key={route.id} className="flex items-center justify-between p-2 bg-muted/20 rounded hover:bg-muted/40">
                  <div className="flex items-center gap-2">
                    <input 
                      type="checkbox" 
                      checked={selectedRoutes.some(r => r.origPort === route.orig_port && r.destPort === route.dest_port)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedRoutes([...selectedRoutes, { origPort: route.orig_port, destPort: route.dest_port }]);
                        } else {
                          setSelectedRoutes(selectedRoutes.filter(r => !(r.origPort === route.orig_port && r.destPort === route.dest_port)));
                        }
                      }}
                      className="w-3 h-3"
                    />
                    <StatusIcon status={route.vector_status} />
                    <span className="text-xs font-mono">{route.orig_port}</span>
                    <span className="text-xs">→</span>
                    <span className="text-xs font-mono">{route.dest_port}</span>
                  </div>
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => handlePreview('route', `${route.orig_port}-${route.dest_port}`)}>
                      <Eye className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => handleVectorize('route', route)}>
                      <Database className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-500" onClick={() => handleDelete('route', route)}>
                      <Trash2 className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="regulation" className="mt-2">
          <div className="space-y-2">
            {/* 操作按钮 */}
            <div className="flex gap-2 flex-wrap">
              <Button 
                size="sm" 
                variant="outline" 
                className="h-6 text-[10px]"
                onClick={handleRegulationBatchVectorize}
                disabled={isVectorizing || selectedRegulations.length === 0}
              >
                <Database className="w-3 h-3 mr-1" />批量向量化
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-6 text-[10px]"
                onClick={() => window.location.href = '/regulations'}
              >
                <Upload className="w-3 h-3 mr-1" />上传文档
              </Button>
              {isVectorizing && (
                <Button size="sm" variant="destructive" className="h-6 text-[10px]" onClick={() => setIsVectorizing(false)}>
                  <XCircle className="w-3 h-3 mr-1" />取消
                </Button>
              )}
            </div>
            
            {/* 规章制度列表 */}
            <div className="space-y-1 max-h-[400px] overflow-y-auto">
              {loading ? (
                <div className="text-xs text-center py-4 text-muted-foreground">加载中...</div>
              ) : regulations.length === 0 ? (
                <div className="text-xs text-center py-4 text-muted-foreground">
                  暂无规章制度文档
                  <div className="mt-2">
                    <Button 
                      size="sm" 
                      variant="outline" 
                      className="h-6 text-xs"
                      onClick={() => window.location.href = '/regulations'}
                    >
                      前往上传
                    </Button>
                  </div>
                </div>
              ) : (
                regulations.map((reg) => (
                  <div key={reg.id} className="p-2 bg-muted/20 rounded hover:bg-muted/40">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <input 
                          type="checkbox" 
                          checked={selectedRegulations.includes(reg.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedRegulations([...selectedRegulations, reg.id]);
                            } else {
                              setSelectedRegulations(selectedRegulations.filter(id => id !== reg.id));
                            }
                          }}
                          className="w-3 h-3"
                        />
                        <StatusIcon status={reg.vector_status === 'success' ? '向量化成功' : reg.vector_status === 'failed' ? '向量化失败' : '未向量化'} />
                        <span className="text-xs truncate flex-1" title={reg.filename}>{reg.filename}</span>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {reg.categories.slice(0, 2).map((cat, i) => (
                          <span key={i} className="text-[10px] px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded">
                            {getCategoryLabel(cat)}
                          </span>
                        ))}
                        {!reg.is_valid && (
                          <span className="text-[10px] px-1 py-0.5 bg-red-100 dark:bg-red-900 text-red-600 rounded">失效</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <div className="text-[10px] text-muted-foreground">
                        {reg.file_size ? `${(reg.file_size / 1024).toFixed(1)}KB` : ''}
                        {reg.version && ` | v${reg.version}`}
                        {reg.publish_org && ` | ${reg.publish_org}`}
                      </div>
                      <div className="flex gap-1">
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0" title="查看切分" onClick={() => handleViewChunks(reg)}>
                          <Layers className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0" title="编辑" onClick={() => { setSelectedItem(reg); setShowRegEditModal(true); }}>
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0" title="向量化" onClick={() => handleRegulationVectorize(reg)} disabled={isVectorizing}>
                          <Database className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-500" title="删除" onClick={() => handleRegulationDelete(reg)}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </TabsContent>

        {/* 海图统计Tab */}
        <TabsContent value="chart" className="mt-2">
          <ChartTab ports={ports} routes={routes} />
        </TabsContent>
        
        {/* 向量化任务Tab */}
        <TabsContent value="tasks" className="mt-2">
          <VectorizeTasksTab />
        </TabsContent>
      </Tabs>

      {/* 预览弹窗 */}
      {showPreviewModal && selectedItem && (activeTab === 'port' || activeTab === 'route') && (
        <PreviewModal 
          item={selectedItem as PortData | RouteData} 
          type={activeTab as 'port' | 'route'}
          onClose={() => setShowPreviewModal(false)} 
        />
      )}

      {/* 切分查看弹窗 */}
      {showChunksModal && selectedItem && (
        <ChunksViewModal
          regulation={selectedItem as RegulationData}
          chunks={selectedRegulationChunks}
          onClose={() => setShowChunksModal(false)}
        />
      )}

      {/* 规章制度编辑弹窗 */}
      {showRegEditModal && selectedItem && (
        <RegulationEditModal
          regulation={selectedItem as RegulationData}
          onClose={() => setShowRegEditModal(false)}
          onSuccess={() => { setShowRegEditModal(false); loadRegulations(); setMessage(''); }}
          setMessage={setMessage}
        />
      )}

      {/* 新增弹窗 */}
      {showAddModal && (activeTab === 'port' || activeTab === 'route') && (
        <AddDataModal 
          type={activeTab} 
          onClose={() => setShowAddModal(false)} 
          onSuccess={() => { setShowAddModal(false); activeTab === 'port' ? loadPorts() : loadRoutes(); setMessage(''); }}
          setMessage={setMessage}
        />
      )}

      {/* 编辑弹窗 */}
      {showEditModal && selectedItem && (activeTab === 'port' || activeTab === 'route') && (
        <EditDataModal 
          type={activeTab} 
          data={selectedItem as unknown as Record<string, unknown>}
          onClose={() => setShowEditModal(false)} 
          onSuccess={() => { setShowEditModal(false); activeTab === 'port' ? loadPorts() : loadRoutes(); setMessage(''); }}
          setMessage={setMessage}
        />
      )}

      {/* 批量导入弹窗 */}
      {showBatchModal && (activeTab === 'port' || activeTab === 'route') && (
        <BatchImportModal 
          type={activeTab}
          onClose={() => setShowBatchModal(false)}
          onSuccess={() => { setShowBatchModal(false); activeTab === 'port' ? loadPorts() : loadRoutes(); }}
          setMessage={setMessage}
        />
      )}
    </div>
  );
}

// 新增数据弹窗
function AddDataModal({ type, onClose, onSuccess, setMessage }: { 
  type: 'port' | 'route'; 
  onClose: () => void; 
  onSuccess: () => void;
  setMessage: (m: string) => void;
}) {
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  const portFields = [
    { key: 'portCode', label: '港口代码' },
    { key: 'nameCn', label: '中文港名' },
    { key: 'ctryCode', label: '国家二码' },
    { key: 'ctryNameCn', label: '国家中文名' },
    { key: 'ctryNameEn', label: '国家英文名' },
    { key: 'namePinyin', label: '全拼音' },
    { key: 'namePy', label: '拼音简码' },
    { key: 'tzOffset', label: '时区偏移' },
    { key: 'portType', label: '港口类型' },
    { key: 'lon', label: '经度' },
    { key: 'lat', label: '纬度' },
    { key: 'continentCode', label: '大洲编码' },
    { key: 'continentNameCn', label: '大洲中文名' },
    { key: 'continentNameEn', label: '大洲英文名' }
  ];

  const routeFields = [
    { key: 'OrigPort', label: '起运港代码' },
    { key: 'DestPort', label: '目的港代码' },
    { key: 'geometry_wkt', label: '航线WKT' }
  ];

  const fields = type === 'port' ? portFields : routeFields;

  const handleSubmit = async () => {
    setLoading(true);
    const res = await fetch('/api/data-maintain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'add', type, data: formData })
    });
    const data = await res.json();
    setMessage(data.message);
    setLoading(false);
    if (data.success) onSuccess();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background p-4 rounded-lg w-[500px] max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-medium">新增{type === 'port' ? '港口' : '航线'}数据</h3>
          <Button size="sm" variant="ghost" onClick={onClose}>✕</Button>
        </div>
        <div className="space-y-2">
          {fields.map(f => (
            <div key={f.key}>
              <label className="text-xs text-muted-foreground">{f.label}</label>
              <Input 
                className="h-7 text-xs mt-0.5"
                value={formData[f.key] || ''}
                onChange={(e) => setFormData({ ...formData, [f.key]: e.target.value })}
                placeholder={f.key === 'geometry_wkt' ? 'MULTILINESTRING ((...))' : ''}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button size="sm" variant="outline" onClick={onClose} className="h-7 text-xs">取消</Button>
          <Button size="sm" onClick={handleSubmit} disabled={loading} className="h-7 text-xs">
            {loading ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// 区域分类定义
const REGIONS = [
  { key: 'global', name: '全球', range: null },
  { key: 'asia_pacific', name: '亚太', range: { lonMin: 100, lonMax: 180, latMin: -50, latMax: 60 } },
  { key: 'middle_east', name: '中东', range: { lonMin: 35, lonMax: 60, latMin: 12, latMax: 40 } },
  { key: 'red_sea_east_africa', name: '红海东非', range: { lonMin: 30, lonMax: 55, latMin: -30, latMax: 30 } },
  { key: 'west_africa', name: '西非', range: { lonMin: -20, lonMax: 20, latMin: -35, latMax: 20 } },
  { key: 'europe', name: '欧洲', range: { lonMin: -10, lonMax: 40, latMin: 35, latMax: 70 } },
  { key: 'north_america', name: '北美', range: { lonMin: -180, lonMax: -60, latMin: 25, latMax: 70 } },
  { key: 'central_south_america', name: '中南美', range: { lonMin: -120, lonMax: -30, latMin: -60, latMax: 25 } }
];

// 根据经纬度判断区域
function getRegionByCoords(lon: number, lat: number): string {
  // 检查各个区域（排除全球）
  for (const region of REGIONS) {
    if (region.range) {
      const { lonMin, lonMax, latMin, latMax } = region.range;
      // 处理跨越180度经线的情况
      if (lonMin > lonMax) {
        if ((lon >= lonMin || lon <= lonMax) && lat >= latMin && lat <= latMax) {
          return region.key;
        }
      } else {
        if (lon >= lonMin && lon <= lonMax && lat >= latMin && lat <= latMax) {
          return region.key;
        }
      }
    }
  }
  return 'global'; // 默认归入全球
}

// 海图统计Tab组件
function ChartTab({ ports, routes }: { ports: PortData[]; routes: RouteData[] }) {
  const [chartType, setChartType] = useState<'port' | 'route'>('port');
  
  // 计算各区域港口数量
  const portStats = useMemo(() => {
    const counts: Record<string, number> = {};
    REGIONS.forEach(r => counts[r.key] = 0);
    
    ports.forEach(port => {
      if (!isNaN(port.lon) && !isNaN(port.lat)) {
        const region = getRegionByCoords(port.lon, port.lat);
        counts[region]++;
      }
    });
    
    // 全球统计为所有港口总数
    counts['global'] = ports.length;
    
    return REGIONS.map(r => ({
      name: r.name,
      key: r.key,
      count: counts[r.key]
    }));
  }, [ports]);
  
  // 计算各区域航线数量（根据起点港口位置）
  const routeStats = useMemo(() => {
    const counts: Record<string, number> = {};
    REGIONS.forEach(r => counts[r.key] = 0);
    
    // 构建港口位置映射
    const portLocationMap = new Map<string, { lon: number; lat: number }>();
    ports.forEach(p => {
      portLocationMap.set(p.port_code, { lon: p.lon, lat: p.lat });
    });
    
    routes.forEach(route => {
      const origLoc = portLocationMap.get(route.orig_port);
      if (origLoc && !isNaN(origLoc.lon) && !isNaN(origLoc.lat)) {
        const region = getRegionByCoords(origLoc.lon, origLoc.lat);
        counts[region]++;
      } else {
        counts['global']++;
      }
    });
    
    // 全球统计为所有航线总数
    counts['global'] = routes.length;
    
    return REGIONS.map(r => ({
      name: r.name,
      key: r.key,
      count: counts[r.key]
    }));
  }, [routes, ports]);
  
  const currentData = chartType === 'port' ? portStats : routeStats;
  const totalCount = chartType === 'port' ? ports.length : routes.length;
  
  return (
    <div className="space-y-3">
      {/* 切换按钮 */}
      <div className="flex gap-2 items-center">
        <Button 
          size="sm" 
          variant={chartType === 'port' ? 'default' : 'outline'}
          onClick={() => setChartType('port')}
          className="h-7 text-xs"
        >
          <Anchor className="w-3 h-3 mr-1" />港口统计
        </Button>
        <Button 
          size="sm" 
          variant={chartType === 'route' ? 'default' : 'outline'}
          onClick={() => setChartType('route')}
          className="h-7 text-xs"
        >
          <Route className="w-3 h-3 mr-1" />航线统计
        </Button>
        <span className="text-xs text-muted-foreground ml-auto">
          共 {totalCount} 条{chartType === 'port' ? '港口' : '航线'}数据
        </span>
      </div>
      
      {/* 直方图 */}
      <div className="bg-muted/20 rounded-lg p-4">
        <div className="h-[300px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={currentData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e0e0e0" />
              <XAxis 
                dataKey="name" 
                tick={{ fontSize: 11 }}
                angle={-30}
                textAnchor="end"
                height={60}
              />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip 
                formatter={(value: number) => [value, chartType === 'port' ? '港口数' : '航线数']}
                labelFormatter={(label) => `区域: ${label}`}
              />
              <Bar 
                dataKey="count" 
                fill={chartType === 'port' ? '#3b82f6' : '#10b981'}
                name={chartType === 'port' ? '港口数' : '航线数'}
                radius={[4, 4, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
      
      {/* 统计表格 */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-muted">
            <tr>
              <th className="p-2 text-left">区域</th>
              <th className="p-2 text-right">{chartType === 'port' ? '港口数' : '航线数'}</th>
              <th className="p-2 text-right">占比</th>
            </tr>
          </thead>
          <tbody>
            {currentData.map((item, idx) => (
              <tr key={item.key} className={idx % 2 === 0 ? 'bg-background' : 'bg-muted/30'}>
                <td className="p-2">{item.name}</td>
                <td className="p-2 text-right font-mono">{item.count}</td>
                <td className="p-2 text-right text-muted-foreground">
                  {totalCount > 0 ? `${(item.count / totalCount * 100).toFixed(1)}%` : '0%'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      
      {/* 说明 */}
      <div className="text-[10px] text-muted-foreground">
        * 区域划分基于港口经纬度坐标，航线按起运港位置归类
      </div>
    </div>
  );
}

// 向量化任务Tab组件
interface VectorizeTask {
  id: string;
  task_type: string;
  target_id: string;
  action: string;
  status: string;
  priority: number;
  error_message?: string;
  created_at: string;
  updated_at: string;
  completed_at?: string;
}

function VectorizeTasksTab() {
  const [tasks, setTasks] = useState<VectorizeTask[]>([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [processing, setProcessing] = useState<string | null>(null);
  
  // 加载任务列表
  const loadTasks = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/data-maintain?action=tasks&status=${statusFilter}`);
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };
  
  useEffect(() => {
    loadTasks();
  }, [statusFilter]);
  
  // 处理单个任务
  const handleProcessTask = async (taskId: string) => {
    setProcessing(taskId);
    try {
      const res = await fetch(`/api/data-maintain?action=process-task&taskId=${taskId}`);
      const data = await res.json();
      if (data.success) {
        loadTasks();
      } else {
        alert(data.error || '处理失败');
      }
    } catch (e) {
      alert('处理失败');
    }
    setProcessing(null);
  };
  
  // 批量处理待处理任务
  const handleProcessAll = async () => {
    const pendingTasks = tasks.filter(t => t.status === 'pending');
    if (pendingTasks.length === 0) {
      alert('没有待处理的任务');
      return;
    }
    
    if (!confirm(`确认处理 ${pendingTasks.length} 个待处理任务？`)) return;
    
    for (const task of pendingTasks) {
      await handleProcessTask(task.id);
    }
  };
  
  // 状态颜色
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'text-yellow-600';
      case 'processing': return 'text-blue-600';
      case 'completed': return 'text-green-600';
      case 'failed': return 'text-red-600';
      default: return 'text-muted-foreground';
    }
  };
  
  // 状态文本
  const getStatusText = (status: string) => {
    switch (status) {
      case 'pending': return '待处理';
      case 'processing': return '处理中';
      case 'completed': return '已完成';
      case 'failed': return '失败';
      default: return status;
    }
  };
  
  // 操作类型文本
  const getActionText = (action: string) => {
    switch (action) {
      case 'add': return '新增';
      case 'update': return '更新';
      case 'delete': return '删除';
      default: return action;
    }
  };
  
  // 类型文本
  const getTypeText = (type: string) => {
    switch (type) {
      case 'port': return '港口';
      case 'route': return '航线';
      case 'regulation': return '规章';
      default: return type;
    }
  };
  
  // 统计
  const stats = {
    pending: tasks.filter(t => t.status === 'pending').length,
    processing: tasks.filter(t => t.status === 'processing').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    failed: tasks.filter(t => t.status === 'failed').length
  };
  
  return (
    <div className="space-y-3">
      {/* 统计信息 */}
      <div className="flex items-center gap-4 text-xs">
        <span className="text-yellow-600">待处理: {stats.pending}</span>
        <span className="text-blue-600">处理中: {stats.processing}</span>
        <span className="text-green-600">已完成: {stats.completed}</span>
        <span className="text-red-600">失败: {stats.failed}</span>
        
        <div className="ml-auto flex gap-2">
          <select 
            className="h-6 text-xs border rounded px-1"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">全部状态</option>
            <option value="pending">待处理</option>
            <option value="processing">处理中</option>
            <option value="completed">已完成</option>
            <option value="failed">失败</option>
          </select>
          <Button size="sm" className="h-6 text-xs" onClick={handleProcessAll} disabled={stats.pending === 0}>
            批量处理
          </Button>
          <Button size="sm" variant="outline" className="h-6 text-xs" onClick={loadTasks}>
            刷新
          </Button>
        </div>
      </div>
      
      {/* 任务列表 */}
      <div className="border rounded max-h-[350px] overflow-y-auto">
        {loading ? (
          <div className="text-xs text-center py-4 text-muted-foreground">加载中...</div>
        ) : tasks.length === 0 ? (
          <div className="text-xs text-center py-4 text-muted-foreground">暂无任务</div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-muted sticky top-0">
              <tr>
                <th className="p-2 text-left">类型</th>
                <th className="p-2 text-left">目标ID</th>
                <th className="p-2 text-left">操作</th>
                <th className="p-2 text-left">状态</th>
                <th className="p-2 text-left">创建时间</th>
                <th className="p-2 text-left">操作</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-t">
                  <td className="p-2">{getTypeText(task.task_type)}</td>
                  <td className="p-2 font-mono">{task.target_id}</td>
                  <td className="p-2">{getActionText(task.action)}</td>
                  <td className={`p-2 ${getStatusColor(task.status)}`}>
                    {getStatusText(task.status)}
                    {task.status === 'failed' && task.error_message && (
                      <span className="ml-1 text-red-500" title={task.error_message}>⚠️</span>
                    )}
                  </td>
                  <td className="p-2 text-muted-foreground">
                    {new Date(task.created_at).toLocaleString('zh-CN')}
                  </td>
                  <td className="p-2">
                    {task.status === 'pending' && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="h-5 text-[10px]"
                        onClick={() => handleProcessTask(task.id)}
                        disabled={processing === task.id}
                      >
                        {processing === task.id ? '处理中...' : '处理'}
                      </Button>
                    )}
                    {task.status === 'failed' && task.error_message && (
                      <span className="text-red-500" title={task.error_message}>查看错误</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// 编辑数据弹窗
function EditDataModal({ type, data, onClose, onSuccess, setMessage }: { 
  type: 'port' | 'route'; 
  data: Record<string, unknown>;
  onClose: () => void; 
  onSuccess: () => void;
  setMessage: (m: string) => void;
}) {
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);

  // 初始化表单数据
  useEffect(() => {
    if (type === 'port') {
      setFormData({
        nameCn: String(data.name_cn || ''),
        ctryCode: String(data.ctry_code || ''),
        ctryNameCn: String(data.ctry_name_cn || ''),
        ctryNameEn: String(data.ctry_name_en || ''),
        namePinyin: String(data.name_pinyin || ''),
        namePy: String(data.name_py || ''),
        tzOffset: String(data.tz_offset || ''),
        portType: String(data.port_type || ''),
        lon: String(data.lon || ''),
        lat: String(data.lat || ''),
        continentCode: String(data.continent_code || ''),
        continentNameCn: String(data.continent_name_cn || ''),
        continentNameEn: String(data.continent_name_en || '')
      });
    } else {
      setFormData({
        geometry_wkt: String(data.geometry_wkt || '')
      });
    }
  }, [type, data]);

  const handleSubmit = async () => {
    setLoading(true);
    const body = type === 'port'
      ? { action: 'edit', type: 'port', data: { portCode: String(data.port_code || ''), ...formData } }
      : { action: 'edit', type: 'route', data: { OrigPort: String(data.orig_port || ''), DestPort: String(data.dest_port || ''), geometry_wkt: formData.geometry_wkt } };
    
    const res = await fetch('/api/data-maintain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    const resp = await res.json();
    setMessage(resp.message);
    setLoading(false);
    if (resp.success) onSuccess();
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background p-4 rounded-lg w-[500px] max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-medium">编辑{type === 'port' ? '港口' : '航线'}数据</h3>
          <Button size="sm" variant="ghost" onClick={onClose}>✕</Button>
        </div>
        <div className="space-y-2">
          {type === 'port' ? (
            <>
              <div className="text-xs text-muted-foreground">港口代码: {String(data.port_code || '')} (不可修改)</div>
              {['nameCn', 'ctryCode', 'ctryNameCn', 'ctryNameEn', 'namePinyin', 'namePy', 'tzOffset', 'portType', 'lon', 'lat', 'continentCode', 'continentNameCn', 'continentNameEn'].map(f => (
                <div key={f}>
                  <label className="text-xs text-muted-foreground">{f}</label>
                  <Input 
                    className="h-7 text-xs mt-0.5"
                    value={formData[f] || ''}
                    onChange={(e) => setFormData({ ...formData, [f]: e.target.value })}
                  />
                </div>
              ))}
            </>
          ) : (
            <>
              <div className="text-xs text-muted-foreground">航线: {String(data.orig_port || '')} → {String(data.dest_port || '')} (不可修改)</div>
              <div>
                <label className="text-xs text-muted-foreground">geometry_wkt</label>
                <textarea 
                  className="w-full h-32 text-xs mt-0.5 p-2 border rounded"
                  value={formData.geometry_wkt || ''}
                  onChange={(e) => setFormData({ ...formData, geometry_wkt: e.target.value })}
                />
              </div>
            </>
          )}
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <Button size="sm" variant="outline" onClick={onClose} className="h-7 text-xs">取消</Button>
          <Button size="sm" onClick={handleSubmit} disabled={loading} className="h-7 text-xs">
            {loading ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>
    </div>
  );
}

// 批量导入弹窗
function BatchImportModal({ type, onClose, onSuccess, setMessage }: {
  type: 'port' | 'route';
  onClose: () => void;
  onSuccess: () => void;
  setMessage: (m: string) => void;
}) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [importMode, setImportMode] = useState<'json' | 'csv'>('csv');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [importedData, setImportedData] = useState<any[]>([]);
  const [showPreview, setShowPreview] = useState(false);

  // CSV文件上传处理
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // 检查文件类型
    const fileName = file.name.toLowerCase();
    const isCsv = fileName.endsWith('.csv') || file.type === 'text/csv' || file.type === 'application/vnd.ms-excel';
    if (!isCsv) {
      setMessage('❌ 请选择CSV格式文件（.csv后缀）');
      e.target.value = '';
      return;
    }
    
    // 检查文件大小（限制10MB）
    if (file.size > 10 * 1024 * 1024) {
      setMessage('❌ 文件过大，请选择小于10MB的文件');
      e.target.value = '';
      return;
    }
    
    setLoading(true);
    setMessage(`正在读取文件 (${(file.size / 1024).toFixed(1)}KB)...`);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);
      
      const res = await fetch('/api/data-maintain/csv-import', {
        method: 'POST',
        body: formData
      });
      
      // 先检查响应是否正常
      if (!res.ok) {
        const text = await res.text();
        console.error('API响应错误:', res.status, text);
        setMessage(`❌ 导入失败: HTTP ${res.status} - ${text.substring(0, 100)}`);
        setLoading(false);
        e.target.value = '';
        return;
      }
      
      // 先读取文本再解析JSON，便于调试
      const responseText = await res.text();
      let data;
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        console.error('JSON解析错误, 响应内容:', responseText.substring(0, 200));
        setMessage(`❌ 响应解析失败: ${responseText.substring(0, 100)}`);
        setLoading(false);
        e.target.value = '';
        return;
      }
      
      if (data.success) {
        setMessage(`✅ ${data.message}`);
        // 显示导入的数据预览
        if (data.data && data.data.length > 0) {
          setImportedData(data.data);
          setShowPreview(true);
        }
        onSuccess();
      } else {
        setMessage(`❌ ${data.error || '导入失败'}`);
      }
    } catch (err) {
      setMessage(`❌ 文件上传失败: ${err instanceof Error ? err.message : '网络错误'}`);
    }
    setLoading(false);
    // 清空文件输入
    e.target.value = '';
  };

  const handleImport = async () => {
    setLoading(true);
    try {
      const items = JSON.parse(text);
      const res = await fetch('/api/data-maintain', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'batchImport', type, data: items })
      });
      const data = await res.json();
      setMessage(`批量导入完成: 成功${data.summary?.succeeded || 0}条, 失败${data.summary?.failed || 0}条`);
      if (data.success) onSuccess();
    } catch (e) {
      setMessage('JSON格式错误');
    }
    setLoading(false);
  };

  const examplePort = `[
  {
    "portCode": "CNSHA",
    "nameCn": "上海",
    "ctryCode": "CN",
    "ctryNameCn": "中国",
    "ctryNameEn": "China",
    "namePinyin": "SHANGHAI",
    "namePy": "SH",
    "tzOffset": 8,
    "portType": "B",
    "lon": 121.4737,
    "lat": 31.2304,
    "continentCode": "AS",
    "continentNameCn": "亚洲",
    "continentNameEn": "Asia"
  }
]`;

  const exampleRoute = `[
  {
    "OrigPort": "CNSHA",
    "DestPort": "SGSIN",
    "geometry_wkt": "MULTILINESTRING ((121.47 31.23, 120.5 30.0, ...))"
  }
]`;

  const csvFieldsInfo = type === 'port' 
    ? 'portCode, nameCn, ctryCode, ctryNameCn, ctryNameEn, namePinyin, namePy, tzOffset, portType, lon, lat, continentCode, continentNameCn, continentNameEn'
    : 'origPort, destPort, geometryWkt';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background p-4 rounded-lg w-[600px] max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-medium">批量导入{type === 'port' ? '港口' : '航线'}数据</h3>
          <Button size="sm" variant="ghost" onClick={onClose}>✕</Button>
        </div>
        
        {/* 导入模式切换 */}
        <div className="flex gap-2 mb-3">
          <Button 
            size="sm" 
            variant={importMode === 'csv' ? 'default' : 'outline'}
            onClick={() => setImportMode('csv')}
            className="h-7 text-xs"
          >
            <Upload className="w-3 h-3 mr-1" />CSV文件导入
          </Button>
          <Button 
            size="sm" 
            variant={importMode === 'json' ? 'default' : 'outline'}
            onClick={() => setImportMode('json')}
            className="h-7 text-xs"
          >
            JSON文本导入
          </Button>
        </div>

        {importMode === 'csv' ? (
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">
              <p className="mb-2">支持CSV格式文件，字段包括：</p>
              <code className="bg-muted p-2 rounded text-[10px] block overflow-x-auto">
                {csvFieldsInfo}
              </code>
            </div>
            <div className="border-2 border-dashed rounded-lg p-6 text-center">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv,application/vnd.ms-excel,text/plain"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button 
                onClick={() => fileInputRef.current?.click()}
                disabled={loading}
                className="mb-2"
              >
                <Upload className="w-4 h-4 mr-2" />
                {loading ? '导入中...' : '选择CSV文件'}
              </Button>
              <p className="text-xs text-muted-foreground mt-2">
                点击按钮选择CSV文件上传
              </p>
              <p className="text-[10px] text-orange-500 mt-1">
                * 如无法选择文件，请尝试在文件管理器中将文件重命名为.csv后缀
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="text-xs text-muted-foreground mb-2">
              粘贴JSON数组格式数据，示例：<br/>
              <pre className="bg-muted p-2 rounded mt-1 text-[10px] overflow-x-auto">
                {type === 'port' ? examplePort : exampleRoute}
              </pre>
            </div>
            <textarea 
              className="w-full h-48 text-xs p-2 border rounded font-mono"
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="粘贴JSON数组..."
            />
          </>
        )}
        
        <div className="flex justify-end gap-2 mt-4">
          <Button size="sm" variant="outline" onClick={onClose} className="h-7 text-xs">取消</Button>
          {importMode === 'json' && (
            <Button size="sm" onClick={handleImport} disabled={loading} className="h-7 text-xs">
              {loading ? '导入中...' : '导入'}
            </Button>
          )}
        </div>
        
        {/* 数据预览弹窗 */}
        {showPreview && importedData.length > 0 && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60]" style={{position: 'fixed'}}>
            <div className="bg-background p-4 rounded-lg w-[700px] max-h-[85vh] overflow-hidden flex flex-col">
              <div className="flex justify-between items-center mb-3">
                <h3 className="text-sm font-medium text-green-600">
                  ✅ 成功导入 {importedData.length} 条数据
                </h3>
                <Button size="sm" variant="ghost" onClick={() => { setShowPreview(false); onClose(); }}>✕</Button>
              </div>
              <div className="flex-1 overflow-auto border rounded">
                <table className="w-full text-xs">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="p-2 text-left w-8">#</th>
                      {type === 'port' ? (
                        <>
                          <th className="p-2 text-left">港口代码</th>
                          <th className="p-2 text-left">名称</th>
                          <th className="p-2 text-left">国家</th>
                          <th className="p-2 text-left">类型</th>
                          <th className="p-2 text-left">经度</th>
                          <th className="p-2 text-left">纬度</th>
                        </>
                      ) : (
                        <>
                          <th className="p-2 text-left">起始港</th>
                          <th className="p-2 text-left">目的港</th>
                          <th className="p-2 text-left">航线</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {importedData.slice(0, 100).map((item, idx) => (
                      <tr key={idx} className="border-t hover:bg-muted/50">
                        <td className="p-2 text-muted-foreground">{idx + 1}</td>
                        {type === 'port' ? (
                          <>
                            <td className="p-2 font-mono">{item.port_code || item.portCode}</td>
                            <td className="p-2">{item.name_cn || item.nameCn}</td>
                            <td className="p-2">{item.ctry_name_cn || item.ctryNameCn}</td>
                            <td className="p-2">{item.port_type || item.portType}</td>
                            <td className="p-2">{item.lon}</td>
                            <td className="p-2">{item.lat}</td>
                          </>
                        ) : (
                          <>
                            <td className="p-2 font-mono">{item.orig_port || item.origPort}</td>
                            <td className="p-2 font-mono">{item.dest_port || item.destPort}</td>
                            <td className="p-2 truncate max-w-[200px]">{(item.geometry_wkt || item.geometryWkt || '').substring(0, 50)}...</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {importedData.length > 100 && (
                  <div className="p-2 text-center text-xs text-muted-foreground bg-muted">
                    仅显示前100条，共 {importedData.length} 条
                  </div>
                )}
              </div>
              <div className="flex justify-end mt-3">
                <Button size="sm" onClick={() => { setShowPreview(false); onClose(); }} className="h-7 text-xs">
                  确定
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// WKT解析函数：解析MULTILINESTRING格式
function parseWKT(wkt: string): [number, number][][] {
  if (!wkt || typeof wkt !== 'string') return [];
  
  // 匹配 MULTILINESTRING ((lon lat, lon lat, ...), (lon lat, ...))
  const multilineMatch = wkt.match(/MULTILINESTRING\s*\(\s*\((.+?)\)\s*\)/i);
  if (multilineMatch) {
    const coordsStr = multilineMatch[1];
    const coords = coordsStr.split(',').map(pair => {
      const parts = pair.trim().split(/\s+/);
      const lon = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      return [lon, lat] as [number, number];
    }).filter(([lon, lat]) => !isNaN(lon) && !isNaN(lat));
    return [coords];
  }
  
  // 匹配 LINESTRING (lon lat, lon lat, ...)
  const lineMatch = wkt.match(/LINESTRING\s*\((.+?)\)/i);
  if (lineMatch) {
    const coordsStr = lineMatch[1];
    const coords = coordsStr.split(',').map(pair => {
      const parts = pair.trim().split(/\s+/);
      const lon = parseFloat(parts[0]);
      const lat = parseFloat(parts[1]);
      return [lon, lat] as [number, number];
    }).filter(([lon, lat]) => !isNaN(lon) && !isNaN(lat));
    return [coords];
  }
  
  // 匹配多重线 MULTILINESTRING ((...), (...))
  const multiMatch = wkt.match(/MULTILINESTRING\s*\(\s*(.+?)\s*\)/i);
  if (multiMatch) {
    const linesStr = multiMatch[1];
    const lines: [number, number][][] = [];
    // 使用正则匹配每个括号内的内容
    const lineMatches = linesStr.match(/\([^()]+\)/g);
    if (lineMatches) {
      for (const lineMatch of lineMatches) {
        const coordsStr = lineMatch.slice(1, -1); // 去掉括号
        const coords = coordsStr.split(',').map(pair => {
          const parts = pair.trim().split(/\s+/);
          const lon = parseFloat(parts[0]);
          const lat = parseFloat(parts[1]);
          return [lon, lat] as [number, number];
        }).filter(([lon, lat]) => !isNaN(lon) && !isNaN(lat));
        if (coords.length > 0) lines.push(coords);
      }
    }
    return lines;
  }
  
  return [];
}

// 预览弹窗组件（带Tab切换和海图显示）
function PreviewModal({ item, type, onClose }: {
  item: PortData | RouteData;
  type: 'port' | 'route';
  onClose: () => void;
}) {
  const [previewTab, setPreviewTab] = useState<'content' | 'map'>('content');
  const [isClient, setIsClient] = useState(false);
  
  useEffect(() => {
    setIsClient(true);
  }, []);

  // 判断是否有有效的坐标数据
  const hasCoordinates = useMemo(() => {
    if (type === 'port') {
      const port = item as PortData;
      return !isNaN(port.lon) && !isNaN(port.lat) && 
             port.lon !== 0 && port.lat !== 0;
    } else {
      const route = item as RouteData;
      const lines = parseWKT(route.geometry_wkt || '');
      return lines.length > 0 && lines.some(line => line.length > 0);
    }
  }, [item, type]);

  // 获取地图中心点
  const mapCenter = useMemo((): [number, number] => {
    if (type === 'port') {
      const port = item as PortData;
      return [port.lat || 0, port.lon || 0];
    } else {
      const route = item as RouteData;
      const lines = parseWKT(route.geometry_wkt || '');
      if (lines.length > 0 && lines[0].length > 0) {
        // 计算所有点的中心
        const allPoints = lines.flat();
        const avgLat = allPoints.reduce((sum, [_, lat]) => sum + lat, 0) / allPoints.length;
        const avgLon = allPoints.reduce((sum, [lon, _]) => sum + lon, 0) / allPoints.length;
        return [avgLat, avgLon];
      }
      return [0, 0];
    }
  }, [item, type]);

  // 解析航线
  const routeLines = useMemo(() => {
    if (type === 'route') {
      return parseWKT((item as RouteData).geometry_wkt || '');
    }
    return [];
  }, [item, type]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background p-4 rounded-lg w-[800px] max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-3 pb-2 border-b">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-medium">
              {type === 'port' ? '港口预览' : '航线预览'}
            </h3>
            <Tabs value={previewTab} onValueChange={(v) => setPreviewTab(v as 'content' | 'map')}>
              <TabsList className="h-6">
                <TabsTrigger value="content" className="h-5 text-xs px-2">
                  <FileText className="w-3 h-3 mr-1" />当前内容
                </TabsTrigger>
                <TabsTrigger value="map" className="h-5 text-xs px-2" disabled={!hasCoordinates}>
                  <MapIcon className="w-3 h-3 mr-1" />预览海图
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <Button size="sm" variant="ghost" onClick={onClose}>✕</Button>
        </div>
        
        <div className="flex-1 overflow-auto min-h-[400px]">
          {previewTab === 'content' ? (
            <div className="bg-muted p-3 rounded">
              <pre className="text-xs overflow-x-auto whitespace-pre-wrap">{JSON.stringify(item, null, 2)}</pre>
            </div>
          ) : (
            <div className="h-[500px] rounded overflow-hidden border">
              {isClient && hasCoordinates ? (
                <MapContainer
                  center={mapCenter}
                  zoom={type === 'port' ? 8 : 4}
                  style={{ height: '100%', width: '100%' }}
                  scrollWheelZoom={true}
                >
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  {type === 'port' && (
                    <Marker position={mapCenter}>
                      <Popup>
                        <div className="text-xs">
                          <div className="font-bold">{(item as PortData).name_cn}</div>
                          <div>{(item as PortData).port_code}</div>
                          <div>{(item as PortData).ctry_name_cn}</div>
                          <div>经度: {(item as PortData).lon?.toFixed(4)}</div>
                          <div>纬度: {(item as PortData).lat?.toFixed(4)}</div>
                        </div>
                      </Popup>
                    </Marker>
                  )}
                  {type === 'route' && routeLines.map((line, idx) => (
                    <Polyline 
                      key={idx}
                      positions={line.map(([lon, lat]) => [lat, lon])}
                      color={idx === 0 ? '#2563eb' : '#16a34a'}
                      weight={3}
                    />
                  ))}
                  {type === 'route' && routeLines.length > 0 && routeLines[0].length > 0 && (
                    <>
                      {/* 起点 */}
                      <Marker position={[routeLines[0][0][1], routeLines[0][0][0]]}>
                        <Popup>
                          <div className="text-xs">
                            <div className="font-bold text-green-600">起点</div>
                            <div>{(item as RouteData).orig_port}</div>
                          </div>
                        </Popup>
                      </Marker>
                      {/* 终点 */}
                      <Marker position={[routeLines[0][routeLines[0].length - 1][1], routeLines[0][routeLines[0].length - 1][0]]}>
                        <Popup>
                          <div className="text-xs">
                            <div className="font-bold text-red-600">终点</div>
                            <div>{(item as RouteData).dest_port}</div>
                          </div>
                        </Popup>
                      </Marker>
                    </>
                  )}
                </MapContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                  {!hasCoordinates ? '暂无有效坐标数据' : '地图加载中...'}
                </div>
              )}
            </div>
          )}
        </div>
        
        {previewTab === 'map' && type === 'route' && (
          <div className="mt-2 text-xs text-muted-foreground flex items-center gap-4">
            <span>航线: {(item as RouteData).orig_port} → {(item as RouteData).dest_port}</span>
            <span>航点数: {routeLines.flat().length}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// 切分查看弹窗
function ChunksViewModal({ regulation, chunks, onClose }: {
  regulation: RegulationData;
  chunks: RegulationChunk[];
  onClose: () => void;
}) {
  const [selectedChunk, setSelectedChunk] = useState<RegulationChunk | null>(null);
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background p-4 rounded-lg w-[900px] max-h-[85vh] overflow-hidden flex flex-col">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-medium">
            文档切分查看: {regulation.filename}
            <span className="ml-2 text-xs text-muted-foreground">共 {chunks.length} 个切分</span>
          </h3>
          <Button size="sm" variant="ghost" onClick={onClose}>✕</Button>
        </div>
        
        <div className="flex gap-3 flex-1 overflow-hidden">
          {/* 切分列表 */}
          <div className="w-1/3 border rounded overflow-y-auto">
            <div className="p-2 bg-muted text-xs font-medium">切分列表</div>
            <div className="divide-y">
              {chunks.length === 0 ? (
                <div className="p-4 text-xs text-center text-muted-foreground">暂无切分数据</div>
              ) : (
                chunks.map((chunk, idx) => (
                  <div 
                    key={chunk.id}
                    className={`p-2 cursor-pointer hover:bg-muted/50 ${selectedChunk?.id === chunk.id ? 'bg-blue-50 dark:bg-blue-950' : ''}`}
                    onClick={() => setSelectedChunk(chunk)}
                  >
                    <div className="text-xs font-medium">切分 #{chunk.chunk_index + 1}</div>
                    <div className="text-[10px] text-muted-foreground truncate mt-0.5">
                      {chunk.content.substring(0, 60)}...
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5">
                      字数: {chunk.content.length}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
          
          {/* 切分内容 */}
          <div className="flex-1 border rounded overflow-hidden flex flex-col">
            <div className="p-2 bg-muted text-xs font-medium">切分内容</div>
            <div className="flex-1 overflow-y-auto p-3">
              {selectedChunk ? (
                <div>
                  <div className="text-xs text-muted-foreground mb-2">
                    切分 #{selectedChunk.chunk_index + 1} | 字数: {selectedChunk.content.length}
                  </div>
                  {selectedChunk.metadata && (
                    <div className="text-[10px] bg-muted p-2 rounded mb-2">
                      <div className="font-medium mb-1">元数据:</div>
                      <pre className="whitespace-pre-wrap">{JSON.stringify(selectedChunk.metadata, null, 2)}</pre>
                    </div>
                  )}
                  <div className="text-xs whitespace-pre-wrap border-t pt-2">
                    {selectedChunk.content}
                  </div>
                </div>
              ) : (
                <div className="text-xs text-center text-muted-foreground py-8">
                  点击左侧切分查看详细内容
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// 规章制度编辑弹窗
function RegulationEditModal({ regulation, onClose, onSuccess, setMessage }: {
  regulation: RegulationData;
  onClose: () => void;
  onSuccess: () => void;
  setMessage: (m: string) => void;
}) {
  const [formData, setFormData] = useState({
    categories: regulation.categories || [],
    is_valid: regulation.is_valid,
    version: regulation.version || '',
    publish_date: regulation.publish_date || '',
    publish_org: regulation.publish_org || '',
    description: regulation.description || ''
  });
  const [loading, setLoading] = useState(false);
  
  const CATEGORY_OPTIONS = [
    { key: 'maritime_rules', label: '海事规章制度' },
    { key: 'platform_ops', label: '平台运维规范' },
    { key: 'trajectory_annotation', label: '航迹标注准则' },
    { key: 'model_training', label: '模型训练管理办法' },
    { key: 'other', label: '其他资料' }
  ];
  
  const handleSubmit = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/regulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          id: regulation.id,
          ...formData
        })
      });
      const data = await res.json();
      if (data.error) {
        setMessage(`❌ ${data.error}`);
      } else {
        setMessage('✅ 更新成功');
        onSuccess();
      }
    } catch (e) {
      setMessage('更新失败');
    }
    setLoading(false);
  };
  
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-background p-4 rounded-lg w-[500px] max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-sm font-medium">编辑规章制度</h3>
          <Button size="sm" variant="ghost" onClick={onClose}>✕</Button>
        </div>
        
        <div className="space-y-3">
          <div className="text-xs text-muted-foreground">
            文件名: {regulation.filename} (不可修改)
          </div>
          
          {/* 分类选择 */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">文档分类</label>
            <div className="flex flex-wrap gap-2">
              {CATEGORY_OPTIONS.map(opt => (
                <label key={opt.key} className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={formData.categories.includes(opt.key)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setFormData({ ...formData, categories: [...formData.categories, opt.key] });
                      } else {
                        setFormData({ ...formData, categories: formData.categories.filter(c => c !== opt.key) });
                      }
                    }}
                    className="w-3 h-3"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>
          
          {/* 生效状态 */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">生效状态</label>
            <label className="flex items-center gap-2 text-xs">
              <input
                type="checkbox"
                checked={formData.is_valid}
                onChange={(e) => setFormData({ ...formData, is_valid: e.target.checked })}
                className="w-3 h-3"
              />
              有效
            </label>
          </div>
          
          {/* 版本 */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">版本号</label>
            <Input
              className="h-7 text-xs"
              value={formData.version}
              onChange={(e) => setFormData({ ...formData, version: e.target.value })}
              placeholder="如: 1.0"
            />
          </div>
          
          {/* 发布日期 */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">发布日期</label>
            <Input
              className="h-7 text-xs"
              type="date"
              value={formData.publish_date}
              onChange={(e) => setFormData({ ...formData, publish_date: e.target.value })}
            />
          </div>
          
          {/* 发布机构 */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">发布机构</label>
            <Input
              className="h-7 text-xs"
              value={formData.publish_org}
              onChange={(e) => setFormData({ ...formData, publish_org: e.target.value })}
              placeholder="如: 交通运输部"
            />
          </div>
          
          {/* 描述 */}
          <div>
            <label className="text-xs text-muted-foreground block mb-1">描述</label>
            <textarea
              className="w-full h-20 text-xs p-2 border rounded"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="文档描述..."
            />
          </div>
        </div>
        
        <div className="flex justify-end gap-2 mt-4">
          <Button size="sm" variant="outline" onClick={onClose} className="h-7 text-xs">取消</Button>
          <Button size="sm" onClick={handleSubmit} disabled={loading} className="h-7 text-xs">
            {loading ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>
    </div>
  );
}
