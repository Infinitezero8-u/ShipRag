'use client';

import { useCallback, useState } from 'react';
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
  MarkerType,
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
    category: 'input',
    fields: [
      { key: 'placeholder', label: '输入提示', type: 'text', default: '请输入您的问题' },
    ],
  },
  // 2. 问题分类Prompt
  classifyPrompt: {
    label: '分类Prompt',
    icon: '🏷️',
    color: '#a855f7',
    category: 'prompt',
    fields: [
      { key: 'template', label: '分类提示词', type: 'textarea', default: `你只允许输出两个单词：RAG 或者 SQL
规则：
1. 用户问题需要统计、求和、计数、平均值、分组、月度汇总、查数据数值 → 输出SQL
2. 用户是查文档内容、条款、规则、文字解释，不需要查数据库数字 → 输出RAG
用户提问：{question}` },
    ],
  },
  // 3. 分类LLM
  classifyLLM: {
    label: '分类LLM',
    icon: '🤖',
    color: '#f43f5e',
    category: 'llm',
    fields: [
      { key: 'model', label: '模型', type: 'select', options: ['doubao-seed-2-0-lite-260215', 'doubao-seed-2-0-pro-260215'], default: 'doubao-seed-2-0-lite-260215' },
    ],
  },
  // 4. 条件分支
  conditionRoute: {
    label: '条件分支',
    icon: '🔀',
    color: '#f59e0b',
    category: 'logic',
    fields: [
      { key: 'ragLabel', label: 'RAG分支标签', type: 'text', default: 'RAG' },
      { key: 'sqlLabel', label: 'SQL分支标签', type: 'text', default: 'SQL' },
    ],
  },
  // 5. Query优化
  queryRewrite: {
    label: 'Query优化',
    icon: '✨',
    color: '#f59e0b',
    category: 'process',
    fields: [
      { key: 'enabled', label: '启用优化', type: 'switch', default: true },
      { key: 'method', label: '优化方式', type: 'select', options: ['关键词提取', '问题扩写', '歧义消除'], default: '关键词提取' },
    ],
  },
  // 6. Query向量化
  embedding: {
    label: '向量化',
    icon: '🔢',
    color: '#6366f1',
    category: 'process',
    fields: [
      { key: 'model', label: '嵌入模型', type: 'select', options: ['doubao-embedding', 'text-embedding-3-small'], default: 'doubao-embedding' },
    ],
  },
  // 7. 向量检索
  vectorRetrieval: {
    label: '向量检索',
    icon: '🔍',
    color: '#3b82f6',
    category: 'retrieval',
    fields: [
      { key: 'topK', label: 'Top K', type: 'number', default: 5 },
      { key: 'threshold', label: '相似度阈值', type: 'number', default: 0.3 },
    ],
  },
  // 8. 结果过滤重排
  rerank: {
    label: '结果重排',
    icon: '📊',
    color: '#8b5cf6',
    category: 'process',
    fields: [
      { key: 'enabled', label: '启用重排', type: 'switch', default: true },
      { key: 'minScore', label: '最低分数', type: 'number', default: 0.5 },
    ],
  },
  // 9. Prompt组装
  prompt: {
    label: 'Prompt组装',
    icon: '📝',
    color: '#ec4899',
    category: 'prompt',
    fields: [
      { key: 'systemPrompt', label: '系统提示词', type: 'textarea', default: '你是一个专业的问答助手，请根据参考资料准确回答问题，不要编造内容。' },
      { key: 'template', label: '模板', type: 'textarea', default: '【参考资料】\n{context}\n\n【用户问题】\n{question}' },
    ],
  },
  // 10. LLM生成
  llm: {
    label: 'LLM生成',
    icon: '🤖',
    color: '#f43f5e',
    category: 'llm',
    fields: [
      { key: 'model', label: '模型', type: 'select', options: ['doubao-seed-2-0-pro-260215', 'doubao-seed-2-0-lite-260215', 'deepseek-v3-2-251201'], default: 'doubao-seed-2-0-lite-260215' },
      { key: 'temperature', label: '温度', type: 'number', default: 0.7 },
      { key: 'maxTokens', label: '最大Token', type: 'number', default: 2000 },
    ],
  },
  // 11. SQL生成Prompt
  sqlPrompt: {
    label: 'SQL生成',
    icon: '🗃️',
    color: '#0ea5e9',
    category: 'prompt',
    fields: [
      { key: 'schema', label: '表结构', type: 'textarea', default: `表名: knowledge_items
字段:
- id: 主键
- title: 标题
- content: 内容
- source: 来源
- tags: 标签
- created_at: 创建时间` },
      { key: 'template', label: 'SQL提示词', type: 'textarea', default: `已知数据表结构：
{schema}

根据用户问题，生成合规的SELECT查询SQL，禁止增删改语句。
用户问题：{question}
只输出SQL语句，不要多余文字。` },
    ],
  },
  // 12. 数据库执行
  dbExecute: {
    label: '数据库执行',
    icon: '🗄️',
    color: '#14b8a6',
    category: 'database',
    fields: [
      { key: 'connection', label: '连接名', type: 'select', options: ['Supabase (主库)', '只读副本'], default: 'Supabase (主库)' },
      { key: 'readonly', label: '只读模式', type: 'switch', default: true },
    ],
  },
  // 13. 结果润色LLM
  resultPolish: {
    label: '结果润色',
    icon: '✍️',
    color: '#f472b6',
    category: 'llm',
    fields: [
      { key: 'model', label: '模型', type: 'select', options: ['doubao-seed-2-0-lite-260215', 'doubao-seed-2-0-pro-260215'], default: 'doubao-seed-2-0-lite-260215' },
      { key: 'template', label: '润色提示词', type: 'textarea', default: `根据下面数据库查询出来的数据，用通顺中文回答用户问题，不要编造额外内容。
原始提问：{question}
查询数据：{data}` },
    ],
  },
  // 14. 输出
  chatOutput: {
    label: '输出',
    icon: '📤',
    color: '#14b8a6',
    category: 'output',
    fields: [
      { key: 'showSource', label: '显示来源', type: 'switch', default: true },
    ],
  },
};

// 分支节点（带两个输出）
function BranchNode({ data, selected }: NodeProps) {
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
      <Handle type="source" position={Position.Top} id="rag" className="w-2 h-2" style={{ left: 15 }} />
      <Handle type="source" position={Position.Bottom} id="sql" className="w-2 h-2" style={{ left: 15 }} />
    </div>
  );
}

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

// 默认双分支工作流
const defaultNodes: Node[] = [
  // 输入层
  { id: 'input', type: 'chatInput', position: { x: 20, y: 180 }, data: { type: 'chatInput', placeholder: '请输入您的问题' } },
  
  // 分类层
  { id: 'classifyPrompt', type: 'classifyPrompt', position: { x: 100, y: 180 }, data: { type: 'classifyPrompt' } },
  { id: 'classifyLLM', type: 'classifyLLM', position: { x: 180, y: 180 }, data: { type: 'classifyLLM' } },
  { id: 'condition', type: 'conditionRoute', position: { x: 260, y: 180 }, data: { type: 'conditionRoute' } },
  
  // RAG 分支 (上方)
  { id: 'queryRewrite', type: 'queryRewrite', position: { x: 340, y: 80 }, data: { type: 'queryRewrite' } },
  { id: 'embedding', type: 'embedding', position: { x: 420, y: 80 }, data: { type: 'embedding' } },
  { id: 'vectorRetrieval', type: 'vectorRetrieval', position: { x: 500, y: 80 }, data: { type: 'vectorRetrieval' } },
  { id: 'rerank', type: 'rerank', position: { x: 580, y: 80 }, data: { type: 'rerank' } },
  { id: 'ragPrompt', type: 'prompt', position: { x: 660, y: 80 }, data: { type: 'prompt' } },
  { id: 'ragLLM', type: 'llm', position: { x: 740, y: 80 }, data: { type: 'llm' } },
  
  // SQL 分支 (下方)
  { id: 'sqlPrompt', type: 'sqlPrompt', position: { x: 340, y: 280 }, data: { type: 'sqlPrompt' } },
  { id: 'dbExecute', type: 'dbExecute', position: { x: 420, y: 280 }, data: { type: 'dbExecute' } },
  { id: 'resultPolish', type: 'resultPolish', position: { x: 500, y: 280 }, data: { type: 'resultPolish' } },
  
  // 输出
  { id: 'output', type: 'chatOutput', position: { x: 820, y: 180 }, data: { type: 'chatOutput' } },
];

const defaultEdges: Edge[] = [
  // 输入到分类
  { id: 'e1', source: 'input', target: 'classifyPrompt', animated: true },
  { id: 'e2', source: 'classifyPrompt', target: 'classifyLLM', animated: true },
  { id: 'e3', source: 'classifyLLM', target: 'condition', animated: true },
  
  // RAG 分支
  { id: 'e4', source: 'condition', sourceHandle: 'rag', target: 'queryRewrite', animated: true, label: 'RAG', style: { stroke: '#10b981' } },
  { id: 'e5', source: 'queryRewrite', target: 'embedding', animated: true },
  { id: 'e6', source: 'embedding', target: 'vectorRetrieval', animated: true },
  { id: 'e7', source: 'vectorRetrieval', target: 'rerank', animated: true },
  { id: 'e8', source: 'rerank', target: 'ragPrompt', animated: true },
  { id: 'e9', source: 'ragPrompt', target: 'ragLLM', animated: true },
  { id: 'e10', source: 'ragLLM', target: 'output', animated: true },
  
  // SQL 分支
  { id: 'e11', source: 'condition', sourceHandle: 'sql', target: 'sqlPrompt', animated: true, label: 'SQL', style: { stroke: '#0ea5e9' } },
  { id: 'e12', source: 'sqlPrompt', target: 'dbExecute', animated: true },
  { id: 'e13', source: 'dbExecute', target: 'resultPolish', animated: true },
  { id: 'e14', source: 'resultPolish', target: 'output', animated: true },
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
  const [routeType, setRouteType] = useState<'RAG' | 'SQL' | ''>('');

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, animated: true }, eds));
  }, [setEdges]);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNode(node);
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
    setSelectedNode((prev) => prev ? { ...prev, data: { ...prev.data, [key]: value } } : null);
  };

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
    setRouteType('');
    
    try {
      // 1. 分类问题
      setTestOutput('正在分析问题类型...');
      const classifyRes = await fetch('/api/rag/classify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: testInput }),
      });
      const classifyData = await classifyRes.json();
      const route = classifyData.route || 'RAG';
      setRouteType(route);
      
      if (route === 'SQL') {
        // SQL 分支
        setTestOutput(`路由: SQL 分支\n正在生成 SQL...`);
        
        const sqlRes = await fetch('/api/rag/sql', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: testInput }),
        });
        const sqlData = await sqlRes.json();
        setTestOutput(`路由: SQL 分支\n\nSQL: ${sqlData.sql || '生成失败'}\n\n执行中...`);
        
        if (sqlData.sql) {
          const result = await fetch('/api/rag/sql-polish', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ query: testInput, data: sqlData.result }),
          });
          const polishData = await result.json();
          setTestOutput(`路由: SQL 分支\n\n答案: ${polishData.answer || '润色失败'}`);
        }
      } else {
        // RAG 分支
        setTestOutput(`路由: RAG 分支\n正在检索知识库...`);
        
        const ragRes = await fetch('/api/rag', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: testInput, stream: false }),
        });
        const ragData = await ragRes.json();
        setTestOutput(`路由: RAG 分支\n\n${ragData.answer || ragData.error || '无结果'}`);
      }
    } catch (err) {
      setTestOutput('执行失败: ' + (err as Error).message);
    }
    setIsRunning(false);
  };

  const nodeTypes = {
    ...Object.fromEntries(Object.keys(NODE_TYPES).map((key) => [key, CustomNode])),
    conditionRoute: BranchNode,
  };

  // 按分类分组节点
  const nodeCategories = {
    '输入/输出': ['chatInput', 'chatOutput'],
    '分类路由': ['classifyPrompt', 'classifyLLM', 'conditionRoute'],
    'RAG处理': ['queryRewrite', 'embedding', 'vectorRetrieval', 'rerank', 'prompt', 'llm'],
    'SQL处理': ['sqlPrompt', 'dbExecute', 'resultPolish'],
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* 顶部栏 */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/" className="text-gray-500">←</Link>
          <span className="font-bold">🔄 双分支RAG工作流</span>
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

      {/* 路由说明 */}
      <div className="bg-gradient-to-r from-green-50 to-blue-50 px-4 py-2 flex items-center justify-center gap-4 text-xs">
        <span className="text-green-600">📤 RAG分支: 文档/条款/规则查询</span>
        <span className="text-blue-600">📊 SQL分支: 统计/求和/计数查询</span>
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
          minZoom={0.3}
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
          <div className="bg-white rounded-t-2xl w-full max-w-md p-4 max-h-[70vh] overflow-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <span className="font-bold">添加节点</span>
              <button onClick={() => setShowAdd(false)}>✕</button>
            </div>
            {Object.entries(nodeCategories).map(([cat, types]) => (
              <div key={cat} className="mb-4">
                <div className="text-xs text-gray-500 mb-2">{cat}</div>
                <div className="grid grid-cols-4 gap-2">
                  {types.map((type) => {
                    const node = NODE_TYPES[type as keyof typeof NODE_TYPES];
                    if (!node) return null;
                    return (
                      <button
                        key={type}
                        onClick={() => addNode(type)}
                        className="p-2 rounded-xl text-center"
                        style={{ backgroundColor: node.color + '20' }}
                      >
                        <div className="text-xl">{node.icon}</div>
                        <div className="text-[10px]">{node.label}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
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
            <div className="flex gap-2 mb-3">
              <button
                onClick={() => setTestInput('港口有多少条数据？')}
                className="px-2 py-1 rounded bg-blue-50 text-blue-600 text-xs"
              >
                统计示例
              </button>
              <button
                onClick={() => setTestInput('合同付款条款是什么？')}
                className="px-2 py-1 rounded bg-green-50 text-green-600 text-xs"
              >
                文档示例
              </button>
            </div>
            <button
              onClick={runWorkflow}
              disabled={isRunning}
              className="w-full py-2 rounded-lg bg-blue-500 text-white text-sm mb-3 disabled:opacity-50"
            >
              {isRunning ? '执行中...' : '执行'}
            </button>
            {testOutput && (
              <div className="bg-gray-50 rounded-lg p-3 text-sm whitespace-pre-wrap max-h-48 overflow-auto">
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
                    className="border rounded-lg px-3 py-2 w-full text-sm h-24"
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
