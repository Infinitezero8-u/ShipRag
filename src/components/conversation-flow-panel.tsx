'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Play,
  Settings,
  Zap,
  Database,
  Brain,
  GitBranch,
  Box,
  Loader2,
  CheckCircle,
  XCircle,
  ChevronRight,
  Eye,
  Trash2,
  Copy
} from 'lucide-react';

interface FlowConfig {
  globalConfig: {
    contextMaxChars: number;
    compressionRatio: number;
    vectorTopN: number;
    sqlMaxRows: number;
    enableQueryRewrite: boolean;
    rewriteExcludePatterns: string[];
  };
  nodes: Record<string, NodeConfig>;
  edges: EdgeConfig[];
}

interface NodeConfig {
  type: 'start' | 'ai' | 'logic' | 'data' | 'tool' | 'subflow';
  name: string;
  [key: string]: any;
}

interface EdgeConfig {
  from: string;
  to: string;
  condition?: string;
  route?: string;
}

interface FlowConfigData {
  id: string;
  name: string;
  description: string;
  config: FlowConfig;
  is_active: boolean;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface ExecutionLog {
  node: string;
  durationMs: number;
  output?: any;
}

const nodeTypeIcons: Record<string, React.ReactNode> = {
  start: <Play className="w-4 h-4" />,
  ai: <Brain className="w-4 h-4" />,
  logic: <GitBranch className="w-4 h-4" />,
  data: <Database className="w-4 h-4" />,
  tool: <Zap className="w-4 h-4" />,
  subflow: <Box className="w-4 h-4" />,
};

const nodeTypeColors: Record<string, string> = {
  start: 'bg-green-500',
  ai: 'bg-purple-500',
  logic: 'bg-blue-500',
  data: 'bg-orange-500',
  tool: 'bg-yellow-500',
  subflow: 'bg-gray-500',
};

export function ConversationFlowPanel() {
  const [configs, setConfigs] = useState<FlowConfigData[]>([]);
  const [activeConfig, setActiveConfig] = useState<FlowConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [showDetail, setShowDetail] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  
  // 执行测试
  const [testQuery, setTestQuery] = useState('');
  const [testSessionId] = useState(() => `test_${Date.now()}`);
  const [executing, setExecuting] = useState(false);
  const [executionLogs, setExecutionLogs] = useState<ExecutionLog[]>([]);
  const [testResult, setTestResult] = useState<string>('');

  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    try {
      const res = await fetch('/api/conversation-flow');
      const data = await res.json();
      setConfigs(Array.isArray(data) ? data : []);
      const active = (Array.isArray(data) ? data : []).find((c: FlowConfigData) => c.is_active);
      setActiveConfig(active || null);
    } catch (error) {
      console.error('加载配置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (id: string) => {
    try {
      const res = await fetch('/api/conversation-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'activate', id })
      });
      if (res.ok) {
        await loadConfigs();
      }
    } catch (error) {
      console.error('激活配置失败:', error);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定删除此配置？')) return;
    try {
      const res = await fetch('/api/conversation-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'delete', id })
      });
      if (res.ok) {
        await loadConfigs();
      } else {
        const data = await res.json();
        alert(data.error || '删除失败');
      }
    } catch (error) {
      console.error('删除配置失败:', error);
    }
  };

  const handleCopy = async (config: FlowConfigData) => {
    try {
      const res = await fetch('/api/conversation-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create',
          name: `${config.name}-副本`,
          description: config.description,
          config: config.config
        })
      });
      if (res.ok) {
        await loadConfigs();
      }
    } catch (error) {
      console.error('复制配置失败:', error);
    }
  };

  const handleExecute = async () => {
    if (!testQuery.trim()) return;
    
    setExecuting(true);
    setExecutionLogs([]);
    setTestResult('');
    
    try {
      const res = await fetch('/api/conversation-flow', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'execute',
          sessionId: testSessionId,
          query: testQuery
        })
      });
      
      const data = await res.json();
      setExecutionLogs(data.executionLog || []);
      setTestResult(data.answer || data.error || '');
    } catch (error: any) {
      setTestResult(`执行失败: ${error.message}`);
    } finally {
      setExecuting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 配置列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5" />
            对话流配置
          </CardTitle>
          <CardDescription>
            5类节点：开始节点、AI能力节点、逻辑控制节点、数据&工具节点、子流程&资源节点
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {configs.map((config) => (
              <div
                key={config.id}
                className={`p-4 border rounded-lg cursor-pointer transition-all ${
                  config.is_active ? 'border-blue-500 bg-blue-50' : 'hover:bg-gray-50'
                }`}
                onClick={() => { setActiveConfig(config); setShowDetail(true); }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${config.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <div>
                      <div className="font-medium">{config.name}</div>
                      <div className="text-sm text-gray-500">{config.description}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {config.is_default && (
                      <Badge variant="secondary" className="text-xs">默认</Badge>
                    )}
                    {config.is_active && (
                      <Badge variant="default" className="text-xs bg-green-500">激活</Badge>
                    )}
                    {!config.is_default && (
                      <>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleCopy(config); }}
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={(e) => { e.stopPropagation(); handleDelete(config.id); }}
                          className="text-red-500 hover:text-red-700"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </>
                    )}
                    {!config.is_active && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={(e) => { e.stopPropagation(); handleActivate(config.id); }}
                      >
                        激活
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 节点可视化 */}
      {activeConfig && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <GitBranch className="w-5 h-5" />
              节点流程图
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2 items-center justify-center p-4 bg-gray-50 rounded-lg">
              {Object.entries(activeConfig.config.nodes).map(([key, node], index, arr) => (
                <div key={key} className="flex items-center gap-2">
                  <div
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedNode === key ? 'border-blue-500 ring-2 ring-blue-200' : 'hover:border-gray-400'
                    }`}
                    onClick={() => setSelectedNode(key)}
                  >
                    <div className="flex items-center gap-2">
                      <div className={`p-1 rounded ${nodeTypeColors[node.type]} text-white`}>
                        {nodeTypeIcons[node.type]}
                      </div>
                      <div>
                        <div className="text-sm font-medium">{node.name}</div>
                        <div className="text-xs text-gray-500">{node.type}</div>
                      </div>
                    </div>
                  </div>
                  {index < arr.length - 1 && (
                    <ChevronRight className="w-4 h-4 text-gray-400" />
                  )}
                </div>
              ))}
            </div>
            
            {/* 节点详情 */}
            {selectedNode && activeConfig.config.nodes[selectedNode] && (
              <div className="mt-4 p-4 border rounded-lg bg-white">
                <h4 className="font-medium mb-2">{activeConfig.config.nodes[selectedNode].name}</h4>
                <pre className="text-xs bg-gray-100 p-2 rounded overflow-auto max-h-40">
                  {JSON.stringify(activeConfig.config.nodes[selectedNode], null, 2)}
                </pre>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* 全局配置 */}
      {activeConfig && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="w-5 h-5" />
              全局配置参数
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div className="p-3 border rounded-lg">
                <div className="text-sm text-gray-500">上下文上限</div>
                <div className="text-lg font-medium">
                  {activeConfig.config.globalConfig.contextMaxChars.toLocaleString()}
                  <span className="text-sm text-gray-400"> 字符</span>
                </div>
              </div>
              <div className="p-3 border rounded-lg">
                <div className="text-sm text-gray-500">压缩比例</div>
                <div className="text-lg font-medium">
                  {(activeConfig.config.globalConfig.compressionRatio * 100).toFixed(0)}%
                </div>
              </div>
              <div className="p-3 border rounded-lg">
                <div className="text-sm text-gray-500">向量召回数</div>
                <div className="text-lg font-medium">
                  {activeConfig.config.globalConfig.vectorTopN}
                </div>
              </div>
              <div className="p-3 border rounded-lg">
                <div className="text-sm text-gray-500">SQL最大行数</div>
                <div className="text-lg font-medium">
                  {activeConfig.config.globalConfig.sqlMaxRows}
                </div>
              </div>
              <div className="p-3 border rounded-lg">
                <div className="text-sm text-gray-500">问题改写</div>
                <div className="text-lg font-medium">
                  {activeConfig.config.globalConfig.enableQueryRewrite ? '开启' : '关闭'}
                </div>
              </div>
              <div className="p-3 border rounded-lg">
                <div className="text-sm text-gray-500">改写排除模式</div>
                <div className="text-sm">
                  {activeConfig.config.globalConfig.rewriteExcludePatterns.join(', ') || '无'}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 测试执行 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="w-5 h-5" />
            流程测试
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex gap-2">
              <Input
                value={testQuery}
                onChange={(e) => setTestQuery(e.target.value)}
                placeholder="输入测试问题..."
                onKeyDown={(e) => e.key === 'Enter' && handleExecute()}
              />
              <Button onClick={handleExecute} disabled={executing}>
                {executing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
                执行
              </Button>
            </div>
            
            {/* 执行日志 */}
            {executionLogs.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium">执行链路：</div>
                <div className="flex flex-wrap gap-2">
                  {executionLogs.map((log, index) => (
                    <div key={index} className="flex items-center gap-1">
                      <Badge variant="outline" className="text-xs">
                        {log.node}
                        <span className="ml-1 text-gray-400">({log.durationMs}ms)</span>
                      </Badge>
                      {index < executionLogs.length - 1 && (
                        <ChevronRight className="w-3 h-3 text-gray-400" />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* 执行结果 */}
            {testResult && (
              <div className="p-4 bg-gray-50 rounded-lg">
                <div className="text-sm font-medium mb-2">执行结果：</div>
                <div className="text-sm whitespace-pre-wrap">{testResult}</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 详情弹窗 */}
      <Dialog open={showDetail} onOpenChange={setShowDetail}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader>
            <DialogTitle>{activeConfig?.name}</DialogTitle>
            <DialogDescription>{activeConfig?.description}</DialogDescription>
          </DialogHeader>
          {activeConfig && (
            <div className="space-y-4">
              <div>
                <h4 className="font-medium mb-2">节点配置</h4>
                <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto max-h-60">
                  {JSON.stringify(activeConfig.config.nodes, null, 2)}
                </pre>
              </div>
              <div>
                <h4 className="font-medium mb-2">边配置</h4>
                <pre className="text-xs bg-gray-100 p-3 rounded overflow-auto max-h-40">
                  {JSON.stringify(activeConfig.config.edges, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
