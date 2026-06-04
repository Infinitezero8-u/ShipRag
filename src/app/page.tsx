'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { DataMaintainPanel } from '@/components/data-maintain-panel';
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
  Settings,
  Download
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
  const [showHome, setShowHome] = useState(false); // 是否显示首页
  const [activeTab, setActiveTab] = useState('rag'); // 默认问答
  
  // 上传状态
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    success: boolean;
    filename?: string;
    itemCount?: number;
    error?: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState('');
  
  // 向量化状态
  const [embedStatus, setEmbedStatus] = useState<{
    total: number;
    embedded: number;
    pending: number;
  } | null>(null);
  const [embedding, setEmbedding] = useState(false);
  const [autoEmbedding, setAutoEmbedding] = useState(false);
  const autoEmbeddingRef = useRef(false); // 用于在 async 循环中正确检测停止信号
  const [embedProgress, setEmbedProgress] = useState({ processed: 0, failed: 0 });
  
  // 展开/折叠状态
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [detailItems, setDetailItems] = useState<KnowledgeItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  
  // 搜索状态
  const [searchQuery, setSearchQuery] = useState('');
  const [searchModality, setSearchModality] = useState<string>('');
  const [searchMode, setSearchMode] = useState<'fuzzy' | 'exact'>('fuzzy');
  const [searchTag, setSearchTag] = useState<string>(''); // 标签过滤
  const [availableTags, setAvailableTags] = useState<{name: string, count: number}[]>([]); // 可用标签列表
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<KnowledgeItem[]>([]);
  const [searchPagination, setSearchPagination] = useState<Pagination | null>(null);
  const [searchPage, setSearchPage] = useState(1);
  
  // 预览状态
  const [previewItem, setPreviewItem] = useState<KnowledgeItem | null>(null);
  
  // RAG 状态
  const [ragQuery, setRagQuery] = useState('');
  const [ragAnswer, setRagAnswer] = useState('');
  const [ragSources, setRagSources] = useState<{title?: string, content?: string, source?: string}[]>([]);
  const [ragLoading, setRagLoading] = useState(false);
  const [ragTokenLimit, setRagTokenLimit] = useState(50000); // 用户可调整的 token 上限
  const [ragSessionId] = useState(() => `session_${Date.now()}_${Math.random().toString(36).slice(2)}`); // 会话ID
  const [showSourceDialog, setShowSourceDialog] = useState(false); // 来源弹窗
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
    fetchAvailableTags();
    const interval = setInterval(fetchEmbedStatus, 5000);
    return () => clearInterval(interval);
  }, [fetchEmbedStatus]);
  
  // 获取可用标签列表
  const fetchAvailableTags = async () => {
    try {
      const res = await fetch('/api/search?action=tags');
      const data = await res.json();
      if (data.success) {
        setAvailableTags(data.tags || []);
      }
    } catch (error) {
      console.error('获取标签列表失败:', error);
    }
  };

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

  // URL 解析上传
  const handleUrlUpload = async () => {
    if (!urlInput.trim()) return;
    
    setUploading(true);
    setUploadResult(null);

    try {
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = await res.json();
      setUploadResult({
        success: data.success,
        filename: data.title || urlInput,
        itemCount: data.itemCount || 0,
        error: data.error,
      });
      if (data.success) {
        setUrlInput('');
        fetchEmbedStatus();
      }
    } catch (error) {
      setUploadResult({ success: false, error: '网页解析失败' });
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
      // 停止向量化
      autoEmbeddingRef.current = false;
      setAutoEmbedding(false);
      
      // 询问是否删除待处理条目
      if (embedStatus && embedStatus.pending > 0) {
        if (confirm(`是否删除剩余 ${embedStatus.pending} 条待向量化的条目？`)) {
          try {
            const res = await fetch('/api/embed', {
              method: 'DELETE',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clearAll: true }),
            });
            const data = await res.json();
            alert(`已删除 ${data.deleted} 条待处理条目`);
            fetchEmbedStatus();
          } catch (error) {
            console.error('删除待处理条目失败:', error);
          }
        }
      }
      return;
    }

    // 开始向量化
    autoEmbeddingRef.current = true;
    setAutoEmbedding(true);
    setEmbedProgress({ processed: 0, failed: 0 });

    while (autoEmbeddingRef.current) {
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

        // 如果没有处理任何条目，或者没有更多待处理条目，自动停止
        if (data.processed === 0 || data.pending === 0) {
          autoEmbeddingRef.current = false;
          setAutoEmbedding(false);
          break;
        }
        
        await fetchEmbedStatus();
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error('自动向量化出错:', error);
        autoEmbeddingRef.current = false;
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
    if (!confirm('确定要删除所有待向量化的条目吗？\n\n注意：已向量化的数据不会被删除。')) return;
    try {
      console.log('[全部取消] 开始执行...');
      const res = await fetch('/api/embed', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clearAll: true }),
      });
      const data = await res.json();
      console.log('[全部取消] 响应:', data);
      
      if (data.success) {
        // 显示实际删除数量
        const stats = data.stats || { total: 0, embedded: 0, pending: 0 };
        alert(`✅ 成功删除 ${data.deleted} 条待向量化条目\n\n当前统计：\n- 总条目: ${stats.total}\n- 已向量化: ${stats.embedded}\n- 待处理: ${stats.pending}`);
        
        // 强制刷新状态（从服务器重新拉取）
        console.log('[全部取消] 强制刷新统计...');
        await fetchEmbedStatus();
        
        // 如果当前展开的是待处理列表，也刷新它
        if (expandedSection === 'pending') {
          await fetchDetailItems('pending');
        }
      } else {
        alert(`❌ 删除失败: ${data.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('[全部取消] 错误:', error);
      alert('取消失败: ' + (error instanceof Error ? error.message : '网络错误'));
    }
  };
  
  // 单条取消
  const handleCancelSingle = async (id: string) => {
    if (!confirm('确定要取消该条目的向量化吗？')) return;
    try {
      const res = await fetch('/api/embed', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ singleId: id }),
      });
      const data = await res.json();
      
      if (data.success) {
        // 强制刷新状态
        await fetchEmbedStatus();
        if (expandedSection === 'pending') {
          await fetchDetailItems('pending');
        }
      } else {
        alert(`取消失败: ${data.error || '未知错误'}`);
      }
    } catch (error) {
      console.error('[单条取消] 错误:', error);
      alert('取消失败');
    }
  };

  // 搜索
  const handleSearch = async (page: number = 1) => {
    if (!searchQuery.trim() && !searchTag) return;
    setSearching(true);
    setSearchPage(page);
    try {
      // 构建过滤条件
      const filter: Record<string, string> = {};
      if (searchModality) filter.modality = searchModality;
      if (searchTag) filter.tags = searchTag;
      
      const res = await fetch('/api/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery || searchTag, // 如果没有查询词，用标签作为查询词
          topK: 500, // 获取更多结果用于分页
          threshold: 0.3,
          mode: searchMode,
          filter: Object.keys(filter).length > 0 ? filter : undefined,
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

  // RAG 问答（支持指令参数）
  const handleRagQuery = async (options?: {
    lockContext?: boolean;
    clearContext?: boolean;
    responseMode?: 'brief' | 'detailed';
    commandType?: string;
  }) => {
    if (!ragQuery.trim()) return;
    setRagLoading(true);
    setRagAnswer('');
    setRagSources([]);

    try {
      // 计算 topK 基于用户设置的 token 上限（假设每条约 200 tokens）
      const calculatedTopK = Math.floor(ragTokenLimit / 200);
      
      const res = await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          query: ragQuery, 
          topK: calculatedTopK,
          noLimit: true,
          sessionId: ragSessionId,
          lockContext: options?.lockContext,
          clearContext: options?.clearContext,
          responseMode: options?.responseMode,
          commandType: options?.commandType,
          stream: false, // 使用非流式模式以便获取sources
        }),
      });

      const data = await res.json();
      if (data.success) {
        setRagAnswer(data.answer || '');
        setRagSources(data.sources || []);
      } else {
        setRagAnswer(data.error || '请求失败');
      }
    } catch (error) {
      setRagAnswer('请求出错，请重试');
      console.error('RAG请求错误:', error);
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
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-xl sm:text-2xl font-bold">跨模态 RAG 知识检索</h1>
        </div>
        
        {/* 导航链接 */}
        <div className="flex items-center gap-4 mb-4 text-sm">
          <button onClick={() => setShowHome(true)} className="text-gray-600 hover:text-gray-900 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" /></svg>
            首页
          </button>
          <a href="/sea-chart" className="text-green-600 hover:text-green-800 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" /></svg>
            海图
          </a>
          <a href="/workflow" className="text-purple-600 hover:text-purple-800 flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg>
            工作流
          </a>
          <a href="/manage" className="text-blue-600 hover:text-blue-800 flex items-center gap-1">
            <Settings className="w-4 h-4" />
            管理
          </a>
        </div>

        {/* 首页功能选择 */}
        {showHome ? (
          <div className="flex flex-col gap-6 mt-8">
            <p className="text-center text-muted-foreground text-sm">选择功能开始使用</p>
            <div className="grid grid-cols-1 gap-4">
              <Card 
                className="cursor-pointer hover:shadow-lg transition-all active:scale-[0.98]" 
                onClick={() => { setShowHome(false); setActiveTab('rag'); }}
              >
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                    <MessageSquare className="w-6 h-6 text-green-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">💬 智能问答</h3>
                    <p className="text-sm text-muted-foreground">基于知识库的 RAG 智能问答</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </CardContent>
              </Card>
              
              <Card 
                className="cursor-pointer hover:shadow-lg transition-all active:scale-[0.98]" 
                onClick={() => { setShowHome(false); setActiveTab('search'); }}
              >
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                    <Search className="w-6 h-6 text-purple-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">🔍 知识检索</h3>
                    <p className="text-sm text-muted-foreground">语义搜索知识条目</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </CardContent>
              </Card>
              
              <Card 
                className="cursor-pointer hover:shadow-lg transition-all active:scale-[0.98]" 
                onClick={() => { setShowHome(false); setActiveTab('upload'); }}
              >
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                    <Upload className="w-6 h-6 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">📤 文件上传</h3>
                    <p className="text-sm text-muted-foreground">上传文件构建知识库</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </CardContent>
              </Card>
              
              <Card 
                className="cursor-pointer hover:shadow-lg transition-all active:scale-[0.98]" 
                onClick={() => window.location.href = '/workflow/manage'}
              >
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-orange-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 5a1 1 0 011-1h14a1 1 0 011 1v2a1 1 0 01-1 1H5a1 1 0 01-1-1V5zM4 13a1 1 0 011-1h6a1 1 0 011 1v6a1 1 0 01-1 1H5a1 1 0 01-1-1v-6zM16 13a1 1 0 011-1h2a1 1 0 011 1v6a1 1 0 01-1 1h-2a1 1 0 01-1-1v-6z" /></svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">⚙️ 工作流管理</h3>
                    <p className="text-sm text-muted-foreground">管理和编辑 RAG 工作流</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </CardContent>
              </Card>
              
              <Card 
                className="cursor-pointer hover:shadow-lg transition-all active:scale-[0.98]" 
                onClick={() => window.location.href = '/segment-label'}
              >
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-cyan-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-cyan-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">🏷️ 航迹标注平台</h3>
                    <p className="text-sm text-muted-foreground">航段行为和意图标注管理</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </CardContent>
              </Card>
              
              <Card 
                className="cursor-pointer hover:shadow-lg transition-all active:scale-[0.98]" 
                onClick={() => window.location.href = '/trajectory-training'}
              >
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-rose-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.755-.988-2.386l-.548-.547z" /></svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">🧠 航迹训练平台</h3>
                    <p className="text-sm text-muted-foreground">分类模型训练、版本管理和推理</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </CardContent>
              </Card>
              
              <Card 
                className="cursor-pointer hover:shadow-lg transition-all active:scale-[0.98]" 
                onClick={() => window.location.href = '/regulations'}
              >
                <CardContent className="p-6 flex items-center gap-4">
                  <div className="w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center">
                    <svg className="w-6 h-6 text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg">📋 规章制度管理</h3>
                    <p className="text-sm text-muted-foreground">海事规章制度文档管理与智能检索</p>
                  </div>
                  <ChevronRight className="w-5 h-5 text-muted-foreground" />
                </CardContent>
              </Card>
            </div>
          </div>
        ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <div className="flex items-center justify-between mb-4">
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => setShowHome(true)}
              className="text-muted-foreground"
            >
              <ChevronLeft className="w-4 h-4 mr-1" />
              返回
            </Button>
            <TabsList className="grid grid-cols-4 gap-1">
              <TabsTrigger value="rag" className="text-xs">💬 问答</TabsTrigger>
              <TabsTrigger value="search" className="text-xs">🔍 检索</TabsTrigger>
              <TabsTrigger value="upload" className="text-xs">📤 上传</TabsTrigger>
              <TabsTrigger value="maintain" className="text-xs">🗄️ 维护</TabsTrigger>
            </TabsList>
            <div className="w-16" /> {/* 占位 */}
          </div>

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
                    className="w-full h-10 text-sm"
                  >
                    {uploading ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        上传中...
                      </>
                    ) : (
                      <>
                        <Upload className="w-4 h-4 mr-2" />
                        选择文件
                      </>
                    )}
                  </Button>
                  <p className="text-xs text-muted-foreground mt-1">
                    支持 Excel、Word、PDF、PPT、图片、音频、JSON、MD
                  </p>
                </div>

                {/* URL 解析 */}
                <div className="space-y-2">
                  <Label className="text-sm">或输入网页链接</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://example.com/article"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      className="flex-1 text-sm h-9"
                    />
                    <Button 
                      onClick={handleUrlUpload}
                      disabled={uploading || !urlInput.trim()}
                      size="sm"
                      className="h-9"
                    >
                      {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : '解析'}
                    </Button>
                  </div>
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
                  
                  {/* 标签过滤 */}
                  <select
                    className="h-10 px-3 border rounded-md text-sm w-full"
                    value={searchTag}
                    onChange={(e) => { setSearchTag(e.target.value); if (e.target.value) handleSearch(1); }}
                  >
                    <option value="">全部标签</option>
                    {availableTags.slice(0, 20).map(t => (
                      <option key={t.name} value={t.name}>🏷️ {t.name} ({t.count})</option>
                    ))}
                  </select>
                  
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
                      className="p-2 bg-muted rounded-lg cursor-pointer hover:bg-muted/80"
                      onClick={() => setPreviewItem(result)}
                    >
                      <div className="flex gap-2">
                        {/* 图片缩略图 */}
                        {result.modality === 'image' && result.metadata && ('imageUrl' in result.metadata || 'storageUrl' in result.metadata) && (
                          <img 
                            src={(result.metadata.imageUrl || result.metadata.storageUrl) as string} 
                            alt={result.title}
                            className="w-16 h-16 object-cover rounded border shrink-0"
                          />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1 mb-1">
                            <Badge variant="outline" className="text-xs shrink-0">
                              {modalityLabels[result.modality as Modality] || result.modality}
                            </Badge>
                            <span className="font-medium text-xs truncate">{result.title}</span>
                            {result.similarity !== undefined && (
                              <span className="text-xs text-green-600 font-bold ml-auto shrink-0">
                                {(result.similarity * 100).toFixed(0)}%
                              </span>
                            )}
                            <Eye className="w-3 h-3 text-muted-foreground shrink-0" />
                          </div>
                          {/* 图片描述摘要 */}
                          {result.modality === 'image' ? (
                            <p className="text-xs text-blue-600 line-clamp-2">
                              📷 {getImageDescription(result) || '暂无描述'}
                            </p>
                          ) : result.modality === 'excel' ? (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              📊 {result.content?.substring(0, 100)}
                            </p>
                          ) : (
                            <p className="text-xs text-muted-foreground line-clamp-2">
                              {result.content?.substring(0, 100)}
                            </p>
                          )}
                        </div>
                      </div>
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
                  
                  {/* 快捷按钮行1：上下文控制 */}
                  <div className="grid grid-cols-3 gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleRagQuery({ clearContext: true })}
                      disabled={ragLoading}
                      className="text-xs h-8"
                    >
                      清空上下文
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleRagQuery({ lockContext: true })}
                      disabled={ragLoading}
                      className="text-xs h-8"
                    >
                      锁定上下文
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleRagQuery({ responseMode: 'brief' })}
                      disabled={ragLoading}
                      className="text-xs h-8"
                    >
                      精简回答
                    </Button>
                  </div>
                  
                  {/* 快捷按钮行2：回答模式 */}
                  <div className="grid grid-cols-3 gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleRagQuery({ responseMode: 'detailed' })}
                      disabled={ragLoading}
                      className="text-xs h-8"
                    >
                      详细回答
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleRagQuery({ commandType: 'chart_annotation' })}
                      disabled={ragLoading}
                      className="text-xs h-8"
                    >
                      查询海图标注
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleRagQuery({ commandType: 'channel_regulation' })}
                      disabled={ragLoading}
                      className="text-xs h-8"
                    >
                      航道通航规范
                    </Button>
                  </div>
                  
                  {/* 快捷按钮行3：新增功能 */}
                  <div className="grid grid-cols-3 gap-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleRagQuery({ commandType: 'compliance_check' })}
                      disabled={ragLoading || !ragAnswer}
                      className="text-xs h-8 text-orange-600"
                    >
                      合规自查
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleRagQuery({ commandType: 'extract_table' })}
                      disabled={ragLoading || !ragAnswer}
                      className="text-xs h-8 text-blue-600"
                    >
                      数据提取制表
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => handleRagQuery({ commandType: 'translate_terms' })}
                      disabled={ragLoading || !ragAnswer}
                      className="text-xs h-8 text-purple-600"
                    >
                      翻译专业术语
                    </Button>
                  </div>
                  
                  <Button onClick={() => handleRagQuery()} disabled={ragLoading} className="w-full h-11">
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
                    
                    {/* 回答操作按钮 */}
                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-border">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          // 导出PDF功能
                          const content = `问题：${ragQuery}\n\n回答：\n${ragAnswer}\n\n${ragSources.length > 0 ? `来源：\n${ragSources.map((s: {title?: string, content?: string}) => `- ${s.title || '未知来源'}`).join('\n')}` : ''}`;
                          const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
                          const url = URL.createObjectURL(blob);
                          const a = document.createElement('a');
                          a.href = url;
                          a.download = `海图问答_${new Date().toISOString().slice(0,10)}.txt`;
                          a.click();
                          URL.revokeObjectURL(url);
                        }}
                        className="text-xs h-7"
                      >
                        <Download className="w-3 h-3 mr-1" />
                        导出回答
                      </Button>
                      {ragSources.length > 0 && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => setShowSourceDialog(true)}
                          className="text-xs h-7"
                        >
                          <FileText className="w-3 h-3 mr-1" />
                          查看来源({ragSources.length})
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* 数据维护 */}
          <TabsContent value="maintain">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">数据维护</CardTitle>
              </CardHeader>
              <CardContent>
                <DataMaintainPanel />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
        )}

        {/* 预览弹窗 */}
        {previewItem && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-2 z-50" onClick={() => setPreviewItem(null)}>
            <div 
              ref={(el) => { if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); }}
              className="bg-background rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" 
              onClick={e => e.stopPropagation()}
            >
              <div className="p-3 border-b flex justify-between items-center sticky top-0 bg-background">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">
                    {modalityLabels[previewItem.modality as Modality] || previewItem.modality}
                  </Badge>
                  <span className="font-medium text-sm">{previewItem.title}</span>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setPreviewItem(null)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="p-3 space-y-3">
                {/* 图片附件 */}
                {previewItem.modality === 'image' && (
                  <div className="space-y-2">
                    {previewItem.metadata && ('imageUrl' in previewItem.metadata || 'storageUrl' in previewItem.metadata) && (
                      <div className="relative">
                        <img 
                          src={(previewItem.metadata.imageUrl || previewItem.metadata.storageUrl) as string} 
                          alt={previewItem.title}
                          className="w-full max-h-64 object-contain rounded-lg border"
                        />
                        <Badge className="absolute top-2 left-2" variant="secondary">📷 附件</Badge>
                      </div>
                    )}
                    <div className="p-2 bg-blue-50 rounded-lg">
                      <p className="text-xs text-blue-800 font-medium mb-1">图片描述</p>
                      <p className="text-sm text-blue-700">{getImageDescription(previewItem) || '暂无描述'}</p>
                    </div>
                  </div>
                )}
                
                {/* Excel 表格展示 */}
                {previewItem.modality === 'excel' && (
                  <div className="space-y-2">
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs border-collapse">
                        <tbody>
                          {(() => {
                            // 解析 content 为表格
                            const fields = previewItem.content.split(', ').map(f => f.split(': '));
                            return fields.map((field, i) => (
                              <tr key={i} className={i % 2 === 0 ? 'bg-muted/50' : ''}>
                                <td className="border px-2 py-1 font-medium w-1/3">{field[0]}</td>
                                <td className="border px-2 py-1">{field[1]}</td>
                              </tr>
                            ));
                          })()}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex gap-2">
                      <Badge variant="outline" className="text-xs">📊 表格数据</Badge>
                      <Badge variant="outline" className="text-xs">{previewItem.source}</Badge>
                    </div>
                  </div>
                )}
                
                {/* 其他类型内容 */}
                {previewItem.modality !== 'image' && previewItem.modality !== 'excel' && (
                  <div className="p-2 bg-muted rounded-lg">
                    <p className="text-xs font-medium mb-1">内容</p>
                    <p className="text-sm whitespace-pre-wrap break-all">{previewItem.content}</p>
                  </div>
                )}
                
                <div className="flex justify-between text-xs text-muted-foreground pt-2 border-t">
                  <span>来源: {previewItem.source}</span>
                  {previewItem.similarity !== undefined && (
                    <span className="text-green-600 font-medium">相似度: {(previewItem.similarity * 100).toFixed(1)}%</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 来源弹窗 */}
        {showSourceDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={() => setShowSourceDialog(false)}>
            <div className="bg-background rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={e => e.stopPropagation()}>
              <div className="p-3 border-b flex items-center justify-between">
                <h3 className="font-semibold text-sm">📚 引用来源</h3>
                <Button variant="ghost" size="sm" onClick={() => setShowSourceDialog(false)} className="h-7 w-7 p-0">
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="p-3 overflow-y-auto max-h-[calc(80vh-60px)]">
                {ragSources.map((source, idx) => (
                  <div key={idx} className="p-3 bg-muted rounded-lg mb-2 last:mb-0">
                    <div className="flex items-center gap-2 mb-2">
                      <FileText className="w-4 h-4 text-primary" />
                      <span className="font-medium text-sm">{source.title || `来源 ${idx + 1}`}</span>
                    </div>
                    <div className="text-xs text-muted-foreground bg-background p-2 rounded border max-h-32 overflow-y-auto">
                      {source.content ? source.content.substring(0, 500) + (source.content.length > 500 ? '...' : '') : '无内容'}
                    </div>
                    {source.source && (
                      <div className="text-[10px] text-muted-foreground mt-1">
                        文件: {source.source}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
