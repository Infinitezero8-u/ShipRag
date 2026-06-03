'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  FileCode,
  Database,
  Loader2,
  CheckCircle,
  XCircle,
  Send,
  ChevronDown,
  ChevronUp,
  Play,
  Pause,
  RefreshCw
} from 'lucide-react';

type Modality = 'text' | 'image' | 'excel' | 'doc' | 'md' | 'json' | 'trajectory';

const modalityIcons: Record<Modality, React.ReactNode> = {
  text: <FileText className="w-4 h-4" />,
  image: <Image className="w-4 h-4" />,
  excel: <FileSpreadsheet className="w-4 h-4" />,
  doc: <FileText className="w-4 h-4" />,
  md: <FileCode className="w-4 h-4" />,
  json: <FileCode className="w-4 h-4" />,
  trajectory: <Database className="w-4 h-4" />,
};

const modalityLabels: Record<Modality, string> = {
  text: '文本',
  image: '图片',
  excel: 'Excel',
  doc: '文档',
  md: 'Markdown',
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
  
  // 自动向量化状态
  const [autoEmbedding, setAutoEmbedding] = useState(false);
  const [embedProgress, setEmbedProgress] = useState({ processed: 0, failed: 0 });
  
  // 展开/折叠状态
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [detailItems, setDetailItems] = useState<KnowledgeItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailPage, setDetailPage] = useState(1);
  const [detailTotal, setDetailTotal] = useState(0);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  
  // 搜索状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searchModality, setSearchModality] = useState<string>('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<KnowledgeItem[]>([]);
  
  // RAG 问答状态
  const [ragQuery, setRagQuery] = useState('');
  const [ragAnswer, setRagAnswer] = useState('');
  const [ragSources, setRagSources] = useState<Array<{
    title: string;
    source: string;
    similarity: number;
  }>>([]);
  const [ragLoading, setRagLoading] = useState(false);
  const answerRef = useRef<HTMLDivElement>(null);

  // 获取向量化状态
  const fetchEmbedStatus = async () => {
    try {
      const res = await fetch('/api/embed');
      const data = await res.json();
      if (data.success) {
        setEmbedStatus(data);
      }
    } catch (error) {
      console.error('获取向量化状态失败:', error);
    }
  };

  useEffect(() => {
    fetchEmbedStatus();
    const interval = setInterval(fetchEmbedStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  // 获取详细条目
  const fetchDetailItems = async (type: 'all' | 'embedded' | 'pending', page: number = 1) => {
    setDetailLoading(true);
    try {
      const params = new URLSearchParams({
        type,
        page: page.toString(),
        limit: '20'
      });
      const res = await fetch(`/api/search?${params}`);
      const data = await res.json();
      if (data.success) {
        setDetailItems(data.items);
        setDetailTotal(data.total);
        setDetailPage(page);
      }
    } catch (error) {
      console.error('获取详细条目失败:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  // 展开/折叠处理
  const handleExpand = (section: string) => {
    if (expandedSection === section) {
      setExpandedSection(null);
    } else {
      setExpandedSection(section);
      const type = section === 'total' ? 'all' : section === 'embedded' ? 'embedded' : 'pending';
      fetchDetailItems(type as 'all' | 'embedded' | 'pending', 1);
    }
  };

  // 文件上传
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);

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
      setUploadResult({
        success: false,
        error: error instanceof Error ? error.message : '上传失败',
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 单次向量化
  const handleEmbed = async () => {
    setEmbedding(true);
    try {
      const res = await fetch('/api/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 50 }),
      });
      const data = await res.json();
      fetchEmbedStatus();
      if (data.success && data.processed > 0) {
        setEmbedProgress(prev => ({
          processed: prev.processed + data.processed,
          failed: prev.failed + (data.failed || 0)
        }));
      }
    } catch (error) {
      console.error('向量化失败:', error);
    } finally {
      setEmbedding(false);
    }
  };

  // 自动批量向量化
  const runAutoEmbed = useCallback(async () => {
    if (!autoEmbedding) return;
    
    try {
      const res = await fetch('/api/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 50 }),
      });
      const data = await res.json();
      
      if (data.success) {
        setEmbedProgress(prev => ({
          processed: prev.processed + data.processed,
          failed: prev.failed + (data.failed || 0)
        }));
        fetchEmbedStatus();
        
        // 如果还有待处理项，继续执行
        if (data.processed > 0 && autoEmbedding) {
          setTimeout(runAutoEmbed, 500); // 500ms 间隔
        } else {
          setAutoEmbedding(false);
        }
      } else {
        setAutoEmbedding(false);
      }
    } catch (error) {
      console.error('自动向量化失败:', error);
      setAutoEmbedding(false);
    }
  }, [autoEmbedding]);

  // 启动/停止自动向量化
  const toggleAutoEmbed = () => {
    if (autoEmbedding) {
      setAutoEmbedding(false);
    } else {
      setAutoEmbedding(true);
      setEmbedProgress({ processed: 0, failed: 0 });
    }
  };

  // 全部取消向量化
  const handleCancelAll = async () => {
    if (!confirm('确定要取消所有待向量化的条目吗？此操作不可恢复。')) return;
    
    try {
      const res = await fetch('/api/embed', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearAll: true }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        fetchEmbedStatus();
        if (expandedSection === 'pending') {
          fetchDetailItems('pending', 1);
        }
      }
    } catch (error) {
      console.error('取消失败:', error);
    }
  };

  // 取消选中的条目
  const handleCancelSelected = async () => {
    if (selectedItems.size === 0) return;
    if (!confirm(`确定要取消选中的 ${selectedItems.size} 条目吗？此操作不可恢复。`)) return;
    
    try {
      const res = await fetch('/api/embed', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedItems) }),
      });
      const data = await res.json();
      if (data.success) {
        alert(data.message);
        setSelectedItems(new Set());
        fetchEmbedStatus();
        if (expandedSection === 'pending') {
          fetchDetailItems('pending', detailPage);
        }
      }
    } catch (error) {
      console.error('取消失败:', error);
    }
  };

  // 切换选中状态
  const toggleItemSelection = (id: string) => {
    const newSelected = new Set(selectedItems);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedItems(newSelected);
  };

  useEffect(() => {
    if (autoEmbedding) {
      runAutoEmbed();
    }
  }, [autoEmbedding, runAutoEmbed]);

  // 执行搜索
  const handleSearch = async () => {
    if (!searchQuery.trim()) return;

    setSearching(true);
    try {
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          modality: searchModality || undefined,
          topK: 20,
          threshold: 0.3,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSearchResults(data.results);
      }
    } catch (error) {
      console.error('搜索失败:', error);
    } finally {
      setSearching(false);
    }
  };

  // RAG 问答
  const handleRagQuery = async () => {
    if (!ragQuery.trim()) return;

    setRagLoading(true);
    setRagAnswer('');
    setRagSources([]);

    try {
      const res = await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: ragQuery,
          stream: true,
        }),
      });

      const reader = res.body?.getReader();
      if (!reader) throw new Error('无法读取响应');

      const decoder = new TextDecoder();
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        setRagAnswer(prev => prev + chunk);
      }
    } catch (error) {
      setRagAnswer('问答失败: ' + (error instanceof Error ? error.message : String(error)));
    } finally {
      setRagLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-muted/20">
      <div className="container mx-auto px-4 py-8">
        {/* 标题 */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold mb-2">跨模态 RAG 知识检索系统</h1>
          <p className="text-muted-foreground">
            支持 Excel、Doc、Markdown、JSON、图片、航迹等多种数据格式的智能检索与问答
          </p>
        </div>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          {/* 知识条目 */}
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleExpand('total')}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">知识条目</CardTitle>
                {expandedSection === 'total' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{embedStatus?.total || 0}</div>
              <p className="text-xs text-muted-foreground">点击查看详情</p>
            </CardContent>
          </Card>
          
          {/* 已向量化 */}
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleExpand('embedded')}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">已向量化</CardTitle>
                {expandedSection === 'embedded' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{embedStatus?.embedded || 0}</div>
              <p className="text-xs text-muted-foreground">点击查看详情</p>
            </CardContent>
          </Card>
          
          {/* 待处理 */}
          <Card className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => handleExpand('pending')}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">待处理</CardTitle>
                {expandedSection === 'pending' ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-500">{embedStatus?.pending || 0}</div>
              <p className="text-xs text-muted-foreground">点击查看详情</p>
            </CardContent>
          </Card>
        </div>

        {/* 展开的详情面板 */}
        {expandedSection && (
          <Card className="mb-8">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>
                  {expandedSection === 'total' && '全部知识条目'}
                  {expandedSection === 'embedded' && '已向量化条目'}
                  {expandedSection === 'pending' && '待处理条目'}
                </CardTitle>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">共 {detailTotal} 条</span>
                  <Button variant="ghost" size="sm" onClick={() => {
                    const type = expandedSection === 'total' ? 'all' : expandedSection === 'embedded' ? 'embedded' : 'pending';
                    fetchDetailItems(type as 'all' | 'embedded' | 'pending', detailPage);
                  }}>
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {detailLoading ? (
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin" />
                </div>
              ) : (
                <div className="space-y-2 max-h-96 overflow-y-auto">
                  {detailItems.map((item, index) => (
                    <div key={item.id || index} className="p-3 border rounded-lg hover:bg-muted/50">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant="outline" className="flex items-center gap-1">
                          {modalityIcons[item.modality as Modality]}
                          {modalityLabels[item.modality as Modality] || item.modality}
                        </Badge>
                        <span className="font-medium">{item.title || '无标题'}</span>
                        <Badge variant={item.status === 'embedded' ? 'default' : 'secondary'} className="ml-auto">
                          {item.status === 'embedded' ? '已向量化' : '待处理'}
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {item.content?.substring(0, 150)}
                        {item.content && item.content.length > 150 && '...'}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">来源：{item.source}</p>
                    </div>
                  ))}
                  {detailItems.length === 0 && (
                    <p className="text-center text-muted-foreground py-4">暂无数据</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )}

        {/* 主功能区域 */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="upload">文件上传</TabsTrigger>
            <TabsTrigger value="search">知识检索</TabsTrigger>
            <TabsTrigger value="rag">智能问答</TabsTrigger>
          </TabsList>

          {/* 文件上传 */}
          <TabsContent value="upload">
            <Card>
              <CardHeader>
                <CardTitle>上传知识文件</CardTitle>
                <CardDescription>
                  支持格式：Excel (.xlsx/.xls/.csv)、Word (.docx)、Markdown (.md)、JSON (.json)、文本 (.txt)、图片
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="border-2 border-dashed rounded-lg p-8 text-center">
                  <input
                    ref={fileInputRef}
                    type="file"
                    className="hidden"
                    accept=".xlsx,.xls,.docx,.doc,.md,.json,.txt,.csv,.png,.jpg,.jpeg,.gif,.webp"
                    onChange={handleFileUpload}
                  />
                  <Upload className="w-12 h-12 mx-auto mb-4 text-muted-foreground" />
                  <p className="mb-4 text-muted-foreground">
                    点击或拖拽文件到此处上传
                  </p>
                  <Button onClick={() => fileInputRef.current?.click()} disabled={uploading}>
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        上传中...
                      </>
                    ) : (
                      '选择文件'
                    )}
                  </Button>
                </div>

                {uploadResult && (
                  <div className={`p-4 rounded-lg ${uploadResult.success ? 'bg-green-50' : 'bg-red-50'}`}>
                    {uploadResult.success ? (
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        <span>
                          上传成功：{uploadResult.filename}，解析出 {uploadResult.itemCount} 个条目
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-red-600">
                        <XCircle className="w-5 h-5" />
                        <span>{uploadResult.error}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* 向量化进度 */}
                {embedStatus && embedStatus.pending > 0 && (
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span>向量化进度</span>
                      <span>{Math.round((embedStatus.embedded / embedStatus.total) * 100)}%</span>
                    </div>
                    <Progress value={(embedStatus.embedded / embedStatus.total) * 100} />
                    
                    {/* 自动向量化进度 */}
                    {autoEmbedding && (
                      <div className="p-3 bg-blue-50 rounded-lg">
                        <div className="flex items-center gap-2 text-blue-600">
                          <Loader2 className="w-4 h-4 animate-spin" />
                          <span>后台向量化中... 已处理 {embedProgress.processed} 条，失败 {embedProgress.failed} 条</span>
                        </div>
                      </div>
                    )}
                    
                    <div className="flex gap-2 flex-wrap">
                      <Button 
                        onClick={toggleAutoEmbed} 
                        variant={autoEmbedding ? "destructive" : "default"}
                        className="flex-1"
                      >
                        {autoEmbedding ? (
                          <>
                            <Pause className="w-4 h-4 mr-2" />
                            停止自动向量化
                          </>
                        ) : (
                          <>
                            <Play className="w-4 h-4 mr-2" />
                            自动向量化全部 ({embedStatus.pending} 条)
                          </>
                        )}
                      </Button>
                      <Button onClick={handleEmbed} disabled={embedding || autoEmbedding} variant="outline">
                        {embedding ? (
                          <>
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                            处理中...
                          </>
                        ) : (
                          '单次处理 (50条)'
                        )}
                      </Button>
                      {/* 取消按钮 */}
                      <Button 
                        onClick={handleCancelAll} 
                        variant="destructive" 
                        disabled={autoEmbedding}
                        className="flex-1"
                      >
                        全部取消
                      </Button>
                      {detailItems.length > 0 && expandedSection === 'pending' && (
                        <Button 
                          onClick={handleCancelSelected} 
                          variant="outline" 
                          disabled={autoEmbedding || selectedItems.size === 0}
                        >
                          取消选中 ({selectedItems.size})
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 知识检索 */}
          <TabsContent value="search">
            <Card>
              <CardHeader>
                <CardTitle>语义检索</CardTitle>
                <CardDescription>
                  基于向量相似度的智能检索，支持跨模态搜索
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Input
                    placeholder="输入检索内容..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  />
                  <select
                    className="px-3 py-2 border rounded-md"
                    value={searchModality}
                    onChange={(e) => setSearchModality(e.target.value)}
                  >
                    <option value="">全部类型</option>
                    <option value="text">文本</option>
                    <option value="excel">Excel</option>
                    <option value="doc">文档</option>
                    <option value="md">Markdown</option>
                    <option value="json">JSON</option>
                  </select>
                  <Button onClick={handleSearch} disabled={searching}>
                    {searching ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Search className="w-4 h-4" />
                    )}
                  </Button>
                </div>

                {/* 搜索结果 */}
                <div className="space-y-3">
                  {searchResults.map((result, index) => (
                    <Card key={result.id || index}>
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <Badge variant="outline" className="flex items-center gap-1">
                                {modalityIcons[result.modality as Modality]}
                                {modalityLabels[result.modality as Modality]}
                              </Badge>
                              <span className="font-medium">{result.title}</span>
                            </div>
                            <p className="text-sm text-muted-foreground line-clamp-3">
                              {result.content?.substring(0, 200)}...
                            </p>
                            <p className="text-xs text-muted-foreground mt-1">
                              来源：{result.source}
                            </p>
                          </div>
                          <div className="text-right ml-4">
                            <div className="text-lg font-bold text-primary">
                              {((result.similarity || 0) * 100).toFixed(1)}%
                            </div>
                            <div className="text-xs text-muted-foreground">相关度</div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 智能问答 */}
          <TabsContent value="rag">
            <Card>
              <CardHeader>
                <CardTitle>RAG 智能问答</CardTitle>
                <CardDescription>
                  基于知识库的智能问答，自动检索相关内容并生成回答
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <Textarea
                    placeholder="输入您的问题..."
                    value={ragQuery}
                    onChange={(e) => setRagQuery(e.target.value)}
                    rows={2}
                  />
                  <Button onClick={handleRagQuery} disabled={ragLoading} className="h-auto">
                    {ragLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>

                {/* 回答 */}
                {ragAnswer && (
                  <Card className="bg-muted/50">
                    <CardContent className="p-4">
                      <div className="flex items-start gap-2">
                        <MessageSquare className="w-5 h-5 mt-1 text-primary" />
                        <div className="flex-1 whitespace-pre-wrap" ref={answerRef}>
                          {ragAnswer}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
