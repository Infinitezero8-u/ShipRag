"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { 
  Upload, Download, Tag, List, Eye, Sparkles, Check, 
  FileJson, FileSpreadsheet, X, ChevronRight, Ship, MapPin,
  Navigation, Anchor, RefreshCw, Trash2, Plus, Edit, Save
} from "lucide-react";

interface TrajectoryItem {
  id: string;
  mmsi: string | null;
  start_port: string | null;
  end_port: string | null;
  geometry_wkt: string | null;
  ai_description: string | null;
  behavior_code: string | null;
  intent_code: string | null;
  confidence_score: number | null;
  label_reasoning: string | null;
  created_at: string;
}

interface LabelDef {
  code: string;
  name: string;
  description: string;
  is_active?: boolean;
}

interface Labels {
  behaviors: LabelDef[];
  intents: LabelDef[];
}

export default function SegmentLabelPage() {
  const [items, setItems] = useState<TrajectoryItem[]>([]);
  const [labels, setLabels] = useState<Labels>({ behaviors: [], intents: [] });
  const [selected, setSelected] = useState<TrajectoryItem | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [labeling, setLabeling] = useState(false);
  const [importData, setImportData] = useState("");
  const [showImport, setShowImport] = useState(false);
  const [filterMmsi, setFilterMmsi] = useState("");
  const [filterUnlabeled, setFilterUnlabeled] = useState(false);
  const [filterStartPort, setFilterStartPort] = useState("");
  const [filterEndPort, setFilterEndPort] = useState("");
  const [filterBehavior, setFilterBehavior] = useState("");
  const [filterIntent, setFilterIntent] = useState("");
  const [filterStartTime, setFilterStartTime] = useState("");
  const [filterEndTime, setFilterEndTime] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedPort, setSelectedPort] = useState<string | null>(null);
  const [portInfo, setPortInfo] = useState<{
    name_cn?: string;
    lon?: number;
    lat?: number;
    port_type?: string;
    tz_offset?: number;
    ctry_name_cn?: string;
  } | null>(null);
  
  // 标签编辑状态
  const [editingLabel, setEditingLabel] = useState<LabelDef | null>(null);
  const [addingLabelType, setAddingLabelType] = useState<'behavior' | 'intent' | null>(null);
  const [labelForm, setLabelForm] = useState({ code: '', name: '', description: '' });

  useEffect(() => {
    fetchLabels();
    fetchItems();
  }, []);

  const fetchLabels = async () => {
    try {
      const res = await fetch("/api/trajectory/label?action=labels");
      const data = await res.json();
      setLabels(data);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchItems = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterMmsi) params.set("mmsi", filterMmsi);
      if (filterUnlabeled) params.set("unlabeled", "true");
      if (filterStartPort) params.set("startPort", filterStartPort);
      if (filterEndPort) params.set("endPort", filterEndPort);
      if (filterBehavior) params.set("behavior", filterBehavior);
      if (filterIntent) params.set("intent", filterIntent);
      if (filterStartTime) params.set("startTime", filterStartTime);
      if (filterEndTime) params.set("endTime", filterEndTime);
      params.set("limit", "50");
      const res = await fetch(`/api/trajectory/label?${params}`);
      const data = await res.json();
      setItems(data.items || []);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // 标签CRUD操作
  const handleAddLabel = async () => {
    if (!labelForm.code || !labelForm.name || !addingLabelType) return;
    
    try {
      const res = await fetch('/api/trajectory/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'addLabel',
          type: addingLabelType,
          code: labelForm.code.toUpperCase(),
          name: labelForm.name,
          description: labelForm.description
        })
      });
      const data = await res.json();
      if (data.success) {
        setLabelForm({ code: '', name: '', description: '' });
        setAddingLabelType(null);
        fetchLabels();
      } else {
        alert(data.error || '添加失败');
      }
    } catch (e) {
      console.error(e);
      alert('添加失败');
    }
  };

  const handleUpdateLabel = async () => {
    if (!editingLabel) return;
    
    try {
      const res = await fetch('/api/trajectory/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'updateLabel',
          code: editingLabel.code,
          name: labelForm.name,
          description: labelForm.description
        })
      });
      const data = await res.json();
      if (data.success) {
        setEditingLabel(null);
        setLabelForm({ code: '', name: '', description: '' });
        fetchLabels();
      } else {
        alert(data.error || '更新失败');
      }
    } catch (e) {
      console.error(e);
      alert('更新失败');
    }
  };

  const handleDeleteLabel = async (code: string) => {
    if (!confirm(`确定删除标签 ${code}？`)) return;
    
    try {
      const res = await fetch('/api/trajectory/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'deleteLabel', code })
      });
      const data = await res.json();
      if (data.success) {
        fetchLabels();
      } else {
        alert(data.error || '删除失败');
      }
    } catch (e) {
      console.error(e);
      alert('删除失败');
    }
  };

  const startEditLabel = (label: LabelDef) => {
    setEditingLabel(label);
    setLabelForm({ code: label.code, name: label.name, description: label.description || '' });
  };

  // 港口信息查询
  const handlePortClick = async (portCode: string) => {
    setSelectedPort(portCode);
    try {
      const res = await fetch(`/api/data-maintain?action=list&type=port&portCode=${portCode}`);
      const data = await res.json();
      if (data.success && data.items?.length > 0) {
        setPortInfo(data.items[0]);
      } else {
        setPortInfo(null);
      }
    } catch {
      setPortInfo(null);
    }
  };

  const handleImport = async () => {
    if (!importData.trim()) return;
    try {
      let data: TrajectoryItem[] = [];
      if (importData.trim().startsWith("[")) {
        data = JSON.parse(importData);
      } else {
        const lines = importData.trim().split("\n");
        const headers = lines[0].split(",");
        for (let i = 1; i < lines.length; i++) {
          const vals = lines[i].split(",");
          const obj: Record<string, string> = {};
          headers.forEach((h, idx) => (obj[h.trim()] = vals[idx]?.trim()));
          data.push({
            id: "",
            mmsi: obj.mmsi || null,
            start_port: obj.start_port || obj.OrigPort || null,
            end_port: obj.end_port || obj.DestPort || null,
            geometry_wkt: obj.geometry_wkt || null,
            ai_description: null,
            behavior_code: null,
            intent_code: null,
            confidence_score: null,
            label_reasoning: null,
            created_at: new Date().toISOString(),
          });
        }
      }
      const res = await fetch("/api/trajectory/label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import", data }),
      });
      const result = await res.json();
      alert(`导入成功: ${result.imported} 条`);
      setShowImport(false);
      setImportData("");
      fetchItems();
    } catch (e) {
      console.error(e);
      alert("导入失败，请检查格式");
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      setImportData(ev.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleExport = (format: "json" | "csv") => {
    const dataToExport = selectedIds.size > 0 
      ? items.filter(item => selectedIds.has(item.id))
      : items;
      
    if (format === "json") {
      const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "trajectories.json";
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const headers = ["mmsi", "start_port", "end_port", "behavior_code", "intent_code", "geometry_wkt"];
      const rows = dataToExport.map((item) =>
        headers.map((h) => String((item as unknown as Record<string, unknown>)[h] || "")).join(",")
      );
      const csv = [headers.join(","), ...rows].join("\n");
      const blob = new Blob([csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "trajectories.csv";
      a.click();
      URL.revokeObjectURL(url);
    }
  };

  const handleLabel = async (item: TrajectoryItem) => {
    setLabeling(true);
    try {
      const res = await fetch("/api/trajectory/label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "label", id: item.id }),
      });
      const data = await res.json();
      if (data.success) {
        alert(`标注结果:\n行为: ${data.result?.behavior || "-"}\n意图: ${data.result?.intent || "-"}`);
        fetchItems();
      } else {
        alert("标注失败: " + (data.error || "未知错误"));
      }
    } catch (e) {
      console.error(e);
      alert("标注失败");
    } finally {
      setLabeling(false);
    }
  };

  const handleBatchLabel = async () => {
    if (selectedIds.size === 0) return;
    setLabeling(true);
    try {
      let success = 0;
      for (const id of selectedIds) {
        const res = await fetch("/api/trajectory/label", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "label", id }),
        });
        const data = await res.json();
        if (data.success) success++;
      }
      alert(`批量标注完成: ${success}/${selectedIds.size}`);
      setSelectedIds(new Set());
      fetchItems();
    } catch (e) {
      console.error(e);
      alert("批量标注失败");
    } finally {
      setLabeling(false);
    }
  };

  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定删除选中的 ${selectedIds.size} 条航迹？`)) return;
    try {
      let success = 0;
      for (const id of selectedIds) {
        const res = await fetch("/api/trajectory/label", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "delete", id }),
        });
        const data = await res.json();
        if (data.success) success++;
      }
      alert(`批量删除完成: ${success}/${selectedIds.size}`);
      setSelectedIds(new Set());
      fetchItems();
    } catch (e) {
      console.error(e);
      alert("批量删除失败");
    }
  };

  const handleBatchClearLabel = async () => {
    if (selectedIds.size === 0) return;
    if (!confirm(`确定取消选中的 ${selectedIds.size} 条航迹的标注？`)) return;
    try {
      let success = 0;
      for (const id of selectedIds) {
        const res = await fetch("/api/trajectory/label", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "clearLabel", id }),
        });
        const data = await res.json();
        if (data.success) success++;
      }
      alert(`批量取消标注完成: ${success}/${selectedIds.size}`);
      setSelectedIds(new Set());
      fetchItems();
    } catch (e) {
      console.error(e);
      alert("批量取消标注失败");
    }
  };

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const parseWKT = (wkt: string): [number, number][] => {
    const match = wkt.match(/\(\(([\d\s\.\-,]+)\)\)/);
    if (!match) return [];
    return match[1].split(",").map((pair) => {
      const [lon, lat] = pair.trim().split(" ").map(Number);
      return [lon, lat];
    });
  };

  const renderPreview = (wkt: string | null) => {
    if (!wkt) return <div className="text-[10px] text-muted-foreground">无航线数据</div>;
    const points = parseWKT(wkt);
    if (points.length < 2) return <div className="text-[10px] text-muted-foreground">WKT格式错误</div>;
    
    const lons = points.map((p) => p[0]);
    const lats = points.map((p) => p[1]);
    const minLon = Math.min(...lons);
    const maxLon = Math.max(...lons);
    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const width = 280;
    const height = 120;
    
    const scaleX = (lon: number) => ((lon - minLon) / (maxLon - minLon || 1)) * width;
    const scaleY = (lat: number) => height - ((lat - minLat) / (maxLat - minLat || 1)) * height;
    
    const pathD = points.map((p, i) => `${i === 0 ? "M" : "L"} ${scaleX(p[0])} ${scaleY(p[1])}`).join(" ");
    
    return (
      <svg width={width} height={height} className="bg-slate-50 rounded border">
        <path d={pathD} fill="none" stroke="#3b82f6" strokeWidth={2} />
        <circle cx={scaleX(points[0][0])} cy={scaleY(points[0][1])} r={4} fill="#22c55e" />
        <circle cx={scaleX(points[points.length - 1][0])} cy={scaleY(points[points.length - 1][1])} r={4} fill="#ef4444" />
      </svg>
    );
  };

  const behaviorMap = new Map(labels.behaviors.map(l => [l.code, l.name]));
  const intentMap = new Map(labels.intents.map(l => [l.code, l.name]));

  return (
    <div className="min-h-screen bg-background p-2">
      <div className="flex items-center justify-between mb-2">
        <h1 className="text-sm font-bold flex items-center gap-1">
          <Tag className="w-4 h-4 text-blue-500" />
          航迹标注平台
        </h1>
        <div className="flex gap-1">
          <Badge variant="outline" className="text-[10px]">
            {items.filter(i => i.behavior_code).length}/{items.length} 已标注
          </Badge>
        </div>
      </div>

      <Tabs defaultValue="list" className="w-full">
        <TabsList className="w-full h-8 mb-2">
          <TabsTrigger value="list" className="text-[10px] flex-1">
            <List className="w-3 h-3 mr-1" />航迹列表
          </TabsTrigger>
          <TabsTrigger value="detail" className="text-[10px] flex-1">
            <Eye className="w-3 h-3 mr-1" />详情预览
          </TabsTrigger>
          <TabsTrigger value="labels" className="text-[10px] flex-1">
            <Tag className="w-3 h-3 mr-1" />标签管理
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="mt-0">
          {/* 筛选区域 */}
          <div className="space-y-1 mb-2">
            <div className="flex gap-1 flex-wrap">
              <Input
                placeholder="MMSI"
                value={filterMmsi}
                onChange={(e) => setFilterMmsi(e.target.value)}
                className="h-7 w-16 text-[10px]"
              />
              <Input
                placeholder="起港"
                value={filterStartPort}
                onChange={(e) => setFilterStartPort(e.target.value)}
                className="h-7 w-16 text-[10px]"
              />
              <Input
                placeholder="止港"
                value={filterEndPort}
                onChange={(e) => setFilterEndPort(e.target.value)}
                className="h-7 w-16 text-[10px]"
              />
              <select 
                value={filterBehavior} 
                onChange={(e) => setFilterBehavior(e.target.value)}
                className="h-7 text-[10px] border rounded px-1"
              >
                <option value="">行为标签</option>
                {labels.behaviors.map(b => <option key={b.code} value={b.code}>{b.name}</option>)}
              </select>
              <select 
                value={filterIntent} 
                onChange={(e) => setFilterIntent(e.target.value)}
                className="h-7 text-[10px] border rounded px-1"
              >
                <option value="">意图标签</option>
                {labels.intents.map(i => <option key={i.code} value={i.code}>{i.name}</option>)}
              </select>
            </div>
            <div className="flex gap-1 flex-wrap items-center">
              <Input
                type="date"
                placeholder="开始时间"
                value={filterStartTime}
                onChange={(e) => setFilterStartTime(e.target.value)}
                className="h-7 w-28 text-[10px]"
              />
              <span className="text-[10px]">至</span>
              <Input
                type="date"
                placeholder="结束时间"
                value={filterEndTime}
                onChange={(e) => setFilterEndTime(e.target.value)}
                className="h-7 w-28 text-[10px]"
              />
              <Button size="sm" variant={filterUnlabeled ? "default" : "outline"} onClick={() => setFilterUnlabeled(!filterUnlabeled)} className="h-7 text-[10px]">
                仅未标注
              </Button>
              <Button size="sm" onClick={fetchItems} className="h-7 text-[10px]">
                <RefreshCw className="w-3 h-3" />
              </Button>
              <Button size="sm" variant="outline" onClick={() => setShowImport(true)} className="h-7 text-[10px]">
                <Upload className="w-3 h-3 mr-1" />导入
              </Button>
              <Button size="sm" variant="outline" onClick={() => handleExport("json")} className="h-7 text-[10px]">
                <Download className="w-3 h-3 mr-1" />导出
              </Button>
            </div>
          </div>

          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 mb-2 p-1 bg-blue-50 rounded">
              <span className="text-[10px]">已选 {selectedIds.size} 条</span>
              <Button size="sm" onClick={handleBatchLabel} disabled={labeling} className="h-6 text-[10px]">
                <Sparkles className="w-3 h-3 mr-1" />批量标注
              </Button>
              <Button size="sm" variant="destructive" onClick={handleBatchDelete} className="h-6 text-[10px]">
                <Trash2 className="w-3 h-3 mr-1" />批量删除
              </Button>
              <Button size="sm" variant="outline" onClick={handleBatchClearLabel} className="h-6 text-[10px]">
                取消标注
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())} className="h-6 text-[10px]">
                取消
              </Button>
            </div>
          )}

          <div className="space-y-1 max-h-[60vh] overflow-y-auto">
            {loading ? (
              <div className="text-center py-4 text-xs text-muted-foreground">加载中...</div>
            ) : items.length === 0 ? (
              <div className="text-center py-4 text-xs text-muted-foreground">暂无数据</div>
            ) : (
              items.map((item) => (
                <Card
                  key={item.id}
                  className={`p-2 cursor-pointer ${selected?.id === item.id ? "border-blue-500" : ""}`}
                  onClick={() => setSelected(item)}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={(e) => {
                        e.stopPropagation();
                        toggleSelect(item.id);
                      }}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1 mb-1">
                        <Ship className="w-3 h-3 text-blue-500" />
                        <span className="text-[10px] font-medium">{item.mmsi || "-"}</span>
                        <span className="text-[10px] text-muted-foreground">
                          {item.start_port} → {item.end_port}
                        </span>
                      </div>
                      <div className="flex gap-1 flex-wrap">
                        {item.behavior_code && (
                          <Badge variant="secondary" className="text-[9px] h-4">
                            {behaviorMap.get(item.behavior_code) || item.behavior_code}
                          </Badge>
                        )}
                        {item.intent_code && (
                          <Badge variant="outline" className="text-[9px] h-4">
                            {intentMap.get(item.intent_code) || item.intent_code}
                          </Badge>
                        )}
                        {!item.behavior_code && !item.intent_code && (
                          <Badge variant="destructive" className="text-[9px] h-4">未标注</Badge>
                        )}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleLabel(item);
                      }}
                      disabled={labeling}
                      className="h-6"
                    >
                      <Sparkles className="w-3 h-3" />
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="detail" className="mt-0">
          {selected ? (
            <Card className="p-3">
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2 text-[10px]">
                  <div><span className="text-muted-foreground">MMSI:</span> {selected.mmsi}</div>
                  <div>
                    <span className="text-muted-foreground">起点:</span>{" "}
                    <button 
                      onClick={() => setSelectedPort(selected.start_port)}
                      className="text-blue-600 hover:underline"
                    >
                      {selected.start_port}
                    </button>
                  </div>
                  <div>
                    <span className="text-muted-foreground">终点:</span>{" "}
                    <button 
                      onClick={() => setSelectedPort(selected.end_port)}
                      className="text-blue-600 hover:underline"
                    >
                      {selected.end_port}
                    </button>
                  </div>
                  <div><span className="text-muted-foreground">置信度:</span> {selected.confidence_score?.toFixed(2) || "-"}</div>
                </div>
                
                <div>
                  <div className="text-[10px] font-medium mb-1">航线预览</div>
                  {renderPreview(selected.geometry_wkt)}
                </div>
                
                <div>
                  <div className="text-[10px] font-medium mb-1">AI描述</div>
                  <div className="text-[10px] text-muted-foreground bg-slate-50 p-2 rounded">
                    {selected.ai_description || "暂无描述"}
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <div className="text-[10px] font-medium mb-1">行为标签</div>
                    <Select
                      value={selected.behavior_code || ""}
                      onValueChange={async (val) => {
                        await fetch("/api/trajectory/label", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "update", id: selected.id, behavior_code: val }),
                        });
                        fetchItems();
                      }}
                    >
                      <SelectTrigger className="h-7 text-[10px]">
                        <SelectValue placeholder="选择行为" />
                      </SelectTrigger>
                      <SelectContent>
                        {labels.behaviors.map((l) => (
                          <SelectItem key={l.code} value={l.code} className="text-[10px]">
                            {l.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <div className="text-[10px] font-medium mb-1">意图标签</div>
                    <Select
                      value={selected.intent_code || ""}
                      onValueChange={async (val) => {
                        await fetch("/api/trajectory/label", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ action: "update", id: selected.id, intent_code: val }),
                        });
                        fetchItems();
                      }}
                    >
                      <SelectTrigger className="h-7 text-[10px]">
                        <SelectValue placeholder="选择意图" />
                      </SelectTrigger>
                      <SelectContent>
                        {labels.intents.map((l) => (
                          <SelectItem key={l.code} value={l.code} className="text-[10px]">
                            {l.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {selected.label_reasoning && (
                  <div>
                    <div className="text-[10px] font-medium mb-1">判定依据</div>
                    <div className="text-[10px] text-muted-foreground bg-slate-50 p-2 rounded">
                      {selected.label_reasoning}
                    </div>
                  </div>
                )}
              </div>
            </Card>
          ) : (
            <div className="text-center py-8 text-xs text-muted-foreground">
              请从列表选择航迹查看详情
            </div>
          )}
        </TabsContent>

        <TabsContent value="labels" className="mt-0">
          <div className="space-y-3">
            {/* 行为标签 */}
            <Card className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium flex items-center gap-1">
                  <Navigation className="w-3 h-3 text-blue-500" />
                  行为标签 ({labels.behaviors.length})
                </div>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => setAddingLabelType('behavior')}
                  className="h-6 text-[10px]"
                >
                  <Plus className="w-3 h-3 mr-1" />新增
                </Button>
              </div>
              <div className="space-y-1">
                {labels.behaviors.map((label) => (
                  <div key={label.code} className="flex items-center justify-between p-1.5 bg-slate-50 rounded">
                    {editingLabel?.code === label.code ? (
                      <div className="flex-1 flex gap-1">
                        <Input
                          value={labelForm.name}
                          onChange={(e) => setLabelForm({ ...labelForm, name: e.target.value })}
                          className="h-6 w-20 text-[10px]"
                          placeholder="名称"
                        />
                        <Input
                          value={labelForm.description}
                          onChange={(e) => setLabelForm({ ...labelForm, description: e.target.value })}
                          className="h-6 flex-1 text-[10px]"
                          placeholder="描述"
                        />
                        <Button size="sm" onClick={handleUpdateLabel} className="h-6 w-6 p-0">
                          <Save className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingLabel(null)} className="h-6 w-6 p-0">
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-medium">{label.name}</div>
                          <div className="text-[9px] text-muted-foreground truncate">{label.code} · {label.description || '无描述'}</div>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => startEditLabel(label)} className="h-6 w-6 p-0">
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteLabel(label.code)} className="h-6 w-6 p-0 text-red-500">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {addingLabelType === 'behavior' && (
                  <div className="flex gap-1 p-1.5 bg-blue-50 rounded border border-blue-200">
                    <Input
                      value={labelForm.code}
                      onChange={(e) => setLabelForm({ ...labelForm, code: e.target.value.toUpperCase() })}
                      className="h-6 w-16 text-[10px]"
                      placeholder="CODE"
                    />
                    <Input
                      value={labelForm.name}
                      onChange={(e) => setLabelForm({ ...labelForm, name: e.target.value })}
                      className="h-6 w-20 text-[10px]"
                      placeholder="名称"
                    />
                    <Input
                      value={labelForm.description}
                      onChange={(e) => setLabelForm({ ...labelForm, description: e.target.value })}
                      className="h-6 flex-1 text-[10px]"
                      placeholder="描述"
                    />
                    <Button size="sm" onClick={handleAddLabel} className="h-6 w-6 p-0">
                      <Check className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setAddingLabelType(null); setLabelForm({ code: '', name: '', description: '' }); }} className="h-6 w-6 p-0">
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>

            {/* 意图标签 */}
            <Card className="p-3">
              <div className="flex items-center justify-between mb-2">
                <div className="text-xs font-medium flex items-center gap-1">
                  <Anchor className="w-3 h-3 text-green-500" />
                  意图标签 ({labels.intents.length})
                </div>
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => setAddingLabelType('intent')}
                  className="h-6 text-[10px]"
                >
                  <Plus className="w-3 h-3 mr-1" />新增
                </Button>
              </div>
              <div className="space-y-1">
                {labels.intents.map((label) => (
                  <div key={label.code} className="flex items-center justify-between p-1.5 bg-slate-50 rounded">
                    {editingLabel?.code === label.code ? (
                      <div className="flex-1 flex gap-1">
                        <Input
                          value={labelForm.name}
                          onChange={(e) => setLabelForm({ ...labelForm, name: e.target.value })}
                          className="h-6 w-20 text-[10px]"
                          placeholder="名称"
                        />
                        <Input
                          value={labelForm.description}
                          onChange={(e) => setLabelForm({ ...labelForm, description: e.target.value })}
                          className="h-6 flex-1 text-[10px]"
                          placeholder="描述"
                        />
                        <Button size="sm" onClick={handleUpdateLabel} className="h-6 w-6 p-0">
                          <Save className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => setEditingLabel(null)} className="h-6 w-6 p-0">
                          <X className="w-3 h-3" />
                        </Button>
                      </div>
                    ) : (
                      <>
                        <div className="flex-1 min-w-0">
                          <div className="text-[10px] font-medium">{label.name}</div>
                          <div className="text-[9px] text-muted-foreground truncate">{label.code} · {label.description || '无描述'}</div>
                        </div>
                        <div className="flex gap-1">
                          <Button size="sm" variant="ghost" onClick={() => startEditLabel(label)} className="h-6 w-6 p-0">
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => handleDeleteLabel(label.code)} className="h-6 w-6 p-0 text-red-500">
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
                {addingLabelType === 'intent' && (
                  <div className="flex gap-1 p-1.5 bg-green-50 rounded border border-green-200">
                    <Input
                      value={labelForm.code}
                      onChange={(e) => setLabelForm({ ...labelForm, code: e.target.value.toUpperCase() })}
                      className="h-6 w-16 text-[10px]"
                      placeholder="CODE"
                    />
                    <Input
                      value={labelForm.name}
                      onChange={(e) => setLabelForm({ ...labelForm, name: e.target.value })}
                      className="h-6 w-20 text-[10px]"
                      placeholder="名称"
                    />
                    <Input
                      value={labelForm.description}
                      onChange={(e) => setLabelForm({ ...labelForm, description: e.target.value })}
                      className="h-6 flex-1 text-[10px]"
                      placeholder="描述"
                    />
                    <Button size="sm" onClick={handleAddLabel} className="h-6 w-6 p-0">
                      <Check className="w-3 h-3" />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => { setAddingLabelType(null); setLabelForm({ code: '', name: '', description: '' }); }} className="h-6 w-6 p-0">
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                )}
              </div>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* 导入弹窗 */}
      {showImport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-md">
            <CardHeader className="p-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">导入航迹</CardTitle>
                <Button size="sm" variant="ghost" onClick={() => setShowImport(false)}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0 space-y-3">
              <input
                type="file"
                ref={fileInputRef}
                accept=".json,.csv"
                onChange={handleFileUpload}
                className="hidden"
              />
              <Button 
                size="sm" 
                variant="outline" 
                onClick={() => fileInputRef.current?.click()}
                className="w-full"
              >
                <Upload className="w-3 h-3 mr-1" />
                选择文件 (JSON/CSV)
              </Button>
              <Textarea
                value={importData}
                onChange={e => setImportData(e.target.value)}
                placeholder='粘贴JSON数组或CSV数据&#10;[{"mmsi":"123","start_port":"CNSHA","end_port":"SGSIN","geometry_wkt":"LINESTRING(...)"}]'
                className="h-32 text-xs"
              />
              <div className="flex gap-2">
                <Button size="sm" onClick={handleImport} className="flex-1">
                  导入
                </Button>
                <Button size="sm" variant="outline" onClick={() => setShowImport(false)} className="flex-1">
                  取消
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 港口信息弹窗 */}
      {selectedPort && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4">
          <Card className="w-full max-w-sm">
            <CardHeader className="p-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm">港口信息: {selectedPort}</CardTitle>
                <Button size="sm" variant="ghost" onClick={() => { setSelectedPort(null); setPortInfo(null); }}>
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              {portInfo ? (
                <div className="space-y-2 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-muted-foreground">中文名:</span> {portInfo.name_cn}</div>
                    <div><span className="text-muted-foreground">国家:</span> {portInfo.ctry_name_cn}</div>
                    <div><span className="text-muted-foreground">经度:</span> {portInfo.lon?.toFixed(4)}</div>
                    <div><span className="text-muted-foreground">纬度:</span> {portInfo.lat?.toFixed(4)}</div>
                    <div><span className="text-muted-foreground">类型:</span> {portInfo.port_type}</div>
                    <div><span className="text-muted-foreground">时区:</span> UTC{(portInfo.tz_offset ?? 0) >= 0 ? '+' : ''}{portInfo.tz_offset ?? 0}</div>
                  </div>
                  <Button size="sm" variant="outline" className="w-full mt-2" asChild>
                    <a href={`/sea-chart?port=${selectedPort}`} target="_blank" rel="noopener noreferrer">
                      <Navigation className="w-3 h-3 mr-1" />在海图中查看
                    </a>
                  </Button>
                </div>
              ) : (
                <div className="text-xs text-muted-foreground text-center py-4">
                  未找到港口数据
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
