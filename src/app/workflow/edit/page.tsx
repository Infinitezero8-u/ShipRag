'use client';

import React, { useState, useCallback, useEffect, DragEvent } from 'react';
import ReactFlow, {
  Node, Edge, Controls, Background, Panel,
  Handle, Position, useNodesState, useEdgesState, addEdge, Connection, ReactFlowProvider
} from 'reactflow';
import 'reactflow/dist/style.css';

// ==================== 节点类型定义 ====================
const NODE_TYPE_CONFIG: Record<string, {
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
      { key: 'historyCount', label: '历史轮数', type: 'number', default: 5 },
    ]
  },
  classifyPrompt: {
    label: '分类Prompt',
    icon: '🏷️',
    color: '#f59e0b',
    category: 'classify',
    fields: [
      { key: 'template', label: '分类模板', type: 'textarea', default: '你是意图判断专家...' },
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
      { key: 'systemPrompt', label: '系统提示词', type: 'textarea', default: '你是专业的问答助手...' },
      { key: 'fallbackMessage', label: '兜底话术', type: 'text', default: '暂未找到相关信息。' },
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
    ]
  },
  sqlPrompt: {
    label: 'SQL生成',
    icon: '🗃️',
    color: '#0ea5e9',
    category: 'sql',
    fields: [
      { key: 'allowedOnlySelect', label: '仅允许SELECT', type: 'switch', default: true },
    ]
  },
  dbExecute: {
    label: '数据库执行',
    icon: '🗄️',
    color: '#22c55e',
    category: 'sql',
    fields: [
      { key: 'timeout', label: '超时(秒)', type: 'number', default: 5 },
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
    ]
  },
};

// 不可删除的节点类型
const UNDELETABLE_TYPES = ['chatInput', 'mergeOutput'];

// ==================== 节点组件 ====================
function CustomNode({ data, selected }: { data: any; selected?: boolean }) {
  const config = NODE_TYPE_CONFIG[data.type];
  if (!config) return null;
  
  const canDelete = !UNDELETABLE_TYPES.includes(data.type);
  
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
        {!canDelete && <span className="text-gray-400">🔒</span>}
      </div>
    </div>
  );
}

const nodeTypes = { custom: CustomNode };

// ==================== 默认节点 ====================
const createDefaultNodes = (): Node[] => [
  { id: 'input', type: 'custom', position: { x: 50, y: 150 }, data: { type: 'chatInput' } },
  { id: 'output', type: 'custom', position: { x: 700, y: 150 }, data: { type: 'mergeOutput' } },
];

// ==================== 节点面板 ====================
const NODE_CATEGORIES = {
  '输入/输出': ['chatInput', 'mergeOutput'],
  '分类路由': ['classifyPrompt', 'classifyLLM', 'conditionRoute'],
  'RAG 分支': ['queryRewrite', 'embedding', 'vectorRetrieval', 'rerank', 'prompt', 'llm'],
  'SQL 分支': ['sqlPrompt', 'dbExecute', 'resultPolish'],
};

function NodePalette({ onDragStart }: { onDragStart: (type: string) => void }) {
  return (
    <div className="bg-white border-r w-48 p-2 overflow-y-auto">
      <h4 className="text-xs font-medium text-gray-500 mb-2">拖拽节点到画布</h4>
      {Object.entries(NODE_CATEGORIES).map(([cat, types]) => (
        <div key={cat} className="mb-3">
          <p className="text-xs text-gray-400 mb-1">{cat}</p>
          <div className="space-y-1">
            {types.map((type) => {
              const config = NODE_TYPE_CONFIG[type];
              if (!config) return null;
              return (
                <div
                  key={type}
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData('application/reactflow', type);
                    e.dataTransfer.effectAllowed = 'move';
                    onDragStart(type);
                  }}
                  className="flex items-center gap-1 px-2 py-1 rounded cursor-grab hover:bg-gray-100 text-xs"
                  style={{ backgroundColor: config.color + '10' }}
                >
                  <span>{config.icon}</span>
                  <span style={{ color: config.color }}>{config.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

// ==================== 节点编辑面板 ====================
function NodeEditPanel({
  selectedNode,
  onUpdate,
  onDelete,
  onClose
}: {
  selectedNode: Node | null;
  onUpdate: (key: string, value: any) => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  if (!selectedNode) return null;
  
  const config = NODE_TYPE_CONFIG[selectedNode.data.type];
  if (!config) return null;
  
  const canDelete = !UNDELETABLE_TYPES.includes(selectedNode.data.type);
  
  return (
    <div className="p-3">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-medium flex items-center gap-2 text-sm">
          <span>{config.icon}</span>
          <span>{config.label}</span>
        </h3>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">✕</button>
      </div>
      
      <div className="space-y-2">
        {config.fields.map((field) => (
          <div key={field.key}>
            <label className="text-xs text-gray-500 block mb-0.5">{field.label}</label>
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
                <span className="text-xs">{selectedNode.data[field.key] ?? field.default ? '开启' : '关闭'}</span>
              </label>
            )}
          </div>
        ))}
      </div>
      
      {canDelete && (
        <button
          onClick={onDelete}
          className="w-full mt-4 py-1.5 bg-red-50 text-red-600 rounded text-xs hover:bg-red-100"
        >
          删除节点
        </button>
      )}
    </div>
  );
}

// ==================== 主组件 ====================
function WorkflowEditor() {
  const [nodes, setNodes, onNodesChange] = useNodesState(createDefaultNodes());
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);
  const [workflowId, setWorkflowId] = useState<string | null>(null);
  const [workflowName, setWorkflowName] = useState('新建工作流');
  const [saving, setSaving] = useState(false);
  const [dragType, setDragType] = useState<string | null>(null);
  
  // 从 URL 加载工作流
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) {
      setWorkflowId(id);
      loadWorkflow(id);
    }
  }, []);
  
  const loadWorkflow = async (id: string) => {
    try {
      const res = await fetch(`/api/workflow?id=${id}`);
      const data = await res.json();
      if (data.nodes && data.edges) {
        setNodes(data.nodes);
        setEdges(data.edges);
        setWorkflowName(data.name);
      }
    } catch (error) {
      console.error('加载工作流失败:', error);
    }
  };
  
  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, animated: true }, eds));
  }, [setEdges]);
  
  const onNodeClick = useCallback((_: any, node: Node) => {
    setSelectedNode(node);
  }, []);
  
  const onDragOver = useCallback((event: DragEvent) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);
  
  const onDrop = useCallback((event: DragEvent) => {
    event.preventDefault();
    
    const type = event.dataTransfer.getData('application/reactflow');
    if (!type) return;
    
    const bounds = (event.target as Element).getBoundingClientRect();
    const x = event.clientX - bounds.left - 40;
    const y = event.clientY - bounds.top - 20;
    
    const newNode: Node = {
      id: `${type}_${Date.now()}`,
      type: 'custom',
      position: { x, y },
      data: { type },
    };
    
    setNodes((nds) => [...nds, newNode]);
    setDragType(null);
  }, [setNodes]);
  
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
  
  const deleteSelectedNode = () => {
    if (!selectedNode) return;
    if (UNDELETABLE_TYPES.includes(selectedNode.data.type)) {
      alert('此节点不可删除');
      return;
    }
    setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
    setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
    setSelectedNode(null);
  };
  
  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = {
        name: workflowName,
        nodes,
        edges,
      };
      
      let res;
      if (workflowId) {
        res = await fetch('/api/workflow', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: workflowId, ...payload }),
        });
      } else {
        res = await fetch('/api/workflow', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }
      
      const data = await res.json();
      if (res.ok) {
        if (!workflowId) {
          setWorkflowId(data.id);
          window.history.replaceState({}, '', `/workflow/edit?id=${data.id}`);
        }
        alert('保存成功');
      } else {
        alert(data.error || '保存失败');
      }
    } catch (error) {
      console.error('保存失败:', error);
      alert('保存失败');
    }
    setSaving(false);
  };
  
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* 顶部导航 */}
      <div className="h-11 border-b bg-white flex items-center justify-between px-3 shrink-0">
        <div className="flex items-center gap-3">
          <a href="/workflow/manage" className="text-blue-600 hover:underline text-sm">← 管理</a>
          <input
            type="text"
            value={workflowName}
            onChange={(e) => setWorkflowName(e.target.value)}
            className="px-2 py-1 border rounded text-sm w-40"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setNodes(createDefaultNodes()); setEdges([]); }}
            className="px-2 py-1 bg-gray-200 rounded text-xs"
          >
            清空
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-3 py-1 bg-blue-500 text-white rounded text-xs disabled:opacity-50"
          >
            {saving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
      
      <div className="flex-1 flex">
        {/* 左侧节点面板 */}
        <NodePalette onDragStart={setDragType} />
        
        {/* 画布 */}
        <div className="flex-1">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onDrop={onDrop}
            onDragOver={onDragOver}
            nodeTypes={nodeTypes}
            fitView
          >
            <Background />
            <Controls />
          </ReactFlow>
        </div>
        
        {/* 右侧编辑面板 */}
        <div className="w-56 border-l bg-white overflow-y-auto hidden sm:block">
          {selectedNode ? (
            <NodeEditPanel
              selectedNode={selectedNode}
              onUpdate={updateNodeData}
              onDelete={deleteSelectedNode}
              onClose={() => setSelectedNode(null)}
            />
          ) : (
            <div className="p-3 text-gray-400 text-xs">
              <p>点击节点编辑参数</p>
              <p className="mt-2">💡 用户输入和输出汇总节点不可删除</p>
            </div>
          )}
        </div>
      </div>
      
      {/* 移动端底部编辑面板 */}
      {selectedNode && (
        <div className="sm:hidden fixed inset-x-0 bottom-0 bg-white border-t rounded-t-xl shadow-lg z-40 max-h-[50vh] overflow-y-auto">
          <div className="sticky top-0 bg-white px-3 py-2 flex justify-center border-b">
            <div className="w-10 h-1 bg-gray-300 rounded-full" />
          </div>
          <NodeEditPanel
            selectedNode={selectedNode}
            onUpdate={updateNodeData}
            onDelete={deleteSelectedNode}
            onClose={() => setSelectedNode(null)}
          />
        </div>
      )}
    </div>
  );
}

export default function WorkflowEditPage() {
  return (
    <ReactFlowProvider>
      <WorkflowEditor />
    </ReactFlowProvider>
  );
}
