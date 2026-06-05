'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import {
  Upload,
  FileText,
  Trash2,
  Eye,
  Edit,
  RefreshCw,
  Search,
  Download,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  Sparkles,
  X,
  AlertCircle,
  FileUp,
  FolderOpen,
} from 'lucide-react';

// 文档分类
const CATEGORIES = [
  { key: 'maritime_rules', label: '海事规章制度' },
  { key: 'platform_ops', label: '平台运维规范' },
  { key: 'trajectory_annotation', label: '航迹标注准则' },
  { key: 'model_training', label: '模型训练管理办法' },
  { key: 'other', label: '其他资料' },
];

// 向量化状态
const VECTOR_STATUS_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  pending: { label: '未向量化', color: 'bg-gray-100 text-gray-700', icon: <Clock className="w-3 h-3" /> },
  success: { label: '向量化成功', color: 'bg-green-100 text-green-700', icon: <CheckCircle className="w-3 h-3" /> },
  failed: { label: '向量化失败', color: 'bg-red-100 text-red-700', icon: <XCircle className="w-3 h-3" /> },
};

interface Regulation {
  id: string;
  filename: string;
  file_type: string;
  file_size: string;
  categories: string[];
  is_valid: boolean;
  version?: string;
  publish_date?: string;
  publish_org?: string;
  description?: string;
  vector_status: string;
  vector_error?: string;
  chunk_count: string;
  created_at: string;
  updated_at?: string;
}

interface Chunk {
  id: string;
  regulation_id: string;
  chunk_index: string;
  chapter?: string;
  clause?: string;
  title?: string;
  content: string;
  metadata?: Record<string, any>;
  embedding_status: string;
  created_at: string;
}

export default function RegulationsPage() {
  const [regulations, setRegulations] = useState<Regulation[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const pageSize = 10;

  // 筛选条件
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterIsValid, setFilterIsValid] = useState<string>('');
  const [filterVectorStatus, setFilterVectorStatus] = useState<string>('');

  // 上传相关
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadCategories, setUploadCategories] = useState<string[]>([]);
  const [uploadIsValid, setUploadIsValid] = useState(true);
  const [uploadVersion, setUploadVersion] = useState('');
  const [uploadPublishDate, setUploadPublishDate] = useState('');
  const [uploadPublishOrg, setUploadPublishOrg] = useState('');
  const [uploadDescription, setUploadDescription] = useState('');
  const [uploading, setUploading] = useState(false);

  // 详情弹窗
  const [detailDialogOpen, setDetailDialogOpen] = useState(false);
  const [selectedRegulation, setSelectedRegulation] = useState<Regulation | null>(null);
  const [selectedChunks, setSelectedChunks] = useState<Chunk[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // 编辑弹窗
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editData, setEditData] = useState<{
    id: string;
    categories: string[];
    isValid: boolean;
    version: string;
    publishDate: string;
    publishOrg: string;
    description: string;
  } | null>(null);
  const [editLoading, setEditLoading] = useState(false);

  // 批量操作
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [batchOperating, setBatchOperating] = useState(false);

  // 分类推荐
  const [recommendDialogOpen, setRecommendDialogOpen] = useState(false);
  const [recommendFiles, setRecommendFiles] = useState<File[]>([]);
  const [recommendations, setRecommendations] = useState<Array<{
    filename: string;
    suggested: string[];
    reason: string;
  }>>([]);
  const [recommending, setRecommending] = useState(false);

  // 向量化状态统计
  const [vectorStats, setVectorStats] = useState<{
    total: number;
    pending: number;
    success: number;
    failed: number;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);

  // 加载列表
  const loadRegulations = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: page.toString(),
        pageSize: pageSize.toString(),
      });
      if (searchTerm) params.set('search', searchTerm);
      if (filterCategory) params.set('category', filterCategory);
      if (filterIsValid) params.set('isValid', filterIsValid);
      if (filterVectorStatus) params.set('vectorStatus', filterVectorStatus);

      const res = await fetch(`/api/regulations?${params}`);
      const data = await res.json();
      
      if (data.items) {
        setRegulations(data.items);
        setTotal(data.total);
      }
    } catch (error) {
      console.error('加载列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 加载向量化统计
  const loadVectorStats = async () => {
    try {
      const res = await fetch('/api/regulations?action=vector-stats');
      const data = await res.json();
      setVectorStats(data);
    } catch (error) {
      console.error('加载统计失败:', error);
    }
  };

  useEffect(() => {
    loadRegulations();
    loadVectorStats();
  }, [page, searchTerm, filterCategory, filterIsValid, filterVectorStatus]);

  // 文件上传
  const handleUpload = async () => {
    if (!uploadFile) {
      alert('请选择文件');
      return;
    }
    if (uploadCategories.length === 0) {
      alert('请选择文档分类');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', uploadFile);
      formData.append('categories', JSON.stringify(uploadCategories));
      formData.append('isValid', uploadIsValid.toString());
      if (uploadVersion) formData.append('version', uploadVersion);
      if (uploadPublishDate) formData.append('publishDate', uploadPublishDate);
      if (uploadPublishOrg) formData.append('publishOrg', uploadPublishOrg);
      if (uploadDescription) formData.append('description', uploadDescription);

      const res = await fetch('/api/regulations', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();

      if (data.success) {
        alert(`上传成功！共创建 ${data.regulation.chunk_count} 个切片`);
        setUploadDialogOpen(false);
        resetUploadForm();
        loadRegulations();
        loadVectorStats();
      } else {
        alert(data.error || '上传失败');
      }
    } catch (error) {
      alert('上传失败');
    } finally {
      setUploading(false);
    }
  };

  const resetUploadForm = () => {
    setUploadFile(null);
    setUploadCategories([]);
    setUploadIsValid(true);
    setUploadVersion('');
    setUploadPublishDate('');
    setUploadPublishOrg('');
    setUploadDescription('');
  };

  // 查看详情
  const handleViewDetail = async (reg: Regulation) => {
    setDetailLoading(true);
    setDetailDialogOpen(true);
    try {
      const res = await fetch(`/api/regulations?action=detail&id=${reg.id}`);
      const data = await res.json();
      setSelectedRegulation(data.regulation);
      setSelectedChunks(data.chunks || []);
    } catch (error) {
      console.error('加载详情失败:', error);
    } finally {
      setDetailLoading(false);
    }
  };

  // 编辑
  const handleEdit = (reg: Regulation) => {
    setEditData({
      id: reg.id,
      categories: reg.categories || [],
      isValid: reg.is_valid,
      version: reg.version || '',
      publishDate: reg.publish_date || '',
      publishOrg: reg.publish_org || '',
      description: reg.description || '',
    });
    setEditDialogOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!editData) return;
    setEditLoading(true);
    try {
      const res = await fetch('/api/regulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          ...editData,
          publishDate: editData.publishDate || null,
          publishOrg: editData.publishOrg || null,
          description: editData.description || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        alert('保存成功');
        setEditDialogOpen(false);
        loadRegulations();
      } else {
        alert(data.error || '保存失败');
      }
    } catch (error) {
      alert('保存失败');
    } finally {
      setEditLoading(false);
    }
  };

  // 删除
  const handleDelete = async (ids: string[]) => {
    if (!confirm(`确定删除 ${ids.length} 个文档？此操作将同时删除关联的向量数据。`)) return;

    try {
      const res = await fetch('/api/regulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', ids }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`成功删除 ${data.deleted} 个文档`);
        setSelectedIds([]);
        loadRegulations();
        loadVectorStats();
      } else {
        alert(data.error || '删除失败');
      }
    } catch (error) {
      alert('删除失败');
    }
  };

  // 重新向量化
  const handleRevectorize = async (id: string) => {
    if (!confirm('确定重新向量化该文档？将重新分片并生成向量。')) return;

    try {
      const res = await fetch('/api/regulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'revectorize', id }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`向量化完成：成功 ${data.successCount} 条，失败 ${data.failCount} 条`);
        loadRegulations();
        loadVectorStats();
      } else {
        alert(data.error || '向量化失败');
      }
    } catch (error) {
      alert('向量化失败');
    }
  };

  // 批量向量化
  const handleBatchVectorize = async () => {
    if (selectedIds.length === 0) {
      alert('请选择要向量化的文档');
      return;
    }

    setBatchOperating(true);
    try {
      const res = await fetch('/api/regulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'batch-vectorize', ids: selectedIds }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`批量向量化完成：成功 ${data.successCount} 个，失败 ${data.failCount} 个`);
        setSelectedIds([]);
        loadRegulations();
        loadVectorStats();
      } else {
        alert(data.error || '批量向量化失败');
      }
    } catch (error) {
      alert('批量向量化失败');
    } finally {
      setBatchOperating(false);
    }
  };

  // 分类推荐
  const handleRecommendCategories = async () => {
    if (recommendFiles.length === 0) {
      alert('请选择文件');
      return;
    }

    setRecommending(true);
    try {
      const filenames = recommendFiles.map(f => f.name);
      const res = await fetch('/api/regulations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'recommend-categories', filenames }),
      });
      const data = await res.json();
      setRecommendations(data.recommendations || []);
    } catch (error) {
      alert('分类推荐失败');
    } finally {
      setRecommending(false);
    }
  };

  // 选择/取消选择
  const toggleSelect = (id: string) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    if (selectedIds.length === regulations.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(regulations.map(r => r.id));
    }
  };

  // 格式化文件大小
  const formatFileSize = (bytes: string | number) => {
    const size = typeof bytes === 'string' ? parseInt(bytes) : bytes;
    if (isNaN(size) || size === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(size) / Math.log(k));
    return parseFloat((size / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* 头部 */}
        <div className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">规章制度管理</h1>
            <p className="text-sm text-gray-500 mt-1">
              支持海事规章制度、平台运维规范等文档的分类管理与智能检索
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setRecommendDialogOpen(true)}
            >
              <Sparkles className="w-4 h-4 mr-2" />
              智能分类推荐
            </Button>
            <Button onClick={() => setUploadDialogOpen(true)}>
              <Upload className="w-4 h-4 mr-2" />
              上传文档
            </Button>
          </div>
        </div>

        {/* 统计卡片 */}
        {vectorStats && (
          <div className="grid grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-gray-500">总文档数</div>
                <div className="text-2xl font-bold">{vectorStats.total}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-gray-500">未向量化</div>
                <div className="text-2xl font-bold text-gray-600">{vectorStats.pending}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-gray-500">向量化成功</div>
                <div className="text-2xl font-bold text-green-600">{vectorStats.success}</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="text-sm text-gray-500">向量化失败</div>
                <div className="text-2xl font-bold text-red-600">{vectorStats.failed}</div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 筛选 */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-4 items-center">
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-gray-400" />
                <Input
                  placeholder="搜索文档名称或描述..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-64"
                />
              </div>
              <Select value={filterCategory || "all"} onValueChange={(v) => setFilterCategory(v === "all" ? "" : v)}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="文档分类" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部分类</SelectItem>
                  {CATEGORIES.map(cat => (
                    <SelectItem key={cat.key} value={cat.key}>{cat.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterIsValid || "all"} onValueChange={(v) => setFilterIsValid(v === "all" ? "" : v)}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="生效状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="true">生效</SelectItem>
                  <SelectItem value="false">失效</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterVectorStatus || "all"} onValueChange={(v) => setFilterVectorStatus(v === "all" ? "" : v)}>
                <SelectTrigger className="w-32">
                  <SelectValue placeholder="向量化状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部</SelectItem>
                  <SelectItem value="pending">未向量化</SelectItem>
                  <SelectItem value="success">成功</SelectItem>
                  <SelectItem value="failed">失败</SelectItem>
                </SelectContent>
              </Select>
              <Button variant="outline" onClick={() => {
                setSearchTerm('');
                setFilterCategory('');
                setFilterIsValid('');
                setFilterVectorStatus('');
              }}>
                重置
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* 批量操作 */}
        {selectedIds.length > 0 && (
          <div className="bg-blue-50 p-3 rounded-lg mb-4 flex items-center justify-between">
            <span className="text-blue-700">
              已选择 {selectedIds.length} 个文档
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={handleBatchVectorize}
                disabled={batchOperating}
              >
                {batchOperating ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : <RefreshCw className="w-4 h-4 mr-1" />}
                批量向量化
              </Button>
              <Button
                size="sm"
                variant="destructive"
                onClick={() => handleDelete(selectedIds)}
              >
                <Trash2 className="w-4 h-4 mr-1" />
                批量删除
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds([])}>
                取消选择
              </Button>
            </div>
          </div>
        )}

        {/* 列表 */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-gray-500">
                <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
                加载中...
              </div>
            ) : regulations.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <FolderOpen className="w-12 h-12 mx-auto mb-2 text-gray-300" />
                暂无文档，请上传规章制度文件
              </div>
            ) : (
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="p-3 text-left">
                      <Checkbox
                        checked={selectedIds.length === regulations.length}
                        onCheckedChange={toggleSelectAll}
                      />
                    </th>
                    <th className="p-3 text-left text-sm font-medium text-gray-500">文件名</th>
                    <th className="p-3 text-left text-sm font-medium text-gray-500">分类</th>
                    <th className="p-3 text-left text-sm font-medium text-gray-500">大小</th>
                    <th className="p-3 text-left text-sm font-medium text-gray-500">切片数</th>
                    <th className="p-3 text-left text-sm font-medium text-gray-500">生效状态</th>
                    <th className="p-3 text-left text-sm font-medium text-gray-500">向量化状态</th>
                    <th className="p-3 text-left text-sm font-medium text-gray-500">上传时间</th>
                    <th className="p-3 text-left text-sm font-medium text-gray-500">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {regulations.map((reg) => (
                    <tr key={reg.id} className="hover:bg-gray-50">
                      <td className="p-3">
                        <Checkbox
                          checked={selectedIds.includes(reg.id)}
                          onCheckedChange={() => toggleSelect(reg.id)}
                        />
                      </td>
                      <td className="p-3">
                        <div className="flex items-center gap-2">
                          <FileText className="w-4 h-4 text-gray-400" />
                          <span className="font-medium text-gray-900">{reg.filename}</span>
                        </div>
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-1">
                          {(reg.categories || []).map((cat) => (
                            <Badge key={cat} variant="secondary" className="text-xs">
                              {CATEGORIES.find(c => c.key === cat)?.label || cat}
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="p-3 text-sm text-gray-500">
                        {formatFileSize(reg.file_size)}
                      </td>
                      <td className="p-3 text-sm text-gray-500">
                        {reg.chunk_count}
                      </td>
                      <td className="p-3">
                        <Badge className={reg.is_valid ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}>
                          {reg.is_valid ? '生效' : '失效'}
                        </Badge>
                      </td>
                      <td className="p-3">
                        <Badge className={VECTOR_STATUS_MAP[reg.vector_status]?.color || 'bg-gray-100'}>
                          <span className="flex items-center gap-1">
                            {VECTOR_STATUS_MAP[reg.vector_status]?.icon}
                            {VECTOR_STATUS_MAP[reg.vector_status]?.label || reg.vector_status}
                          </span>
                        </Badge>
                      </td>
                      <td className="p-3 text-sm text-gray-500">
                        {new Date(reg.created_at).toLocaleDateString()}
                      </td>
                      <td className="p-3">
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => handleViewDetail(reg)}>
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleEdit(reg)}>
                            <Edit className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleRevectorize(reg.id)}>
                            <RefreshCw className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDelete([reg.id])}>
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardContent>
        </Card>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              disabled={page === 1}
              onClick={() => setPage(page - 1)}
            >
              上一页
            </Button>
            <span className="flex items-center text-sm text-gray-500">
              {page} / {totalPages} (共 {total} 条)
            </span>
            <Button
              variant="outline"
              size="sm"
              disabled={page >= totalPages}
              onClick={() => setPage(page + 1)}
            >
              下一页
            </Button>
          </div>
        )}

        {/* 上传弹窗 */}
        <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>上传规章制度文档</DialogTitle>
              <DialogDescription>
                上传规章制度文件，需选择文档分类。废止文件请勾选失效标记。
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>选择文件 *</Label>
                <Input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.md"
                  onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                />
              </div>
              <div>
                <Label>文档分类 *（必选）</Label>
                <div className="grid grid-cols-2 gap-2 mt-2">
                  {CATEGORIES.map((cat) => (
                    <div key={cat.key} className="flex items-center gap-2">
                      <Checkbox
                        id={`cat-${cat.key}`}
                        checked={uploadCategories.includes(cat.key)}
                        onCheckedChange={(checked) => {
                          setUploadCategories(prev =>
                            checked ? [...prev, cat.key] : prev.filter(c => c !== cat.key)
                          );
                        }}
                      />
                      <Label htmlFor={`cat-${cat.key}`} className="text-sm cursor-pointer">
                        {cat.label}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Checkbox
                  id="is-valid"
                  checked={uploadIsValid}
                  onCheckedChange={(checked) => setUploadIsValid(checked as boolean)}
                />
                <Label htmlFor="is-valid" className="cursor-pointer">
                  文档生效（废止文件请取消勾选）
                </Label>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>版本号</Label>
                  <Input
                    value={uploadVersion}
                    onChange={(e) => setUploadVersion(e.target.value)}
                    placeholder="如: V1.0"
                  />
                </div>
                <div>
                  <Label>发布日期</Label>
                  <Input
                    type="date"
                    value={uploadPublishDate}
                    onChange={(e) => setUploadPublishDate(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>发布机构</Label>
                <Input
                  value={uploadPublishOrg}
                  onChange={(e) => setUploadPublishOrg(e.target.value)}
                  placeholder="如: 交通运输部"
                />
              </div>
              <div>
                <Label>文档描述</Label>
                <Textarea
                  value={uploadDescription}
                  onChange={(e) => setUploadDescription(e.target.value)}
                  placeholder="简要描述文档内容..."
                  rows={2}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setUploadDialogOpen(false);
                resetUploadForm();
              }}>
                取消
              </Button>
              <Button onClick={handleUpload} disabled={uploading}>
                {uploading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                上传
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 详情弹窗 */}
        <Dialog open={detailDialogOpen} onOpenChange={setDetailDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>文档详情</DialogTitle>
            </DialogHeader>
            {detailLoading ? (
              <div className="p-8 text-center">
                <Loader2 className="w-6 h-6 animate-spin mx-auto" />
              </div>
            ) : selectedRegulation ? (
              <div className="space-y-6">
                {/* 基本信息 */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="w-5 h-5" />
                      {selectedRegulation.filename}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">分类：</span>
                        <div className="flex flex-wrap gap-1 mt-1">
                          {selectedRegulation.categories.map((cat) => (
                            <Badge key={cat} variant="secondary">
                              {CATEGORIES.find(c => c.key === cat)?.label || cat}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-500">生效状态：</span>
                        <Badge className={selectedRegulation.is_valid ? 'bg-green-100 text-green-700' : 'bg-gray-100'}>
                          {selectedRegulation.is_valid ? '生效' : '失效'}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-gray-500">版本：</span>
                        <span className="ml-1">{selectedRegulation.version || '-'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">发布日期：</span>
                        <span className="ml-1">{selectedRegulation.publish_date || '-'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">发布机构：</span>
                        <span className="ml-1">{selectedRegulation.publish_org || '-'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">向量化状态：</span>
                        <Badge className={VECTOR_STATUS_MAP[selectedRegulation.vector_status]?.color}>
                          {VECTOR_STATUS_MAP[selectedRegulation.vector_status]?.label}
                        </Badge>
                      </div>
                      <div>
                        <span className="text-gray-500">切片数量：</span>
                        <span className="ml-1">{selectedRegulation.chunk_count}</span>
                      </div>
                      <div>
                        <span className="text-gray-500">文件大小：</span>
                        <span className="ml-1">{formatFileSize(selectedRegulation.file_size)}</span>
                      </div>
                    </div>
                    {selectedRegulation.description && (
                      <div className="mt-4">
                        <span className="text-gray-500 text-sm">描述：</span>
                        <p className="mt-1 text-sm">{selectedRegulation.description}</p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* 切片列表 */}
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">切片内容</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4 max-h-96 overflow-y-auto">
                      {selectedChunks.map((chunk, index) => (
                        <div key={chunk.id} className="border rounded-lg p-4">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <Badge variant="outline">#{index + 1}</Badge>
                              {chunk.chapter && (
                                <Badge variant="secondary">{chunk.chapter}</Badge>
                              )}
                              {chunk.clause && (
                                <Badge variant="secondary">{chunk.clause}</Badge>
                              )}
                              {chunk.title && (
                                <span className="text-sm font-medium">{chunk.title}</span>
                              )}
                            </div>
                            <Badge className={
                              chunk.embedding_status === 'success'
                                ? 'bg-green-100 text-green-700'
                                : chunk.embedding_status === 'failed'
                                  ? 'bg-red-100 text-red-700'
                                  : 'bg-gray-100'
                            }>
                              {VECTOR_STATUS_MAP[chunk.embedding_status]?.label || chunk.embedding_status}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-600 whitespace-pre-wrap">
                            {chunk.content.substring(0, 300)}
                            {chunk.content.length > 300 && '...'}
                          </p>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            ) : null}
          </DialogContent>
        </Dialog>

        {/* 编辑弹窗 */}
        <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>编辑基本信息</DialogTitle>
              <DialogDescription>
                仅可修改分类、生效状态、版本和发布信息，不能修改原文内容。
              </DialogDescription>
            </DialogHeader>
            {editData && (
              <div className="space-y-4">
                <div>
                  <Label>文档分类</Label>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    {CATEGORIES.map((cat) => (
                      <div key={cat.key} className="flex items-center gap-2">
                        <Checkbox
                          id={`edit-cat-${cat.key}`}
                          checked={editData.categories.includes(cat.key)}
                          onCheckedChange={(checked) => {
                            setEditData(prev => prev ? {
                              ...prev,
                              categories: checked
                                ? [...prev.categories, cat.key]
                                : prev.categories.filter(c => c !== cat.key)
                            } : null);
                          }}
                        />
                        <Label htmlFor={`edit-cat-${cat.key}`} className="text-sm cursor-pointer">
                          {cat.label}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="edit-is-valid"
                    checked={editData.isValid}
                    onCheckedChange={(checked) => setEditData(prev => prev ? { ...prev, isValid: checked as boolean } : null)}
                  />
                  <Label htmlFor="edit-is-valid" className="cursor-pointer">
                    文档生效
                  </Label>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>版本号</Label>
                    <Input
                      value={editData.version}
                      onChange={(e) => setEditData(prev => prev ? { ...prev, version: e.target.value } : null)}
                    />
                  </div>
                  <div>
                    <Label>发布日期</Label>
                    <Input
                      type="date"
                      value={editData.publishDate}
                      onChange={(e) => setEditData(prev => prev ? { ...prev, publishDate: e.target.value } : null)}
                    />
                  </div>
                </div>
                <div>
                  <Label>发布机构</Label>
                  <Input
                    value={editData.publishOrg}
                    onChange={(e) => setEditData(prev => prev ? { ...prev, publishOrg: e.target.value } : null)}
                  />
                </div>
                <div>
                  <Label>文档描述</Label>
                  <Textarea
                    value={editData.description}
                    onChange={(e) => setEditData(prev => prev ? { ...prev, description: e.target.value } : null)}
                    rows={2}
                  />
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
                取消
              </Button>
              <Button onClick={handleSaveEdit} disabled={editLoading}>
                {editLoading && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                保存
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* 分类推荐弹窗 */}
        <Dialog open={recommendDialogOpen} onOpenChange={setRecommendDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>智能分类推荐</DialogTitle>
              <DialogDescription>
                上传批量文档，AI将根据文件名推荐文档分类（仅供参考，最终以人工勾选为准）
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>选择批量文档</Label>
                <Input
                  ref={batchFileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.txt,.md"
                  multiple
                  onChange={(e) => setRecommendFiles(Array.from(e.target.files || []))}
                />
              </div>
              {recommendFiles.length > 0 && (
                <div className="text-sm text-gray-500">
                  已选择 {recommendFiles.length} 个文件
                </div>
              )}
              <Button
                onClick={handleRecommendCategories}
                disabled={recommending || recommendFiles.length === 0}
              >
                {recommending && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                <Sparkles className="w-4 h-4 mr-2" />
                分析并推荐分类
              </Button>
              {recommendations.length > 0 && (
                <div className="border rounded-lg divide-y">
                  {recommendations.map((rec, index) => (
                    <div key={index} className="p-4">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium">{rec.filename}</span>
                        <div className="flex gap-1">
                          {rec.suggested.map((cat) => (
                            <Badge key={cat} className="bg-blue-100 text-blue-700">
                              {CATEGORIES.find(c => c.key === cat)?.label || cat}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <p className="text-sm text-gray-500">{rec.reason}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setRecommendDialogOpen(false);
                setRecommendFiles([]);
                setRecommendations([]);
              }}>
                关闭
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
