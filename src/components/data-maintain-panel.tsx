'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Plus, Edit2, Trash2, Eye, Database, Search, Upload, 
  CheckCircle, XCircle, Clock, FileText, Route, Anchor, BookOpen, ExternalLink,
  Layers, Zap
} from 'lucide-react';

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

export function DataMaintainPanel() {
  const [activeTab, setActiveTab] = useState<'port' | 'route' | 'regulation'>('port');
  const [ports, setPorts] = useState<PortData[]>([]);
  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [regulations, setRegulations] = useState<{id: string; name: string; categories: string[]; is_valid: boolean; vector_status: string}[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchCode, setSearchCode] = useState('');
  const [searchResults, setSearchResults] = useState<PortData[]>([]);
  
  // 弹窗状态
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState<PortData | RouteData | null>(null);
  const [message, setMessage] = useState<string>('');
  // 批量选中状态
  const [selectedPorts, setSelectedPorts] = useState<string[]>([]);
  const [selectedRoutes, setSelectedRoutes] = useState<{origPort: string, destPort: string}[]>([]);
  // 向量化状态
  const [isVectorizing, setIsVectorizing] = useState(false);
  const [vectorizeProgress, setVectorizeProgress] = useState({ current: 0, total: 0 });

  // 加载数据
  const loadPorts = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/data-maintain?action=list&type=port');
      const data = await res.json();
      setPorts(data.items || []);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const loadRoutes = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/data-maintain?action=list&type=route');
      const data = await res.json();
      setRoutes(data.items || []);
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
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'port' | 'route' | 'regulation')}>
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
            {/* 快速跳转按钮 */}
            <div className="flex gap-2">
              <Button 
                size="sm" 
                variant="outline" 
                className="h-7 text-xs flex-1"
                onClick={() => window.location.href = '/regulations'}
              >
                <ExternalLink className="w-3 h-3 mr-1" />
                打开规章制度管理
              </Button>
            </div>
            
            {/* 规章制度列表 */}
            <div className="space-y-1 max-h-[350px] overflow-y-auto">
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
                  <div key={reg.id} className="flex items-center justify-between p-2 bg-muted/20 rounded hover:bg-muted/40">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <StatusIcon status={reg.vector_status === 'success' ? '向量化成功' : reg.vector_status === 'failed' ? '向量化失败' : '未向量化'} />
                      <span className="text-xs truncate flex-1">{reg.name}</span>
                      <div className="flex gap-1 flex-shrink-0">
                        {reg.categories.slice(0, 2).map((cat, i) => (
                          <span key={i} className="text-[10px] px-1 py-0.5 bg-blue-100 dark:bg-blue-900 rounded">
                            {cat === 'maritime_rules' ? '海事' : cat === 'platform_ops' ? '运维' : cat === 'trajectory_annotation' ? '标注' : cat === 'model_training' ? '训练' : '其他'}
                          </span>
                        ))}
                      </div>
                      {!reg.is_valid && (
                        <span className="text-[10px] px-1 py-0.5 bg-red-100 dark:bg-red-900 text-red-600 rounded">失效</span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* 预览弹窗 */}
      {showPreviewModal && selectedItem && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background p-4 rounded-lg max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-medium">数据预览</h3>
              <Button size="sm" variant="ghost" onClick={() => setShowPreviewModal(false)}>✕</Button>
            </div>
            <pre className="text-xs bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(selectedItem, null, 2)}
            </pre>
          </div>
        </div>
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
    
    setLoading(true);
    setMessage('正在读取文件...');
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('type', type);
      
      const res = await fetch('/api/data-maintain/csv-import', {
        method: 'POST',
        body: formData
      });
      const data = await res.json();
      
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
