'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import ReactECharts from 'echarts-for-react';
import 'leaflet/dist/leaflet.css';

// 修复 Leaflet 默认图标问题
delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: unknown })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// 港口图标 - 根据国家代码返回不同颜色
const getPortIcon = (countryCode?: string) => {
  let color = '#000'; // 默认黑色
  let borderColor = '#333';
  
  if (countryCode) {
    const code = countryCode.toUpperCase();
    if (code === 'CN' || code === 'CHN' || code === '中国') {
      color = '#ef4444'; // 中国红色
      borderColor = '#dc2626';
    } else if (code === 'US' || code === 'USA' || code === '美国') {
      color = '#3b82f6'; // 美国蓝色
      borderColor = '#2563eb';
    }
  }
  
  return new L.DivIcon({
    className: 'custom-port-marker',
    html: `<div style="width:8px;height:8px;background:${color};border-radius:50%;border:1px solid ${borderColor};"></div>`,
    iconSize: [8, 8],
    iconAnchor: [4, 4],
  });
};

// 船舶图标
const shipIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41],
  iconAnchor: [12, 41],
  popupAnchor: [1, -34],
  shadowSize: [41, 41],
});

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

// 地图点击处理组件
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// 地图控制器组件
function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  return null;
}

export default function SeaChartPage() {
  const [activeTab, setActiveTab] = useState<'map' | 'track' | 'chart'>('map');
  const [mapCenter, setMapCenter] = useState<[number, number]>([35, 105]);
  const [mapZoom, setMapZoom] = useState(4);
  const [showSeaMap, setShowSeaMap] = useState(true);
  const [showPorts, setShowPorts] = useState(true);
  const [showTrack, setShowTrack] = useState(true);
  const [customTrack, setCustomTrack] = useState<TrackPoint[]>([]);
  const [isDrawing, setIsDrawing] = useState(false);
  
  // 折叠状态
  const [expandLayer, setExpandLayer] = useState(false);
  const [expandView, setExpandView] = useState(false);
  const [expandTrackInfo, setExpandTrackInfo] = useState(false);
  const [expandTrackDraw, setExpandTrackDraw] = useState(false);
  
  // 数据库港口数据
  const [dbPorts, setDbPorts] = useState<Port[]>([]);
  const [loadingPorts, setLoadingPorts] = useState(false);
  
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
        {(activeTab === 'map' || activeTab === 'track') && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            {/* 控制面板 */}
            <div className="lg:col-span-1 space-y-4">
              {/* 图层控制 - 可折叠 */}
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
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showPorts}
                        onChange={(e) => setShowPorts(e.target.checked)}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-sm text-gray-700">港口标记 ({allPorts.length}个)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={showTrack}
                        onChange={(e) => setShowTrack(e.target.checked)}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-sm text-gray-700">航迹线</span>
                    </label>
                    {loadingPorts && <p className="text-xs text-gray-400">加载港口数据中...</p>}
                  </div>
                )}
              </div>

              {/* 视图控制 - 可折叠 */}
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

            {/* 地图区域 */}
            <div className="lg:col-span-3">
              <div className="bg-white rounded-xl shadow-sm overflow-hidden">
                <MapContainer
                  center={mapCenter}
                  zoom={mapZoom}
                  style={{ height: '600px', width: '100%' }}
                >
                  <MapController center={mapCenter} zoom={mapZoom} />
                  <MapClickHandler onMapClick={handleMapClick} />
                  
                  {/* 基础地图 - OpenStreetMap */}
                  <TileLayer
                    attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                  />
                  
                  {/* 海图叠加 - OpenSeaMap */}
                  {showSeaMap && (
                    <TileLayer
                      attribution='&copy; <a href="https://www.openseamap.org">OpenSeaMap</a>'
                      url="https://tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
                    />
                  )}

                  {/* 港口标记 */}
                  {showPorts && allPorts.map((port) => {
                    // 从 port 中获取国家代码
                    const countryCode = (port as any).ctryCode || (port as any).countryCode || '';
                    return (
                    <Marker key={port.id} position={[port.lat, port.lng]} icon={getPortIcon(countryCode)}>
                      <Popup>
                        <div className="min-w-[75px] text-xs">
                          <h4 className="font-bold text-xs">{port.name}</h4>
                          <p className="text-xs text-gray-600">代码: {port.id}</p>
                          {port.country && <p className="text-xs text-gray-600">国家: {port.country}</p>}
                        </div>
                      </Popup>
                    </Marker>
                    );
                  })}

                  {/* 模拟航迹线 */}
                  {showTrack && mockTrack.length > 1 && (
                    <Polyline
                      positions={mockTrack.map(p => [p.lat, p.lng])}
                      pathOptions={{ color: '#3b82f6', weight: 3, opacity: 0.8 }}
                    />
                  )}

                  {/* 航迹起点 */}
                  {showTrack && mockTrack.length > 0 && (
                    <Marker position={[mockTrack[0].lat, mockTrack[0].lng]} icon={shipIcon}>
                      <Popup>
                        <div>
                          <h4 className="font-bold">起点: 上海港</h4>
                          <p className="text-sm text-gray-600">时间: {mockTrack[0].time}</p>
                        </div>
                      </Popup>
                    </Marker>
                  )}

                  {/* 航迹终点 */}
                  {showTrack && mockTrack.length > 0 && (
                    <Marker position={[mockTrack[mockTrack.length - 1].lat, mockTrack[mockTrack.length - 1].lng]} icon={shipIcon}>
                      <Popup>
                        <div>
                          <h4 className="font-bold">终点: 新加坡港</h4>
                          <p className="text-sm text-gray-600">时间: {mockTrack[mockTrack.length - 1].time}</p>
                        </div>
                      </Popup>
                    </Marker>
                  )}

                  {/* 自定义航迹 */}
                  {customTrack.length > 1 && (
                    <Polyline
                      positions={customTrack.map(p => [p.lat, p.lng])}
                      pathOptions={{ color: '#ef4444', weight: 2, opacity: 0.8, dashArray: '5, 10' }}
                    />
                  )}
                </MapContainer>
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
