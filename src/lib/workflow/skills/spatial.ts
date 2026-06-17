/**
 * Skill: 空间距离计算 (Spatial Proximity)
 *
 * 功能: 基于Haversine公式计算港口间的大圆距离,
 *      支持"距离XX最近的N个港口"、"两港之间距离"等空间查询。
 *
 * 输入: 查询文本 → 自动提取地名+距离要求
 * 输出: 排序后的港口列表(含距离)
 */
import pg from 'pg';

const DB = process.env.DATABASE_URL || 'postgresql://localhost:5432/shiprag';

export interface NearbyPort {
  port_code: string; name_cn: string; ctry_name_cn: string;
  lat: number; lon: number; distance_km: number;
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * 找距离某个港口最近的N个港口
 */
export async function findNearbyPorts(portName: string, n: number = 5, maxKm?: number): Promise<NearbyPort[]> {
  const pool = new pg.Pool({ connectionString: DB, max: 1 });
  try {
    // 1. 获取参考港口坐标
    const { rows: [ref] } = await pool.query(
      `SELECT port_code, name_cn, lat, lon FROM port_data
       WHERE name_cn = $1 OR port_code = $1 LIMIT 1`, [portName]
    );
    if (!ref || ref.lat == null || ref.lon == null) return [];

    // 2. 获取所有港口(排除自身)并计算距离
    const { rows } = await pool.query(
      `SELECT port_code, name_cn, ctry_name_cn, lat, lon FROM port_data
       WHERE (lat IS NOT NULL AND lon IS NOT NULL)
       AND port_code != $1 LIMIT 5000`, [ref.port_code]
    );

    const withDist = rows.map(r => ({
      ...r,
      distance_km: haversineKm(ref.lat, ref.lon, r.lat, r.lon),
    }))
    .filter(r => !maxKm || r.distance_km <= maxKm)
    .sort((a, b) => a.distance_km - b.distance_km)
    .slice(0, n);

    return withDist;
  } finally { await pool.end(); }
}

/**
 * 计算两个港口之间的距离
 */
export async function distanceBetweenPorts(a: string, b: string): Promise<number | null> {
  const pool = new pg.Pool({ connectionString: DB, max: 1 });
  try {
    const { rows } = await pool.query(
      `SELECT port_code, name_cn, lat, lon FROM port_data
       WHERE port_code = $1 OR name_cn = $1 OR port_code = $2 OR name_cn = $2 LIMIT 2`,
      [a, b]
    );
    if (rows.length < 2) return null;
    return haversineKm(rows[0].lat, rows[0].lon, rows[1].lat, rows[1].lon);
  } finally { await pool.end(); }
}

/**
 * 判断查询是否触发空间距离Skill
 * 匹配模式: "距离XX最近"、"XX附近"、"靠近XX"、"XX周围"
 */
export function shouldUseSpatial(query: string): { use: boolean; portName?: string; topN?: number } {
  const patterns = [
    /距离(.{1,8})最[近进]/,
    /(.{1,8})附近的港口/,
    /靠近(.{1,8})的港口/,
    /(.{1,8})周围/,
    /离(.{1,8})(最近|多远)/,
  ];
  for (const p of patterns) {
    const m = query.match(p);
    if (m) return { use: true, portName: m[1].replace(/的|港口|港/g, ''), topN: 5 };
  }

  const topN = /最近的?(\d+)个/.exec(query);
  if (topN) return { use: true, portName: '上海', topN: parseInt(topN[1]) };

  return { use: false };
}
