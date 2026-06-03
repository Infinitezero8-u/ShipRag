"use client";

import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { 
  Upload, Download, Tag, List, Eye, Sparkles, Check, 
  FileJson, FileSpreadsheet, X, ChevronRight, Ship, MapPin,
  Navigation, Anchor, RefreshCw, Trash2
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
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleLabel = async (item: TrajectoryItem) => {
    setLabeling(true);
    try {
      const res = await fetch("/api/trajectory/label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "label",
          id: item.id,
          mmsi: item.mmsi,
          startPort: item.start_port,
          endPort: item.end_port,
          description: item.ai_description
        })
      });
      const data = await res.json();
      if (data.success) {
        await fetchItems();
        if (selected?.id === item.id) {
          setSelected({ ...item, ...data.result });
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLabeling(false);
    }
  };

  const handleBatchLabel = async () => {
    if (selectedIds.size === 0) return;
    setLabeling(true);
    const toLabel = items.filter(i => selectedIds.has(i.id));
    for (const item of toLabel) {
      await handleLabel(item);
    }
    setSelectedIds(new Set());
    setLabeling(false);
  };

  const handleImport = async () => {
    if (!importData.trim()) return;
    try {
      let data: unknown[] = [];
      if (importData.trim().startsWith("[")) {
        data = JSON.parse(importData);
      } else {
        const lines = importData.trim().split("\n");
        const headers = lines[0].split(",");
        for (let i = 1; i < lines.length; i++) {
          const values = lines[i].split(",");
          const obj: Record<string, string> = {};
          headers.forEach((h, idx) => obj[h.trim()] = values[idx]?.trim());
          data.push(obj);
        }
      }
      const res = await fetch("/api/trajectory/label", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "import", data })
      });
      const result = await res.json();
      if (result.success) {
        setShowImport(false);
        setImportData("");
        fetchItems();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleExport = (format: "json" | "csv") => {
    const exportItems = selectedIds.size > 0 
      ? items.filter(i => selectedIds.has(i.id))
      : items;
    
    if (format === "json") {
      const blob = new Blob([JSON.stringify(exportItems, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "trajectories.json";
      a.click();
    } else {
      const headers = ["id,mmsi,start_port,end_port,behavior_code,intent_code"];
      const rows = exportItems.map(i => 
        [i.id, i.mmsi, i.start_port, i.end_port, i.behavior_code, i.intent_code].join(",")
      );
      const blob = new Blob([headers.concat(rows).join("\n")], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "trajectories.csv";
      a.click();
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

  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) newSet.delete(id);
    else newSet.add(id);
    setSelectedIds(newSet);
  };

  const parseWKT = (wkt: string | null): number[][] => {
    if (!wkt) return [];
    const match = wkt.match(/LINESTRING\s*\((.*)\)/i);
    if (!match) return [];
    return match[1].split(",").map(p => {
      const [lng, lat] = p.trim().split(/\s+/).map(Number);
      return [lng, lat];
    }).filter(p => p[0] && p[1]);
  };

  const renderTrajectoryPreview = (wkt: string | null) => {
    const points = parseWKT(wkt);
    if (points.length < 2) return null;
    
    const lats = points.map(p => p[1]);
    const lngs = points.map(p => p[0]);
    const minLat = Math.min(...lats), maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs), maxLng = Math.max(...lngs);
    const pad = 0.1;
    
    const svgPoints = points.map(p => {
      const x = ((p[0] - minLng) / (maxLng - minLng + pad)) * 280 + 10;
      const y = 150 - ((p[1] - minLat) / (maxLat - minLat + pad)) * 130;
      return `${x},${y}`;
    }).join(" ");

    return (
      <svg viewBox="0 0 300 160" className="w-full h-32 bg-slate-50 rounded border">
        <polyline points={svgPoints} fill="none" stroke="#3b82f6" strokeWidth="2"/>
        <circle cx={parseFloat(svgPoints.split(" ")[0].split(",")[0])} 
                cy={parseFloat(svgPoints.split(" ")[0].split(",")[1])} 
                r="5" fill="#22c55e"/>
        <circle cx={parseFloat(svgPoints.split(" ").pop()!.split(",")[0])} 
                cy={parseFloat(svgPoints.split(" ").pop()!.split(",")[1])} 
                r="5" fill="#ef4444"/>
      </svg>
    );
  };

  const getLabelName = (code: string | null, type: "behavior" | "intent") => {
    if (!code) return "-";
    const list = type === "behavior" ? labels.behaviors : labels.intents;
    return list.find(l => l.code === code)?.name || code;
  };

  const labeledCount = items.filter(i => i.behavior_code && i.intent_code).length;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部标题栏 */}
      <div className="bg-white border-b px-3 py-2 sticky top-0 z-10">
        <div className="flex items-center justify-between">
          <h1 className="text-base font-semibold">航迹标注平台</h1>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="text-xs">
              {labeledCount}/{items.length}
            </Badge>
            <Button size="sm" variant="outline" onClick={() => setShowImport(true)}>
              <Upload className="w-4 h-4 mr-1" />
              导入
            </Button>
            <Button size="sm" variant="outline" onClick={() => handleExport("json")}>
              <Download className="w-4 h-4 mr-1" />
              导出
            </Button>
          </div>
        </div>
      </div>

      {/* 主内容区 - Tabs切换 */}
      <Tabs defaultValue="list" className="p-3">
        <TabsList className="grid w-full grid-cols-3 mb-3">
          <TabsTrigger value="list" className="text-sm">
            <List className="w-4 h-4 mr-1" />
            航迹列表
          </TabsTrigger>
          <TabsTrigger value="detail" className="text-sm">
            <Eye className="w-4 h-4 mr-1" />
            详情预览
          </TabsTrigger>
          <TabsTrigger value="labels" className="text-sm">
            <Tag className="w-4 h-4 mr-1" />
            标签管理
          </TabsTrigger>
        </TabsList>

        {/* 航迹列表 */}
        <TabsContent value="list" className="mt-0 space-y-3">
          {/* 筛选和操作 */}
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              placeholder="MMSI筛选"
              value={filterMmsi}
              onChange={e => setFilterMmsi(e.target.value)}
              className="h-8 px-2 text-sm border rounded w-28"
            />
            <label className="flex items-center gap-1 text-sm">
              <input
                type="checkbox"
                checked={filterUnlabeled}
                onChange={e => setFilterUnlabeled(e.target.checked)}
                className="w-4 h-4"
              />
              仅未标注
            </label>
            <Button size="sm" variant="secondary" onClick={fetchItems}>
              <RefreshCw className="w-3 h-3 mr-1" />
              刷新
            </Button>
            {selectedIds.size > 0 && (
              <Button size="sm" onClick={handleBatchLabel} disabled={labeling}>
                <Sparkles className="w-3 h-3 mr-1" />
                批量标注({selectedIds.size})
              </Button>
            )}
          </div>

          {/* 列表 */}
          {loading ? (
            <div className="text-center py-8 text-sm text-muted-foreground">加载中...</div>
          ) : items.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              暂无数据，请导入航迹
            </div>
          ) : (
            <div className="space-y-2">
              {items.map(item => (
                <Card 
                  key={item.id} 
                  className={`p-2 cursor-pointer transition-colors ${
                    selected?.id === item.id ? "ring-2 ring-blue-500" : ""
                  }`}
                  onClick={() => setSelected(item)}
                >
                  <div className="flex items-start gap-2">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(item.id)}
                      onChange={(e) => { e.stopPropagation(); toggleSelect(item.id); }}
                      onClick={e => e.stopPropagation()}
                      className="mt-1 w-4 h-4"
                    />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Ship className="w-3 h-3 text-muted-foreground" />
                        <span className="text-sm font-medium truncate">
                          {item.mmsi || "未知船舶"}
                        </span>
                        {item.behavior_code && (
                          <Badge variant="secondary" className="text-[10px]">
                            {getLabelName(item.behavior_code, "behavior")}
                          </Badge>
                        )}
                        {item.intent_code && (
                          <Badge variant="outline" className="text-[10px]">
                            {getLabelName(item.intent_code, "intent")}
                          </Badge>
                        )}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <MapPin className="w-3 h-3" />
                        <span>{item.start_port || "?"}</span>
                        <ChevronRight className="w-3 h-3" />
                        <span>{item.end_port || "?"}</span>
                      </div>
                    </div>
                    {!item.behavior_code && (
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        onClick={(e) => { e.stopPropagation(); handleLabel(item); }}
                        disabled={labeling}
                        className="shrink-0"
                      >
                        <Sparkles className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* 详情预览 */}
        <TabsContent value="detail" className="mt-0">
          {selected ? (
            <div className="space-y-3">
              {/* 基本信息 */}
              <Card>
                <CardHeader className="p-3">
                  <CardTitle className="text-sm">基本信息</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-2">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div><span className="text-muted-foreground">MMSI:</span> {selected.mmsi || "-"}</div>
                    <div><span className="text-muted-foreground">起点:</span> {selected.start_port || "-"}</div>
                    <div><span className="text-muted-foreground">终点:</span> {selected.end_port || "-"}</div>
                  </div>
                  {selected.ai_description && (
                    <div className="text-sm text-muted-foreground mt-2">
                      {selected.ai_description}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 航线预览 */}
              <Card>
                <CardHeader className="p-3">
                  <CardTitle className="text-sm">航线预览</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0">
                  {renderTrajectoryPreview(selected.geometry_wkt) || (
                    <div className="h-20 flex items-center justify-center text-sm text-muted-foreground border rounded bg-slate-50">
                      无航线数据
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* 标注结果 */}
              <Card>
                <CardHeader className="p-3">
                  <CardTitle className="text-sm">标注结果</CardTitle>
                </CardHeader>
                <CardContent className="p-3 pt-0 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">行为标签</div>
                      <Select
                        value={selected.behavior_code || ""}
                        onValueChange={async (v) => {
                          const res = await fetch("/api/trajectory/label", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "save", id: selected.id, behaviorCode: v, intentCode: selected.intent_code })
                          });
                          if (res.ok) {
                            setSelected({ ...selected, behavior_code: v });
                            fetchItems();
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="选择行为" />
                        </SelectTrigger>
                        <SelectContent>
                          {labels.behaviors.map(l => (
                            <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground mb-1">意图标签</div>
                      <Select
                        value={selected.intent_code || ""}
                        onValueChange={async (v) => {
                          const res = await fetch("/api/trajectory/label", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ action: "save", id: selected.id, behaviorCode: selected.behavior_code, intentCode: v })
                          });
                          if (res.ok) {
                            setSelected({ ...selected, intent_code: v });
                            fetchItems();
                          }
                        }}
                      >
                        <SelectTrigger className="h-8 text-sm">
                          <SelectValue placeholder="选择意图" />
                        </SelectTrigger>
                        <SelectContent>
                          {labels.intents.map(l => (
                            <SelectItem key={l.code} value={l.code}>{l.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {selected.label_reasoning && (
                    <div className="text-xs text-muted-foreground p-2 bg-slate-50 rounded">
                      {selected.label_reasoning}
                    </div>
                  )}

                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      onClick={() => handleLabel(selected)} 
                      disabled={labeling}
                      className="flex-1"
                    >
                      <Sparkles className="w-3 h-3 mr-1" />
                      智能标注
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          ) : (
            <div className="text-center py-12 text-sm text-muted-foreground">
              请从列表选择一条航迹
            </div>
          )}
        </TabsContent>

        {/* 标签管理 */}
        <TabsContent value="labels" className="mt-0">
          <div className="space-y-3">
            <Card>
              <CardHeader className="p-3">
                <CardTitle className="text-sm">行为标签 ({labels.behaviors.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="grid grid-cols-2 gap-2">
                  {labels.behaviors.map(l => (
                    <div key={l.code} className="p-2 bg-slate-50 rounded text-xs">
                      <div className="font-medium">{l.name}</div>
                      <div className="text-muted-foreground mt-0.5">{l.description}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="p-3">
                <CardTitle className="text-sm">意图标签 ({labels.intents.length})</CardTitle>
              </CardHeader>
              <CardContent className="p-3 pt-0">
                <div className="grid grid-cols-2 gap-2">
                  {labels.intents.map(l => (
                    <div key={l.code} className="p-2 bg-slate-50 rounded text-xs">
                      <div className="font-medium">{l.name}</div>
                      <div className="text-muted-foreground mt-0.5">{l.description}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
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
    </div>
  );
}
