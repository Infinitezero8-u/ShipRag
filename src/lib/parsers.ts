/**
 * 文件解析模块
 * 支持 Excel、Doc、MD、JSON、图片等多种格式
 */

import * as XLSX from 'xlsx';
import * as mammoth from 'mammoth';

export type Modality = 'text' | 'image' | 'excel' | 'doc' | 'md' | 'json' | 'trajectory';

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
  };

  return ext ? typeMap[ext] || null : null;
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
    default:
      return { 
        success: false, 
        items: [], 
        error: `暂不支持该文件类型: ${fileType}` 
      };
  }
}
