'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { 
  Brain, Zap, AlertTriangle, Check, X, RefreshCw, 
  Database, Target, Layers, ArrowRight, Settings
} from 'lucide-react';
import Link from 'next/link';

// 类型定义
interface Trajectory {
  id: string;
  segment_id: string;
  ai_description: string | null;
  behavior_code: string | null;
  intent_code: string | null;
  start_port: string | null;
  end_port: string | null;
  sea_area: string | null;
  wkt_route: string | null;
}

interface AnomalyItem {
  id: string;
  trajectory_id: string;
  segment_id: string;
  predicted_behavior: string | null;
  predicted_intent: string | null;
  confidence: number;
  anomaly_type: string;
}

// 行为和意图标签
const BEHAVIOR_LABELS: Record<string, string> = {
  'DOCKING': '码头靠泊',
  'ANCHORING': '锚泊',
  'BUOY_MOORING': '浮筒系泊',
  'DRIFTING': '原地漂泊',
  'STEADY_SAILING': '匀速直航',
  'CHANNEL_TURNING': '航道转向',
  'VARIABLE_SAILING': '变速航行',
  'TURNING_BACK': '原地掉头',
  'LOITERING': '原地徘徊',
  'AVOIDING': '船舶避让',
  'CROSSING_CHANNEL': '横穿航道',
  'DEVIATION': '违规偏航',
  'AIS_OFF': 'AIS关机失联',
  'SUSPICIOUS_LOITERING': '无目的低速游荡',
};

const INTENT_LABELS: Record<string, string> = {
  'INBOUND': '船舶进港',
  'OUTBOUND': '船舶出港',
  'WAITING_ANCHORAGE': '锚地候泊',
  'INTER_PORT_TRANSIT': '跨港干线运输',
  'INTERMEDIATE_CALL': '中途挂靠港口',
  'PILOTAGE': '接驳引水',
  'ENGINEERING_WORK': '水上工程作业',
  'FISHING': '渔船捕捞',
  'MEETING_AVOIDANCE': '会船避让',
  'EMERGENCY_SHELTER': '故障临时避险',
  'SUSPICIOUS_SMUGGLING': '可疑走私航行',
  'RESTRICTED_ENTRY': '违规闯入禁航',
};

export default function TrajectoryInferencePage() {
  const [trajectories, setTrajectories] = useState<Trajectory[]>([]);
  const [anomalies, setAnomalies] = useState<AnomalyItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [inferenceRunning, setInferenceRunning] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    labeled: 0,
    unlabeled: 0,
  });

  // 加载数据
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [trajRes, statsRes, anomalyRes] = await Promise.all([
        fetch('/api/trajectory?limit=50'),
        fetch('/api/trajectory/training/stats'),
        fetch('/api/trajectory/training/anomalies'),
      ]);
      
      if (trajRes.ok) {
        const trajData = await trajRes.json();
        setTrajectories(trajData.data || []);
      }
      
      if (statsRes.ok) {
        setStats(await statsRes.json());
      }
      
      if (anomalyRes.ok) {
        const anomalyData = await anomalyRes.json();
        setAnomalies(anomalyData.anomalies || []);
      }
    } catch (error) {
      console.error('加载数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 执行批量推理
  const runInference = async () => {
    setInferenceRunning(true);
    try {
      const res = await fetch('/api/trajectory/training/inference', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unlabeled_only: true }),
      });
      
      if (res.ok) {
        const data = await res.json();
        alert(`推理完成！处理 ${data.processed || 0} 条航迹`);
        loadData();
      } else {
        alert('推理失败');
      }
    } catch (error) {
      alert('推理失败');
    } finally {
      setInferenceRunning(false);
    }
  };

  // 跳转标注页面
  const goToLabel = (trajectoryId?: string) => {
    const url = trajectoryId 
      ? `/segment-label?trajectory=${trajectoryId}`
      : '/segment-label';
    window.location.href = url;
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4 md:p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* 标题 */}
        <div className="flex items-center justify-between">
          <div>
            <a href="/" className="hover:opacity-80 transition-opacity"><h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Brain className="w-7 h-7 text-purple-600" />
              航迹推理
            </h1></a>
            <p className="text-gray-500 mt-1">
              使用固定模型自动预测航迹行为和意图标签
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={loadData}>
              <RefreshCw className="w-4 h-4 mr-2" />
              刷新
            </Button>
            <Button onClick={() => goToLabel()}>
              <Target className="w-4 h-4 mr-2" />
              去标注
            </Button>
          </div>
        </div>

        {/* 模型说明 */}
        <Card className="bg-gradient-to-r from-purple-50 to-blue-50 border-purple-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Zap className="w-5 h-5 text-purple-600" />
              固定推理模型
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="font-medium text-gray-700">文本模型</p>
                <p className="text-gray-600">BGE-base-zh + LoRA</p>
                <p className="text-gray-500 text-xs">epoch=4, batch=16, lr=2e-4, rank=8</p>
              </div>
              <div>
                <p className="font-medium text-gray-700">空间模型</p>
                <p className="text-gray-600">XGBoost</p>
                <p className="text-gray-500 text-xs">n_est=120, depth=6, lr=0.1</p>
              </div>
              <div>
                <p className="font-medium text-gray-700">融合权重</p>
                <p className="text-gray-600">文本 0.7 + 空间 0.3</p>
                <p className="text-gray-500 text-xs">BGE-Rerank 阈值 0.6</p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-gray-900">{stats.total}</div>
              <div className="text-sm text-gray-500">总航迹数</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-600">{stats.labeled}</div>
              <div className="text-sm text-gray-500">已标注</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-orange-600">{stats.unlabeled}</div>
              <div className="text-sm text-gray-500">待推理</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-red-600">{anomalies.length}</div>
              <div className="text-sm text-gray-500">异常样本</div>
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="inference">
          <TabsList>
            <TabsTrigger value="inference">批量推理</TabsTrigger>
            <TabsTrigger value="anomalies">异常样本 ({anomalies.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="inference" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>推理控制</CardTitle>
                    <CardDescription>对未标注航迹自动预测行为和意图标签</CardDescription>
                  </div>
                  <Button 
                    onClick={runInference}
                    disabled={inferenceRunning || stats.unlabeled === 0}
                  >
                    {inferenceRunning ? (
                      <>
                        <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                        推理中...
                      </>
                    ) : (
                      <>
                        <Brain className="w-4 h-4 mr-2" />
                        执行推理
                      </>
                    )}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {stats.unlabeled === 0 ? (
                  <Alert>
                    <Check className="w-4 h-4" />
                    <AlertDescription>
                      所有航迹已完成分类，无需推理
                    </AlertDescription>
                  </Alert>
                ) : (
                  <Alert>
                    <Database className="w-4 h-4" />
                    <AlertDescription>
                      有 {stats.unlabeled} 条航迹待推理，点击"执行推理"开始自动分类
                    </AlertDescription>
                  </Alert>
                )}

                {/* 最近航迹列表 */}
                <div className="mt-6">
                  <h3 className="font-medium mb-3">最近航迹</h3>
                  <div className="space-y-2">
                    {trajectories.slice(0, 10).map((t) => (
                      <div 
                        key={t.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                      >
                        <div className="flex items-center gap-3">
                          <span className="font-mono text-sm text-gray-600">
                            {t.segment_id}
                          </span>
                          <span className="text-sm text-gray-500">
                            {t.start_port} → {t.end_port}
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          {t.behavior_code && (
                            <Badge variant="secondary" className="text-xs">
                              {BEHAVIOR_LABELS[t.behavior_code] || t.behavior_code}
                            </Badge>
                          )}
                          {t.intent_code && (
                            <Badge variant="outline" className="text-xs">
                              {INTENT_LABELS[t.intent_code] || t.intent_code}
                            </Badge>
                          )}
                          {!t.behavior_code && !t.intent_code && (
                            <Badge variant="destructive" className="text-xs">
                              待推理
                            </Badge>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="anomalies" className="mt-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-orange-500" />
                      异常样本
                    </CardTitle>
                    <CardDescription>
                      置信度低于 0.6 的预测结果，需要人工校验
                    </CardDescription>
                  </div>
                  <Button 
                    variant="outline"
                    onClick={() => goToLabel()}
                  >
                    <ArrowRight className="w-4 h-4 mr-2" />
                    批量标注
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {anomalies.length === 0 ? (
                  <Alert>
                    <Check className="w-4 h-4" />
                    <AlertDescription>
                      暂无异常样本，所有预测结果置信度正常
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-2">
                    {anomalies.map((a) => (
                      <div 
                        key={a.id}
                        className="flex items-center justify-between p-3 bg-orange-50 rounded-lg border border-orange-200"
                      >
                        <div>
                          <span className="font-mono text-sm">{a.segment_id}</span>
                          <div className="text-xs text-gray-500 mt-1">
                            预测: {BEHAVIOR_LABELS[a.predicted_behavior || ''] || a.predicted_behavior}
                            {' / '}
                            {INTENT_LABELS[a.predicted_intent || ''] || a.predicted_intent}
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge variant="destructive" className="text-xs">
                            {(a.confidence * 100).toFixed(0)}%
                          </Badge>
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => goToLabel(a.trajectory_id)}
                          >
                            标注
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* 底部链接 */}
        <div className="flex gap-4 justify-center text-sm text-gray-500">
          <Link href="/trajectory" className="hover:text-gray-700 flex items-center gap-1">
            <Database className="w-4 h-4" />
            航迹检索
          </Link>
          <Link href="/sea-chart" className="hover:text-gray-700 flex items-center gap-1">
            <Layers className="w-4 h-4" />
            海图可视化
          </Link>
          <Link href="/segment-label" className="hover:text-gray-700 flex items-center gap-1">
            <Target className="w-4 h-4" />
            行为意图管理
          </Link>
        </div>
      </div>
    </div>
  );
}
