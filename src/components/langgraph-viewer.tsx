'use client';

import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
interface LangGraphViewerProps {
  workflowName: string;
  workflowId: string | null;
  engine: string;
  nodes: any[];
  edges: any[];
  nodeTypeConfig: Record<string, { label: string; icon: string; color: string; category: string; fields: any[] }>;
}

export function LangGraphViewer({
  workflowName, workflowId, engine,
  nodes, edges, nodeTypeConfig,
}: LangGraphViewerProps) {
  const nodeCount = nodes.length;

  return (
    <div className="h-screen flex flex-col bg-gradient-to-br from-indigo-50 via-white to-blue-50">
      {/* 导航条 */}
      <div className="h-10 border-b bg-white flex items-center justify-between px-3 shrink-0 shadow-sm">
        <div className="flex items-center gap-2">
          <a href="/workflow/manage" className="text-blue-600 text-xs hover:underline">
            ← 工作流管理
          </a>
          <span className="text-slate-300">|</span>
          <span className="text-xs font-medium text-slate-700">{workflowName}</span>
          <Badge className="bg-indigo-100 text-indigo-700 text-[10px]">LangGraph {engine}</Badge>
          <Badge className="bg-amber-100 text-amber-700 text-[10px]">只读</Badge>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="outline"
            onClick={() => window.location.href = '/workflow/manage'}
            className="h-6 text-[10px]">返回</Button>
          <Button size="sm" variant="outline"
            onClick={() => window.location.href = `/workflow/edit?id=${workflowId}`}
            className="h-6 text-[10px] text-green-600 border-green-200">
            复制并编辑
          </Button>
        </div>
      </div>

      {/* 内容区 */}
      <div className="flex-1 overflow-auto p-4">
        <div className="max-w-6xl mx-auto space-y-6">
          {/* 工作流描述 */}
          <Card className="border-indigo-200 bg-white/80">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-indigo-100 flex items-center justify-center text-xl">
                  {workflowId === 'rag-sql-dual' ? '🔀' : workflowId === 'rag-only' ? '📖' : '🔍'}
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-800">{workflowName}</h2>
                  <p className="text-[10px] text-slate-500">
                    StateGraph · {nodeCount} 节点 · {edges.length} 连线 · 引擎: {engine}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* 节点流水线 */}
          <Card className="border-indigo-200">
            <CardHeader className="pb-1 pt-3 px-4">
              <CardTitle className="text-xs font-medium text-slate-600">
                LangGraph StateGraph — 节点执行流
                <span className="font-normal text-slate-400 ml-2">（START → 各节点 → END）</span>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="overflow-x-auto">
                <svg width={Math.max(nodeCount * 160, 800)} height="180" className="mx-auto">
                  <defs>
                    <marker id="arrowhead" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
                      <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
                    </marker>
                  </defs>

                  {/* START → first node */}
                  <circle cx="45" cy="85" r="20" fill="#27AE60" opacity="0.85" />
                  <text x="45" y="80" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">START</text>
                  {nodeCount > 0 && (
                    <line x1="65" y1="85" x2="105" y2="85" stroke="#94a3b8" strokeWidth="2" markerEnd="url(#arrowhead)" />
                  )}

                  {/* Node boxes */}
                  {nodes.map((node: any, i: number) => {
                    const tc = nodeTypeConfig[node?.type];
                    const color = tc?.color || '#64748b';
                    const icon = tc?.icon || '⚙';
                    const label = node.name || tc?.label || node.type || `节点${i}`;
                    const nx = 115 + i * 150;

                    return (
                      <g key={i}>
                        {i < nodeCount - 1 && (
                          <line x1={nx + 75} y1="85" x2={nx + 138} y2="85"
                            stroke="#94a3b8" strokeWidth="2" markerEnd="url(#arrowhead)" />
                        )}
                        <rect x={nx} y="40" width="70" height="90" rx="8"
                          fill={color} opacity="0.1" stroke={color} strokeWidth="1.5" />
                        <rect x={nx} y="40" width="70" height="24" rx="8"
                          fill={color} opacity="0.85" />
                        <text x={nx + 35} y="55" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">
                          {icon} {i}
                        </text>
                        <text x={nx + 35} y="78" textAnchor="middle" fill="#334155" fontSize="7" fontWeight="bold">
                          {label.length > 6 ? label.slice(0, 6) + '..' : label}
                        </text>
                        <text x={nx + 35} y="96" textAnchor="middle" fill="#94a3b8" fontSize="5">
                          {node.type}
                        </text>
                        <text x={nx + 35} y="112" textAnchor="middle" fill="#64748b" fontSize="5">
                          #{i}
                        </text>
                      </g>
                    );
                  })}

                  {/* Last node → END */}
                  {nodeCount > 0 && (
                    <>
                      <line x1={115 + (nodeCount - 1) * 150 + 75} y1="85"
                        x2={115 + nodeCount * 150 - 12} y2="85"
                        stroke="#94a3b8" strokeWidth="2" markerEnd="url(#arrowhead)" />
                      <circle cx={115 + nodeCount * 150 + 10} cy="85" r="20" fill="#E74C3C" opacity="0.85" />
                      <text x={115 + nodeCount * 150 + 10} y="80" textAnchor="middle" fill="white" fontSize="8" fontWeight="bold">END</text>
                    </>
                  )}
                </svg>
              </div>
            </CardContent>
          </Card>

          {/* 节点详情 + 边关系 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card className="border-indigo-200">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-medium text-slate-600">节点定义 · {nodeCount} 个</CardTitle>
              </CardHeader>
              <CardContent className="p-2">
                <div className="grid gap-2">
                  {nodes.map((node: any, i: number) => {
                    const tc = nodeTypeConfig[node?.type];
                    return (
                      <div key={i} className="flex items-center gap-2 p-2 border rounded-lg bg-white hover:shadow-sm transition-shadow"
                        style={{ borderLeftColor: tc?.color || '#64748b', borderLeftWidth: 3 }}>
                        <div className="w-6 h-6 rounded flex items-center justify-center text-xs"
                          style={{ backgroundColor: (tc?.color || '#64748b') + '20', color: tc?.color }}>
                          {tc?.icon || '⚙'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-medium text-slate-700 truncate">
                              {node.name || tc?.label || node.type}
                            </span>
                            <span className="text-[8px] text-slate-400">#{i}</span>
                          </div>
                          <span className="text-[9px] text-slate-400">type: {node.type}</span>
                          <span className="text-[9px] text-slate-400 ml-2">category: {tc?.category}</span>
                        </div>
                        <div className="text-right flex-shrink-0">
                          <div className="w-2 h-2 rounded-full mx-auto" style={{ backgroundColor: tc?.color }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            <Card className="border-indigo-200">
              <CardHeader className="pb-1 pt-3 px-4">
                <CardTitle className="text-xs font-medium text-slate-600">边关系 · {edges.length} 条</CardTitle>
              </CardHeader>
              <CardContent className="p-2 overflow-auto max-h-[500px]">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="text-left text-slate-500 font-medium bg-slate-50">
                      <th className="p-1">#</th>
                      <th className="p-1">from</th>
                      <th className="p-1 text-center">→</th>
                      <th className="p-1">to</th>
                    </tr>
                  </thead>
                  <tbody>
                    {edges.map((edge: any, i: number) => {
                      const fromIdx = typeof edge.from === 'number' ? edge.from :
                        nodes.findIndex((n: any) => n.id === edge.source);
                      const toIdx = typeof edge.to === 'number' ? edge.to :
                        nodes.findIndex((n: any) => n.id === edge.target);
                      const fromNode = fromIdx >= 0 ? nodes[fromIdx] : null;
                      const toNode = toIdx >= 0 ? nodes[toIdx] : null;
                      const fromTC = fromNode ? nodeTypeConfig[fromNode.type] : null;
                      const toTC = toNode ? nodeTypeConfig[toNode.type] : null;
                      return (
                        <tr key={i} className="border-t border-slate-100 hover:bg-indigo-50/30">
                          <td className="p-1 text-slate-400">{i + 1}</td>
                          <td className="p-1">
                            <span style={{ color: fromTC?.color || '#64748b' }}>
                              [{fromIdx}] {fromNode?.name || fromTC?.label || edge.source || '—'}
                            </span>
                          </td>
                          <td className="p-1 text-center text-slate-300">→</td>
                          <td className="p-1">
                            <span style={{ color: toTC?.color || '#64748b' }}>
                              [{toIdx}] {toNode?.name || toTC?.label || edge.target || '—'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
