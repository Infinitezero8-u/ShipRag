import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** 文件名中间截断: 保留开头和结尾（含扩展名），中间用 ... */
export function truncateMiddle(name: string, maxLen = 30): string {
  if (!name || name.length <= maxLen) return name || '';
  const extIdx = name.lastIndexOf('.');
  const ext = extIdx > 1 && extIdx > name.length - 8 ? name.substring(extIdx) : '';
  const base = ext ? name.substring(0, extIdx) : name;
  const headLen = Math.floor((maxLen - 3 - ext.length) / 2);
  const tailLen = maxLen - 3 - ext.length - headLen;
  if (headLen <= 0 || tailLen <= 0) return name.substring(0, maxLen - 3) + '...';
  return base.substring(0, headLen) + '...' + base.substring(base.length - tailLen) + ext;
}
