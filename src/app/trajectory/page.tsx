'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Search, Loader2, MapPin, Navigation } from 'lucide-react';

interface Trajectory {
  id: string;
  segment_id: string;
  start_port: string;
  end_port: string;
  wkt_route: string;
  sea_area: string;
  segment_attrs: any;
  ai_description: string;
  bounds_min_lng: number;
  bounds_max_lng: number;
  bounds_min_lat: number;
  bounds_max_lat: number;
  source_file: string;
  similarity?: number;
}

export default function TrajectorySearchPage() {
  const [query, setQuery] = useState('');
  const [startPort, setStartPort] = useState('');
  const [endPort, setEndPort] = useState('');
  const [seaArea, setSeaArea] = useState('');
  const [behavior, setBehavior] = useState('');
  const [intent, setIntent] = useState('');
  const [minLng, setMinLng] = useState('');
  const [maxLng, setMaxLng] = useState('');
  const [minLat, setMinLat] = useState('');
  const [maxLat, setMaxLat] = useState('');
  
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState<Trajectory[]>([]);
  const [selectedTrajectory, setSelectedTrajectory] = useState<Trajectory | null>(null);
  
  // 向量化状态
  const [embedStatus, setEmbedStatus] = useState({ total: 0, embedded: 0, pending: 0 });
  const [embedding, setEmbedding] = useState(false);

  useEffect(() => {
    fetchEmbedStatus();
  }, []);

  const fetchEmbedStatus = async () => {
    try {
      const res = await fetch('/api/trajectory/embed');
      const data = await res.json();
      setEmbedStatus({
        total: data.total || 0,
        embedded: data.embedded || 0,
        pending: data.pending || 0,
      });
    } catch (error) {
      console.error('获取状态失败:', error);
    }
  };

  const handleSearch = async () => {
    setSearching(true);
    try {
      const body: any = { limit: 20, threshold: 0.5 };
      
      if (query.trim()) body.query = query;
      if (startPort.trim()) body.startPort = startPort;
      if (endPort.trim()) body.endPort = endPort;
      if (seaArea.trim()) body.seaArea = seaArea;
      if (behavior) body.behavior = behavior;
      if (intent) body.intent = intent;
      if (minLng) body.minLng = parseFloat(minLng);
      if (maxLng) body.maxLng = parseFloat(maxLng);
      if (minLat) body.minLat = parseFloat(minLat);
      if (maxLat) body.maxLat = parseFloat(maxLat);
      
      const res = await fetch('/api/trajectory/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      
      const data = await res.json();
      setResults(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error('检索失败:', error);
    }
    setSearching(false);
  };

  const handleEmbed = async () => {
    setEmbedding(true);
    try {
      const res = await fetch('/api/trajectory/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      alert(data.message || '向量化完成');
      fetchEmbedStatus();
    } catch (error) {
      console.error('向量化失败:', error);
      alert('向量化失败');
    }
    setEmbedding(false);
  };

  const handleViewOnMap = (traj: Trajectory) => {
    // 跳转到海图页面并传递航迹ID
    window.location.href = `/sea-chart?trajectory=${traj.id}`;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-4xl mx-auto">
        {/* 顶部导航 */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <a href="/" className="text-blue-600 hover:underline text-sm">← 返回</a>
            <h1 className="text-lg font-medium">🚢 航迹检索</h1>
          </div>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>共 {embedStatus.total} 条航迹</span>
            <span>|</span>
            <span>已向量化 {embedStatus.embedded}</span>
            {embedStatus.pending > 0 && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleEmbed}
                disabled={embedding}
                className="ml-2"
              >
                {embedding ? <Loader2 className="w-3 h-3 animate-spin" /> : '向量化'}
              </Button>
            )}
          </div>
        </div>

        {/* 检索表单 */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">检索条件</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* 文本搜索 */}
            <Input
              placeholder="输入检索内容（如：从上海到新加坡的航线）..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            />
            
            {/* 港口筛选 */}
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="起港口"
                value={startPort}
                onChange={(e) => setStartPort(e.target.value)}
              />
              <Input
                placeholder="止港口"
                value={endPort}
                onChange={(e) => setEndPort(e.target.value)}
              />
            </div>
            
            {/* 海域筛选 */}
            <Input
              placeholder="途经海域"
              value={seaArea}
              onChange={(e) => setSeaArea(e.target.value)}
            />
            
            {/* 行为分类 */}
            <select
              value={behavior}
              onChange={(e) => setBehavior(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            >
              <option value="">全部行为</option>
              <option value="DOCKING">码头靠泊</option>
              <option value="ANCHORING">锚泊</option>
              <option value="BUOY_MOORING">浮筒系泊</option>
              <option value="DRIFTING">原地漂泊</option>
              <option value="STEADY_SAILING">匀速直航</option>
              <option value="CHANNEL_TURNING">航道转向</option>
              <option value="VARIABLE_SAILING">变速航行</option>
              <option value="TURNING_BACK">原地掉头</option>
              <option value="LOITERING">原地徘徊</option>
              <option value="AVOIDING">船舶避让</option>
              <option value="CROSSING_CHANNEL">横穿航道</option>
              <option value="DEVIATION">违规偏航</option>
              <option value="AIS_OFF">AIS关机失联</option>
              <option value="SUSPICIOUS_LOITERING">无目的低速游荡</option>
            </select>
            
            {/* 意图分类 */}
            <select
              value={intent}
              onChange={(e) => setIntent(e.target.value)}
              className="w-full px-3 py-2 border rounded-md text-sm"
            >
              <option value="">全部意图</option>
              <option value="INBOUND">船舶进港</option>
              <option value="OUTBOUND">船舶出港</option>
              <option value="WAITING_ANCHORAGE">锚地候泊</option>
              <option value="INTER_PORT_TRANSIT">跨港干线运输</option>
              <option value="INTERMEDIATE_CALL">中途挂靠港口</option>
              <option value="PILOTAGE">接驳引水</option>
              <option value="ENGINEERING_WORK">水上工程作业</option>
              <option value="FISHING">渔船捕捞</option>
              <option value="MEETING_AVOIDANCE">会船避让</option>
              <option value="EMERGENCY_SHELTER">故障临时避险</option>
              <option value="SUSPICIOUS_SMUGGLING">可疑走私航行</option>
              <option value="RESTRICTED_ENTRY">违规闯入禁航</option>
            </select>
            
            {/* 空间范围 */}
            <div className="grid grid-cols-4 gap-2">
              <Input
                type="number"
                step="0.1"
                placeholder="最小经度"
                value={minLng}
                onChange={(e) => setMinLng(e.target.value)}
              />
              <Input
                type="number"
                step="0.1"
                placeholder="最大经度"
                value={maxLng}
                onChange={(e) => setMaxLng(e.target.value)}
              />
              <Input
                type="number"
                step="0.1"
                placeholder="最小纬度"
                value={minLat}
                onChange={(e) => setMinLat(e.target.value)}
              />
              <Input
                type="number"
                step="0.1"
                placeholder="最大纬度"
                value={maxLat}
                onChange={(e) => setMaxLat(e.target.value)}
              />
            </div>
            
            <Button onClick={handleSearch} disabled={searching} className="w-full">
              {searching ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  搜索中...
                </>
              ) : (
                <>
                  <Search className="w-4 h-4 mr-2" />
                  检索
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* 检索结果 */}
        {results.length > 0 && (
          <div className="space-y-2">
            <p className="text-sm text-gray-500">找到 {results.length} 条航迹</p>
            {results.map((traj) => (
              <Card
                key={traj.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedTrajectory(traj)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">{traj.segment_id}</Badge>
                        {traj.similarity !== undefined && (
                          <span className="text-xs text-green-600 font-bold">
                            {(traj.similarity * 100).toFixed(1)}%
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-sm">
                        <MapPin className="w-3 h-3 text-red-500" />
                        <span>{traj.start_port || '未知'}</span>
                        <Navigation className="w-3 h-3 text-blue-500" />
                        <span>{traj.end_port || '未知'}</span>
                        {traj.sea_area && (
                          <Badge variant="secondary" className="text-xs">{traj.sea_area}</Badge>
                        )}
                      </div>
                      {traj.ai_description && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">
                          {traj.ai_description}
                        </p>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleViewOnMap(traj);
                      }}
                    >
                      查看地图
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* 航迹详情弹窗 */}
        {selectedTrajectory && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <Card className="w-full max-w-lg max-h-[80vh] overflow-y-auto">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">{selectedTrajectory.segment_id}</CardTitle>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setSelectedTrajectory(null)}
                  >
                    ✕
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span className="text-gray-500">起港口：</span>
                    <span className="font-medium">{selectedTrajectory.start_port || '未知'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">止港口：</span>
                    <span className="font-medium">{selectedTrajectory.end_port || '未知'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">途经海域：</span>
                    <span className="font-medium">{selectedTrajectory.sea_area || '未知'}</span>
                  </div>
                  <div>
                    <span className="text-gray-500">来源文件：</span>
                    <span className="font-medium">{selectedTrajectory.source_file}</span>
                  </div>
                </div>
                
                <div className="text-sm">
                  <span className="text-gray-500">空间范围：</span>
                  <div className="mt-1 p-2 bg-gray-100 rounded text-xs font-mono">
                    经度: {selectedTrajectory.bounds_min_lng?.toFixed(4)} ~ {selectedTrajectory.bounds_max_lng?.toFixed(4)}<br/>
                    纬度: {selectedTrajectory.bounds_min_lat?.toFixed(4)} ~ {selectedTrajectory.bounds_max_lat?.toFixed(4)}
                  </div>
                </div>
                
                {selectedTrajectory.ai_description && (
                  <div>
                    <span className="text-sm text-gray-500">AI 描述：</span>
                    <p className="text-sm mt-1 p-2 bg-blue-50 rounded">
                      {selectedTrajectory.ai_description}
                    </p>
                  </div>
                )}
                
                <div>
                  <span className="text-sm text-gray-500">WKT 航线：</span>
                  <pre className="text-xs mt-1 p-2 bg-gray-100 rounded overflow-x-auto">
                    {selectedTrajectory.wkt_route}
                  </pre>
                </div>
                
                <div className="flex gap-2">
                  <Button
                    onClick={() => handleViewOnMap(selectedTrajectory)}
                    className="flex-1"
                  >
                    在地图上查看
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
