/**
 * 文件解析模块
 * 支持 Excel、Doc、MD、JSON、图片、PDF、PPT 等多种格式
 * 集成微软 MarkItDown 进行文档转换
 */

import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';
import { spawn } from 'child_process';
import path from 'path';

export type Modality = 'text' | 'image' | 'excel' | 'doc' | 'md' | 'json' | 'trajectory' | 'pdf' | 'ppt';

export interface ParsedItem {
  id: string;
  modality: Modality;
  title: string;
  content: string;
  metadata?: Record<string, unknown>;
}

export interface ParseResult {
  success: boolean;
  items: ParsedItem[];
  error?: string;
}

/**
 * 生成唯一 ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * 解析 Excel 文件 - 每行作为独立条目存储，便于单独检索
 */
export async function parseExcel(buffer: Buffer, filename: string): Promise<ParseResult> {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const items: ParsedItem[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
      const columns = Object.keys(jsonData[0] || {});

      // 每行数据单独存储为一条记录
      jsonData.forEach((row, index) => {
        const content = Object.entries(row)
          .map(([key, value]) => `${key}: ${value}`)
          .join(', ');
        
        // 提取标题：优先使用名称/标题字段，否则使用第一列值
        const titleField = row['名称'] || row['标题'] || row['name'] || row['title'] || row[columns[0]];
        const title = titleField ? String(titleField) : `${filename} - ${sheetName} - 行${index + 1}`;

        items.push({
          id: generateId(),
          modality: 'excel',
          title,
          content,
          metadata: {
            sheetName,
            rowIndex: index + 1,
            columns,
            source: filename,
          },
        });
      });
    }

    return { success: true, items };
  } catch (error) {
    return { 
      success: false, 
      items: [], 
      error: `Excel 解析失败: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}

/**
 * 解析 Word 文档
 */
export async function parseDoc(buffer: Buffer, filename: string): Promise<ParseResult> {
  try {
    const result = await mammoth.extractRawText({ buffer });
    
    const items: ParsedItem[] = [{
      id: generateId(),
      modality: 'doc',
      title: filename,
      content: result.value,
      metadata: {
        charCount: result.value.length,
      },
    }];

    return { success: true, items };
  } catch (error) {
    return { 
      success: false, 
      items: [], 
      error: `Doc 解析失败: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}

/**
 * 解析 Markdown 文件
 */
export async function parseMarkdown(content: string, filename: string): Promise<ParseResult> {
  try {
    // 提取标题（第一个 # 开头的行）
    const titleMatch = content.match(/^#\s+(.+)$/m);
    const title = titleMatch ? titleMatch[1] : filename;

    const items: ParsedItem[] = [{
      id: generateId(),
      modality: 'md',
      title,
      content,
      metadata: {
        charCount: content.length,
        hasTitle: !!titleMatch,
      },
    }];

    return { success: true, items };
  } catch (error) {
    return { 
      success: false, 
      items: [], 
      error: `Markdown 解析失败: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}

/**
 * 解析 JSON 文件
 */
export async function parseJson(content: string, filename: string): Promise<ParseResult> {
  try {
    const data = JSON.parse(content);
    const items: ParsedItem[] = [];

    const processValue = (obj: unknown, path: string = ''): void => {
      if (typeof obj === 'object' && obj !== null) {
        if (Array.isArray(obj)) {
          obj.forEach((item, index) => processValue(item, `${path}[${index}]`));
        } else {
          // 将对象转换为文本
          const textContent = Object.entries(obj as Record<string, unknown>)
            .map(([key, value]) => {
              if (typeof value === 'object') {
                return `${key}: ${JSON.stringify(value)}`;
              }
              return `${key}: ${value}`;
            })
            .join('\n');

          if (textContent.trim()) {
            items.push({
              id: generateId(),
              modality: 'json',
              title: `${filename}${path ? ` - ${path}` : ''}`,
              content: textContent,
              metadata: {
                path,
                type: 'object',
              },
            });
          }
        }
      }
    };

    if (Array.isArray(data)) {
      data.forEach((item, index) => processValue(item, `[${index}]`));
    } else {
      processValue(data);
    }

    // 如果没有解析出条目，直接存储整个 JSON
    if (items.length === 0) {
      items.push({
        id: generateId(),
        modality: 'json',
        title: filename,
        content: JSON.stringify(data, null, 2),
        metadata: { type: Array.isArray(data) ? 'array' : 'object' },
      });
    }

    return { success: true, items };
  } catch (error) {
    return { 
      success: false, 
      items: [], 
      error: `JSON 解析失败: ${error instanceof Error ? error.message : String(error)}` 
    };
  }
}

/**
 * 解析纯文本文件
 */
export async function parseText(content: string, filename: string): Promise<ParseResult> {
  const items: ParsedItem[] = [{
    id: generateId(),
    modality: 'text',
    title: filename,
    content,
    metadata: {
      charCount: content.length,
      lineCount: content.split('\n').length,
    },
  }];

  return { success: true, items };
}

/**
 * 根据文件类型选择解析器
 */
export function getFileType(filename: string): Modality | null {
  const ext = filename.toLowerCase().split('.').pop();
  
  const typeMap: Record<string, Modality> = {
    'xlsx': 'excel',
    'xls': 'excel',
    'docx': 'doc',
    'doc': 'doc',
    'md': 'md',
    'markdown': 'md',
    'json': 'json',
    'txt': 'text',
    'csv': 'excel',
    'png': 'image',
    'jpg': 'image',
    'jpeg': 'image',
    'gif': 'image',
    'webp': 'image',
    'pdf': 'pdf',
    'pptx': 'ppt',
    'ppt': 'ppt',
    'mp3': 'text',  // 音频通过 MarkItDown 转文字
    'wav': 'text',
    'm4a': 'text',
    'epub': 'text',  // EPUB 通过 MarkItDown 转 Markdown
  };

  return ext ? typeMap[ext] || null : null;
}

/**
 * 使用 MarkItDown 转换文件（支持 PDF、PPT、音频等）
 */
export async function convertWithMarkItDown(buffer: Buffer, filename: string): Promise<ParseResult> {
  try {
    // 转换为 Base64
    const base64Content = buffer.toString('base64');
    
    // 调用 Python 脚本
    const scriptPath = path.join(process.cwd(), 'scripts', 'markitdown_converter.py');
    
    // 使用 spawn 并通过 stdin 传递 base64 内容（避免命令行参数过长导致 E2BIG 错误）
    const result = await new Promise<any>((resolve, reject) => {
      const proc = spawn('python3', [scriptPath, '--stdin', filename]);
      
      let stdout = '';
      let stderr = '';
      
      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });
      
      proc.on('error', (err) => reject(err));
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(stderr || `Process exited with code ${code}`));
        } else {
          try {
            resolve(JSON.parse(stdout));
          } catch (e) {
            reject(new Error(`Invalid JSON: ${stdout.substring(0, 200)}`));
          }
        }
      });
      
      // 通过 stdin 发送 base64 内容
      proc.stdin.write(base64Content);
      proc.stdin.end();
    });
    
    if (!result.success) {
      return { success: false, items: [], error: result.error || 'MarkItDown 转换失败' };
    }
    
    // 解析 Markdown 内容，按段落分割
    const markdownContent = result.text_content;
    const title = result.title || filename;
    
    // 打印解析详情
    console.log(`[PDF解析] 文件: ${filename}, 字符数: ${markdownContent.length}, 页数: ${result.page_count || '未知'}, 段落数: ${markdownContent.split(/\n\n+/).length}`);
    
    // 将 Markdown 按段落分割成多个条目（便于检索）
    const paragraphs = markdownContent
      .split(/\n\n+/)
      .filter((p: string) => p.trim().length > 50)  // 过滤太短的段落
      .map((p: string) => p.trim());
    
    const items: ParsedItem[] = paragraphs.map((content: string, index: number) => ({
      id: generateId(),
      modality: getFileType(filename) || 'text',
      title: paragraphs.length > 1 ? `${title} - 第${index + 1}段` : title,
      content,
      metadata: {
        source: filename,
        paragraphIndex: index + 1,
        totalParagraphs: paragraphs.length,
        originalTitle: title,
      },
    }));
    
    // 如果没有分割出段落，存储整个内容
    if (items.length === 0) {
      items.push({
        id: generateId(),
        modality: getFileType(filename) || 'text',
        title,
        content: markdownContent,
        metadata: { source: filename },
      });
    }
    
    return { success: true, items };
  } catch (error) {
    return {
      success: false,
      items: [],
      error: `MarkItDown 转换失败: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * RAGAnything content item from MinerU parser
 */
interface RAGAnythingContentItem {
  type: string;
  text?: string;
  img_path?: string;
  image_caption?: string[];
  table_body?: string;
  table_caption?: string[];
  text_level?: number;
  bbox?: number[];
  page_idx?: number;
}

/**
 * RAGAnything parse result (from Python script)
 */
interface RAGAnythingResult {
  success: boolean;
  error?: string;
  filename?: string;
  content_list?: RAGAnythingContentItem[];
  doc_id?: string;
  page_count?: number;
  parser_used?: string;
}

/**
 * 使用 RAGAnything MinerU 解析 PDF/PPT 等复杂文档
 * 需要: OPENAI_API_KEY (optional, for VLM image captioning)
 * 需要: pip install 'raganything[all]'
 */
export async function convertWithRAGAnything(buffer: Buffer, filename: string): Promise<ParseResult> {
  try {
    const base64Content = buffer.toString('base64');
    const scriptPath = path.join(process.cwd(), 'scripts', 'raganything_parser.py');

    const result: RAGAnythingResult = await new Promise((resolve, reject) => {
      const proc = spawn('python3', [scriptPath, '--stdin', filename], {
        timeout: 300000, // 5 min timeout for large PDFs
        env: {
          ...process.env,
          MINERU_MODEL_SOURCE: process.env.MINERU_MODEL_SOURCE || 'modelscope',
        },
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => { stdout += data.toString(); });
      proc.stderr.on('data', (data) => { stderr += data.toString(); });

      proc.on('error', (err) => reject(err));
      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(stderr || `RAGAnything exited with code ${code}`));
        } else {
          try {
            resolve(JSON.parse(stdout));
          } catch (e) {
            reject(new Error(`RAGAnything invalid JSON: ${stdout.substring(0, 200)}`));
          }
        }
      });

      proc.stdin.write(base64Content);
      proc.stdin.end();
    });

    if (!result.success || !result.content_list) {
      return { success: false, items: [], error: result.error || 'RAGAnything parse failed' };
    }

    console.log(`[RAGAnything] ${filename}: ${result.content_list.length} blocks, ${result.page_count} pages, parser=${result.parser_used}`);

    return transformContentListToParsedItems(result.content_list, filename);

  } catch (error) {
    return {
      success: false,
      items: [],
      error: `RAGAnything failed: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * 将 RAGAnything content_list 转换为 ShipRag ParsedItem[]
 */
function transformContentListToParsedItems(
  contentList: RAGAnythingContentItem[],
  filename: string
): ParseResult {
  const items: ParsedItem[] = [];

  for (let i = 0; i < contentList.length; i++) {
    const block = contentList[i];
    const pageIdx = block.page_idx ?? 0;

    if (block.type === 'text' && block.text) {
      // Only keep meaningful text (skip single-line headers that are just numbers)
      const text = block.text.trim();
      if (text.length < 5) continue; // skip too-short fragments

      const level = block.text_level || 0;
      const titlePrefix = level <= 2 ? `[H${level}] ` : '';

      items.push({
        id: generateId(),
        modality: 'pdf',
        title: `${filename} - P${pageIdx + 1}${titlePrefix}`,
        content: text,
        metadata: {
          source: filename,
          pageIdx,
          textLevel: level,
          bbox: block.bbox,
          type: 'text',
        },
      });
    } else if (block.type === 'image' && block.img_path) {
      // Image: store path for later S3 upload + LLM description
      const caption = (block.image_caption || []).join('; ');
      items.push({
        id: generateId(),
        modality: 'image',
        title: `${filename} - P${pageIdx + 1} Image`,
        content: caption || '', // will be enriched by upload route
        metadata: {
          source: filename,
          pageIdx,
          imgPath: block.img_path,
          imageCaption: block.image_caption,
          type: 'image',
        },
      });
    } else if (block.type === 'table' && block.table_body) {
      // Table: store markdown directly
      const caption = (block.table_caption || []).join('; ');
      items.push({
        id: generateId(),
        modality: 'pdf',
        title: `${filename} - P${pageIdx + 1} Table${caption ? ': ' + caption : ''}`,
        content: block.table_body,
        metadata: {
          source: filename,
          pageIdx,
          tableCaption: block.table_caption,
          type: 'table',
        },
      });
    }
    // equation type is skipped for now (LaTeX doesn't embed well)
  }

  // If we got too few items, create one summary item with all text
  if (items.length === 0) {
    const allText = contentList
      .filter(b => b.type === 'text' && b.text)
      .map(b => b.text)
      .join('\n\n');
    if (allText) {
      items.push({
        id: generateId(),
        modality: 'pdf',
        title: filename,
        content: allText,
        metadata: { source: filename, type: 'full_text' },
      });
    }
  }

  return { success: true, items };
}

/**
 * 检查是否应该使用 RAGAnything 解析
 */
export function shouldUseRAGAnything(): boolean {
  // Feature toggle via env
  if (process.env.RAG_ENRICHMENT_ENABLED !== 'true') return false;
  return true;
}

/**
 * 统一解析入口
 */
export async function parseFile(
  buffer: Buffer,
  filename: string,
  mimeType?: string
): Promise<ParseResult> {
  const fileType = getFileType(filename);
  
  if (!fileType) {
    return { 
      success: false, 
      items: [], 
      error: `不支持的文件类型: ${filename}` 
    };
  }

  switch (fileType) {
    case 'excel':
      return parseExcel(buffer, filename);
    case 'doc':
      return parseDoc(buffer, filename);
    case 'md':
      return parseMarkdown(buffer.toString('utf-8'), filename);
    case 'json':
      return parseJson(buffer.toString('utf-8'), filename);
    case 'text':
      // 对于音频文件，使用 MarkItDown 进行语音转录
      const ext = filename.toLowerCase().split('.').pop();
      if (['mp3', 'wav', 'm4a', 'epub'].includes(ext || '')) {
        return convertWithMarkItDown(buffer, filename);
      }
      return parseText(buffer.toString('utf-8'), filename);
    case 'image':
      // 图片不解析内容，返回空，由上层处理上传
      return { 
        success: true, 
        items: [{
          id: generateId(),
          modality: 'image',
          title: filename,
          content: '', // 图片内容为空，需要后续处理
          metadata: { mimeType },
        }] 
      };
    case 'pdf':
    case 'ppt':
      // PDF 和 PPT 使用 MarkItDown 转换
      return convertWithMarkItDown(buffer, filename);
    default:
      return { 
        success: false, 
        items: [], 
        error: `暂不支持该文件类型: ${fileType}` 
      };
  }
}
