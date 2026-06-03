'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Upload, 
  Search, 
  MessageSquare, 
  FileText, 
  Image, 
  FileSpreadsheet,
  Loader2,
  Send,
  Play,
  Pause,
  X,
  ChevronLeft,
  ChevronRight,
  Eye,
  Settings
} from 'lucide-react';

type Modality = 'text' | 'image' | 'excel' | 'doc' | 'md' | 'json' | 'trajectory';

const modalityIcons: Record<Modality, React.ReactNode> = {
  text: <FileText className="w-4 h-4" />,
  image: <Image className="w-4 h-4" />,
  excel: <FileSpreadsheet className="w-4 h-4" />,
  doc: <FileText className="w-4 h-4" />,
  md: <FileText className="w-4 h-4" />,
  json: <FileText className="w-4 h-4" />,
  trajectory: <FileSpreadsheet className="w-4 h-4" />,
};

const modalityLabels: Record<Modality, string> = {
  text: '文本',
  image: '图片',
  excel: 'Excel',
  doc: '文档',
  md: 'MD',
  json: 'JSON',
  trajectory: '航迹',
};

interface KnowledgeItem {
  id: string;
  modality: string;
  title: string;
  content: string;
  source: string;
  similarity?: number;
  status: 'embedded' | 'pending';
  metadata?: Record<string, unknown>;
}

interface Pagination {
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasMore: boolean;
}

export default function RagPage() {
  const [activeTab, setActiveTab] = useState('upload');
  
  // 上传状态
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    filename?: string;
    itemCount?: number;
    error?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // 向量化状态
  const [embedStatus, setEmbedStatus] = useState<{
    total: number;
    embedded: number;
    pending: number;
  } | null>(null);
  const [embedding, setEmbedding] = useState(false);
  const [autoEmbedding, setAutoEmbedding] = useState(false);
  const [embedProgress, setEmbedProgress] = useState({ processed: 0, failed: 0 });
  
  // 展开/折叠状态
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [detailItems, setDetailItems] = useState<KnowledgeItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  
  // 搜索状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searchModality, setSearchModality] = useState<string>('');
  const [searchMode, setSearchMode] = useState<'fuzzy' | 'exact'>('fuzzy');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<KnowledgeItem[]>([]);
  const [searchPagination, setSearchPagination] = useState<Pagination | null>(null);
  const [searchPage, setSearchPage] = useState(1);
  
  // 预览状态
  const [previewItem, setPreviewItem] = useState<KnowledgeItem | null>(null);
  
  // RAG 状态
  const [ragQuery, setRagQuery] = useState('');
  const [ragAnswer, setRagAnswer] = useState('');
  const [ragLoading, setRagLoading] = useState(false);
  const [ragTokenLimit, setRagTokenLimit] = useState(50000); // 用户可调整的 token 上限
  const answerRef = useRef<HTMLDivElement>(null);

  // 获取向量化状态
  const fetchEmbedStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/embed');
      const data = await res.json();
      setEmbedStatus({
        total: data.total || 0,
        embedded: data.embedded || 0,
        pending: data.pending || 0,
      });
    } catch (error) {
      console.error('获取状态失败:', error);
    }
  }, []);

  useEffect(() => {
    fetchEmbedStatus();
    const interval = setInterval(fetchEmbedStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchEmbedStatus]);

  // 文件上传
  const handleUpload = async () => {
    const fileInput = fileInputRef.current;
    if (!fileInput?.files?.length) return;

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    setUploadResult(null);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      setUploadResult(data);
      if (data.success) {
        fetchEmbedStatus();
      }
    } catch (error) {
      setUploadResult({ success: false, error: '上传失败' });
    } finally {
      setUploading(false);
    }
  };

  // 单次向量化
  const handleEmbed = async () => {
    setEmbedding(true);
    try {
      await fetch('/api/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 50 }),
      });
      fetchEmbedStatus();
    } finally {
      setEmbedding(false);
    }
  };

  // 自动向量化
  const toggleAutoEmbed = async () => {
    if (autoEmbedding) {
      setAutoEmbedding(false);
      return;
    }

    setAutoEmbedding(true);
    setEmbedProgress({ processed: 0, failed: 0 });

    while (autoEmbedding || embedStatus?.pending === 0) {
      try {
        const res = await fetch('/api/embed', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ batchSize: 50 }),
        });
        const data = await res.json();
        
        setEmbedProgress(prev => ({
          processed: prev.processed + (data.processed || 0),
          failed: prev.failed + (data.failed || 0),
        }));

        if (data.processed === 0 || data.pending === 0) {
          setAutoEmbedding(false);
          break;
        }
        
        await fetchEmbedStatus();
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error('自动向量化出错:', error);
        setAutoEmbedding(false);
        break;
      }
    }
  };

  // 获取详情列表
  const fetchDetailItems = async (type: 'embedded' | 'pending' | 'all') => {
    setDetailLoading(true);
    try {
      const res = await fetch(`/api/search?type=${type}&limit=20`);
      const data = await res.json();
      setDetailItems(data.items || []);
    } finally {
      setDetailLoading(false);
    }
  };

  const toggleSection = (section: string) => {
    if (expandedSection === section) {
      setExpandedSection(null);
    } else {
      setExpandedSection(section);
      fetchDetailItems(section as 'embedded' | 'pending' | 'all');
    }
  };

  // 全部取消
  const handleCancelAll = async () => {
    if (!confirm('确定要删除所有待向量化的条目吗？')) return;
    try {
      const res = await fetch('/api/embed', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearAll: true }),
      });
      const data = await res.json();
      alert(`已删除 ${data.deleted} 条待处理条目`);
      fetchEmbedStatus();
      if (expandedSection === 'pending') {
        fetchDetailItems('pending');
      }
    } catch (error) {
      alert('取消失败');
    }
  };

  // 搜索
  const handleSearch = async (page: number = 1) => {
    if (!searchQuery.trim()) return;
    setSearching(true);
    setSearchPage(page);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          topK: 500, // 获取更多结果用于分页
          threshold: 0.3,
          mode: searchMode,
          filter: searchModality ? { modality: searchModality } : undefined,
          page,
          pageSize: 10,
        }),
      });
      const data = await res.json();
      setSearchResults(data.results || []);
      setSearchPagination(data.pagination || null);
    } finally {
      setSearching(false);
    }
  };

  // RAG 问答
  const handleRagQuery = async () => {
    if (!ragQuery.trim()) return;
    setRagLoading(true);
    setRagAnswer('');

    try {
      // 计算 topK 基于用户设置的 token 上限（假设每条约 200 tokens）
      const calculatedTopK = Math.floor(ragTokenLimit / 200);
      
      const res = await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: ragQuery, 
          topK: calculatedTopK,
          noLimit: true 
        }),
      });

      const reader = res.body?.getReader();
      if (!reader) return;

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setRagAnswer(prev => prev + chunk);
      }
    } finally {
      setRagLoading(false);
    }
  };

  // 获取图片描述
  const getImageDescription = (item: KnowledgeItem): string => {
    if (item.metadata?.description) {
      return item.metadata.description as string;
    }
    if (item.content && item.content.length > 0) {
      return item.content.substring(0, 150);
    }
    return '图片已向量化，暂无描述';
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto p-3 sm:p-4">
        {/* 标题 */}
        <div className="text-center mb-4">
          <h1 className="text-xl sm:text-2xl font-bold">跨模态 RAG 知识检索</h1>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full grid-cols-3 mb-4">
            <TabsTrigger value="upload" className="text-sm">📤 上传</TabsTrigger>
            <TabsTrigger value="search" className="text-sm">🔍 检索</TabsTrigger>
            <TabsTrigger value="rag" className="text-sm">💬 问答</TabsTrigger>
          </TabsList>

          {/* 文件上传 */}
          <TabsContent value="upload">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">文件上传</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* 上传区域 */}
                <div className="border-2 border-dashed rounded-lg p-4 text-center">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleUpload}
                    accept=".txt,.md,.json,.xlsx,.xls,.csv,.docx,.pdf,.pptx,.jpg,.jpeg,.png,.gif,.webp,.mp3,.wav,.m4a"
                    className="hidden"
                  />
                  <Button 
                    onClick={() => fileInputRef.current?.click()} 
                    disabled={uploading}
                    className="w-full h-12 text-base"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        上传中...
                      </>
                    ) : (
                      <>
                        <Upload className="w-5 h-5 mr-2" />
                        选择文件
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-2">
                    支持 Excel、Word、PDF、PPT、图片、音频、JSON、MD
                  </p>
                </div>

                {/* 上传结果 */}
                {uploadResult && (
                  <div className={`p-3 rounded-lg text-sm ${uploadResult.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                    {uploadResult.success 
                      ? `✅ ${uploadResult.filename} - ${uploadResult.itemCount} 条` 
                      : `❌ ${uploadResult.error}`}
                  </div>
                )}

                {/* 统计卡片 */}
                {embedStatus && (
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => toggleSection('all')}
                      className="p-3 bg-muted rounded-lg text-center"
                    >
                      <div className="text-2xl font-bold">{embedStatus.total}</div>
                      <div className="text-xs text-muted-foreground">知识条目</div>
                    </button>
                    <button
                      onClick={() => toggleSection('embedded')}
                      className="p-3 bg-green-100 rounded-lg text-center"
                    >
                      <div className="text-2xl font-bold text-green-700">{embedStatus.embedded}</div>
                      <div className="text-xs text-green-600">已向量化</div>
                    </button>
                    <button
                      onClick={() => toggleSection('pending')}
                      className="p-3 bg-yellow-100 rounded-lg text-center"
                    >
                      <div className="text-2xl font-bold text-yellow-700">{embedStatus.pending}</div>
                      <div className="text-xs text-yellow-600">待处理</div>
                    </button>
                  </div>
                )}

                {/* 向量化进度 */}
                {autoEmbedding && (
                  <div className="space-y-2">
                    <Progress value={(embedProgress.processed / (embedStatus?.total || 1)) * 100} />
                    <p className="text-xs text-center text-muted-foreground">
                      已处理 {embedProgress.processed} 条，失败 {embedProgress.failed} 条
                    </p>
                  </div>
                )}

                {/* 展开详情 */}
                {expandedSection && (
                  <div className="border rounded-lg p-3 max-h-60 overflow-y-auto space-y-2">
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium">
                        {expandedSection === 'all' ? '全部' : expandedSection === 'embedded' ? '已向量化' : '待处理'}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => setExpandedSection(null)}>
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    {detailLoading ? (
                      <div className="text-center py-4"><Loader2 className="w-5 h-5 animate-spin mx-auto" /></div>
                    ) : (
                      detailItems.slice(0, 10).map(item => (
                        <div key={item.id} className="text-xs p-2 bg-muted rounded flex justify-between">
                          <span className="truncate flex-1">{item.title}</span>
                          <Badge variant="outline" className="ml-2 text-xs">{modalityLabels[item.modality as Modality] || item.modality}</Badge>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* 向量化按钮 */}
                {embedStatus && embedStatus.pending > 0 && (
                  <div className="space-y-2">
                    <Button 
                      onClick={toggleAutoEmbed} 
                      disabled={embedding}
                      className="w-full h-11"
                      variant={autoEmbedding ? "destructive" : "default"}
                    >
                      {autoEmbedding ? (
                        <>
                          <Pause className="w-4 h-4 mr-2" />
                          停止向量化
                        </>
                      ) : (
                        <>
                          <Play className="w-4 h-4 mr-2" />
                          自动向量化 ({embedStatus.pending} 条)
                        </>
                      )}
                    </Button>
                    <div className="grid grid-cols-2 gap-2">
                      <Button onClick={handleEmbed} disabled={embedding || autoEmbedding} variant="outline" className="h-10">
                        单次处理
                      </Button>
                      <Button onClick={handleCancelAll} variant="destructive" disabled={autoEmbedding} className="h-10">
                        全部取消
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 知识检索 */}
          <TabsContent value="search">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">智能检索</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* 搜索框 */}
                <div className="space-y-2">
                  <Input
                    placeholder="输入检索内容..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch(1)}
                    className="h-11 text-base"
                  />
                  
                  {/* 搜索选项 */}
                  <div className="grid grid-cols-2 gap-2">
                    <select
                      className="h-10 px-3 border rounded-md text-sm"
                      value={searchMode}
                      onChange={(e) => setSearchMode(e.target.value as 'fuzzy' | 'exact')}
                    >
                      <option value="fuzzy">🔍 模糊搜索</option>
                      <option value="exact">🎯 精确搜索</option>
                    </select>
                    <select
                      className="h-10 px-3 border rounded-md text-sm"
                      value={searchModality}
                      onChange={(e) => setSearchModality(e.target.value)}
                    >
                      <option value="">全部类型</option>
                      <option value="excel">Excel</option>
                      <option value="text">文本</option>
                      <option value="doc">文档</option>
                      <option value="image">图片</option>
                    </select>
                  </div>
                  
                  <Button onClick={() => handleSearch(1)} disabled={searching} className="w-full h-11">
                    {searching ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        搜索中...
                      </>
                    ) : (
                      <>
                        <Search className="w-4 h-4 mr-2" />
                        搜索
                      </>
                    )}
                  </Button>
                </div>

                {/* 分页信息 */}
                {searchPagination && searchPagination.totalCount > 0 && (
                  <div className="flex justify-between items-center text-sm text-muted-foreground px-1">
                    <span>共 {searchPagination.totalCount} 条结果</span>
                    <span>第 {searchPagination.page}/{searchPagination.totalPages} 页</span>
                  </div>
                )}

                {/* 搜索结果 */}
                <div className="space-y-2">
                  {searchResults.map((result, index) => (
                    <div 
                      key={result.id || index} 
                      className="p-3 bg-muted rounded-lg cursor-pointer hover:bg-muted/80"
                      onClick={() => setPreviewItem(result)}
                    >
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="text-xs">
                          {modalityLabels[result.modality as Modality] || result.modality}
                        </Badge>
                        <span className="font-medium text-sm truncate flex-1">{result.title}</span>
                        {result.similarity !== undefined && (
                          <span className="text-xs text-green-600 font-bold">
                            {((result.similarity) * 100).toFixed(0)}%
                          </span>
                        )}
                        <Eye className="w-4 h-4 text-muted-foreground" />
                      </div>
                      {/* 图片显示摘要描述 */}
                      {result.modality === 'image' ? (
                        <p className="text-xs text-blue-600 line-clamp-2">
                          📷 {getImageDescription(result)}
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground line-clamp-2">
                          {result.content?.substring(0, 150)}
                        </p>
                      )}
                    </div>
                  ))}
                </div>

                {/* 分页按钮 */}
                {searchPagination && searchPagination.totalPages > 1 && (
                  <div className="flex justify-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={searchPage <= 1 || searching}
                      onClick={() => handleSearch(searchPage - 1)}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <span className="flex items-center px-3 text-sm">
                      {searchPage} / {searchPagination.totalPages}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!searchPagination.hasMore || searching}
                      onClick={() => handleSearch(searchPage + 1)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 智能问答 */}
          <TabsContent value="rag">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">RAG 智能问答</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Token 上限设置 */}
                <div className="flex items-center gap-2 p-2 bg-muted rounded-lg">
                  <Settings className="w-4 h-4 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Token上限:</span>
                  <input
                    type="range"
                    min="10000"
                    max="100000"
                    step="5000"
                    value={ragTokenLimit}
                    onChange={(e) => setRagTokenLimit(Number(e.target.value))}
                    className="flex-1 h-2"
                  />
                  <span className="text-xs font-medium w-16 text-right">
                    {(ragTokenLimit / 1000).toFixed(0)}K
                  </span>
                </div>

                <div className="space-y-2">
                  <Textarea
                    placeholder="输入您的问题..."
                    value={ragQuery}
                    onChange={(e) => setRagQuery(e.target.value)}
                    rows={2}
                    className="text-base"
                  />
                  <Button onClick={handleRagQuery} disabled={ragLoading} className="w-full h-11">
                    {ragLoading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        思考中...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4 mr-2" />
                        提问
                      </>
                    )}
                  </Button>
                </div>

                {/* 回答 */}
                {ragAnswer && (
                  <div className="p-3 bg-muted rounded-lg">
                    <div className="flex items-start gap-2">
                      <MessageSquare className="w-4 h-4 mt-1 text-primary shrink-0" />
                      <div className="flex-1 whitespace-pre-wrap text-sm" ref={answerRef}>
                        {ragAnswer}
                      </div>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 预览弹窗 */}
        {previewItem && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setPreviewItem(null)}>
            <div className="bg-background rounded-lg max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
              <div className="p-4 border-b flex justify-between items-center">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {modalityLabels[previewItem.modality as Modality] || previewItem.modality}
                  </Badge>
                  <span className="font-medium">{previewItem.title}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setPreviewItem(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="p-4 space-y-3">
                {previewItem.modality === 'image' && previewItem.metadata && 'storageUrl' in previewItem.metadata && (
                  <img 
                    src={previewItem.metadata.storageUrl as string} 
                    alt={previewItem.title}
                    className="w-full rounded-lg"
                  />
                )}
                {previewItem.modality === 'image' && (
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-800 font-medium mb-1">📷 图片描述</p>
                    <p className="text-sm text-blue-700">{getImageDescription(previewItem)}</p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-muted-foreground mb-1">来源: {previewItem.source}</p>
                  {previewItem.similarity !== undefined && (
                    <p className="text-xs text-green-600">相似度: {((previewItem.similarity) * 100).toFixed(1)}%</p>
                  )}
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-xs font-medium mb-1">内容</p>
                  <p className="text-sm whitespace-pre-wrap break-all">{previewItem.content}</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
