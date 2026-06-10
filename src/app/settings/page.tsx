'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Settings, MapPin, AlertTriangle, Database, RefreshCw, 
  Plus, Trash2, Edit, Search, Download
} from 'lucide-react';
import Link from 'next/link';

// 类型定义
interface PortMapping {
  id: string;
  alias_name: string;
  standard_name: string;
  port_code: string | null;
  country: string | null;
}

interface AnomalyItem {
  id: string;
  trajectory_id: string;
  segment_id: string;
  anomaly_type: string;
  confidence: number;
}

export default function GlobalSettingsPage() {
  const [mappings, setMappings] = useState<PortMapping[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  
  // 新映射表单
  const [newAlias, setNewAlias] = useState('');
  const [newStandard, setNewStandard] = useState('');
  const [newCode, setNewCode] = useState('');
  const [newCountry, setNewCountry] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [mappingRes, anomalyRes] = await Promise.all([
        fetch('/api/settings/port-mappings'),
        fetch('/api/trajectory/training/anomalies'),
      ]);
      
      if (mappingRes.ok) {
        const data = await mappingRes.json();
        setMappings(data.mappings || []);
      }
      
      if (anomalyRes.ok) {
        const data = await anomalyRes.json();
        setAnomalies(data.anomalies || []);
      }
    } catch (error) {
      console.error('加载失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const addMapping = async () => {
    if (!newAlias || !newStandard) return;
    
    try {
      const res = await fetch('/api/settings/port-mappings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alias_name: newAlias,
          standard_name: newStandard,
          port_code: newCode || null,
          country: newCountry || null,
        }),
      });
      
      if (res.ok) {
        setNewAlias('');
        setNewStandard('');
        setNewCode('');
        setNewCountry('');
        loadData();
      }
    } catch (error) {
      alert('添加失败');
    }
  };

  const deleteMapping = async (id: string) => {
    if (!confirm('确定删除此映射？')) return;
    
    try {
      await fetch(`/api/settings/port-mappings/${id}`, { method: 'DELETE' });
      loadData();
    } catch (error) {
      alert('删除失败');
    }
  };

  const filteredMappings = mappings.filter(m => 
    m.alias_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    m.standard_name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* 标题 */}
        <div className="flex items-center justify-between">
          <div>
            <a href="/" className="hover:opacity-80 transition-opacity"><h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Settings className="w-7 h-7 text-gray-600" />
              系统设置
            </h1></a>
            <p className="text-gray-500 mt-1">
              港口地名归一化、异常数据归集
            </p>
          </div>
          <Button variant="outline" onClick={loadData}>
            <RefreshCw className="w-4 h-4 mr-2" />
            刷新
          </Button>
        </div>

        {/* 快捷卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <MapPin className="w-8 h-8 text-blue-500" />
                <div>
                  <div className="text-2xl font-bold">{mappings.length}</div>
                  <div className="text-sm text-gray-500">港口别名映射</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <AlertTriangle className="w-8 h-8 text-orange-500" />
                <div>
                  <div className="text-2xl font-bold">{anomalies.length}</div>
                  <div className="text-sm text-gray-500">异常数据</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                <Database className="w-8 h-8 text-green-500" />
                <div>
                  <div className="text-2xl font-bold">3</div>
                  <div className="text-sm text-gray-500">数据来源</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="port-mapping">
          <TabsList>
            <TabsTrigger value="port-mapping">地名归一化</TabsTrigger>
            <TabsTrigger value="anomalies">异常归集</TabsTrigger>
            <TabsTrigger value="sources">数据来源</TabsTrigger>
          </TabsList>

          {/* 地名归一化 */}
          <TabsContent value="port-mapping" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>港口名称别名映射</CardTitle>
                <CardDescription>
                  将不同写法的港口名称统一映射到标准名称
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* 搜索和添加 */}
                <div className="flex flex-col md:flex-row gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <Input
                      placeholder="搜索别名或标准名称..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>
                
                {/* 添加新映射 */}
                <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                  <Input
                    placeholder="别名"
                    value={newAlias}
                    onChange={(e) => setNewAlias(e.target.value)}
                  />
                  <Input
                    placeholder="标准名称"
                    value={newStandard}
                    onChange={(e) => setNewStandard(e.target.value)}
                  />
                  <Input
                    placeholder="港口代码"
                    value={newCode}
                    onChange={(e) => setNewCode(e.target.value)}
                  />
                  <Input
                    placeholder="国家"
                    value={newCountry}
                    onChange={(e) => setNewCountry(e.target.value)}
                  />
                  <Button onClick={addMapping} className="w-full">
                    <Plus className="w-4 h-4 mr-2" />
                    添加
                  </Button>
                </div>

                {/* 映射列表 */}
                <div className="border rounded-lg divide-y">
                  {filteredMappings.map((m) => (
                    <div 
                      key={m.id}
                      className="flex items-center justify-between p-3"
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-medium">{m.alias_name}</span>
                        <span className="text-gray-400">→</span>
                        <span className="text-blue-600">{m.standard_name}</span>
                        {m.port_code && (
                          <Badge variant="outline" className="text-xs">
                            {m.port_code}
                          </Badge>
                        )}
                        {m.country && (
                          <Badge variant="secondary" className="text-xs">
                            {m.country}
                          </Badge>
                        )}
                      </div>
                      <Button 
                        size="sm" 
                        variant="ghost"
                        onClick={() => deleteMapping(m.id)}
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </Button>
                    </div>
                  ))}
                  {filteredMappings.length === 0 && (
                    <div className="p-4 text-center text-gray-500">
                      暂无映射数据
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 异常归集 */}
          <TabsContent value="anomalies" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>异常数据归集</CardTitle>
                    <CardDescription>
                      置信度低、预测错误、格式异常的数据
                    </CardDescription>
                  </div>
                  <Link href="/segment-label">
                    <Button>
                      一键跳转标注
                    </Button>
                  </Link>
                </div>
              </CardHeader>
              <CardContent>
                {anomalies.length === 0 ? (
                  <div className="text-center py-8 text-gray-500">
                    暂无异常数据
                  </div>
                ) : (
                  <div className="space-y-2">
                    {anomalies.map((a) => (
                      <div 
                        key={a.id}
                        className="flex items-center justify-between p-3 bg-orange-50 rounded-lg"
                      >
                        <div>
                          <span className="font-mono">{a.segment_id}</span>
                          <Badge variant="outline" className="ml-2">
                            {a.anomaly_type}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="destructive">
                            {(a.confidence * 100).toFixed(0)}%
                          </Badge>
                          <Link href={`/segment-label?trajectory=${a.trajectory_id}`}>
                            <Button size="sm" variant="outline">
                              标注
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 数据来源 */}
          <TabsContent value="sources" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle>数据来源分类</CardTitle>
                <CardDescription>
                  航迹数据按来源分集合存储
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="border-blue-200 bg-blue-50">
                    <CardContent className="pt-4">
                      <h3 className="font-medium text-blue-700">导入数据</h3>
                      <p className="text-sm text-blue-600 mt-1">
                        CSV/Excel 批量导入的航迹
                      </p>
                      <div className="mt-2">
                        <Badge variant="secondary">WKT 航线</Badge>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="border-green-200 bg-green-50">
                    <CardContent className="pt-4">
                      <h3 className="font-medium text-green-700">标注数据</h3>
                      <p className="text-sm text-green-600 mt-1">
                        海图手绘、标点标注的航迹
                      </p>
                      <div className="mt-2">
                        <Badge variant="secondary">GeoJSON</Badge>
                      </div>
                    </CardContent>
                  </Card>
                  
                  <Card className="border-purple-200 bg-purple-50">
                    <CardContent className="pt-4">
                      <h3 className="font-medium text-purple-700">推理数据</h3>
                      <p className="text-sm text-purple-600 mt-1">
                        AI 自动预测标签的航迹
                      </p>
                      <div className="mt-2">
                        <Badge variant="secondary">自动分类</Badge>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 底部链接 */}
        <div className="flex gap-4 justify-center text-sm text-gray-500">
          <Link href="/trajectory" className="hover:text-gray-700">航迹检索</Link>
          <Link href="/sea-chart" className="hover:text-gray-700">海图可视化</Link>
          <Link href="/trajectory-inference" className="hover:text-gray-700">分类推理</Link>
        </div>
      </div>
    </div>
  );
}
