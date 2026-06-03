# NOAA S-57 海图集成指南

## 一、数据准备

### 1. 下载和解压
```bash
# 下载 NOAA 全球海图
wget https://charts.noaa.gov/ENCs/All_ENCs.zip

# 解压
unzip All_ENCs.zip -d enc_data
```

### 2. 转换为 GeoJSON (使用 GDAL)
```bash
# 安装 GDAL
# Ubuntu: apt-get install gdal-bin
# Mac: brew install gdal

# 转换单个文件
ogr2ogr -f GeoJSON output.json input.000

# 批量转换
for f in enc_data/**/*.000; do
  ogr2ogr -f GeoJSON "${f%.000}.json" "$f"
done
```

## 二、Web 集成方式

### 方式 A: 直接加载 GeoJSON (小范围)
```javascript
// 适合小范围海图
fetch('/enc_data/chart.json')
  .then(res => res.json())
  .then(data => {
    L.geoJSON(data, {
      style: feature => ({
        color: getChartColor(feature.properties.OBJNAM),
        weight: 1
      })
    }).addTo(map);
  });
```

### 方式 B: 矢量瓦片 (推荐，大数据量)
```bash
# 使用 tippecanoe 生成矢量瓦片
tippecanoe -o enc_tiles.mbtiles *.json

# 或使用 mapbox-gl-js 直接渲染
```

### 方式 C: 样式化渲染 (Mapbox GL)
```javascript
import mapboxgl from 'mapbox-gl';

const map = new mapboxgl.Map({
  style: {
    sources: {
      enc: {
        type: 'vector',
        url: 'mbtiles://enc_tiles.mbtiles'
      }
    },
    layers: [
      {
        id: 'depth-contours',
        type: 'line',
        source: 'enc',
        'source-layer': 'depth',
        paint: { 'line-color': '#0066cc' }
      }
    ]
  }
});
```

## 三、S-57 要素类型

| 要素代码 | 名称 | 样式建议 |
|---------|------|---------|
| DEPARE | 深度区域 | 蓝色填充 |
| DEPCNT | 等深线 | 蓝色线条 |
| LIGHTS | 灯塔/灯标 | 黄色图标 |
| BOYCAR | 浮标 | 绿色图标 |
| BCNSPP | 信标 | 红色图标 |
| SLCONS | 海岸线 | 灰色线条 |
| BUAARE | 建成区 | 灰色填充 |

## 四、简化方案（仅加载关键要素）

```javascript
// 只加载重要要素
const IMPORTANT_LAYERS = ['LIGHTS', 'BOYCAR', 'BCNSPP', 'DEPCNT'];

function filterENC(geojson) {
  return {
    ...geojson,
    features: geojson.features.filter(f =>
      IMPORTANT_LAYERS.includes(f.properties?.OBJNAM)
    )
  };
}
```

## 五、注意事项

1. **文件大小**: 全球海图很大，建议只下载需要的区域
2. **更新频率**: NOAA 每周更新，建议定期同步
3. **版权**: NOAA 海图为公共领域，可自由使用
4. **性能**: 大量 GeoJSON 建议使用矢量瓦片

## 六、替代方案

如果 S-57 处理复杂，可使用：
- **OpenSeaMap**: 开源海图瓦片，直接叠加
- **Navionics API**: 商业海图服务（需授权）
- **Cesium Ion**: 3D 海图可视化
