'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Activity, Database, Tag, AlertTriangle, Upload, Brain, LineChart } from 'lucide-react';
import Link from 'next/link';

interface Stats {
  trajectories: {
    total: number;
    labeled: number;
    vectorized: number;
    pendingVector: number;
    bySource: Record<string, number>;
    byBehavior: Record<string, number>;
    byIntent: Record<string, number>;
  };
  training: {
    total: number;
    labeled: number;
    train: number;
    val: number;
  };
  anomalies: {
    total: number;
    corrected: number;
    pending: number;
  };
  uploads: {
    total: number;
    success: number;
    pending: number;
  };
  knowledge: {
    total: number;
    vectorized: number;
  };
}

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [days, setDays] = useState('7');

  useEffect(() => {
    fetchStats();
  }, [days]);

  const fetchStats = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/stats?days=${days}`);
      const data = await res.json();
      if (data.success) {
        setStats(data);
      }
    } catch (error) {
      console.error('获取统计失败:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="flex items-center justify-center h-64">
          <Activity className="h-8 w-8 animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">日志看板</h1>
          <p className="text-muted-foreground">系统运行统计与监控</p>
        </div>
        <div className="flex items-center gap-4">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="1">今日</SelectItem>
              <SelectItem value="7">近7天</SelectItem>
              <SelectItem value="30">近30天</SelectItem>
              <SelectItem value="90">近90天</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" onClick={fetchStats}>
            刷新
          </Button>
        </div>
      </div>

      {/* 核心指标 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">航迹总数</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.trajectories.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              已标注 {stats?.trajectories.labeled || 0} 条
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">向量化进度</CardTitle>
            <Brain className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.trajectories.vectorized || 0}</div>
            <p className="text-xs text-muted-foreground">
              待处理 {stats?.trajectories.pendingVector || 0} 条
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">异常样本</CardTitle>
            <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-500">{stats?.anomalies.pending || 0}</div>
            <p className="text-xs text-muted-foreground">
              已修正 {stats?.anomalies.corrected || 0} 条
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">知识条目</CardTitle>
            <LineChart className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.knowledge.total || 0}</div>
            <p className="text-xs text-muted-foreground">
              已向量化 {stats?.knowledge.vectorized || 0} 条
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 详细统计 */}
      <div className="grid md:grid-cols-2 gap-6">
        {/* 航迹来源分布 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              数据来源分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(stats?.trajectories.bySource || {}).map(([source, count]) => (
                <div key={source} className="flex items-center justify-between">
                  <span className="text-sm truncate">{source || '未知'}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
              {Object.keys(stats?.trajectories.bySource || {}).length === 0 && (
                <p className="text-sm text-muted-foreground">暂无数据</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 行为分布 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              行为分类分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(stats?.trajectories.byBehavior || {}).map(([behavior, count]) => (
                <div key={behavior} className="flex items-center justify-between">
                  <span className="text-sm">{behavior}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
              {Object.keys(stats?.trajectories.byBehavior || {}).length === 0 && (
                <p className="text-sm text-muted-foreground">暂无标注数据</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 意图分布 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Tag className="h-5 w-5" />
              意图分类分布
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(stats?.trajectories.byIntent || {}).map(([intent, count]) => (
                <div key={intent} className="flex items-center justify-between">
                  <span className="text-sm">{intent}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))}
              {Object.keys(stats?.trajectories.byIntent || {}).length === 0 && (
                <p className="text-sm text-muted-foreground">暂无标注数据</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 训练数据统计 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5" />
              训练数据统计
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <p className="text-sm text-muted-foreground">训练集</p>
                <p className="text-xl font-bold">{stats?.training.train || 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">验证集</p>
                <p className="text-xl font-bold">{stats?.training.val || 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">已标注</p>
                <p className="text-xl font-bold">{stats?.training.labeled || 0}</p>
              </div>
              <div>
                <p className="text-sm text-muted-foreground">总计</p>
                <p className="text-xl font-bold">{stats?.training.total || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 快捷操作 */}
      <Card>
        <CardHeader>
          <CardTitle>快捷操作</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/trajectory">航迹检索</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/trajectory/upload">航迹导入</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/segment-label">行为标注</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/manage">知识管理</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href="/trajectory-inference">分类推理</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
