'use client';

import React, { useState, useCallback } from 'react';
import ReactFlow, {
  Node, Edge, Controls, Background,
  Handle, Position, useNodesState, useEdgesState, addEdge, Connection
} from 'reactflow';
import 'reactflow/dist/style.css';

// ==================== 节点类型定义 ====================
const NODE_TYPES: Record<string, {
  label: string;
  icon: string;
  color: string;
  category: string;
  fields: { key: string; label: string; type: string; default: any; options?: string[]; description?: string }[];
}> = {
  chatInput: {
    label: '用户输入',
    icon: '💬',
    color: '#10b981',
    category: 'input',
    fields: [
      { key: 'placeholder', label: '输入提示', type: 'text', default: '请输入您的问题' },
      { key: 'enableHistory', label: '开启多轮对话', type: 'switch', default: true },
      { key: 'historyCount', label: '历史轮数', type: 'number', default: 5, description: '最多携带N轮' },
    ]
  },
  classifyPrompt: {
    label: '分类Prompt',
    icon: '🏷️',
    color: '#f59e0b',
    category: 'classify',
    fields: [
      { key: 'template', label: '分类模板', type: 'textarea', default: `你是意图判断专家，分析用户问题，输出标签：
【RAG】：需要查阅文档、条款、规则、说明类文本知识；
【SQL】：需要对数据库做求和、计数、汇总、明细查询；
【ALL】：既需要文档资料，又需要统计数据。
仅输出标签文本：RAG / SQL / ALL，不要多余内容。` },
    ]
  },
  classifyLLM: {
    label: '分类LLM',
    icon: '🤖',
    color: '#8b5cf6',
    category: 'classify',
    fields: [
      { key: 'model', label: '模型', type: 'select', default: 'doubao-seed-32k', options: ['doubao-seed-32k', 'deepseek-chat'] },
      { key: 'temperature', label: 'Temperature', type: 'number', default: 0 },
    ]
  },
  conditionRoute: {
    label: '条件分支',
    icon: '🔀',
    color: '#ec4899',
    category: 'route',
    fields: [
      { key: 'mode', label: '路由模式', type: 'select', default: 'three-way', options: ['three-way', 'two-way'] },
    ]
  },
  queryRewrite: {
    label: 'Query优化',
    icon: '✨',
    color: '#06b6d4',
    category: 'rag',
    fields: [
      { key: 'enabled', label: '启用', type: 'switch', default: true },
      { key: 'enableSpellCheck', label: '错别字修正', type: 'switch', default: true },
      { key: 'enableKeyword', label: '关键词提取', type: 'switch', default: true },
      { key: 'enableExpand', label: '语义扩写', type: 'switch', default: true },
    ]
  },
  embedding: {
    label: '向量化',
    icon: '🔢',
    color: '#6366f1',
    category: 'rag',
    fields: [
      { key: 'model', label: '向量模型', type: 'select', default: 'doubao-embedding', options: ['doubao-embedding', 'bge-m3'] },
    ]
  },
  vectorRetrieval: {
    label: '向量检索',
    icon: '🔍',
    color: '#14b8a6',
    category: 'rag',
    fields: [
      { key: 'topK', label: '召回数量', type: 'number', default: 8 },
      { key: 'threshold', label: '相似度阈值', type: 'number', default: 0.65 },
      { key: 'enableMetadataFilter', label: '元数据筛选', type: 'switch', default: true },
    ]
  },
  rerank: {
    label: '结果重排',
    icon: '📊',
    color: '#f97316',
    category: 'rag',
    fields: [
      { key: 'enabled', label: '启用Rerank', type: 'switch', default: true },
      { key: 'keepTop', label: '保留TOP', type: 'number', default: 5 },
    ]
  },
  prompt: {
    label: 'Prompt组装',
    icon: '📝',
    color: '#84cc16',
    category: 'rag',
    fields: [
      { key: 'systemPrompt', label: '系统提示词', type: 'textarea', default: '你是专业的问答助手，根据参考资料回答问题。' },
      { key: 'fallbackMessage', label: '兜底话术', type: 'text', default: '暂未找到相关信息。' },
      { key: 'showSource', label: '标注来源', type: 'switch', default: true },
    ]
  },
  llm: {
    label: 'LLM生成',
    icon: '🤖',
    color: '#8b5cf6',
    category: 'rag',
    fields: [
      { key: 'model', label: '模型', type: 'select', default: 'doubao-seed-32k', options: ['doubao-seed-32k', 'deepseek-chat'] },
      { key: 'temperature', label: 'Temperature', type: 'number', default: 0.3 },
      { key: 'maxTokens', label: 'Max Tokens', type: 'number', default: 2000 },
      { key: 'stream', label: '流式输出', type: 'switch', default: true },
    ]
  },
  sqlPrompt: {
    label: 'SQL生成',
    icon: '🗃️',
    color: '#0ea5e9',
    category: 'sql',
    fields: [
      { key: 'allowedOnlySelect', label: '仅允许SELECT', type: 'switch', default: true },
      { key: 'tableSchema', label: '表结构', type: 'textarea', default: 'knowledge_items(id, title, content, modality, source, tags)' },
    ]
  },
  dbExecute: {
    label: '数据库执行',
    icon: '🗄️',
    color: '#22c55e',
    category: 'sql',
    fields: [
      { key: 'timeout', label: '超时(秒)', type: 'number', default: 5 },
      { key: 'retry', label: '重试次数', type: 'number', default: 1 },
    ]
  },
  resultPolish: {
    label: '结果润色',
    icon: '✍️',
    color: '#a855f7',
    category: 'sql',
    fields: [
      { key: 'model', label: '润色模型', type: 'select', default: 'doubao-seed-32k', options: ['doubao-seed-32k', 'deepseek-chat'] },
    ]
  },
  mergeOutput: {
    label: '输出汇总',
    icon: '📤',
    color: '#ef4444',
    category: 'output',
    fields: [
      { key: 'format', label: '输出格式', type: 'select', default: 'markdown', options: ['markdown', 'text', 'json'] },
      { key: 'showSource', label: '标注来源', type: 'switch', default: true },
    ]
  },
};

// ==================== 节点组件 ====================
function CustomNode({ data, selected }: { data: any; selected?: boolean }) {
  const config = NODE_TYPES[data.type];
  if (!config) return null;
  
  return (
    <div
      className={`px-2 py-1.5 rounded-lg shadow-md border-2 text-xs ${selected ? 'border-blue-500' : 'border-transparent'}`}
      style={{ backgroundColor: config.color + '20', borderColor: selected ? '#3b82f6' : config.color + '50' }}
    >
      {data.type !== 'chatInput' && (
        <Handle type="target" position={Position.Left} className="w-2 h-2 bg-gray-400" />
      )}
      
      {data.type === 'conditionRoute' && (
        <>
          <Handle type="source" position={Position.Top} id="rag" className="w-2 h-2 bg-green-500" style={{ left: 12 }} />
          <Handle type="source" position={Position.Right} id="all" className="w-2 h-2 bg-purple-500" />
          <Handle type="source" position={Position.Bottom} id="sql" className="w-2 h-2 bg-blue-500" style={{ left: 12 }} />
        </>
      )}
      
      {data.type !== 'conditionRoute' && data.type !== 'mergeOutput' && (
        <Handle type="source" position={Position.Right} className="w-2 h-2 bg-gray-400" />
      )}
      
      <div className="flex items-center gap-1">
        <span>{config.icon}</span>
        <span style={{ color: config.color }} className="font-medium">{config.label}</span>
      </div>
    </div>
  );
}

const nodeTypes = { custom: CustomNode };

// ==================== 默认工作流 ====================
const defaultNodes: Node[] = [
  { id: 'input', type: 'custom', position: { x: 20, y: 150 }, data: { type: 'chatInput' } },
  { id: 'classifyPrompt', type: 'custom', position: { x: 100, y: 150 }, data: { type: 'classifyPrompt' } },
  { id: 'classifyLLM', type: 'custom', position: { x: 180, y: 150 }, data: { type: 'classifyLLM' } },
  { id: 'condition', type: 'custom', position: { x: 260, y: 150 }, data: { type: 'conditionRoute' } },
  { id: 'queryRewrite', type: 'custom', position: { x: 340, y: 60 }, data: { type: 'queryRewrite' } },
  { id: 'embedding', type: 'custom', position: { x: 420, y: 60 }, data: { type: 'embedding' } },
  { id: 'vectorRetrieval', type: 'custom', position: { x: 500, y: 60 }, data: { type: 'vectorRetrieval' } },
  { id: 'rerank', type: 'custom', position: { x: 580, y: 60 }, data: { type: 'rerank' } },
  { id: 'ragPrompt', type: 'custom', position: { x: 660, y: 60 }, data: { type: 'prompt' } },
  { id: 'ragLLM', type: 'custom', position: { x: 740, y: 60 }, data: { type: 'llm' } },
  { id: 'sqlPrompt', type: 'custom', position: { x: 340, y: 240 }, data: { type: 'sqlPrompt' } },
  { id: 'dbExecute', type: 'custom', position: { x: 420, y: 240 }, data: { type: 'dbExecute' } },
  { id: 'resultPolish', type: 'custom', position: { x: 500, y: 240 }, data: { type: 'resultPolish' } },
  { id: 'mergeOutput', type: 'custom', position: { x: 820, y: 150 }, data: { type: 'mergeOutput' } },
];

const defaultEdges: Edge[] = [
  { id: 'e1', source: 'input', target: 'classifyPrompt', animated: true },
  { id: 'e2', source: 'classifyPrompt', target: 'classifyLLM', animated: true },
  { id: 'e3', source: 'classifyLLM', target: 'condition', animated: true },
  { id: 'e4', source: 'condition', sourceHandle: 'rag', target: 'queryRewrite', animated: true, label: 'RAG', style: { stroke: '#10b981' } },
  { id: 'e5', source: 'queryRewrite', target: 'embedding', animated: true },
  { id: 'e6', source: 'embedding', target: 'vectorRetrieval', animated: true },
  { id: 'e7', source: 'vectorRetrieval', target: 'rerank', animated: true },
  { id: 'e8', source: 'rerank', target: 'ragPrompt', animated: true },
  { id: 'e9', source: 'ragPrompt', target: 'ragLLM', animated: true },
  { id: 'e10', source: 'ragLLM', target: 'mergeOutput', animated: true },
  { id: 'e11', source: 'condition', sourceHandle: 'sql', target: 'sqlPrompt', animated: true, label: 'SQL', style: { stroke: '#0ea5e9' } },
  { id: 'e12', source: 'sqlPrompt', target: 'dbExecute', animated: true },
  { id: 'e13', source: 'dbExecute', target: 'resultPolish', animated: true },
  { id: 'e14', source: 'resultPolish', target: 'mergeOutput', animated: true },
  { id: 'e15', source: 'condition', sourceHandle: 'all', target: 'queryRewrite', animated: true, label: 'ALL', style: { stroke: '#a855f7', strokeDasharray: '3,3' } },
  { id: 'e16', source: 'condition', sourceHandle: 'all', target: 'sqlPrompt', animated: true, style: { stroke: '#a855f7', strokeDasharray: '3,3' } },
];

// ==================== 节点编辑面板 ====================
function NodeEditPanel({ 
  selectedNode, 
  onUpdate, 
  onClose 
}: { 
  selectedNode: Node | null; 
  onUpdate: (key: string, value: any) => void;
  onClose: () => void;
}) {
  if (!selectedNode) return null;
  
  const config = NODE_TYPES[selectedNode.data.type];
  if (!config) return null;
  
  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium flex items-center gap-2 text-sm">
          <span>{config.icon}</span>
          <span>{config.label}</span>
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-lg">✕</button>
      </div>
      
      <div className="space-y-2">
        {config.fields.map((field) => (
          <div key={field.key}>
            <label className="text-xs text-gray-500 block mb-0.5">
              {field.label}
              {field.description && <span className="text-gray-400 ml-1">({field.description})</span>}
            </label>
            {field.type === 'text' && (
              <input
                type="text"
                value={selectedNode.data[field.key] ?? field.default}
                onChange={(e) => onUpdate(field.key, e.target.value)}
                className="w-full px-2 py-1 border rounded text-xs"
              />
            )}
            {field.type === 'number' && (
              <input
                type="number"
                value={selectedNode.data[field.key] ?? field.default}
                onChange={(e) => onUpdate(field.key, Number(e.target.value))}
                className="w-full px-2 py-1 border rounded text-xs"
                step={field.key.includes('threshold') || field.key.includes('temperature') ? '0.1' : '1'}
              />
            )}
            {field.type === 'textarea' && (
              <textarea
                value={selectedNode.data[field.key] ?? field.default}
                onChange={(e) => onUpdate(field.key, e.target.value)}
                className="w-full px-2 py-1 border rounded text-xs h-20"
              />
            )}
            {field.type === 'select' && (
              <select
                value={selectedNode.data[field.key] ?? field.default}
                onChange={(e) => onUpdate(field.key, e.target.value)}
                className="w-full px-2 py-1 border rounded text-xs"
              >
                {field.options?.map((opt) => (
                  <option key={opt} value={opt}>{opt}</option>
                ))}
              </select>
            )}
            {field.type === 'switch' && (
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selectedNode.data[field.key] ?? field.default}
                  onChange={(e) => onUpdate(field.key, e.target.checked)}
                  className="rounded"
                />
                <span className="text-xs">
                  {selectedNode.data[field.key] ?? field.default ? '开启' : '关闭'}
                </span>
              </label>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

// ==================== 主页面 ====================
export default function WorkflowPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(defaultEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showTest, setShowTest] = useState(false);
  const [showPanel, setShowPanel] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [testOutput, setTestOutput] = useState('');
  const [testLog, setTestLog] = useState<string[]>([]);
  
  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, animated: true }, eds));
  }, [setEdges]);
  
  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node);
    setShowPanel(true);
  }, []);
  
  const updateNodeData = (key: string, value: any) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNode.id
          ? { ...n, data: { ...n.data, [key]: value } }
          : n
      )
    );
    setSelectedNode((n) => n ? { ...n, data: { ...n.data, [key]: value } } : null);
  };
  
  const runTest = async () => {
    if (!testInput.trim()) return;
    setTestOutput('');
    setTestLog([]);
    const addLog = (msg: string) => setTestLog((l) => [...l, msg]);
    
    try {
      addLog('📊 正在分类用户意图...');
      const classifyRes = await fetch('/api/rag/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: testInput })
      });
      const classifyData = await classifyRes.json();
      const route = classifyData.route || 'RAG';
      addLog(`✅ 意图分类: ${route}`);
      
      let ragResult = '';
      let sqlResult = '';
      
      if (route === 'RAG' || route === 'ALL') {
        addLog('🔍 执行 RAG 分支...');
        const ragRes = await fetch('/api/rag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: testInput, stream: false })
        });
        ragResult = await ragRes.text();
        addLog(`✅ RAG 结果: ${ragResult.substring(0, 80)}...`);
      }
      
      if (route === 'SQL' || route === 'ALL') {
        addLog('🗄️ 执行 SQL 分支...');
        const sqlRes = await fetch('/api/rag/sql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: testInput })
        });
        const sqlData = await sqlRes.json();
        sqlResult = sqlData.result ? JSON.stringify(sqlData.result) : '';
        addLog(`✅ SQL 结果: ${sqlResult.substring(0, 80)}...`);
        
        if (sqlResult) {
          const polishRes = await fetch('/api/rag/sql-polish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: testInput, data: sqlData.result })
          });
          const polishData = await polishRes.json();
          sqlResult = polishData.answer || sqlResult;
        }
      }
      
      let finalOutput = '';
      if (route === 'RAG') finalOutput = ragResult;
      else if (route === 'SQL') finalOutput = sqlResult;
      else if (route === 'ALL') finalOutput = `## 📚 文档资料\n${ragResult}\n\n## 📊 统计数据\n${sqlResult}`;
      
      addLog('✅ 工作流执行完成');
      setTestOutput(finalOutput);
    } catch (error: any) {
      addLog(`❌ 执行失败: ${error.message}`);
      setTestOutput('暂时无法解答该问题');
    }
  };
  
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* 顶部导航 */}
      <div className="h-11 border-b bg-white flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-2">
          <a href="/" className="text-blue-600 hover:underline text-sm">← 返回</a>
          <span className="font-medium text-sm hidden sm:inline">双分支 RAG 工作流</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowTest(true)}
            className="px-2 py-1 rounded bg-blue-500 text-white text-xs"
          >
            ▶ 测试
          </button>
          <button
            onClick={() => { setNodes(defaultNodes); setEdges(defaultEdges); setSelectedNode(null); setShowPanel(false); }}
            className="px-2 py-1 rounded bg-gray-200 text-xs"
          >
            重置
          </button>
        </div>
      </div>
      
      {/* 主区域 */}
      <div className="flex-1 flex flex-col sm:flex-row">
        {/* 画布 */}
        <div className="flex-1 min-h-0">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
        
        {/* 桌面端右侧面板 */}
        <div className="hidden sm:block w-72 border-l bg-white overflow-y-auto">
          {selectedNode ? (
            <NodeEditPanel 
              selectedNode={selectedNode} 
              onUpdate={updateNodeData}
              onClose={() => { setSelectedNode(null); setShowPanel(false); }}
            />
          ) : (
            <div className="p-3 text-gray-400 text-xs">
              <p>点击节点查看参数</p>
              <div className="mt-3 space-y-1">
                <p className="font-medium text-gray-600">工作流说明：</p>
                <ul className="list-disc list-inside">
                  <li>绿色：RAG 分支</li>
                  <li>蓝色：SQL 分支</li>
                  <li>紫色虚线：ALL 并行</li>
                </ul>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* 移动端底部抽屉 */}
      {showPanel && selectedNode && (
        <div className="sm:hidden fixed inset-x-0 bottom-0 bg-white border-t rounded-t-xl shadow-lg z-40 max-h-[60vh] overflow-y-auto">
          <div className="sticky top-0 bg-white border-b px-3 py-2 flex justify-center">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>
          <NodeEditPanel 
            selectedNode={selectedNode} 
            onUpdate={updateNodeData}
            onClose={() => { setSelectedNode(null); setShowPanel(false); }}
          />
        </div>
      )}
      
      {/* 测试弹窗 */}
      {showTest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3">
          <div className="bg-white rounded-lg w-full max-w-lg max-h-[80vh] overflow-hidden flex flex-col">
            <div className="p-3 border-b flex items-center justify-between shrink-0">
              <h3 className="font-medium text-sm">工作流测试</h3>
              <button onClick={() => setShowTest(false)} className="text-gray-400 hover:text-gray-600">✕</button>
            </div>
            <div className="p-3 space-y-2 shrink-0">
              <input
                type="text"
                value={testInput}
                onChange={(e) => setTestInput(e.target.value)}
                placeholder="输入测试问题..."
                className="w-full px-2 py-1.5 border rounded text-sm"
              />
              <button
                onClick={runTest}
                className="w-full py-1.5 bg-blue-500 text-white rounded text-sm"
              >
                执行
              </button>
            </div>
            
            {testLog.length > 0 && (
              <div className="px-3 pb-2 shrink-0">
                <div className="bg-gray-100 rounded p-2 text-xs font-mono space-y-0.5 max-h-24 overflow-y-auto">
                  {testLog.map((log, i) => (
                    <div key={i}>{log}</div>
                  ))}
                </div>
              </div>
            )}
            
            {testOutput && (
              <div className="p-3 border-t flex-1 overflow-y-auto min-h-0">
                <pre className="whitespace-pre-wrap bg-gray-100 p-2 rounded text-xs">
                  {testOutput}
                </pre>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
