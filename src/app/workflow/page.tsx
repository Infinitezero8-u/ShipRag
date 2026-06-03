'use client';

import React, { useCallback, useState, useEffect } from 'react';
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
  Handle,
  Position,
  NodeProps,
  MiniMap,
} from 'reactflow';
import 'reactflow/dist/style.css';
import Link from 'next/link';

// 紧凑型节点组件（移动端优化）
const LLMNode = ({ data }: NodeProps) => (
  <div className="bg-white border-2 border-blue-500 rounded-lg p-2 min-w-[100px] shadow-sm">
    <Handle type="target" position={Position.Left} className="w-2 h-2 bg-blue-500" />
    <div className="font-bold text-blue-600 text-sm">🤖 LLM</div>
    <div className="text-xs text-gray-500">{data.model || 'doubao'}</div>
    <Handle type="source" position={Position.Right} className="w-2 h-2 bg-blue-500" />
  </div>
);

const RetrievalNode = ({ data }: NodeProps) => (
  <div className="bg-white border-2 border-green-500 rounded-lg p-2 min-w-[100px] shadow-sm">
    <Handle type="target" position={Position.Left} className="w-2 h-2 bg-green-500" />
    <div className="font-bold text-green-600 text-sm">🔍 检索</div>
    <div className="text-xs text-gray-500">K={data.topK || 10}</div>
    <Handle type="source" position={Position.Right} className="w-2 h-2 bg-green-500" />
  </div>
);

const PromptNode = ({ data }: NodeProps) => (
  <div className="bg-white border-2 border-purple-500 rounded-lg p-2 min-w-[100px] shadow-sm">
    <Handle type="target" position={Position.Left} className="w-2 h-2 bg-purple-500" />
    <div className="font-bold text-purple-600 text-sm">📝 Prompt</div>
    <Handle type="source" position={Position.Right} className="w-2 h-2 bg-purple-500" />
  </div>
);

const InputNode = ({ data }: NodeProps) => (
  <div className="bg-white border-2 border-orange-500 rounded-lg p-2 min-w-[100px] shadow-sm">
    <div className="font-bold text-orange-600 text-sm">📥 输入</div>
    <Handle type="source" position={Position.Right} className="w-2 h-2 bg-orange-500" />
  </div>
);

const OutputNode = ({ data }: NodeProps) => (
  <div className="bg-white border-2 border-red-500 rounded-lg p-2 min-w-[100px] shadow-sm">
    <Handle type="target" position={Position.Left} className="w-2 h-2 bg-red-500" />
    <div className="font-bold text-red-600 text-sm">📤 输出</div>
  </div>
);

const EmbeddingNode = ({ data }: NodeProps) => (
  <div className="bg-white border-2 border-cyan-500 rounded-lg p-2 min-w-[100px] shadow-sm">
    <Handle type="target" position={Position.Left} className="w-2 h-2 bg-cyan-500" />
    <div className="font-bold text-cyan-600 text-sm">📊 向量化</div>
    <Handle type="source" position={Position.Right} className="w-2 h-2 bg-cyan-500" />
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

// 移动端适配的节点位置
const initialNodes: Node[] = [
  { id: '1', type: 'input', position: { x: 10, y: 100 }, data: { label: '用户输入' } },
  { id: '2', type: 'embedding', position: { x: 130, y: 100 }, data: { label: '向量化' } },
  { id: '3', type: 'retrieval', position: { x: 250, y: 100 }, data: { label: '向量检索', topK: 20 } },
  { id: '4', type: 'prompt', position: { x: 370, y: 100 }, data: { label: 'Prompt' } },
  { id: '5', type: 'llm', position: { x: 490, y: 100 }, data: { label: 'LLM' } },
  { id: '6', type: 'output', position: { x: 610, y: 100 }, data: { label: '输出' } },
];

const initialEdges: Edge[] = [
  { id: 'e1-2', source: '1', target: '2', animated: true },
  { id: 'e2-3', source: '2', target: '3', animated: true },
  { id: 'e3-4', source: '3', target: '4', animated: true },
  { id: 'e4-5', source: '4', target: '5', animated: true },
  { id: 'e5-6', source: '5', target: '6', animated: true },
];

const nodeOptions = [
  { type: 'input', label: '📥 输入', color: 'orange' },
  { type: 'embedding', label: '📊 向量化', color: 'cyan' },
  { type: 'retrieval', label: '🔍 检索', color: 'green' },
  { type: 'prompt', label: '📝 Prompt', color: 'purple' },
  { type: 'llm', label: '🤖 LLM', color: 'blue' },
  { type: 'output', label: '📤 输出', color: 'red' },
];

export default function WorkflowPage() {
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const [savedWorkflows, setSavedWorkflows] = useState<string[]>([]);
  const [workflowName, setWorkflowName] = useState('默认RAG');
  const [showPanel, setShowPanel] = useState(false);
  const [showSave, setShowSave] = useState(false);

  useEffect(() => {
    const keys = Object.keys(localStorage).filter(k => k.startsWith('workflow_'));
    setSavedWorkflows(keys.map(k => k.replace('workflow_', '')));
  }, []);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  const addNode = (type: string) => {
    const newNode: Node = {
      id: `${Date.now()}`,
      type,
      position: { x: Math.random() * 300 + 50, y: Math.random() * 200 + 50 },
      data: { label: type },
    };
    setNodes((nds) => [...nds, newNode]);
    setShowPanel(false);
  };

  const saveWorkflow = () => {
    const workflow = JSON.stringify({ nodes, edges });
    localStorage.setItem(`workflow_${workflowName}`, workflow);
    setSavedWorkflows((prev) => [...new Set([...prev, workflowName])]);
    setShowSave(false);
    alert('已保存！');
  };

  const loadWorkflow = (name: string) => {
    const saved = localStorage.getItem(`workflow_${name}`);
    if (saved) {
      const { nodes: savedNodes, edges: savedEdges } = JSON.parse(saved);
      setNodes(savedNodes);
      setEdges(savedEdges);
      setWorkflowName(name);
    }
    setShowPanel(false);
  };

  const deleteWorkflow = (name: string) => {
    localStorage.removeItem(`workflow_${name}`);
    setSavedWorkflows(prev => prev.filter(n => n !== name));
  };

  const resetToDefault = () => {
    setNodes(initialNodes);
    setEdges(initialEdges);
    setShowPanel(false);
  };

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* 顶部栏 */}
      <div className="bg-white border-b px-3 py-2 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <Link href="/" className="text-blue-600 p-2">←</Link>
          <span className="font-bold text-base">🔄 工作流</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => setShowSave(true)} className="bg-blue-500 text-white px-3 py-1.5 rounded-lg text-sm">
            💾
          </button>
          <button onClick={() => setShowPanel(!showPanel)} className="bg-gray-200 px-3 py-1.5 rounded-lg text-sm">
            📋
          </button>
        </div>
      </div>

      {/* 主画布 */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.3}
          maxZoom={2}
        >
          <Background gap={12} size={1} />
          <Controls showInteractive={false} className="!bottom-4 !left-4" />
        </ReactFlow>

        {/* 快捷操作栏（底部） */}
        <div className="absolute bottom-4 right-4 flex gap-2">
          <button onClick={resetToDefault} className="bg-white shadow-lg rounded-full w-12 h-12 flex items-center justify-center text-xl">
            🔄
          </button>
        </div>
      </div>

      {/* 侧边面板（添加节点/已保存） */}
      {showPanel && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:hidden" onClick={() => setShowPanel(false)}>
          <div className="bg-white rounded-t-2xl w-full max-h-[70vh] p-4" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-4">
              <span className="font-bold">节点与工作流</span>
              <button onClick={() => setShowPanel(false)} className="text-gray-500">✕</button>
            </div>

            {/* 添加节点 */}
            <div className="mb-4">
              <div className="text-sm text-gray-500 mb-2">添加节点</div>
              <div className="grid grid-cols-3 gap-2">
                {nodeOptions.map((opt) => (
                  <button
                    key={opt.type}
                    onClick={() => addNode(opt.type)}
                    className="p-3 rounded-lg border-2 border-gray-200 text-center text-sm active:scale-95"
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 已保存的工作流 */}
            <div>
              <div className="text-sm text-gray-500 mb-2">已保存</div>
              <div className="space-y-2">
                {savedWorkflows.length === 0 && <div className="text-gray-400 text-sm">暂无保存的工作流</div>}
                {savedWorkflows.map((name) => (
                  <div key={name} className="flex items-center justify-between p-2 bg-gray-50 rounded-lg">
                    <button onClick={() => loadWorkflow(name)} className="flex-1 text-left text-sm truncate">
                      📁 {name}
                    </button>
                    <button onClick={() => deleteWorkflow(name)} className="text-red-500 text-sm px-2">
                      🗑
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 保存弹窗 */}
      {showSave && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setShowSave(false)}>
          <div className="bg-white rounded-2xl p-4 w-[280px]" onClick={e => e.stopPropagation()}>
            <div className="font-bold mb-3">保存工作流</div>
            <input
              type="text"
              value={workflowName}
              onChange={(e) => setWorkflowName(e.target.value)}
              className="border rounded-lg px-3 py-2 w-full text-sm mb-3"
              placeholder="输入名称"
            />
            <div className="flex gap-2">
              <button onClick={() => setShowSave(false)} className="flex-1 py-2 rounded-lg bg-gray-200 text-sm">
                取消
              </button>
              <button onClick={saveWorkflow} className="flex-1 py-2 rounded-lg bg-blue-500 text-white text-sm">
                保存
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
