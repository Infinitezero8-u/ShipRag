'use client';

import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
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
  
  if (countryCode === 'CN' || countryCode === 'CHN') {
    color = '#ef4444'; // 红色
    borderColor = '#dc2626';
  } else if (countryCode === 'US' || countryCode === 'USA') {
    color = '#3b82f6'; // 蓝色
    borderColor = '#2563eb';
  }
  
  return L.divIcon({
    className: 'custom-port-icon',
    html: `<div style="
      width: 8px;
      height: 8px;
      background: ${color};
      border: 1px solid ${borderColor};
      border-radius: 50%;
    "></div>`,
    iconSize: [8, 8],
    iconAnchor: [4, 4],
  });
};

// 船舶图标
const shipIcon = L.divIcon({
  className: 'custom-ship-icon',
  html: `<div style="
    width: 16px;
    height: 16px;
    background: #3b82f6;
    border: 2px solid #1d4ed8;
    border-radius: 50%;
    box-shadow: 0 2px 4px rgba(0,0,0,0.3);
  "></div>`,
  iconSize: [16, 16],
  iconAnchor: [8, 8],
});

interface Port {
  id: string;
  name: string;
  lat: number;
  lng: number;
  country?: string;
  ctryCode?: string; // 国家代码
}

interface TrackPoint {
  lat: number;
  lng: number;
  time?: string;
}

interface Trajectory {
  id: string;
  segment_id: string;
  start_port: string | null;
  end_port: string | null;
  wkt_route: string | null;
  sea_area: string | null;
  ai_description: string | null;
  behavior_code?: string | null;
  intent_code?: string | null;
}

interface SeaMapProps {
  mapCenter: [number, number];
  mapZoom: number;
  showSeaMap: boolean;
  showPorts: boolean;
  showTrack: boolean;
  showTrajectories: boolean;
  allPorts: Port[];
  selectedCountries?: string[]; // 港口国家筛选：多选数组
  mockTrack: TrackPoint[];
  customTrack: TrackPoint[];
  trajectories: Trajectory[];
  selectedTrajectory: Trajectory | null;
  onMapClick: (lat: number, lng: number) => void;
}

// 地图控制器
function MapController({ center, zoom }: { center: [number, number]; zoom: number }) {
  const map = useMap();
  
  useEffect(() => {
    map.setView(center, zoom);
  }, [center, zoom, map]);
  
  return null;
}

import { useEffect } from 'react';

// 地图点击处理器
function MapClickHandler({ onMapClick }: { onMapClick: (lat: number, lng: number) => void }) {
  useMapEvents({
    click: (e) => {
      onMapClick(e.latlng.lat, e.latlng.lng);
    },
  });
  return null;
}

// 解析 WKT LINESTRING
function parseWKT(wkt: string | null): [number, number][] {
  if (!wkt) return [];
  
  // LINESTRING(lng1 lat1, lng2 lat2, ...)
  const match = wkt.match(/LINESTRING\s*\((.*)\)/i);
  if (!match) return [];
  
  const coords = match[1].split(',').map(c => c.trim());
  return coords.map(coord => {
    const [lng, lat] = coord.split(/\s+/).map(Number);
    return [lat, lng] as [number, number]; // 注意：Leaflet 使用 [lat, lng]
  });
}

export default function SeaMap({
  mapCenter,
  mapZoom,
  showSeaMap,
  showPorts,
  showTrack,
  showTrajectories,
  allPorts,
  selectedCountries,
  mockTrack,
  customTrack,
  trajectories,
  selectedTrajectory,
  onMapClick,
}: SeaMapProps) {
  // 根据国家筛选港口（支持多选）
  const filteredPorts = allPorts.filter(port => {
    if (!selectedCountries || selectedCountries.length === 0) return true;
    
    const ctryCode = port.ctryCode || '';
    const country = port.country || '';
    
    return selectedCountries.some(selectedCountry => {
      if (selectedCountry === 'CN') {
        return ctryCode === 'CN' || ctryCode === 'CHN' || country === '中国';
      } else if (selectedCountry === 'US') {
        return ctryCode === 'US' || ctryCode === 'USA' || country === '美国';
      } else if (selectedCountry === 'OTHER') {
        return !['CN', 'CHN', 'US', 'USA'].includes(ctryCode) && !['中国', '美国'].includes(country);
      }
      return false;
    });
  });
  return (
    <div className="bg-white rounded-xl shadow-sm overflow-hidden">
      <MapContainer
        center={mapCenter}
        zoom={mapZoom}
        style={{ height: '500px', width: '100%' }}
      >
        <MapController center={mapCenter} zoom={mapZoom} />
        <MapClickHandler onMapClick={onMapClick} />
        
        {/* 基础地图 - 高德地图（国内稳定） */}
        <TileLayer
          attribution='&copy; 高德地图'
          url="https://webrd0{s}.is.autonavi.com/appmaptile?lang=zh_cn&size=1&scale=1&style=8&x={x}&y={y}&z={z}"
          subdomains={['1', '2', '3', '4']}
          maxZoom={18}
        />
        
        {/* 海图底图 - OpenSeaMap */}
        {showSeaMap && (
          <TileLayer
            attribution='&copy; <a href="https://www.openseamap.org">OpenSeaMap</a>'
            url="https://{s}.tiles.openseamap.org/seamark/{z}/{x}/{y}.png"
            subdomains={['a', 'b', 'c']}
            maxZoom={19}
          />
        )}

        {/* 港口标记 */}
        {showPorts && filteredPorts.map((port) => {
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

        {/* 数据库航迹 */}
        {showTrajectories && trajectories.map((trajectory) => {
          const points = parseWKT(trajectory.wkt_route);
          if (points.length < 2) return null;
          
          const isSelected = selectedTrajectory?.id === trajectory.id;
          const color = isSelected ? '#ef4444' : '#3b82f6';
          const weight = isSelected ? 4 : 2;
          
          return (
            <Polyline
              key={trajectory.id}
              positions={points}
              pathOptions={{ color, weight, opacity: 0.8 }}
              eventHandlers={{
                click: () => {
                  // 通过 window 触发父组件事件
                  (window as any).__selectTrajectory?.(trajectory);
                },
              }}
            />
          );
        })}

        {/* 选中航迹的起止点 */}
        {selectedTrajectory && (() => {
          const points = parseWKT(selectedTrajectory.wkt_route);
          if (points.length === 0) return null;
          
          const startPoint = points[0];
          const endPoint = points[points.length - 1];
          
          return (
            <>
              <Marker position={startPoint} icon={L.divIcon({
                className: 'start-marker',
                html: `<div style="width:12px;height:12px;background:#22c55e;border-radius:50%;border:2px solid #16a34a;"></div>`,
                iconSize: [12, 12],
                iconAnchor: [6, 6],
              })}>
                <Popup>
                  <div className="min-w-[120px] text-xs">
                    <h4 className="font-bold">起点</h4>
                    <p>港口: {selectedTrajectory.start_port || '未知'}</p>
                  </div>
                </Popup>
              </Marker>
              <Marker position={endPoint} icon={L.divIcon({
                className: 'end-marker',
                html: `<div style="width:12px;height:12px;background:#ef4444;border-radius:50%;border:2px solid #dc2626;"></div>`,
                iconSize: [12, 12],
                iconAnchor: [6, 6],
              })}>
                <Popup>
                  <div className="min-w-[120px] text-xs">
                    <h4 className="font-bold">终点</h4>
                    <p>港口: {selectedTrajectory.end_port || '未知'}</p>
                  </div>
                </Popup>
              </Marker>
            </>
          );
        })()}

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
  );
}
