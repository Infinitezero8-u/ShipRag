'use client';

import { useCallback, useState, useRef, useEffect } from 'react';
import ReactFlow, {
  Node,
  Edge,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  Panel,
  NodeProps,
  Handle,
  Position,
} from 'reactflow';
import 'reactflow/dist/style.css';
import Link from 'next/link';

// 节点类型定义
const NODE_TYPES = {
  // 1. 用户输入
  chatInput: {
    label: '用户输入',
    icon: '💬',
    color: '#10b981',
    fields: [
      { key: 'placeholder', label: '输入提示', type: 'text', default: '请输入您的问题' },
    ],
  },
  // 2. Query优化
  queryRewrite: {
    label: 'Query优化',
    icon: '✨',
    color: '#f59e0b',
    fields: [
      { key: 'enabled', label: '启用优化', type: 'switch', default: true },
      { key: 'method', label: '优化方式', type: 'select', options: ['关键词提取', '问题扩写', '歧义消除'], default: '关键词提取' },
    ],
  },
  // 3. Query向量化
  embedding: {
    label: '向量化',
    icon: '🔢',
    color: '#6366f1',
    fields: [
      { key: 'model', label: '嵌入模型', type: 'select', options: ['doubao-embedding', 'text-embedding-3-small'], default: 'doubao-embedding' },
    ],
  },
  // 4. 向量检索
  vectorRetrieval: {
    label: '向量检索',
    icon: '🔍',
    color: '#3b82f6',
    fields: [
      { key: 'topK', label: 'Top K', type: 'number', default: 5 },
      { key: 'threshold', label: '相似度阈值', type: 'number', default: 0.3 },
      { key: 'collection', label: '知识库', type: 'select', options: ['全部', '港口数据', '文档库'], default: '全部' },
    ],
  },
  // 5. 结果过滤重排
  rerank: {
    label: '结果重排',
    icon: '📊',
    color: '#8b5cf6',
    fields: [
      { key: 'enabled', label: '启用重排', type: 'switch', default: true },
      { key: 'minScore', label: '最低分数', type: 'number', default: 0.5 },
    ],
  },
  // 6. Prompt组装
  prompt: {
    label: 'Prompt组装',
    icon: '📝',
    color: '#ec4899',
    fields: [
      { key: 'systemPrompt', label: '系统提示词', type: 'textarea', default: '你是一个专业的问答助手，请根据参考资料准确回答问题，不要编造内容。' },
      { key: 'template', label: '模板', type: 'textarea', default: '【参考资料】\n{context}\n\n【用户问题】\n{question}' },
    ],
  },
  // 7. LLM生成
  llm: {
    label: 'LLM生成',
    icon: '🤖',
    color: '#f43f5e',
    fields: [
      { key: 'model', label: '模型', type: 'select', options: ['doubao-seed-2-0-pro-260215', 'doubao-seed-2-0-lite-260215', 'deepseek-v3-2-251201', 'kimi-k2-5-260127'], default: 'doubao-seed-2-0-lite-260215' },
      { key: 'temperature', label: '温度', type: 'number', default: 0.7 },
      { key: 'maxTokens', label: '最大Token', type: 'number', default: 2000 },
    ],
  },
  // 8. 输出
  chatOutput: {
    label: '输出',
    icon: '📤',
    color: '#14b8a6',
    fields: [
      { key: 'showSource', label: '显示来源', type: 'switch', default: true },
    ],
  },
};

// 自定义节点组件
function CustomNode({ data, selected }: NodeProps) {
  const nodeType = NODE_TYPES[data.type as keyof typeof NODE_TYPES];
  return (
    <div
      className="px-3 py-2 rounded-xl shadow-md border-2 min-w-[60px] text-center"
      style={{
        backgroundColor: nodeType?.color + '20',
        borderColor: selected ? nodeType?.color : 'transparent',
      }}
    >
      <Handle type="target" position={Position.Left} className="w-2 h-2" />
      <div className="text-lg">{nodeType?.icon}</div>
      <div className="text-[10px] font-medium whitespace-nowrap">{nodeType?.label}</div>
      <Handle type="source" position={Position.Right} className="w-2 h-2" />
    </div>
  );
}

// 默认 RAG 工作流
const defaultNodes: Node[] = [
  { id: '1', type: 'chatInput', position: { x: 20, y: 150 }, data: { type: 'chatInput', placeholder: '请输入您的问题' } },
  { id: '2', type: 'queryRewrite', position: { x: 100, y: 150 }, data: { type: 'queryRewrite', enabled: true, method: '关键词提取' } },
  { id: '3', type: 'embedding', position: { x: 180, y: 150 }, data: { type: 'embedding', model: 'doubao-embedding' } },
  { id: '4', type: 'vectorRetrieval', position: { x: 260, y: 150 }, data: { type: 'vectorRetrieval', topK: 5, threshold: 0.3 } },
  { id: '5', type: 'rerank', position: { x: 340, y: 150 }, data: { type: 'rerank', enabled: true } },
  { id: '6', type: 'prompt', position: { x: 420, y: 150 }, data: { type: 'prompt', systemPrompt: '你是一个专业的问答助手', template: '【参考资料】\n{context}\n\n【用户问题】\n{question}' } },
  { id: '7', type: 'llm', position: { x: 500, y: 150 }, data: { type: 'llm', model: 'doubao-seed-2-0-lite-260215', temperature: 0.7 } },
  { id: '8', type: 'chatOutput', position: { x: 580, y: 150 }, data: { type: 'chatOutput', showSource: true } },
];

const defaultEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true },
  { id: 'e2-3', source: '2', target: '3', animated: true },
  { id: 'e3-4', source: '3', target: '4', animated: true },
  { id: 'e4-5', source: '4', target: '5', animated: true },
  { id: 'e5-6', source: '5', target: '6', animated: true },
  { id: 'e6-7', source: '6', target: '7', animated: true },
  { id: 'e7-8', source: '7', target: '8', animated: true },
];

export default function WorkflowPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState(defaultNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(defaultEdges);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [testInput, setTestInput] = useState('');
  const [testOutput, setTestOutput] = useState('');
  const [isRunning, setIsRunning] = useState(false);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, animated: true }, eds));
  }, [setEdges]);

  // 点击节点
  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
  }, []);

  // 更新节点数据
  const updateNodeData = (key: string, value: any) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((n) =>
        n.id === selectedNode.id
          ? { ...n, data: { ...n.data, [key]: value } }
          : n
      )
    );
    setSelectedNode((prev) => prev ? { ...prev, data: { ...prev.data, [key]: value } } : null);
  };

  // 添加节点
  const addNode = (type: string) => {
    const nodeType = NODE_TYPES[type as keyof typeof NODE_TYPES];
    const newId = Date.now().toString();
    const defaultData: Record<string, any> = { type };
    nodeType.fields.forEach((f) => { defaultData[f.key] = f.default; });
    
    const newNode: Node = {
      id: newId,
      type,
      position: { x: 100 + Math.random() * 200, y: 100 + Math.random() * 100 },
      data: defaultData,
    };
    setNodes((nds) => [...nds, newNode]);
    setShowAdd(false);
  };

  // 删除节点
  const deleteNode = () => {
    if (!selectedNode) return;
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
  };

  // 执行工作流
  const runWorkflow = async () => {
    if (!testInput.trim()) return;
    setIsRunning(true);
    setTestOutput('');
    
    try {
      const response = await fetch('/api/rag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: testInput, stream: false }),
      });
      const data = await response.json();
      setTestOutput(data.answer || data.error || '无结果');
    } catch (err) {
      setTestOutput('执行失败');
    }
    setIsRunning(false);
  };

  const nodeTypes = Object.fromEntries(
    Object.keys(NODE_TYPES).map((key) => [key, CustomNode])
  );

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* 顶部栏 */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-500">←</Link>
          <span className="font-bold">🔄 工作流编排</span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setShowTest(true)}
            className="px-3 py-1 rounded-lg bg-blue-500 text-white text-sm"
          >
            ▶ 测试
          </button>
          <button
            onClick={() => { setNodes(defaultNodes); setEdges(defaultEdges); }}
            className="px-3 py-1 rounded-lg bg-gray-200 text-sm"
          >
            重置
          </button>
        </div>
      </div>

      {/* 工作流画布 */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          minZoom={0.5}
          maxZoom={2}
        >
          <Background gap={12} size={1} />
          <Controls showInteractive={false} />
          <Panel position="bottom-left">
            <button
              onClick={() => setShowAdd(true)}
              className="px-3 py-2 rounded-lg bg-white shadow text-sm"
            >
              + 添加节点
            </button>
          </Panel>
        </ReactFlow>
      </div>

      {/* 添加节点弹窗 */}
      {showAdd && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-end justify-center" onClick={() => setShowAdd(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <span className="font-bold">添加节点</span>
              <button onClick={() => setShowAdd(false)}>✕</button>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {Object.entries(NODE_TYPES).map(([key, node]) => (
                <button
                  key={key}
                  onClick={() => addNode(key)}
                  className="p-2 rounded-xl text-center"
                  style={{ backgroundColor: node.color + '20' }}
                >
                  <div className="text-xl">{node.icon}</div>
                  <div className="text-[10px]">{node.label}</div>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 测试弹窗 */}
      {showTest && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-end justify-center" onClick={() => setShowTest(false)}>
          <div className="bg-white rounded-t-2xl w-full max-w-md p-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <span className="font-bold">▶ 测试工作流</span>
              <button onClick={() => setShowTest(false)}>✕</button>
            </div>
            <input
              type="text"
              value={testInput}
              onChange={(e) => setTestInput(e.target.value)}
              className="border rounded-lg px-3 py-2 w-full text-sm mb-3"
              placeholder="输入测试问题..."
            />
            <button
              onClick={runWorkflow}
              disabled={isRunning}
              className="w-full py-2 rounded-lg bg-blue-500 text-white text-sm mb-3 disabled:opacity-50"
            >
              {isRunning ? '执行中...' : '执行'}
            </button>
            {testOutput && (
              <div className="bg-gray-50 rounded-lg p-3 text-sm whitespace-pre-wrap max-h-40 overflow-auto">
                {testOutput}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 节点编辑面板 */}
      {selectedNode && (
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white rounded-t-2xl shadow-lg max-h-[60vh] overflow-auto">
          <div className="p-4 border-b sticky top-0 bg-white flex justify-between items-center">
            <div className="font-bold">
              {NODE_TYPES[selectedNode.data.type as keyof typeof NODE_TYPES]?.icon}{' '}
              {NODE_TYPES[selectedNode.data.type as keyof typeof NODE_TYPES]?.label}
            </div>
            <button onClick={() => setSelectedNode(null)}>✕</button>
          </div>
          <div className="p-4 space-y-3">
            {NODE_TYPES[selectedNode.data.type as keyof typeof NODE_TYPES]?.fields.map((field) => (
              <div key={field.key}>
                <label className="text-xs text-gray-500 block mb-1">{field.label}</label>
                {field.type === 'text' && (
                  <input
                    type="text"
                    value={selectedNode.data[field.key] || ''}
                    onChange={(e) => updateNodeData(field.key, e.target.value)}
                    className="border rounded-lg px-3 py-2 w-full text-sm"
                  />
                )}
                {field.type === 'number' && (
                  <input
                    type="number"
                    step={field.key === 'temperature' || field.key === 'threshold' || field.key === 'minScore' ? '0.1' : '1'}
                    value={selectedNode.data[field.key] ?? field.default}
                    onChange={(e) => updateNodeData(field.key, field.key === 'temperature' || field.key === 'threshold' || field.key === 'minScore' ? parseFloat(e.target.value) : parseInt(e.target.value))}
                    className="border rounded-lg px-3 py-2 w-full text-sm"
                  />
                )}
                {field.type === 'textarea' && (
                  <textarea
                    value={selectedNode.data[field.key] || ''}
                    onChange={(e) => updateNodeData(field.key, e.target.value)}
                    className="border rounded-lg px-3 py-2 w-full text-sm h-20"
                  />
                )}
                {field.type === 'select' && (
                  <select
                    value={selectedNode.data[field.key] || field.default}
                    onChange={(e) => updateNodeData(field.key, e.target.value)}
                    className="border rounded-lg px-3 py-2 w-full text-sm"
                  >
                    {'options' in field && field.options?.map((opt: string) => (
                      <option key={opt} value={opt}>{opt}</option>
                    ))}
                  </select>
                )}
                {field.type === 'switch' && (
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => updateNodeData(field.key, !selectedNode.data[field.key])}
                      className={`w-10 h-6 rounded-full transition ${selectedNode.data[field.key] ? 'bg-blue-500' : 'bg-gray-300'}`}
                    >
                      <div className={`w-4 h-4 bg-white rounded-full transition ${selectedNode.data[field.key] ? 'translate-x-5' : 'translate-x-1'}`} />
                    </button>
                    <span className="text-sm">{selectedNode.data[field.key] ? '开启' : '关闭'}</span>
                  </div>
                )}
              </div>
            ))}
            <button onClick={deleteNode} className="w-full py-2 rounded-lg bg-red-50 text-red-600 text-sm mt-4">
              删除节点
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
