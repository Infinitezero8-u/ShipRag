/**
 * 智能文档分块器 — P1-1 修复
 *
 * 策略: 按段落/H2/H3 自然边界切分，每块 500-800 字，块间 100 字重叠。
 * 这样 "金阿兰湾" 会出现在它自己的块里，不会被埋在上万字的整体文档中。
 */

export interface Chunk {
  index: number;
  text: string;
  title: string;
  metadata: { heading?: string; position: number; totalChunks: number };
}

/**
 * 对纯文本做智能分块
 */
export function chunkText(text: string, options: {
  title?: string;
  chunkSize?: number;
  chunkOverlap?: number;
} = {}): Chunk[] {
  const {
    title = '',
    chunkSize = 800,
    chunkOverlap = 100,
  } = options;

  if (!text || text.trim().length < chunkSize) {
    return [{ index: 0, text: text || '', title, metadata: { position: 0, totalChunks: 1 } }];
  }

  const paragraphs = text.split(/\n\s*\n/);
  const chunks: string[] = [];
  let currentChunk = '';
  let heading = '';

  for (const para of paragraphs) {
    const trimmed = para.trim();
    if (!trimmed) continue;

    // 检测标题行 (H2/H3 Markdown 格式)
    if (/^#{1,3}\s/.test(trimmed)) {
      heading = trimmed.replace(/^#{1,3}\s+/, '').substring(0, 60);
      if (currentChunk.length > chunkSize * 0.5) {
        chunks.push(currentChunk.trim());
        currentChunk = '';
      }
      currentChunk += trimmed + '\n\n';
      continue;
    }

    // 如果当前块加上新段落会超过限制
    if (currentChunk.length + trimmed.length > chunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());

      // 保留 overlap：取当前块最后 100 字作为重叠
      const overlap = currentChunk.slice(-chunkOverlap);
      currentChunk = overlap + '\n\n' + trimmed + '\n\n';
    } else {
      currentChunk += trimmed + '\n\n';
    }
  }

  // 最后一块
  if (currentChunk.trim()) {
    chunks.push(currentChunk.trim());
  }

  return chunks.map((text, i) => ({
    index: i,
    text,
    title: heading || title,
    metadata: { heading, position: i, totalChunks: chunks.length },
  }));
}

/**
 * 对 Markdown 文档分块，优先在 H2/H3 边界切
 */
export function chunkMarkdown(md: string, title?: string): Chunk[] {
  return chunkText(md, { title, chunkSize: 800, chunkOverlap: 100 });
}

/**
 * 对港口/航线等结构化数据生成描述文本块
 */
export function chunkPortData(port: {
  port_code: string; name_cn: string; ctry_name_cn: string;
  continent_name_cn?: string; lon?: number; lat?: number; port_type?: string;
}): string {
  const parts = [
    `港口代码: ${port.port_code}`,
    `中文名: ${port.name_cn}`,
    `所属国家: ${port.ctry_name_cn}`,
  ];
  if (port.continent_name_cn) parts.push(`所在大洲: ${port.continent_name_cn}`);
  if (port.lon != null && port.lat != null) parts.push(`坐标: ${port.lon.toFixed(4)}, ${port.lat.toFixed(4)}`);
  if (port.port_type) parts.push(`港口类型: ${port.port_type}`);
  return parts.join(', ');
}
