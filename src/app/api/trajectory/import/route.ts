import { NextRequest, NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return NextResponse.json({ error: '未提供文件' }, { status: 400 });
    }

    const fileName = file.name.toLowerCase();
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    
    // 创建临时文件
    const tmpDir = '/tmp/trajectory-import';
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }
    
    const tmpPath = path.join(tmpDir, file.name);
    fs.writeFileSync(tmpPath, fileBuffer);

    let trajectories: any[] = [];

    if (fileName.endsWith('.shp')) {
      // 解析 Shapefile
      trajectories = await parseShapefile(tmpPath);
    } else if (fileName.endsWith('.geojson') || fileName.endsWith('.json')) {
      // 解析 GeoJSON
      trajectories = await parseGeoJSON(tmpPath);
    } else if (fileName.endsWith('.csv')) {
      // 解析 CSV
      trajectories = await parseCSV(tmpPath);
    } else {
      return NextResponse.json({ error: '不支持的文件格式，支持 SHP/GeoJSON/CSV' }, { status: 400 });
    }

    // 清理临时文件
    fs.unlinkSync(tmpPath);

    return NextResponse.json({
      success: true,
      count: trajectories.length,
      trajectories
    });
  } catch (error) {
    console.error('导入失败:', error);
    return NextResponse.json({ error: '导入失败' }, { status: 500 });
  }
}

async function parseShapefile(filePath: string): Promise<any[]> {
  // 使用 Python 解析 Shapefile
  const script = `
import shapefile
import json
import sys

try:
    sf = shapefile.Reader('${filePath}')
    trajectories = []
    
    for i, shape in enumerate(sf.shapes()):
        if shape.shapeType == shapefile.POLYLINE or shape.shapeType == shapefile.POLYLINEZ:
            # 提取线段坐标
            coords = []
            for part_start in range(len(shape.parts)):
                part_end = len(shape.points) if part_start == len(shape.parts) - 1 else shape.parts[part_start + 1]
                part_points = shape.points[part_start:part_end]
                coords.extend([[p[0], p[1]] for p in part_points])
            
            if coords:
                # 生成 WKT
                wkt = "LINESTRING (" + ", ".join([f"{c[0]} {c[1]}" for c in coords]) + ")"
                
                # 计算边界
                lats = [c[1] for c in coords]
                lngs = [c[0] for c in coords]
                
                trajectories.append({
                    'segment_id': f'SHP_{i+1}',
                    'wkt_route': wkt,
                    'bounds_min_lng': min(lngs),
                    'bounds_max_lng': max(lngs),
                    'bounds_min_lat': min(lats),
                    'bounds_max_lat': max(lats),
                    'start_port': None,
                    'end_port': None,
                    'sea_area': None
                })
    
    print(json.dumps(trajectories))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;

  const { stdout } = await execAsync(`python3 -c "${script.replace(/"/g, '\\"')}"`);
  const result = JSON.parse(stdout);
  
  if (result.error) {
    throw new Error(result.error);
  }
  
  return result;
}

async function parseGeoJSON(filePath: string): Promise<any[]> {
  const script = `
import json
import sys

try:
    with open('${filePath}', 'r') as f:
        data = json.load(f)
    
    trajectories = []
    features = data.get('features', []) if 'features' in data else [data]
    
    for i, feature in enumerate(features):
        geom = feature.get('geometry', {})
        props = feature.get('properties', {})
        
        if geom.get('type') == 'LineString':
            coords = geom.get('coordinates', [])
        elif geom.get('type') == 'MultiLineString':
            coords = [c for part in geom.get('coordinates', []) for c in part]
        else:
            continue
        
        if coords:
            wkt = "LINESTRING (" + ", ".join([f"{c[0]} {c[1]}" for c in coords]) + ")"
            lats = [c[1] for c in coords]
            lngs = [c[0] for c in coords]
            
            trajectories.append({
                'segment_id': props.get('id', props.get('segment_id', f'GEO_{i+1}')),
                'wkt_route': wkt,
                'bounds_min_lng': min(lngs),
                'bounds_max_lng': max(lngs),
                'bounds_min_lat': min(lats),
                'bounds_max_lat': max(lats),
                'start_port': props.get('start_port'),
                'end_port': props.get('end_port'),
                'sea_area': props.get('sea_area')
            })
    
    print(json.dumps(trajectories))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;

  const { stdout } = await execAsync(`python3 -c "${script.replace(/"/g, '\\"')}"`);
  const result = JSON.parse(stdout);
  
  if (result.error) {
    throw new Error(result.error);
  }
  
  return result;
}

async function parseCSV(filePath: string): Promise<any[]> {
  const script = `
import csv
import json
import sys

try:
    trajectories = []
    with open('${filePath}', 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for i, row in enumerate(reader):
            trajectories.append({
                'segment_id': row.get('航段编号', row.get('segment_id', f'CSV_{i+1}')),
                'start_port': row.get('起港口', row.get('start_port')),
                'end_port': row.get('止港口', row.get('end_port')),
                'wkt_route': row.get('WKT航线', row.get('wkt_route')),
                'sea_area': row.get('途经海域', row.get('sea_area'))
            })
    
    print(json.dumps(trajectories))
except Exception as e:
    print(json.dumps({'error': str(e)}))
`;

  const { stdout } = await execAsync(`python3 -c "${script.replace(/"/g, '\\"')}"`);
  const result = JSON.parse(stdout);
  
  if (result.error) {
    throw new Error(result.error);
  }
  
  return result;
}
