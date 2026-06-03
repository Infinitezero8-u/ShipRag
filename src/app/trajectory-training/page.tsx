'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { 
  Database, Play, RefreshCw, Check, X, AlertTriangle, 
  Upload, Download, Settings, Brain, Target, Layers
} from 'lucide-react';
import Link from 'next/link';

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
  const [stats, setStats] = useState<Stats>({
    total: 0, labeled: 0, unlabeled: 0, train: 0, val: 0, needsReview: 0
  });
  const [loading, setLoading] = useState(false);
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetchTrainingData();
    fetchJobs();
    fetchStats();
  }, []);

  const fetchTrainingData = async () => {
    try {
      const res = await fetch('/api/trajectory/training/data');
      if (res.ok) {
        const data = await res.json();
        setTrainingData(data.data || []);
      }
    } catch (e) {
      console.error('Failed to fetch training data:', e);
    }
  };

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/trajectory/training/jobs');
      if (res.ok) {
        setJobs(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch jobs:', e);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/trajectory/training/stats');
      if (res.ok) {
        setStats(await res.json());
      }
    } catch (e) {
      console.error('Failed to fetch stats:', e);
    }
  };

  // 从标注平台导入数据
  const importFromLabels = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trajectory/training/import', { method: 'POST' });
      if (res.ok) {
        const result = await res.json();
        alert(`导入成功！训练集: ${result.train_count}条，验证集: ${result.val_count}条`);
        fetchTrainingData();
        fetchStats();
      } else {
        const err = await res.json();
        alert(`导入失败: ${err.error}`);
      }
    } catch (e) {
      alert('导入失败');
    }
    setLoading(false);
  };

  // 拆分数据集
  const splitDataset = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trajectory/training/split', { method: 'POST' });
      if (res.ok) {
        const result = await res.json();
        alert(`拆分完成！训练集: ${result.train_count}条，验证集: ${result.val_count}条`);
        fetchStats();
      }
    } catch (e) {
      alert('拆分失败');
    }
    setLoading(false);
  };

  // KMeans 聚类预分类
  const runClustering = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trajectory/training/cluster', { method: 'POST' });
      if (res.ok) {
        const result = await res.json();
        alert(`聚类完成！共 ${result.cluster_count} 个簇，${result.clustered_count} 条数据已预分类`);
        fetchTrainingData();
      }
    } catch (e) {
      alert('聚类失败');
    }
    setLoading(false);
  };

  // 开始训练
  const startTraining = async (modelType: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/trajectory/training/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model_type: modelType })
      });
      if (res.ok) {
        const result = await res.json();
        alert(`训练任务已创建！任务ID: ${result.job_id}`);
        fetchJobs();
      }
    } catch (e) {
      alert('启动训练失败');
    }
    setLoading(false);
  };

  // 质量校验
  const runValidation = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trajectory/training/validate', { method: 'POST' });
      if (res.ok) {
        const result = await res.json();
        alert(`校验完成！通过: ${result.passed_count}条，需修改: ${result.review_count}条`);
        fetchTrainingData();
        fetchStats();
      }
    } catch (e) {
      alert('校验失败');
    }
    setLoading(false);
  };

  // 推理分类
  const runInference = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/trajectory/training/inference', { method: 'POST' });
      if (res.ok) {
        const result = await res.json();
        alert(`推理完成！已分类: ${result.inferred_count}条航迹`);
      }
    } catch (e) {
      alert('推理失败');
    }
    setLoading(false);
  };

  const getBehaviorLabel = (code: string | null) => {
    const labels: Record<string, string> = {
      'DOCKING': '码头靠泊', 'ANCHORING': '锚泊', 'BUOY_MOORING': '浮筒系泊',
      'DRIFTING': '原地漂泊', 'STEADY_SAILING': '匀速直航', 'CHANNEL_TURNING': '航道转向',
      'VARIABLE_SAILING': '变速航行', 'TURNING_BACK': '原地掉头', 'LOITERING': '原地徘徊',
      'AVOIDING': '船舶避让', 'CROSSING_CHANNEL': '横穿航道', 'DEVIATION': '违规偏航',
      'AIS_OFF': 'AIS关机失联', 'SUSPICIOUS_LOITERING': '无目的低速游荡'
    };
    return code ? labels[code] || code : '-';
  };

  const getIntentLabel = (code: string | null) => {
    const labels: Record<string, string> = {
      'INBOUND': '船舶进港', 'OUTBOUND': '船舶出港', 'WAITING_ANCHORAGE': '锚地候泊',
      'INTER_PORT_TRANSIT': '跨港干线运输', 'INTERMEDIATE_CALL': '中途挂靠港口',
      'PILOTAGE': '接驳引水', 'ENGINEERING_WORK': '水上工程作业', 'FISHING': '渔船捕捞',
      'MEETING_AVOIDANCE': '会船避让', 'EMERGENCY_SHELTER': '故障临时避险',
      'SUSPICIOUS_SMUGGLING': '可疑走私航行', 'RESTRICTED_ENTRY': '违规闯入禁航'
    };
    return code ? labels[code] || code : '-';
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Brain className="w-7 h-7 text-purple-600" />
            航迹分类训练平台
          </h1>
          <p className="text-gray-600 mt-1">
            多模态航迹分类模型训练，支持文本+空间特征融合
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-xs text-gray-500">总数据</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-green-600">{stats.labeled}</div>
              <div className="text-xs text-gray-500">已标注</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-orange-600">{stats.unlabeled}</div>
              <div className="text-xs text-gray-500">未标注</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">{stats.train}</div>
              <div className="text-xs text-gray-500">训练集</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-purple-600">{stats.val}</div>
              <div className="text-xs text-gray-500">验证集</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 text-center">
              <div className="text-2xl font-bold text-red-600">{stats.needsReview}</div>
              <div className="text-xs text-gray-500">待修改</div>
            </CardContent>
          </Card>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="dataset"><Database className="w-4 h-4 mr-1" />数据集</TabsTrigger>
            <TabsTrigger value="cluster"><Layers className="w-4 h-4 mr-1" />聚类预分类</TabsTrigger>
            <TabsTrigger value="train"><Play className="w-4 h-4 mr-1" />模型训练</TabsTrigger>
            <TabsTrigger value="validate"><Target className="w-4 h-4 mr-1" />质量校验</TabsTrigger>
          </TabsList>

          {/* 数据集 Tab */}
          <TabsContent value="dataset">
            <Card>
              <CardHeader>
                <CardTitle>训练数据集管理</CardTitle>
                <CardDescription>
                  从标注平台导入数据，自动 7:3 拆分训练/验证集
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-3 mb-4">
                  <Button onClick={importFromLabels} disabled={loading}>
                    <Upload className="w-4 h-4 mr-1" />
                    从标注平台导入
                  </Button>
                  <Button variant="outline" onClick={splitDataset} disabled={loading}>
                    <RefreshCw className="w-4 h-4 mr-1" />
                    重新拆分 (7:3)
                  </Button>
                  <Link href="/segment-label">
                    <Button variant="outline">
                      去标注平台补全
                    </Button>
                  </Link>
                </div>

                {/* 数据列表 */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="overflow-x-auto max-h-96">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-100 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">航段ID</th>
                          <th className="px-3 py-2 text-left">描述</th>
                          <th className="px-3 py-2 text-left">行为</th>
                          <th className="px-3 py-2 text-left">意图</th>
                          <th className="px-3 py-2 text-left">数据集</th>
                          <th className="px-3 py-2 text-left">校验分</th>
                          <th className="px-3 py-2 text-left">状态</th>
                        </tr>
                      </thead>
                      <tbody>
                        {trainingData.map((item) => (
                          <tr key={item.id} className="border-t hover:bg-gray-50">
                            <td className="px-3 py-2 font-mono text-xs">{item.segment_id?.slice(0, 12)}...</td>
                            <td className="px-3 py-2 max-w-xs truncate">{item.ai_description?.slice(0, 30)}...</td>
                            <td className="px-3 py-2">
                              {item.behavior_code ? (
                                <Badge variant="secondary" className="text-xs">{getBehaviorLabel(item.behavior_code)}</Badge>
                              ) : <span className="text-gray-400">-</span>}
                            </td>
                            <td className="px-3 py-2">
                              {item.intent_code ? (
                                <Badge variant="outline" className="text-xs">{getIntentLabel(item.intent_code)}</Badge>
                              ) : <span className="text-gray-400">-</span>}
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant={item.dataset_type === 'train' ? 'default' : 'outline'} className="text-xs">
                                {item.dataset_type === 'train' ? '训练' : item.dataset_type === 'val' ? '验证' : '未分配'}
                              </Badge>
                            </td>
                            <td className="px-3 py-2">
                              {item.validation_score !== null ? (
                                <span className={item.validation_score >= 0.6 ? 'text-green-600' : 'text-red-600'}>
                                  {item.validation_score.toFixed(2)}
                                </span>
                              ) : '-'}
                            </td>
                            <td className="px-3 py-2">
                              {item.needs_review ? (
                                <Badge variant="destructive" className="text-xs">待修改</Badge>
                              ) : item.is_labeled ? (
                                <Badge variant="default" className="text-xs bg-green-600">已标注</Badge>
                              ) : (
                                <Badge variant="outline" className="text-xs">未标注</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                        {trainingData.length === 0 && (
                          <tr>
                            <td colSpan={7} className="px-3 py-8 text-center text-gray-500">
                              暂无数据，请从标注平台导入
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 聚类预分类 Tab */}
          <TabsContent value="cluster">
            <Card>
              <CardHeader>
                <CardTitle>KMeans 聚类预分类</CardTitle>
                <CardDescription>
                  对无标签航迹进行 KMeans 聚类 (n_clusters=8)，辅助人工标注
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <h3 className="font-medium mb-2">聚类参数</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-gray-500">聚类数量:</span>
                        <span className="ml-2 font-mono">8</span>
                      </div>
                      <div>
                        <span className="text-gray-500">特征维度:</span>
                        <span className="ml-2 font-mono">文本+空间</span>
                      </div>
                      <div>
                        <span className="text-gray-500">向量模型:</span>
                        <span className="ml-2 font-mono">bge-base-zh</span>
                      </div>
                      <div>
                        <span className="text-gray-500">空间特征:</span>
                        <span className="ml-2 font-mono">Shapely</span>
                      </div>
                    </div>
                  </div>
                  
                  <Button onClick={runClustering} disabled={loading}>
                    <Layers className="w-4 h-4 mr-1" />
                    执行聚类
                  </Button>
                  
                  <p className="text-sm text-gray-500">
                    聚类完成后，可前往 <Link href="/segment-label" className="text-blue-600 hover:underline">标注平台</Link> 查看聚类结果并进行人工校准
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 模型训练 Tab */}
          <TabsContent value="train">
            <div className="grid md:grid-cols-2 gap-4">
              {/* 文本分类模型 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="w-5 h-5 text-blue-600" />
                    文本分类模型
                  </CardTitle>
                  <CardDescription>BGE-base-zh + LoRA 微调</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="p-2 bg-gray-50 rounded">
                      <span className="text-gray-500">Epochs:</span> 4
                    </div>
                    <div className="p-2 bg-gray-50 rounded">
                      <span className="text-gray-500">Batch:</span> 16
                    </div>
                    <div className="p-2 bg-gray-50 rounded">
                      <span className="text-gray-500">LR:</span> 2e-4
                    </div>
                    <div className="p-2 bg-gray-50 rounded">
                      <span className="text-gray-500">LoRA Rank:</span> 8
                    </div>
                    <div className="p-2 bg-gray-50 rounded col-span-2">
                      <span className="text-gray-500">LoRA Alpha:</span> 16
                    </div>
                  </div>
                  <Button onClick={() => startTraining('text_classifier')} disabled={loading || stats.train < 10}>
                    <Play className="w-4 h-4 mr-1" />
                    开始训练
                  </Button>
                  {stats.train < 10 && (
                    <p className="text-xs text-orange-600">训练集数据不足，请先导入数据</p>
                  )}
                </CardContent>
              </Card>

              {/* 空间特征模型 */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="w-5 h-5 text-green-600" />
                    空间特征模型
                  </CardTitle>
                  <CardDescription>XGBoost 分类器</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="p-2 bg-gray-50 rounded">
                      <span className="text-gray-500">N Estimators:</span> 120
                    </div>
                    <div className="p-2 bg-gray-50 rounded">
                      <span className="text-gray-500">Max Depth:</span> 6
                    </div>
                    <div className="p-2 bg-gray-50 rounded col-span-2">
                      <span className="text-gray-500">LR:</span> 0.1
                    </div>
                  </div>
                  <div className="p-2 bg-blue-50 rounded text-sm">
                    <span className="text-blue-600">空间特征:</span> 航线长度、曲率、转向角、航程范围
                  </div>
                  <Button onClick={() => startTraining('spatial_classifier')} disabled={loading || stats.train < 10}>
                    <Play className="w-4 h-4 mr-1" />
                    开始训练
                  </Button>
                </CardContent>
              </Card>

              {/* 融合模型 */}
              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Settings className="w-5 h-5 text-purple-600" />
                    融合模型
                  </CardTitle>
                  <CardDescription>文本权重 0.7 + 空间权重 0.3</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-3 gap-2 text-sm">
                    <div className="p-2 bg-gray-50 rounded">
                      <span className="text-gray-500">文本权重:</span> 0.7
                    </div>
                    <div className="p-2 bg-gray-50 rounded">
                      <span className="text-gray-500">空间权重:</span> 0.3
                    </div>
                    <div className="p-2 bg-gray-50 rounded">
                      <span className="text-gray-500">融合策略:</span> 加权平均
                    </div>
                  </div>
                  <Button onClick={() => startTraining('ensemble')} disabled={loading || stats.train < 10}>
                    <Play className="w-4 h-4 mr-1" />
                    训练融合模型
                  </Button>
                </CardContent>
              </Card>
            </div>

            {/* 训练任务列表 */}
            <Card className="mt-4">
              <CardHeader>
                <CardTitle>训练任务</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {jobs.map((job) => (
                    <div key={job.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <div className="font-medium">{job.name}</div>
                        <div className="text-xs text-gray-500">
                          {job.model_type} · 训练:{job.train_count} 验证:{job.val_count}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={
                          job.status === 'completed' ? 'default' :
                          job.status === 'running' ? 'secondary' :
                          job.status === 'failed' ? 'destructive' : 'outline'
                        }>
                          {job.status === 'completed' ? '已完成' :
                           job.status === 'running' ? '运行中' :
                           job.status === 'failed' ? '失败' : '待执行'}
                        </Badge>
                        {job.metrics && (
                          <span className="text-sm text-green-600">F1: {job.metrics.f1?.toFixed(3)}</span>
                        )}
                      </div>
                    </div>
                  ))}
                  {jobs.length === 0 && (
                    <p className="text-center text-gray-500 py-4">暂无训练任务</p>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* 质量校验 Tab */}
          <TabsContent value="validate">
            <Card>
              <CardHeader>
                <CardTitle>质量校验</CardTitle>
                <CardDescription>
                  使用 bge-reranker-base 校验标注质量，匹配分数低于 0.6 的数据退回标注修改
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <h3 className="font-medium mb-2">校验流程</h3>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-gray-600">
                    <li>计算航迹描述与行为/意图标签的语义匹配分数</li>
                    <li>分数 ≥ 0.6 视为通过，分数 &lt; 0.6 标记为需修改</li>
                    <li>需修改的数据需返回标注平台重新标注</li>
                  </ol>
                </div>
                
                <div className="flex gap-3">
                  <Button onClick={runValidation} disabled={loading}>
                    <Target className="w-4 h-4 mr-1" />
                    执行校验
                  </Button>
                  <Button variant="outline" onClick={runInference} disabled={loading}>
                    <RefreshCw className="w-4 h-4 mr-1" />
                    推理分类
                  </Button>
                </div>

                {stats.needsReview > 0 && (
                  <div className="p-3 bg-orange-50 rounded-lg flex items-center gap-2">
                    <AlertTriangle className="w-5 h-5 text-orange-600" />
                    <span className="text-orange-800">
                      有 {stats.needsReview} 条数据需要修改，请前往
                      <Link href="/segment-label" className="text-blue-600 hover:underline mx-1">标注平台</Link>
                      进行修正
                    </span>
                  </div>
                )}

                <div className="p-4 bg-green-50 rounded-lg">
                  <h3 className="font-medium mb-2 text-green-800">训练完成后的自动流程</h3>
                  <ol className="list-decimal list-inside space-y-1 text-sm text-green-700">
                    <li>新导入/新标注的航迹自动推理分类标签</li>
                    <li>分类结果存入元数据</li>
                    <li>执行向量化入库</li>
                    <li>海图和检索页面可按分类筛选</li>
                  </ol>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 模型参数说明 */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">模型参数配置</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-3 gap-4 text-sm">
              <div className="p-3 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-blue-600 mb-1">文本分类</h4>
                <ul className="space-y-1 text-gray-600">
                  <li>模型: bge-base-zh</li>
                  <li>微调: LoRA (rank=8, alpha=16)</li>
                  <li>Epoch: 4, Batch: 16</li>
                  <li>LR: 2e-4</li>
                </ul>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-green-600 mb-1">空间特征</h4>
                <ul className="space-y-1 text-gray-600">
                  <li>模型: XGBoost</li>
                  <li>N_estimators: 120</li>
                  <li>Max_depth: 6, LR: 0.1</li>
                  <li>特征: Shapely 提取</li>
                </ul>
              </div>
              <div className="p-3 bg-gray-50 rounded-lg">
                <h4 className="font-medium text-purple-600 mb-1">融合策略</h4>
                <ul className="space-y-1 text-gray-600">
                  <li>文本权重: 0.7</li>
                  <li>空间权重: 0.3</li>
                  <li>聚类: KMeans (k=8)</li>
                  <li>校验: bge-reranker-base</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
