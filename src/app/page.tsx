'use client';

import { useState, useRef, useEffect } from 'react';
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
  Send
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
  
  // 搜索状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searchModality, setSearchModality] = useState<string>('');
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<Array<{
    id: string;
    modality: string;
    title: string;
    content: string;
    source: string;
    similarity: number;
  }>>([]);
  
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

  // 执行向量化
  const handleEmbed = async () => {
    setEmbedding(true);
    try {
      const res = await fetch('/api/embed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batchSize: 20 }),
      });
      const data = await res.json();
      fetchEmbedStatus();
      if (data.success && data.processed > 0) {
        alert(`向量化完成：处理 ${data.processed} 条，失败 ${data.failed || 0} 条`);
      } else if (data.message) {
        alert(data.message);
      }
    } catch (error) {
      console.error('向量化失败:', error);
    } finally {
      setEmbedding(false);
    }
  };

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
          topK: 10,
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
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">知识条目</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{embedStatus?.total || 0}</div>
              <p className="text-xs text-muted-foreground">总条目数</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">已向量化</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-green-600">{embedStatus?.embedded || 0}</div>
              <p className="text-xs text-muted-foreground">可检索条目</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">待处理</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-orange-500">{embedStatus?.pending || 0}</div>
              <p className="text-xs text-muted-foreground">等待向量化</p>
            </CardContent>
          </Card>
        </div>

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
                  支持格式：Excel (.xlsx/.xls)、Word (.docx)、Markdown (.md)、JSON (.json)、文本 (.txt)、图片
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
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>向量化进度</span>
                      <span>{Math.round((embedStatus.embedded / embedStatus.total) * 100)}%</span>
                    </div>
                    <Progress value={(embedStatus.embedded / embedStatus.total) * 100} />
                    <Button onClick={handleEmbed} disabled={embedding} className="w-full">
                      {embedding ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          向量化中...
                        </>
                      ) : (
                        '执行向量化'
                      )}
                    </Button>
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
                              {(result.similarity * 100).toFixed(1)}%
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
