'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import dynamic from 'next/dynamic';
import ReactECharts from 'echarts-for-react';

// 动态导入地图组件，禁用 SSR
const SeaMap = dynamic(() => import('./SeaMap'), {
  ssr: false,
  loading: () => (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden flex items-center justify-center" style={{ height: '500px' }}>
      <div className="text-gray-500">加载地图中...</div>
    </div>
  ),
});

// 港口图标 - 根据国家代码返回不同颜色（用于非地图部分）
const getPortIconColor = (countryCode?: string) => {
  if (countryCode === 'CN' || countryCode === 'CHN') {
    return '#ef4444'; // 红色
  } else if (countryCode === 'US' || countryCode === 'USA') {
    return '#3b82f6'; // 蓝色
  }
  return '#000'; // 默认黑色
};

// 航迹点类型
interface TrackPoint {
  lat: number;
  lng: number;
  time: string;
  speed?: number;
  heading?: number;
}

// 港口类型
interface Port {
  id: string;
  name: string;
  lat: number;
  lng: number;
  country: string;
  ctryCode?: string; // 国家代码
  type: string;
}

// 航迹数据类型（从数据库加载）
interface Trajectory {
  id: string;
  segment_id: string;
  start_port: string;
  end_port: string;
  wkt_route: string;
  sea_area: string;
  segment_attrs: Record<string, unknown>;
  ai_description: string;
  bounds_min_lng: number;
  bounds_max_lng: number;
  bounds_min_lat: number;
  bounds_max_lat: number;
  source_file: string;
  behavior_code?: string;
  intent_code?: string;
  is_split?: boolean;
  parent_trajectory_id?: string;
  coordinates: [number, number][]; // 解析后的坐标数组
}

// 行为类型
interface Behavior {
  id: string;
  code: string;
  name: string;
  color: string;
}

// 意图类型
interface Intent {
  id: string;
  code: string;
  name: string;
  color: string;
}

// 模拟港口数据
const mockPorts: Port[] = [
  { id: 'CNSHA', name: '上海港', lat: 31.2304, lng: 121.4737, country: '中国', type: '集装箱' },
  { id: 'CNSZX', name: '深圳港', lat: 22.5431, lng: 113.8852, country: '中国', type: '集装箱' },
  { id: 'SGSIN', name: '新加坡港', lat: 1.2644, lng: 103.8198, country: '新加坡', type: '集装箱' },
  { id: 'NLRTM', name: '鹿特丹港', lat: 51.9225, lng: 4.4792, country: '荷兰', type: '集装箱' },
  { id: 'AEJAZ', name: '杰贝阿里港', lat: 25.0, lng: 55.0, country: '阿联酋', type: '集装箱' },
];

// 模拟航迹数据
const mockTrack: TrackPoint[] = [
  { lat: 31.2304, lng: 121.4737, time: '2024-01-01 08:00', speed: 12.5, heading: 135 },
  { lat: 30.5, lng: 122.5, time: '2024-01-01 12:00', speed: 15.2, heading: 140 },
  { lat: 29.0, lng: 124.0, time: '2024-01-01 18:00', speed: 14.8, heading: 145 },
  { lat: 26.0, lng: 126.0, time: '2024-01-02 06:00', speed: 13.5, heading: 150 },
  { lat: 22.0, lng: 128.0, time: '2024-01-02 18:00', speed: 16.0, heading: 155 },
  { lat: 18.0, lng: 130.0, time: '2024-01-03 06:00', speed: 14.0, heading: 160 },
  { lat: 10.0, lng: 132.0, time: '2024-01-03 18:00', speed: 15.5, heading: 165 },
  { lat: 1.2644, lng: 103.8198, time: '2024-01-04 12:00', speed: 11.0, heading: 180 },
];

export default function SeaChartPage() {
  const [activeTab, setActiveTab] = useState<'map' | 'track' | 'chart'>('map');
  const [mapCenter, setMapCenter] = useState<[number, number]>([21, 106.5]);
  const [mapZoom, setMapZoom] = useState(3);
  const [showSeaMap, setShowSeaMap] = useState(true);
  const [showPorts, setShowPorts] = useState(true); // 港口显隐：单选框控制
  const [selectedCountries, setSelectedCountries] = useState<string[]>(['CN', 'US', 'OTHER']); // 国家筛选：复选框多选
  const [showTrack, setShowTrack] = useState(true);
  const [customTrack, setCustomTrack] = useState<TrackPoint[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  
  // 客户端渲染标志
  const [mounted, setMounted] = useState(false);
  
  // 折叠状态
  const [expandLayer, setExpandLayer] = useState(false);
  const [expandView, setExpandView] = useState(false);
  const [expandTrackInfo, setExpandTrackInfo] = useState(false);
  const [expandTrackDraw, setExpandTrackDraw] = useState(false);
  
  // 数据库港口数据
  const [dbPorts, setDbPorts] = useState<Port[]>([]);
  const [loadingPorts, setLoadingPorts] = useState(false);
  
  // 航迹数据
  const [trajectories, setTrajectories] = useState<Trajectory[]>([]);
  const [loadingTrajectories, setLoadingTrajectories] = useState(false);
  const [selectedTrajectory, setSelectedTrajectory] = useState<Trajectory | null>(null);
  
  // 航迹筛选条件
  const [trajectoryFilter, setTrajectoryFilter] = useState({
    startPort: '',
    endPort: '',
    seaArea: '',
    behavior: '',
    intent: '',
  });
  const [showTrajectories, setShowTrajectories] = useState(true);
  
  // 行为和意图类型
  const [behaviors, setBehaviors] = useState<Behavior[]>([]);
  const [intents, setIntents] = useState<Intent[]>([]);
  
  // 分割模式
  const [splitMode, setSplitMode] = useState(false);
  const [splitPoints, setSplitPoints] = useState<number[]>([]);
  
  // 标注弹窗
  const [showLabelModal, setShowLabelModal] = useState(false);
  
  // 客户端渲染
  useEffect(() => {
    setMounted(true);
  }, []);
  
  // 从数据库获取港口数据
  useEffect(() => {
    const fetchPorts = async () => {
      setLoadingPorts(true);
      try {
        const res = await fetch('/api/search?limit=1000');
        const data = await res.json();
        const items = data.items || [];
        
        // 解析港口数据
        const ports: Port[] = [];
        items.forEach((item: { 
          id?: string; 
          title?: string; 
          content?: string; 
          source?: string;
          metadata?: Record<string, unknown>;
        }) => {
          const content = item.content || '';
          // 解析格式: portCode: XXX, nameCn: XXX, lat: XXX, lon: XXX, ...
          const portCodeMatch = content.match(/portCode:\s*([^,]+)/);
          const nameCnMatch = content.match(/nameCn:\s*([^,]+)/);
          const latMatch = content.match(/lat:\s*([\d.-]+)/);
          const lonMatch = content.match(/lon:\s*([\d.-]+)/);
          const ctryNameCnMatch = content.match(/ctryNameCn:\s*([^,]+)/);
          const ctryCodeMatch = content.match(/ctryCode:\s*([^,]+)/);
          
          if (portCodeMatch && latMatch && lonMatch) {
            const lat = parseFloat(latMatch[1]);
            const lng = parseFloat(lonMatch[1]);
            if (!isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
              ports.push({
                id: portCodeMatch[1].trim(),
                name: nameCnMatch ? nameCnMatch[1].trim() : portCodeMatch[1].trim(),
                lat,
                lng,
                country: ctryNameCnMatch ? ctryNameCnMatch[1].trim() : '',
                ctryCode: ctryCodeMatch ? ctryCodeMatch[1].trim() : '',
                type: '港口',
              });
            }
          }
        });
        
        setDbPorts(ports);
        console.log(`加载了 ${ports.length} 个港口数据`);
      } catch (error) {
        console.error('获取港口数据失败:', error);
      } finally {
        setLoadingPorts(false);
      }
    };
    
    fetchPorts();
  }, []);
  
  // 解析 WKT LINESTRING 格式
  const parseWKT = (wkt: string): [number, number][] => {
    try {
      // LINESTRING(lng1 lat1, lng2 lat2, ...)
      const match = wkt.match(/LINESTRING\s*\((.*)\)/i);
      if (!match) return [];
      
      const coords = match[1].split(',').map(pair => {
        const parts = pair.trim().split(/\s+/);
        const lng = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        return [lng, lat] as [number, number];
      });
      
      return coords.filter(([lng, lat]) => 
        !isNaN(lng) && !isNaN(lat) && 
        lat >= -90 && lat <= 90 && 
        lng >= -180 && lng <= 180
      );
    } catch {
      return [];
    }
  };
  
  // 加载航迹数据
  const loadTrajectories = useCallback(async () => {
    setLoadingTrajectories(true);
    try {
      const res = await fetch('/api/trajectory/search?limit=1000');
      const data = await res.json();
      const items = data.trajectories || [];
      
      const parsedTrajectories: Trajectory[] = items.map((item: any) => ({
        ...item,
        coordinates: parseWKT(item.wkt_route || ''),
      })).filter((t: Trajectory) => t.coordinates.length >= 2);
      
      setTrajectories(parsedTrajectories);
      console.log(`加载了 ${parsedTrajectories.length} 条航迹`);
    } catch (error) {
      console.error('加载航迹数据失败:', error);
    }
    setLoadingTrajectories(false);
  }, []);
  
  // 加载行为和意图类型
  const loadBehaviorsAndIntents = useCallback(async () => {
    try {
      const [behaviorsRes, intentsRes] = await Promise.all([
        fetch('/api/segment/behavior'),
        fetch('/api/segment/intent')
      ]);
      const behaviorsData = await behaviorsRes.json();
      const intentsData = await intentsRes.json();
      setBehaviors(behaviorsData || []);
      setIntents(intentsData || []);
    } catch (error) {
      console.error('加载行为意图类型失败:', error);
    }
  }, []);
  
  // 分割航段
  const handleSplitTrajectory = async () => {
    if (!selectedTrajectory || splitPoints.length === 0) return;
    
    const sortedPoints = [...splitPoints].sort((a, b) => a - b);
    
    try {
      for (const splitIndex of sortedPoints) {
        await fetch('/api/trajectory/split', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            trajectoryId: selectedTrajectory.id,
            splitIndex
          })
        });
      }
      
      alert(`已将航段分割为 ${sortedPoints.length + 1} 段`);
      setSplitPoints([]);
      setSplitMode(false);
      loadTrajectories();
    } catch (error) {
      console.error('分割失败:', error);
      alert('分割失败');
    }
  };
  
  // 标注航段
  const handleLabelTrajectory = async (behaviorCode?: string, intentCode?: string) => {
    if (!selectedTrajectory) return;
    
    try {
      await fetch(`/api/trajectory/${selectedTrajectory.id}/label`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          behavior_code: behaviorCode,
          intent_code: intentCode
        })
      });
      
      alert('标注成功');
      setShowLabelModal(false);
      loadTrajectories();
    } catch (error) {
      console.error('标注失败:', error);
      alert('标注失败');
    }
  };
  
  // 初始加载航迹和行为意图类型
  useEffect(() => {
    loadTrajectories();
    loadBehaviorsAndIntents();
  }, [loadTrajectories, loadBehaviorsAndIntents]);
  
  // 合并模拟港口和数据库港口
  const allPorts = [...mockPorts, ...dbPorts];
  
  // 图表数据
  const [portStats, setPortStats] = useState({
    throughput: [1200, 1800, 2100, 1900, 2400, 2800, 3200],
    months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月'],
  });

  // 处理地图点击（航迹绘制）
  const handleMapClick = useCallback((lat: number, lng: number) => {
    if (isDrawing) {
      const now = new Date();
      setCustomTrack(prev => [...prev, {
        lat,
        lng,
        time: now.toISOString().slice(0, 16).replace('T', ' '),
        speed: Math.random() * 20 + 5,
        heading: Math.random() * 360,
      }]);
    }
  }, [isDrawing]);

  // 清除自定义航迹
  const clearCustomTrack = () => {
    setCustomTrack([]);
  };

  // 导出航迹数据
  const exportTrack = () => {
    const data = customTrack.length > 0 ? customTrack : mockTrack;
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'track_data.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // 港口吞吐量图表配置
  const throughputChartOption = {
    title: { text: '港口吞吐量趋势', left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: { type: 'category', data: portStats.months },
    yAxis: { type: 'value', name: '万TEU' },
    series: [{
      name: '吞吐量',
      type: 'line',
      data: portStats.throughput,
      smooth: true,
      areaStyle: { opacity: 0.3 },
      itemStyle: { color: '#3b82f6' },
    }],
  };

  // 航速图表配置
  const speedChartOption = {
    title: { text: '航速变化', left: 'center' },
    tooltip: { trigger: 'axis' },
    xAxis: { 
      type: 'category', 
      data: mockTrack.map(p => p.time.slice(5, 11)),
    },
    yAxis: { type: 'value', name: '节' },
    series: [{
      name: '航速',
      type: 'bar',
      data: mockTrack.map(p => p.speed),
      itemStyle: { color: '#10b981' },
    }],
  };

  // 港口分布饼图
  const portTypeChartOption = {
    title: { text: '港口类型分布', left: 'center' },
    tooltip: { trigger: 'item' },
    series: [{
      type: 'pie',
      radius: '60%',
      data: [
        { value: 45, name: '集装箱港', itemStyle: { color: '#3b82f6' } },
        { value: 25, name: '散货港', itemStyle: { color: '#10b981' } },
        { value: 15, name: '油港', itemStyle: { color: '#f59e0b' } },
        { value: 15, name: '综合港', itemStyle: { color: '#8b5cf6' } },
      ],
      label: { formatter: '{b}: {d}%' },
    }],
  };

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <a href="/" className="flex items-center gap-2 text-gray-700 hover:text-blue-600">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
              </svg>
              <span className="text-sm font-medium">首页</span>
            </a>
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab('map')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  activeTab === 'map' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                地图
              </button>
              <button
                onClick={() => setActiveTab('track')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  activeTab === 'track' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                航迹
              </button>
              <button
                onClick={() => setActiveTab('chart')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                  activeTab === 'chart' ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                图表
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4">
        {/* 地图/海图展示 */}
        {mounted && (activeTab === 'map' || activeTab === 'track') && (
          <div className="space-y-4">
            {/* 地图区域 */}
            <SeaMap
              mapCenter={mapCenter}
              mapZoom={mapZoom}
              showSeaMap={showSeaMap}
              showPorts={showPorts}
              showTrack={showTrack}
              showTrajectories={showTrajectories}
              allPorts={allPorts}
              selectedCountries={selectedCountries}
              mockTrack={mockTrack}
              customTrack={customTrack}
              trajectories={trajectories}
              selectedTrajectory={selectedTrajectory}
              onMapClick={handleMapClick}
            />

            {/* 控制面板 - 水平排列 */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {/* 图层控制 */}
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <button 
                  onClick={() => setExpandLayer(!expandLayer)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                >
                  <h3 className="font-semibold text-gray-900">🗺️ 图层控制</h3>
                  <span className="text-gray-400">{expandLayer ? '▼' : '▶'}</span>
                </button>
                {expandLayer && (
                  <div className="px-4 pb-4 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showSeaMap}
                        onChange={(e) => setShowSeaMap(e.target.checked)}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-sm text-gray-700">海图叠加 (OpenSeaMap)</span>
                    </label>
                    {/* 港口显隐 - 单选框 */}
                    <div className="border-t pt-2 mt-2">
                      <label className="text-xs text-gray-500 font-medium">港口</label>
                      <div className="mt-1 space-y-1 text-xs">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="showPorts"
                            checked={showPorts}
                            onChange={() => setShowPorts(true)}
                            className="w-3 h-3"
                          />
                          <span className="text-gray-700">显示港口</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input
                            type="radio"
                            name="showPorts"
                            checked={!showPorts}
                            onChange={() => setShowPorts(false)}
                            className="w-3 h-3"
                          />
                          <span className="text-gray-700">隐藏港口</span>
                        </label>
                      </div>
                    </div>
                    {/* 国家筛选 - 复选框 */}
                    {showPorts && (
                      <div className="border-t pt-2 mt-2">
                        <label className="text-xs text-gray-500 font-medium">国家分类</label>
                        <div className="mt-1 space-y-1 text-xs">
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedCountries.includes('CN')}
                              onChange={() => {
                                setSelectedCountries(prev => 
                                  prev.includes('CN') ? prev.filter(c => c !== 'CN') : [...prev, 'CN']
                                );
                              }}
                              className="w-3 h-3 rounded"
                            />
                            <span className="w-2 h-2 rounded-full bg-red-500"></span>
                            <span className="text-gray-700">中国 ({allPorts.filter(p => p.ctryCode === 'CN' || p.ctryCode === 'CHN' || p.country === '中国').length}个)</span>
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedCountries.includes('US')}
                              onChange={() => {
                                setSelectedCountries(prev => 
                                  prev.includes('US') ? prev.filter(c => c !== 'US') : [...prev, 'US']
                                );
                              }}
                              className="w-3 h-3 rounded"
                            />
                            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                            <span className="text-gray-700">美国 ({allPorts.filter(p => p.ctryCode === 'US' || p.ctryCode === 'USA' || p.country === '美国').length}个)</span>
                          </label>
                          <label className="flex items-center gap-1 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={selectedCountries.includes('OTHER')}
                              onChange={() => {
                                setSelectedCountries(prev => 
                                  prev.includes('OTHER') ? prev.filter(c => c !== 'OTHER') : [...prev, 'OTHER']
                                );
                              }}
                              className="w-3 h-3 rounded"
                            />
                            <span className="w-2 h-2 rounded-full bg-gray-500"></span>
                            <span className="text-gray-700">其他 ({allPorts.filter(p => 
                              !['CN', 'CHN', 'US', 'USA'].includes(p.ctryCode || '') && 
                              !['中国', '美国'].includes(p.country)
                            ).length}个)</span>
                          </label>
                        </div>
                      </div>
                    )}
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showTrack}
                        onChange={(e) => setShowTrack(e.target.checked)}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-sm text-gray-700">航迹线</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showTrajectories}
                        onChange={(e) => setShowTrajectories(e.target.checked)}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-sm text-gray-700">航迹数据 ({trajectories.length}条)</span>
                    </label>
                    {loadingTrajectories && <p className="text-xs text-gray-400">加载航迹数据中...</p>}
                    {loadingPorts && <p className="text-xs text-gray-400">加载港口数据中...</p>}
                  </div>
                )}
              </div>

              {/* 视图控制 */}
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <button 
                  onClick={() => setExpandView(!expandView)}
                  className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                >
                  <h3 className="font-semibold text-gray-900">📍 视图控制</h3>
                  <span className="text-gray-400">{expandView ? '▼' : '▶'}</span>
                </button>
                {expandView && (
                  <div className="px-4 pb-4 space-y-3">
                    <div>
                      <label className="text-xs text-gray-500">中心位置</label>
                      <div className="flex gap-2 mt-1">
                        <input
                          type="number"
                          value={mapCenter[0]}
                          onChange={(e) => setMapCenter([parseFloat(e.target.value) || 0, mapCenter[1]])}
                          className="flex-1 px-2 py-1 border rounded text-sm"
                          placeholder="纬度"
                        />
                        <input
                          type="number"
                          value={mapCenter[1]}
                          onChange={(e) => setMapCenter([mapCenter[0], parseFloat(e.target.value) || 0])}
                          className="flex-1 px-2 py-1 border rounded text-sm"
                          placeholder="经度"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">缩放级别: {mapZoom}</label>
                      <input
                        type="range"
                        min="1"
                        max="18"
                        value={mapZoom}
                        onChange={(e) => setMapZoom(parseInt(e.target.value))}
                        className="w-full mt-1"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => { setMapCenter([21, 106.5]); setMapZoom(3); }}
                        className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded text-xs hover:bg-blue-100"
                      >
                        亚太区域
                      </button>
                      <button
                        onClick={() => { setMapCenter([31.2304, 121.4737]); setMapZoom(10); }}
                        className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded text-xs hover:bg-blue-100"
                      >
                        上海港
                      </button>
                      <button
                        onClick={() => { setMapCenter([1.2644, 103.8198]); setMapZoom(10); }}
                        className="px-3 py-1.5 bg-blue-50 text-blue-600 rounded text-xs hover:bg-blue-100"
                      >
                        新加坡
                      </button>
                    </div>
                  </div>
                )}
              </div>
              
              {/* 航迹筛选面板 */}
              {trajectories.length > 0 && (
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <button 
                    onClick={() => setSelectedTrajectory(null)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                  >
                    <h3 className="font-semibold text-gray-900">🧭 航迹筛选</h3>
                    <span className="text-xs text-gray-400">{trajectories.length} 条航迹</span>
                  </button>
                  <div className="px-4 pb-4 space-y-2">
                    <div>
                      <label className="text-xs text-gray-500">起港口</label>
                      <input
                        type="text"
                        value={trajectoryFilter.startPort}
                        onChange={(e) => setTrajectoryFilter({ ...trajectoryFilter, startPort: e.target.value })}
                        placeholder="输入港口名称"
                        className="w-full mt-1 px-2 py-1 border rounded text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">止港口</label>
                      <input
                        type="text"
                        value={trajectoryFilter.endPort}
                        onChange={(e) => setTrajectoryFilter({ ...trajectoryFilter, endPort: e.target.value })}
                        placeholder="输入港口名称"
                        className="w-full mt-1 px-2 py-1 border rounded text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">海域</label>
                      <input
                        type="text"
                        value={trajectoryFilter.seaArea}
                        onChange={(e) => setTrajectoryFilter({ ...trajectoryFilter, seaArea: e.target.value })}
                        placeholder="输入海域名称"
                        className="w-full mt-1 px-2 py-1 border rounded text-xs"
                      />
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">行为分类</label>
                      <select
                        value={trajectoryFilter.behavior}
                        onChange={(e) => setTrajectoryFilter({ ...trajectoryFilter, behavior: e.target.value })}
                        className="w-full mt-1 px-2 py-1 border rounded text-xs"
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
                    </div>
                    <div>
                      <label className="text-xs text-gray-500">意图分类</label>
                      <select
                        value={trajectoryFilter.intent}
                        onChange={(e) => setTrajectoryFilter({ ...trajectoryFilter, intent: e.target.value })}
                        className="w-full mt-1 px-2 py-1 border rounded text-xs"
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
                    </div>
                    <button
                      onClick={loadTrajectories}
                      className="w-full px-2 py-1 bg-blue-50 text-blue-600 rounded text-xs hover:bg-blue-100"
                    >
                      刷新航迹数据
                    </button>
                  </div>
                </div>
              )}
              
              {/* 选中航迹详情 */}
              {selectedTrajectory && (
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <div className="px-4 py-3 flex items-center justify-between bg-blue-50">
                    <h3 className="font-semibold text-blue-700">📍 航迹详情</h3>
                    <button 
                      onClick={() => setSelectedTrajectory(null)}
                      className="text-gray-400 hover:text-gray-600"
                    >
                      ✕
                    </button>
                  </div>
                  <div className="px-4 py-3 space-y-2 text-xs">
                    <div>
                      <span className="text-gray-500">航段编号：</span>
                      <span className="font-medium">{selectedTrajectory.segment_id}</span>
                    </div>
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
                      <span className="text-gray-500">坐标点数：</span>
                      <span className="font-medium">{selectedTrajectory.coordinates.length}</span>
                    </div>
                    {selectedTrajectory.ai_description && (
                      <div className="pt-2 border-t">
                        <p className="text-gray-500 mb-1">AI 描述：</p>
                        <p className="text-gray-700 bg-gray-50 p-2 rounded">{selectedTrajectory.ai_description}</p>
                      </div>
                    )}
                    
                    {/* 行为和意图显示 */}
                    {(selectedTrajectory.behavior_code || selectedTrajectory.intent_code) && (
                      <div className="pt-2 border-t flex gap-2 flex-wrap">
                        {selectedTrajectory.behavior_code && (
                          <span className="px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                            行为: {behaviors.find(b => b.code === selectedTrajectory.behavior_code)?.name || selectedTrajectory.behavior_code}
                          </span>
                        )}
                        {selectedTrajectory.intent_code && (
                          <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                            意图: {intents.find(i => i.code === selectedTrajectory.intent_code)?.name || selectedTrajectory.intent_code}
                          </span>
                        )}
                      </div>
                    )}
                    
                    {/* 分割和标注按钮 */}
                    <div className="pt-2 border-t flex gap-2 flex-wrap">
                      <button
                        onClick={() => setSplitMode(!splitMode)}
                        className={`px-2 py-1 rounded text-xs ${splitMode ? 'bg-red-100 text-red-700' : 'bg-orange-100 text-orange-700'}`}
                      >
                        {splitMode ? '取消分割' : '✂️ 分割'}
                      </button>
                      <button
                        onClick={() => setShowLabelModal(true)}
                        className="px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs"
                      >
                        🏷️ 标注
                      </button>
                      {splitMode && (
                        <button
                          onClick={handleSplitTrajectory}
                          disabled={splitPoints.length === 0}
                          className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs disabled:opacity-50"
                        >
                          确认分割 ({splitPoints.length}点)
                        </button>
                      )}
                    </div>
                    
                    {splitMode && (
                      <div className="pt-2 text-xs text-orange-600">
                        点击航迹上的点选择分割位置
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              {/* 标注弹窗 */}
              {showLabelModal && selectedTrajectory && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[1000] p-4">
                  <div className="bg-white rounded-lg shadow-xl w-full max-w-sm">
                    <div className="p-4 border-b flex justify-between items-center">
                      <h3 className="font-semibold">标注航段</h3>
                      <button onClick={() => setShowLabelModal(false)} className="text-gray-500">✕</button>
                    </div>
                    <div className="p-4 space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-2">行为类型</label>
                        <select 
                          className="w-full px-3 py-2 border rounded-md text-sm"
                          defaultValue={selectedTrajectory.behavior_code || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value) handleLabelTrajectory(value, undefined);
                          }}
                        >
                          <option value="">选择行为...</option>
                          {behaviors.map(b => (
                            <option key={b.code} value={b.code}>{b.name}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="block text-sm font-medium mb-2">意图类型</label>
                        <select 
                          className="w-full px-3 py-2 border rounded-md text-sm"
                          defaultValue={selectedTrajectory.intent_code || ''}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value) handleLabelTrajectory(undefined, value);
                          }}
                        >
                          <option value="">选择意图...</option>
                          {intents.map(i => (
                            <option key={i.code} value={i.code}>{i.name}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="p-4 border-t">
                      <button
                        onClick={() => setShowLabelModal(false)}
                        className="w-full px-4 py-2 bg-gray-100 rounded-md text-sm"
                      >
                        关闭
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* 航迹绘制控制 */}
              {activeTab === 'track' && (
                <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <button 
                    onClick={() => setExpandTrackDraw(!expandTrackDraw)}
                    className="w-full px-4 py-3 flex items-center justify-between hover:bg-gray-50"
                  >
                    <h3 className="font-semibold text-gray-900">✏️ 航迹绘制</h3>
                    <span className="text-gray-400">{expandTrackDraw ? '▼' : '▶'}</span>
                  </button>
                  {expandTrackDraw && (
                  <div className="px-4 pb-4 space-y-3">
                    <button
                      onClick={() => setIsDrawing(!isDrawing)}
                      className={`w-full px-3 py-2 rounded-lg text-sm font-medium transition ${
                        isDrawing 
                          ? 'bg-red-500 text-white hover:bg-red-600' 
                          : 'bg-green-500 text-white hover:bg-green-600'
                      }`}
                    >
                      {isDrawing ? '⏹️ 停止绘制' : '✏️ 开始绘制'}
                    </button>
                    <button
                      onClick={clearCustomTrack}
                      className="w-full px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
                    >
                      🗑️ 清除航迹
                    </button>
                    <button
                      onClick={exportTrack}
                      className="w-full px-3 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm hover:bg-blue-100"
                    >
                      📥 导出航迹
                    </button>
                    <div className="text-xs text-gray-500">
                      {isDrawing && '点击地图添加航迹点'}
                      {customTrack.length > 0 && `已绘制 ${customTrack.length} 个点`}
                    </div>
                  </div>
                  )}
                </div>
              )}

              {/* 航迹信息 */}
              <div className="bg-white rounded-xl shadow-sm">
                <div 
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandTrackInfo(!expandTrackInfo)}
                >
                  <h3 className="font-semibold text-gray-900 text-sm">📊 航迹信息</h3>
                  <span className="text-gray-400">{expandTrackInfo ? '▼' : '▶'}</span>
                </div>
                {expandTrackInfo && (
                  <div className="px-3 pb-3 space-y-2 text-xs">
                  <div className="flex justify-between">
                    <span className="text-gray-500">航迹点数</span>
                    <span className="font-medium">{mockTrack.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">自定义点数</span>
                    <span className="font-medium">{customTrack.length}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">平均航速</span>
                    <span className="font-medium">
                      {(mockTrack.reduce((sum, p) => sum + (p.speed || 0), 0) / mockTrack.length).toFixed(1)} 节
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-500">港口数量</span>
                    <span className="font-medium">{mockPorts.length}</span>
                  </div>
                  </div>
                )}
              </div>
            </div>

          </div>
        )}

        {/* 图表展示 */}
        {activeTab === 'chart' && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl shadow-sm p-4">
                <ReactECharts option={throughputChartOption} style={{ height: '300px' }} />
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4">
                <ReactECharts option={speedChartOption} style={{ height: '300px' }} />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="bg-white rounded-xl shadow-sm p-4">
                <ReactECharts option={portTypeChartOption} style={{ height: '300px' }} />
              </div>
              <div className="bg-white rounded-xl shadow-sm p-4">
                <h3 className="font-semibold text-gray-900 mb-3">📈 港口排名</h3>
                <div className="space-y-2">
                  {[
                    { name: '上海港', value: 4350, unit: '万TEU' },
                    { name: '新加坡港', value: 3720, unit: '万TEU' },
                    { name: '宁波舟山港', value: 3340, unit: '万TEU' },
                    { name: '深圳港', value: 2850, unit: '万TEU' },
                    { name: '广州港', value: 2420, unit: '万TEU' },
                  ].map((port, i) => (
                    <div key={port.name} className="flex items-center gap-3">
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                        i === 0 ? 'bg-yellow-400 text-white' :
                        i === 1 ? 'bg-gray-300 text-white' :
                        i === 2 ? 'bg-amber-600 text-white' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {i + 1}
                      </span>
                      <span className="flex-1 text-sm font-medium">{port.name}</span>
                      <span className="text-sm text-gray-500">{port.value} {port.unit}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
