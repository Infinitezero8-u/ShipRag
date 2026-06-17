'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  History, Trash2, Download, Loader2, X, Search, MessageSquare,
  ChevronLeft, ChevronRight, Clock, RefreshCw
} from 'lucide-react';

interface HistoryItem {
  id: string;
  history_type: 'rag' | 'search';
  query: string;
  answer: string;
  modality: string;
  source: string;
  result_count: number;
  created_at: string;
}

interface HistoryPanelProps {
  type: 'rag' | 'search';
  onLoadItem?: (item: HistoryItem) => void;
  onClose: () => void;
}

export function HistoryPanel({ type, onLoadItem, onClose }: HistoryPanelProps) {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [exporting, setExporting] = useState(false);
  const pageSize = 20;

  const loadHistory = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/history?action=list&type=${type}&page=${page}&pageSize=${pageSize}`);
      const data = await res.json();
      if (data.success) {
        setHistory(data.history || []);
        setTotalPages(data.pagination?.totalPages || 1);
        setTotalCount(data.pagination?.totalCount || 0);
      }
    } catch (e) {
      console.error('加载历史记录失败:', e);
    }
    setLoading(false);
  };

  useEffect(() => { loadHistory(); }, [page, type]);

  const handleDelete = async (id: string) => {
    if (!confirm('删除此条记录？')) return;
    try {
      await fetch(`/api/history?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      loadHistory();
    } catch (e) { console.error('删除失败:', e); }
  };

  const handleClearAll = async () => {
    if (!confirm(`确认清空所有${type === 'rag' ? '智能问答' : '智能检索'}历史记录？此操作不可恢复。`)) return;
    try {
      await fetch(`/api/history?action=clear&type=${type}`, { method: 'DELETE' });
      setPage(1);
      loadHistory();
    } catch (e) { console.error('清空失败:', e); }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const res = await fetch(`/api/history?action=export&type=${type}`);
      if (!res.ok) { alert('导出失败'); setExporting(false); return; }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `历史记录_${type === 'rag' ? '智能问答' : '智能检索'}_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { alert('导出失败'); }
    setExporting(false);
  };

  const title = type === 'rag' ? '智能问答历史' : '智能检索历史';

  return (
    <Card className="w-full h-full flex flex-col border-indigo-200 shadow-lg">
      <CardHeader className="pb-2 pt-3 px-3 shrink-0">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {type === 'rag' ? <MessageSquare className="w-4 h-4 text-indigo-500" /> : <Search className="w-4 h-4 text-sky-500" />}
            <CardTitle className="text-sm font-medium">{title}</CardTitle>
            <Badge variant="secondary" className="text-[10px]">{totalCount} 条</Badge>
          </div>
          <div className="flex items-center gap-1">
            <Button size="sm" variant="outline" onClick={handleExport} disabled={exporting || totalCount === 0}
              className="h-6 text-[10px] px-2" title="导出 Excel">
              {exporting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Download className="w-3 h-3 mr-1" />}
              导出
            </Button>
            <Button size="sm" variant="outline" onClick={handleClearAll} disabled={totalCount === 0}
              className="h-6 text-[10px] px-2 text-red-500 border-red-200" title="清空">
              <Trash2 className="w-3 h-3 mr-1" />清空
            </Button>
            <Button size="sm" variant="ghost" onClick={onClose} className="h-6 w-6 p-0">
              <X className="w-3 h-3" />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-0 flex-1 overflow-hidden flex flex-col">
        {/* 列表 */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-slate-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />加载中...
            </div>
          ) : history.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <History className="w-10 h-10 mb-2 opacity-20" />
              <p className="text-xs">暂无{title}记录</p>
              <p className="text-[10px] mt-1">进行对话或搜索后会自动保存</p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100">
              {history.map((item) => (
                <div key={item.id}
                  onClick={() => onLoadItem?.(item)}
                  className="p-2 hover:bg-indigo-50/30 cursor-pointer transition-colors group">
                  {/* 查询（主显） */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium text-slate-700 line-clamp-2 leading-relaxed">
                        {item.query}
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0" title="重新搜索"
                        onClick={(e) => { e.stopPropagation(); onLoadItem?.(item); }}>
                        <RefreshCw className="w-2.5 h-2.5 text-slate-400" />
                      </Button>
                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0 text-red-400" title="删除"
                        onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}>
                        <Trash2 className="w-2.5 h-2.5" />
                      </Button>
                    </div>
                  </div>
                  {/* 回答预览 */}
                  {item.answer && (
                    <p className="text-[10px] text-slate-400 line-clamp-1 mt-0.5 ml-0">
                      {item.answer.substring(0, 120)}
                    </p>
                  )}
                  {/* 时间 + 元信息 */}
                  <div className="flex items-center gap-2 mt-1">
                    <Clock className="w-2.5 h-2.5 text-slate-300" />
                    <span className="text-[9px] text-slate-400">
                      {item.created_at ? new Date(item.created_at).toLocaleString('zh-CN') : ''}
                    </span>
                    {item.modality && (
                      <Badge variant="outline" className="text-[8px] h-3.5 px-1">{item.modality}</Badge>
                    )}
                    {item.result_count > 0 && (
                      <span className="text-[9px] text-slate-400">{item.result_count} 条结果</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-center gap-1 py-2 border-t shrink-0">
            <Button size="sm" variant="outline" disabled={page <= 1}
              onClick={() => setPage(p => p - 1)} className="h-6 text-[10px] px-2">
              <ChevronLeft className="w-3 h-3" />
            </Button>
            <span className="text-[10px] text-slate-500 px-2">{page} / {totalPages}</span>
            <Button size="sm" variant="outline" disabled={page >= totalPages}
              onClick={() => setPage(p => p + 1)} className="h-6 text-[10px] px-2">
              <ChevronRight className="w-3 h-3" />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
