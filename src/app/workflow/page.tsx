'use client';

import React, { useCallback, useState } from 'react';
import ReactFlow, {
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  Panel,
  Handle,
  Position,
  NodeProps,
} from 'reactflow';
import 'reactflow/dist/style.css';
import Link from 'next/link';

// 自定义节点组件
const LLMNode = ({ data }: NodeProps) => (
  <div className="bg-white border-2 border-blue-500 rounded-lg p-3 min-w-[150px]">
    <Handle type="target" position={Position.Left} className="w-3 h-3 bg-blue-500" />
    <div className="font-bold text-blue-600 mb-1">🤖 LLM</div>
    <div className="text-xs text-gray-500">{data.model || 'doubao-seed'}</div>
    <Handle type="source" position={Position.Right} className="w-3 h-3 bg-blue-500" />
  </div>
);

const RetrievalNode = ({ data }: NodeProps) => (
  <div className="bg-white border-2 border-green-500 rounded-lg p-3 min-w-[150px]">
    <Handle type="target" position={Position.Left} className="w-3 h-3 bg-green-500" />
    <div className="font-bold text-green-600 mb-1">🔍 向量检索</div>
    <div className="text-xs text-gray-500">Top-K: {data.topK || 10}</div>
    <Handle type="source" position={Position.Right} className="w-3 h-3 bg-green-500" />
  </div>
);

const PromptNode = ({ data }: NodeProps) => (
  <div className="bg-white border-2 border-purple-500 rounded-lg p-3 min-w-[150px]">
    <Handle type="target" position={Position.Left} className="w-3 h-3 bg-purple-500" />
    <div className="font-bold text-purple-600 mb-1">📝 Prompt</div>
    <div className="text-xs text-gray-500 truncate max-w-[120px]">{data.template || '基于上下文回答...'}</div>
    <Handle type="source" position={Position.Right} className="w-3 h-3 bg-purple-500" />
  </div>
);

const InputNode = ({ data }: NodeProps) => (
  <div className="bg-white border-2 border-orange-500 rounded-lg p-3 min-w-[150px]">
    <div className="font-bold text-orange-600 mb-1">📥 用户输入</div>
    <div className="text-xs text-gray-500">{data.placeholder || '请输入问题'}</div>
    <Handle type="source" position={Position.Right} className="w-3 h-3 bg-orange-500" />
  </div>
);

const OutputNode = ({ data }: NodeProps) => (
  <div className="bg-white border-2 border-red-500 rounded-lg p-3 min-w-[150px]">
    <Handle type="target" position={Position.Left} className="w-3 h-3 bg-red-500" />
    <div className="font-bold text-red-600 mb-1">📤 输出</div>
    <div className="text-xs text-gray-500">{data.type || '流式输出'}</div>
  </div>
);

const EmbeddingNode = ({ data }: NodeProps) => (
  <div className="bg-white border-2 border-cyan-500 rounded-lg p-3 min-w-[150px]">
    <Handle type="target" position={Position.Left} className="w-3 h-3 bg-cyan-500" />
    <div className="font-bold text-cyan-600 mb-1">📊 向量化</div>
    <div className="text-xs text-gray-500">2048 维</div>
    <Handle type="source" position={Position.Right} className="w-3 h-3 bg-cyan-500" />
  </div>
);

const nodeTypes = {
  llm: LLMNode,
  retrieval: RetrievalNode,
  prompt: PromptNode,
  input: InputNode,
  output: OutputNode,
  embedding: EmbeddingNode,
};

// 默认节点配置（标准 RAG 流程）
const initialNodes: Node[] = [
  {
    id: '1',
    type: 'input',
    position: { x: 50, y: 200 },
    data: { label: '用户输入', placeholder: '请输入问题' },
  },
  {
    id: '2',
    type: 'embedding',
    position: { x: 250, y: 200 },
    data: { label: '向量化' },
  },
  {
    id: '3',
    type: 'retrieval',
    position: { x: 450, y: 200 },
    data: { label: '向量检索', topK: 20 },
  },
  {
    id: '4',
    type: 'prompt',
    position: { x: 650, y: 200 },
    data: { label: 'Prompt', template: '基于以下上下文回答问题...' },
  },
  {
    id: '5',
    type: 'llm',
    position: { x: 850, y: 200 },
    data: { label: 'LLM', model: 'doubao-seed' },
  },
  {
    id: '6',
    type: 'output',
    position: { x: 1050, y: 200 },
    data: { label: '输出', type: '流式输出' },
  },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true },
  { id: 'e2-3', source: '2', target: '3', animated: true },
  { id: 'e3-4', source: '3', target: '4', animated: true },
  { id: 'e4-5', source: '4', target: '5', animated: true },
  { id: 'e5-6', source: '5', target: '6', animated: true },
];

const nodeOptions = [
  { type: 'input', label: '📥 用户输入', color: 'orange' },
  { type: 'embedding', label: '📊 向量化', color: 'cyan' },
  { type: 'retrieval', label: '🔍 向量检索', color: 'green' },
  { type: 'prompt', label: '📝 Prompt', color: 'purple' },
  { type: 'llm', label: '🤖 LLM', color: 'blue' },
  { type: 'output', label: '📤 输出', color: 'red' },
];

export default function WorkflowPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [savedWorkflows, setSavedWorkflows] = useState<string[]>([]);
  const [workflowName, setWorkflowName] = useState('默认 RAG 流程');

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  const addNode = (type: string) => {
    const newNode: Node = {
      id: `${Date.now()}`,
      type,
      position: { x: Math.random() * 400 + 100, y: Math.random() * 300 + 100 },
      data: { label: type },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const saveWorkflow = () => {
    const workflow = JSON.stringify({ nodes, edges });
    localStorage.setItem(`workflow_${workflowName}`, workflow);
    setSavedWorkflows((prev) => [...new Set([...prev, workflowName])]);
    alert('工作流已保存！');
  };

  const loadWorkflow = (name: string) => {
    const saved = localStorage.getItem(`workflow_${name}`);
    if (saved) {
      const { nodes: savedNodes, edges: savedEdges } = JSON.parse(saved);
      setNodes(savedNodes);
      setEdges(savedEdges);
      setWorkflowName(name);
    }
  };

  const clearWorkflow = () => {
    setNodes([]);
    setEdges([]);
  };

  const resetToDefault = () => {
    setNodes(initialNodes);
    setEdges(initialEdges);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* 头部 */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/" className="text-blue-600 hover:underline">← 返回</Link>
          <h1 className="text-xl font-bold">🔄 工作流可视化</h1>
        </div>
        <div className="flex items-center gap-2">
          <input
            type="text"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="border rounded px-2 py-1 text-sm"
            placeholder="工作流名称"
          />
          <button
            onClick={saveWorkflow}
            className="bg-blue-500 text-white px-3 py-1 rounded text-sm hover:bg-blue-600"
          >
            保存
          </button>
          <button
            onClick={resetToDefault}
            className="bg-gray-500 text-white px-3 py-1 rounded text-sm hover:bg-gray-600"
          >
            重置
          </button>
        </div>
      </div>

      <div className="flex-1 flex">
        {/* 左侧工具栏 */}
        <div className="w-48 bg-white border-r p-3">
          <div className="font-bold mb-3">添加节点</div>
          <div className="space-y-2">
            {nodeOptions.map((opt) => (
              <button
                key={opt.type}
                onClick={() => addNode(opt.type)}
                className={`w-full text-left px-3 py-2 rounded border-2 border-${opt.color}-400 hover:bg-${opt.color}-50 text-sm`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="mt-6 font-bold mb-3">已保存的工作流</div>
          <div className="space-y-1">
            {savedWorkflows.map((name) => (
              <button
                key={name}
                onClick={() => loadWorkflow(name)}
                className="w-full text-left px-2 py-1 rounded hover:bg-gray-100 text-sm truncate"
              >
                📁 {name}
              </button>
            ))}
          </div>

          <div className="mt-6 text-xs text-gray-500">
            <div className="font-bold mb-1">使用说明</div>
            <ul className="space-y-1">
              <li>• 拖拽节点移动位置</li>
              <li>• 从右侧圆点连线</li>
              <li>• 点击节点可编辑</li>
              <li>• 连线显示数据流向</li>
            </ul>
          </div>
        </div>

        {/* 主画布 */}
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background variant={BackgroundVariant.Dots} gap={20} size={1} />
            <Controls />
            <Panel position="top-right">
              <div className="bg-white rounded-lg shadow p-2 text-xs">
                <div className="font-bold mb-1">当前流程</div>
                <div>节点: {nodes.length}</div>
                <div>连线: {edges.length}</div>
              </div>
            </Panel>
          </ReactFlow>
        </div>
      </div>
    </div>
  );
}
