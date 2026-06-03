'use client';

import { useState, useEffect, useRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { 
  Database, Play, RefreshCw, Check, X, AlertTriangle, 
  Upload, Download, Settings, Brain, Target, Layers,
  History, TrendingUp, BarChart3, PieChart, Zap,
  FileJson, Box, ArrowRightLeft, Sparkles
} from 'lucide-react';
import Link from 'next/link';

// 类型定义
interface TrainingData {
  id: string;
  trajectory_id: string;
  segment_id: string;
  ai_description: string;
  behavior_code: string | null;
  intent_code: string | null;
  is_labeled: boolean;
  dataset_type: string;
  validation_score: number | null;
  needs_review: boolean;
}

interface TrainingJob {
  id: string;
  name: string;
  model_type: string;
  status: string;
  config: any;
  metrics: any;
  train_count: number;
  val_count: number;
  created_at: string;
  completed_at: string | null;
}

interface ModelVersion {
  id: string;
  version_name: string;
  model_type: string;
  is_active: boolean;
  metrics: any;
  train_samples: number;
  val_samples: number;
  is_incremental: boolean;
  base_version_id: string | null;
  created_at: string;
}

interface TrainingLog {
  epoch: number;
  step: number;
  train_loss: number;
  val_loss: number;
  train_acc: number;
  val_acc: number;
}

interface AnomalySample {
  id: string;
  trajectory_id: string;
  segment_id: string;
  predicted_behavior: string;
  predicted_intent: string;
  actual_behavior: string;
  actual_intent: string;
  confidence: number;
  is_corrected: boolean;
}

interface Stats {
  total: number;
  labeled: number;
  unlabeled: number;
  train: number;
  val: number;
  needsReview: number;
}

export default function TrajectoryTrainingPage() {
  const [activeTab, setActiveTab] = useState('dataset');
  const [trainingData, setTrainingData] = useState<TrainingData[]>([]);
  const [jobs, setJobs] = useState<TrainingJob[]>([]);
  const [versions, setVersions] = useState<ModelVersion[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalySample[]>([]);
  const [logs, setLogs] = useState<TrainingLog[]>([]);
  const [stats, setStats] = useState<Stats>({
    total: 0, labeled: 0, unlabeled: 0, train: 0, val: 0, needsReview: 0
  });
  const [loading, setLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());
  
  // 训练配置
  const [trainConfig, setTrainConfig] = useState({
    modelType: 'ensemble',
    useAugmentation: true,
    isIncremental: false,
    baseVersionId: ''
  });
  
  // 数据增强配置
  const [augConfig, setAugConfig] = useState({
    spatialPerturb: true,
    textSynonym: true,
    perturbScale: 0.001,
    synonymCount: 2
  });
  
  const logRef = useRef<HTMLDivElement>(null);

  // 加载数据
  useEffect(() => {
    fetchStats();
    fetchJobs();
    fetchVersions();
    fetchAnomalies();
  }, []);

  // 轮询训练日志
  useEffect(() => {
    const runningJob = jobs.find(j => j.status === 'running');
    if (runningJob) {
      const interval = setInterval(() => fetchLogs(runningJob.id), 2000);
      return () => clearInterval(interval);
    }
  }, [jobs]);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/trajectory/training/stats');
      const data = await res.json();
      setStats(data);
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    }
  };

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/trajectory/training/jobs');
      const data = await res.json();
      setJobs(data.jobs || []);
    } catch (e) {
      console.error('Failed to fetch jobs:', e);
    }
  };

  const fetchVersions = async () => {
    try {
      const res = await fetch('/api/trajectory/training/versions');
      const data = await res.json();
      setVersions(data.versions || []);
    } catch (e) {
      console.error('Failed to fetch versions:', e);
    }
  };

  const fetchAnomalies = async () => {
    try {
      const res = await fetch('/api/trajectory/training/anomalies');
      const data = await res.json();
      setAnomalies(data.anomalies || []);
    } catch (e) {
      console.error('Failed to fetch anomalies:', e);
    }
  };

  const fetchLogs = async (jobId: string) => {
    try {
      const res = await fetch(`/api/trajectory/training/logs?job_id=${jobId}`);
      const data = await res.json();
      setLogs(data.logs || []);
      // 自动滚动到底部
      if (logRef.current) {
        logRef.current.scrollTop = logRef.current.scrollHeight;
      }
    } catch (e) {
      console.error('Failed to fetch logs:', e);
    }
  };

  const handleImportFromLabel = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trajectory/training/import', { method: 'POST' });
      const data = await res.json();
      alert(`导入成功：${data.imported} 条，跳过（已存在）：${data.skipped} 条`);
      fetchStats();
      fetchData();
    } catch (e) {
      alert('导入失败');
    }
    setLoading(false);
  };

  const handleSplit = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trajectory/training/split', { method: 'POST' });
      const data = await res.json();
      alert(`拆分完成：训练集 ${data.train} 条，验证集 ${data.val} 条`);
      fetchStats();
      fetchData();
    } catch (e) {
      alert('拆分失败');
    }
    setLoading(false);
  };

  const handleAugment = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trajectory/training/augment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(augConfig)
      });
      const data = await res.json();
      alert(`数据增强完成：新增 ${data.augmented} 条`);
      fetchStats();
      fetchData();
    } catch (e) {
      alert('数据增强失败');
    }
    setLoading(false);
  };

  const handleTrain = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trajectory/training/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(trainConfig)
      });
      const data = await res.json();
      alert(`训练任务已创建：${data.job_id}`);
      fetchJobs();
    } catch (e) {
      alert('训练启动失败');
    }
    setLoading(false);
  };

  const handleToggleVersion = async (versionId: string, activate: boolean) => {
    try {
      await fetch('/api/trajectory/training/versions/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ version_id: versionId, activate })
      });
      fetchVersions();
    } catch (e) {
      alert('切换失败');
    }
  };

  const handleExportDataset = async () => {
    try {
      const res = await fetch('/api/trajectory/training/export?format=json');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `trajectory_dataset_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('导出失败');
    }
  };

  const handleExportModel = async (versionId: string) => {
    try {
      const res = await fetch(`/api/trajectory/training/export-model?version_id=${versionId}`);
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `lora_weights_${versionId}.bin`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (e) {
      alert('导出模型失败');
    }
  };

  const handleGoToLabel = (trajectoryIds: string[]) => {
    // 跳转到标注页面，带上需要标注的轨迹ID
    const ids = trajectoryIds.join(',');
    window.open(`/segment-label?trajectories=${ids}`, '_blank');
  };

  const fetchData = async () => {
    try {
      const res = await fetch('/api/trajectory/training/data?limit=100');
      const data = await res.json();
      setTrainingData(data.data || []);
    } catch (e) {
      console.error('Failed to fetch data:', e);
    }
  };

  useEffect(() => {
    if (activeTab === 'dataset') {
      fetchData();
    }
  }, [activeTab]);

  // 计算混淆矩阵数据
  const getConfusionMatrix = () => {
    // 简化的混淆矩阵展示
    const behaviors = ['DOCKING', 'ANCHORING', 'STEADY_SAILING', 'CHANNEL_TURNING'];
    const matrix: number[][] = behaviors.map(() => behaviors.map(() => 0));
    
    // 这里应该从实际数据计算
    // 暂时返回模拟数据
    return { behaviors, matrix };
  };

  const { behaviors, matrix } = getConfusionMatrix();

  return (
    <div className="container mx-auto p-4 max-w-7xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">航迹分类训练平台</h1>
          <p className="text-muted-foreground">训练航迹行为/意图分类模型</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/segment-label">前往标注平台</Link>
          </Button>
          <Button variant="outline" onClick={handleExportDataset}>
            <Download className="w-4 h-4 mr-2" />
            导出数据集
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-6 gap-4 mb-6">
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-xs text-muted-foreground">总样本</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-green-600">{stats.labeled}</div>
            <div className="text-xs text-muted-foreground">已标注</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-orange-600">{stats.unlabeled}</div>
            <div className="text-xs text-muted-foreground">待标注</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-blue-600">{stats.train}</div>
            <div className="text-xs text-muted-foreground">训练集</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-purple-600">{stats.val}</div>
            <div className="text-xs text-muted-foreground">验证集</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="text-2xl font-bold text-red-600">{stats.needsReview}</div>
            <div className="text-xs text-muted-foreground">待复核</div>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-5 mb-4">
          <TabsTrigger value="dataset">数据集</TabsTrigger>
          <TabsTrigger value="augment">数据增强</TabsTrigger>
          <TabsTrigger value="train">模型训练</TabsTrigger>
          <TabsTrigger value="versions">版本管理</TabsTrigger>
          <TabsTrigger value="anomalies">异常样本</TabsTrigger>
        </TabsList>

        {/* 数据集管理 */}
        <TabsContent value="dataset">
          <Card>
            <CardHeader>
              <CardTitle>数据集管理</CardTitle>
              <CardDescription>导入标注数据并拆分训练/验证集</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap gap-2">
                <Button onClick={handleImportFromLabel} disabled={loading}>
                  <Upload className="w-4 h-4 mr-2" />
                  从标注平台导入
                </Button>
                <Button variant="secondary" onClick={handleSplit} disabled={loading || stats.labeled < 10}>
                  <RefreshCw className="w-4 h-4 mr-2" />
                  7:3 拆分数据集
                </Button>
              </div>

              <div className="text-sm text-muted-foreground">
                当前：训练集 {stats.train} 条，验证集 {stats.val} 条（比例 7:3）
              </div>

              {/* 数据列表 */}
              <div className="border rounded-lg max-h-96 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="p-2 text-left">航段ID</th>
                      <th className="p-2 text-left">描述</th>
                      <th className="p-2 text-left">行为</th>
                      <th className="p-2 text-left">意图</th>
                      <th className="p-2 text-left">类型</th>
                      <th className="p-2 text-left">状态</th>
                    </tr>
                  </thead>
                  <tbody>
                    {trainingData.map((item) => (
                      <tr key={item.id} className="border-t hover:bg-muted/50">
                        <td className="p-2 font-mono text-xs">{item.segment_id?.slice(0, 12)}...</td>
                        <td className="p-2 max-w-xs truncate">{item.ai_description?.slice(0, 30)}...</td>
                        <td className="p-2">
                          {item.behavior_code && (
                            <Badge variant="outline" className="text-xs">{item.behavior_code}</Badge>
                          )}
                        </td>
                        <td className="p-2">
                          {item.intent_code && (
                            <Badge variant="outline" className="text-xs">{item.intent_code}</Badge>
                          )}
                        </td>
                        <td className="p-2">
                          <Badge variant={item.dataset_type === 'train' ? 'default' : 'secondary'}>
                            {item.dataset_type || '未分配'}
                          </Badge>
                        </td>
                        <td className="p-2">
                          {item.needs_review ? (
                            <Badge variant="destructive">待复核</Badge>
                          ) : item.is_labeled ? (
                            <Badge variant="default">已标注</Badge>
                          ) : (
                            <Badge variant="outline">未标注</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 数据增强 */}
        <TabsContent value="augment">
          <Card>
            <CardHeader>
              <CardTitle>数据增强</CardTitle>
              <CardDescription>扩充训练样本，提升模型泛化能力</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                {/* 空间扰动 */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">航线坐标扰动</CardTitle>
                      <Switch 
                        checked={augConfig.spatialPerturb}
                        onCheckedChange={(v) => setAugConfig({...augConfig, spatialPerturb: v})}
                      />
                    </div>
                    <CardDescription>对航线坐标添加微量随机扰动</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">扰动比例：</span>
                      <input 
                        type="range" 
                        min="0.0001" 
                        max="0.01" 
                        step="0.0001"
                        value={augConfig.perturbScale}
                        onChange={(e) => setAugConfig({...augConfig, perturbScale: parseFloat(e.target.value)})}
                        className="flex-1"
                      />
                      <span className="text-sm font-mono">{augConfig.perturbScale.toFixed(4)}</span>
                    </div>
                  </CardContent>
                </Card>

                {/* 文本改写 */}
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-base">描述文本改写</CardTitle>
                      <Switch 
                        checked={augConfig.textSynonym}
                        onCheckedChange={(v) => setAugConfig({...augConfig, textSynonym: v})}
                      />
                    </div>
                    <CardDescription>使用 LLM 同义改写描述文本</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center gap-2">
                      <span className="text-sm">改写数量：</span>
                      <Select 
                        value={String(augConfig.synonymCount)}
                        onValueChange={(v) => setAugConfig({...augConfig, synonymCount: parseInt(v)})}
                      >
                        <SelectTrigger className="w-20">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1</SelectItem>
                          <SelectItem value="2">2</SelectItem>
                          <SelectItem value="3">3</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="text-sm text-muted-foreground">条/样本</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <Button onClick={handleAugment} disabled={loading || (!augConfig.spatialPerturb && !augConfig.textSynonym)}>
                <Sparkles className="w-4 h-4 mr-2" />
                执行数据增强
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 模型训练 */}
        <TabsContent value="train">
          <div className="grid md:grid-cols-2 gap-4">
            {/* 训练配置 */}
            <Card>
              <CardHeader>
                <CardTitle>训练配置</CardTitle>
                <CardDescription>固定模型参数，可选增量训练</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="text-sm font-medium">模型类型</label>
                  <Select 
                    value={trainConfig.modelType}
                    onValueChange={(v) => setTrainConfig({...trainConfig, modelType: v})}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="text_classifier">文本分类 (BGE + LoRA)</SelectItem>
                      <SelectItem value="spatial_classifier">空间特征 (XGBoost)</SelectItem>
                      <SelectItem value="ensemble">融合模型 (0.7 文本 + 0.3 空间)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium">使用数据增强</label>
                    <p className="text-xs text-muted-foreground">扩充训练样本</p>
                  </div>
                  <Switch 
                    checked={trainConfig.useAugmentation}
                    onCheckedChange={(v) => setTrainConfig({...trainConfig, useAugmentation: v})}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-medium">增量训练</label>
                    <p className="text-xs text-muted-foreground">基于当前上线模型微调</p>
                  </div>
                  <Switch 
                    checked={trainConfig.isIncremental}
                    onCheckedChange={(v) => setTrainConfig({...trainConfig, isIncremental: v})}
                  />
                </div>

                {/* 固定参数展示 */}
                <div className="bg-muted p-3 rounded-lg text-xs space-y-1">
                  <div className="font-medium mb-2">固定参数</div>
                  {trainConfig.modelType === 'text_classifier' && (
                    <>
                      <div>模型：bge-base-zh + LoRA</div>
                      <div>Epoch: 4, Batch: 16, LR: 2e-4</div>
                      <div>LoRA Rank: 8, Alpha: 16</div>
                    </>
                  )}
                  {trainConfig.modelType === 'spatial_classifier' && (
                    <>
                      <div>模型：XGBoost</div>
                      <div>n_estimators: 120, max_depth: 6</div>
                      <div>Learning Rate: 0.1</div>
                    </>
                  )}
                  {trainConfig.modelType === 'ensemble' && (
                    <>
                      <div>文本权重: 0.7, 空间权重: 0.3</div>
                      <div>文本：bge-base-zh + LoRA</div>
                      <div>空间：XGBoost</div>
                    </>
                  )}
                </div>

                <Button onClick={handleTrain} disabled={loading || stats.train < 10} className="w-full">
                  <Play className="w-4 h-4 mr-2" />
                  开始训练
                </Button>
              </CardContent>
            </Card>

            {/* 训练监控 */}
            <Card>
              <CardHeader>
                <CardTitle>训练监控</CardTitle>
                <CardDescription>实时 Loss 和准确率</CardDescription>
              </CardHeader>
              <CardContent>
                {jobs.find(j => j.status === 'running') ? (
                  <div className="space-y-4">
                    {/* Loss 曲线 */}
                    <div className="h-40 border rounded-lg p-2" ref={logRef}>
                      <div className="text-xs text-muted-foreground mb-2">Loss 曲线</div>
                      <div className="h-28 flex items-end gap-1">
                        {logs.slice(-30).map((log, i) => (
                          <div key={i} className="flex-1 flex flex-col gap-0.5">
                            <div 
                              className="bg-blue-500 rounded-t" 
                              style={{height: `${Math.min(log.train_loss * 20, 100)}%`}}
                            />
                            <div 
                              className="bg-orange-500 rounded-b" 
                              style={{height: `${Math.min(log.val_loss * 20, 100)}%`}}
                            />
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 准确率 */}
                    <div className="grid grid-cols-2 gap-4 text-center">
                      <div className="p-3 bg-muted rounded-lg">
                        <div className="text-2xl font-bold text-blue-600">
                          {logs.length > 0 ? (logs[logs.length - 1].train_acc * 100).toFixed(1) : 0}%
                        </div>
                        <div className="text-xs text-muted-foreground">训练准确率</div>
                      </div>
                      <div className="p-3 bg-muted rounded-lg">
                        <div className="text-2xl font-bold text-orange-600">
                          {logs.length > 0 ? (logs[logs.length - 1].val_acc * 100).toFixed(1) : 0}%
                        </div>
                        <div className="text-xs text-muted-foreground">验证准确率</div>
                      </div>
                    </div>

                    <Progress value={logs.length > 0 ? (logs[logs.length - 1].epoch / 4) * 100 : 0} />
                    <div className="text-sm text-center text-muted-foreground">
                      Epoch {logs.length > 0 ? logs[logs.length - 1].epoch : 0} / 4
                    </div>
                  </div>
                ) : (
                  <div className="h-60 flex items-center justify-center text-muted-foreground">
                    {jobs.find(j => j.status === 'pending') ? '等待训练...' : '暂无进行中的训练任务'}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* 混淆矩阵 */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>混淆矩阵</CardTitle>
              <CardDescription>分类结果可视化</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr>
                      <th className="p-2"></th>
                      {behaviors.map((b) => (
                        <th key={b} className="p-2 text-center">{b.slice(0, 6)}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {behaviors.map((row, i) => (
                      <tr key={row}>
                        <td className="p-2 font-medium">{row.slice(0, 6)}</td>
                        {behaviors.map((col, j) => (
                          <td 
                            key={col} 
                            className="p-2 text-center"
                            style={{
                              backgroundColor: i === j ? '#22c55e33' : matrix[i]?.[j] ? '#ef444422' : 'transparent'
                            }}
                          >
                            {matrix[i]?.[j] || 0}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {/* 训练历史 */}
          <Card className="mt-4">
            <CardHeader>
              <CardTitle>训练历史</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {jobs.map((job) => (
                  <div key={job.id} className="flex items-center justify-between p-2 border rounded-lg">
                    <div className="flex items-center gap-3">
                      <Badge variant={
                        job.status === 'completed' ? 'default' :
                        job.status === 'running' ? 'secondary' :
                        job.status === 'failed' ? 'destructive' : 'outline'
                      }>
                        {job.status}
                      </Badge>
                      <span className="font-medium">{job.name}</span>
                      <span className="text-xs text-muted-foreground">{job.model_type}</span>
                    </div>
                    <div className="flex items-center gap-4 text-sm">
                      <span>训练: {job.train_count}</span>
                      <span>验证: {job.val_count}</span>
                      {job.metrics?.accuracy && (
                        <span>准确率: {(job.metrics.accuracy * 100).toFixed(1)}%</span>
                      )}
                      <span className="text-xs text-muted-foreground">
                        {new Date(job.created_at).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 版本管理 */}
        <TabsContent value="versions">
          <Card>
            <CardHeader>
              <CardTitle>模型版本管理</CardTitle>
              <CardDescription>管理训练生成的模型版本，切换上线/下线</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {versions.length === 0 ? (
                  <div className="text-center text-muted-foreground py-8">
                    暂无模型版本，请先训练模型
                  </div>
                ) : (
                  versions.map((version) => (
                    <div key={version.id} className={`p-4 border rounded-lg ${version.is_active ? 'border-green-500 bg-green-50' : ''}`}>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {version.is_active && (
                            <Badge className="bg-green-500">当前上线</Badge>
                          )}
                          <span className="font-medium">{version.version_name}</span>
                          <Badge variant="outline">{version.model_type}</Badge>
                          {version.is_incremental && (
                            <Badge variant="secondary">增量训练</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <Button 
                            variant={version.is_active ? "outline" : "default"}
                            size="sm"
                            onClick={() => handleToggleVersion(version.id, !version.is_active)}
                          >
                            {version.is_active ? '下线' : '上线'}
                          </Button>
                          <Button 
                            variant="outline" 
                            size="sm"
                            onClick={() => handleExportModel(version.id)}
                          >
                            <Download className="w-3 h-3 mr-1" />
                            导出
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 text-sm text-muted-foreground flex gap-4">
                        <span>训练样本: {version.train_samples}</span>
                        <span>验证样本: {version.val_samples}</span>
                        {version.metrics?.accuracy && (
                          <span>准确率: {(version.metrics.accuracy * 100).toFixed(1)}%</span>
                        )}
                        <span>创建时间: {new Date(version.created_at).toLocaleString()}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 异常样本 */}
        <TabsContent value="anomalies">
          <Card>
            <CardHeader>
              <CardTitle>异常样本管理</CardTitle>
              <CardDescription>预测结果与实际标签差异较大的样本（置信度 &lt; 0.6）</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between mb-4">
                <div className="text-sm text-muted-foreground">
                  共 {anomalies.length} 条异常样本，{anomalies.filter(a => !a.is_corrected).length} 条待订正
                </div>
                <Button 
                  variant="outline"
                  onClick={() => handleGoToLabel(anomalies.filter(a => !a.is_corrected).map(a => a.trajectory_id))}
                  disabled={anomalies.filter(a => !a.is_corrected).length === 0}
                >
                  <ArrowRightLeft className="w-4 h-4 mr-2" />
                  批量跳转标注订正
                </Button>
              </div>

              <div className="border rounded-lg max-h-96 overflow-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted sticky top-0">
                    <tr>
                      <th className="p-2 text-left">航段ID</th>
                      <th className="p-2 text-left">预测行为</th>
                      <th className="p-2 text-left">实际行为</th>
                      <th className="p-2 text-left">预测意图</th>
                      <th className="p-2 text-left">实际意图</th>
                      <th className="p-2 text-left">置信度</th>
                      <th className="p-2 text-left">状态</th>
                      <th className="p-2 text-left">操作</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anomalies.map((item) => (
                      <tr key={item.id} className="border-t hover:bg-muted/50">
                        <td className="p-2 font-mono text-xs">{item.segment_id?.slice(0, 10)}...</td>
                        <td className="p-2"><Badge variant="outline">{item.predicted_behavior}</Badge></td>
                        <td className="p-2"><Badge variant="outline">{item.actual_behavior}</Badge></td>
                        <td className="p-2"><Badge variant="outline">{item.predicted_intent}</Badge></td>
                        <td className="p-2"><Badge variant="outline">{item.actual_intent}</Badge></td>
                        <td className="p-2">
                          <span className={item.confidence < 0.4 ? 'text-red-500' : 'text-orange-500'}>
                            {item.confidence.toFixed(2)}
                          </span>
                        </td>
                        <td className="p-2">
                          {item.is_corrected ? (
                            <Badge variant="default">已订正</Badge>
                          ) : (
                            <Badge variant="destructive">待订正</Badge>
                          )}
                        </td>
                        <td className="p-2">
                          {!item.is_corrected && (
                            <Button 
                              variant="link" 
                              size="sm"
                              onClick={() => handleGoToLabel([item.trajectory_id])}
                            >
                              去订正
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
