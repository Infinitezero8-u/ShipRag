/**
 * Skill: 实体提取 (Entity Extraction)
 *
 * 自动从查询中提取海事专业实体:
 * - 港口代码 (CNSHA→上海, JPTYO→东京)
 * - MMSI (9位数字, 水上移动通信标识)
 * - IMO编号 (IMO 7位数字)
 * - 船舶类型 (集装箱船/散货船/油轮等)
 * - 国家/地区名称
 * - 经纬度坐标
 */

interface ExtractedEntity {
  type: 'port_code' | 'mmsi' | 'imo' | 'ship_type' | 'country' | 'latlon' | 'regulation_name';
  value: string; original: string; confidence: number;
}

const COUNTRY_ALIASES: Record<string, string> = {
  '中国': '中国', 'china': '中国', 'cn': '中国', '大陆': '中国', '内地': '中国',
  '日本': '日本', 'japan': '日本', 'jp': '日本',
  '韩国': '韩国', 'korea': '韩国', 'kr': '韩国',
  '美国': '美国', 'usa': '美国', 'us': '美国',
  '英国': '英国', 'uk': '英国', 'gb': '英国',
  '新加坡': '新加坡', 'singapore': '新加坡', 'sg': '新加坡',
};

const SHIP_TYPES: Record<string, string> = {
  '集装箱船': '集装箱船', 'container': '集装箱船',
  '散货船': '散货船', 'bulk': '散货船',
  '油轮': '油轮', 'tanker': '油轮',
  '客船': '客船', 'passenger': '客船',
  'LNG': 'LNG船', 'lng': 'LNG船',
  '化学品船': '化学品船', 'chemical': '化学品船',
};

/**
 * 从查询文本中提取海事专业实体
 */
export function extractEntities(query: string): ExtractedEntity[] {
  const entities: ExtractedEntity[] = [];

  // 1. MMSI: 9位数字
  const mmsiMatch = query.match(/\b[2-7]\d{8}\b/);
  if (mmsiMatch) entities.push({ type: 'mmsi', value: mmsiMatch[0], original: mmsiMatch[0], confidence: 0.95 });

  // 2. IMO: "IMO" + 7位数字
  const imoMatch = query.match(/IMO\s*(\d{7})/i);
  if (imoMatch) entities.push({ type: 'imo', value: imoMatch[1], original: imoMatch[0], confidence: 0.95 });

  // 3. 港口代码: 5位大写字母 (如CNSHA)
  const portRegex = /\b([A-Z]{2}[A-Z]{3})\b/g;
  for (const m of query.matchAll(portRegex)) {
    if (!/^(SELECT|WHERE|FROM|LIMIT|COUNT|INSERT|DELETE|UPDATE)$/.test(m[1])) {
      entities.push({ type: 'port_code', value: m[1], original: m[1], confidence: 0.85 });
    }
  }

  // 4. 国家名称
  for (const [alias, country] of Object.entries(COUNTRY_ALIASES)) {
    if (query.toLowerCase().includes(alias.toLowerCase()) && !entities.some(e => e.type === 'country' && e.value === country)) {
      entities.push({ type: 'country', value: country, original: alias, confidence: 0.9 });
    }
  }

  // 5. 船舶类型
  for (const [alias, stype] of Object.entries(SHIP_TYPES)) {
    if (query.toLowerCase().includes(alias.toLowerCase())) {
      entities.push({ type: 'ship_type', value: stype, original: alias, confidence: 0.85 });
      break;
    }
  }

  // 6. 经纬度: "-?XX.XX" 或 "XX°XX'XX\""
  const latlonMatch = query.match(/(\d{1,3})[°度](\d{1,2})[′分]?\s*[NS]?[\s,]*(\d{1,3})[°度](\d{1,2})[′分]?\s*[EW]?/);
  if (latlonMatch) {
    entities.push({ type: 'latlon', value: `${latlonMatch[1]}°${latlonMatch[2]}' ${latlonMatch[3]}°${latlonMatch[4]}'`, original: latlonMatch[0], confidence: 0.8 });
  }

  // 7. 法规名称: "XX条例/XX法/XX公约"
  const regMatch = query.match(/([一-龥]{3,20}(?:条例|法|公约|规则|规定|办法))/);
  if (regMatch && !entities.some(e => e.type === 'regulation_name')) {
    entities.push({ type: 'regulation_name', value: regMatch[1], original: regMatch[1], confidence: 0.8 });
  }

  return entities;
}
