'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { DataMaintainPanel } from '@/components/data-maintain-panel';
import {
  Upload, Search, MessageSquare, FileText, Image, FileSpreadsheet,
  Loader2, Send, Play, Pause, X, ChevronLeft, ChevronRight,
  Eye, Settings, Download, Database, BarChart3, Map, GitBranch,
  Brain, Tag, TrendingUp, Cog, Layers, LayoutDashboard
} from 'lucide-react';
import dynamic from 'next/dynamic';

const SeaMapComponent = dynamic(() => import('@/app/sea-chart/SeaMap'), {
  ssr: false,
  loading: () => <div className="h-full w-full flex items-center justify-center bg-gray-100"><div className="text-gray-500">加载地图中...</div></div>,
});

function SeaChartEmbed() {
  const [ports, setPorts] = useState<{id:string; name:string; lat:number; lng:number}[]>([]);
  const [routes, setRoutes] = useState<{id:string; coordinates:[number,number][]}[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const [pr, rr] = await Promise.all([
          fetch('/api/data-maintain?action=list&type=port&limit=10000').then(r=>r.json()),
          fetch('/api/data-maintain?action=list&type=route&limit=10000').then(r=>r.json()),
        ]);
        if (pr.success && pr.data) {
          setPorts(pr.data.filter((p:{lat:number,lon:number})=>p.lat&&p.lon).map((p:{port_code:string,name_cn:string,lat:number,lon:number})=>({id:p.port_code,name:p.name_cn,lat:p.lat,lng:p.lon})));
        }
        if (rr.success && rr.data) {
          setRoutes(rr.data.filter((r:{geometry_wkt:string})=>r.geometry_wkt).map((r:{route_code:string,geometry_wkt:string})=>{try{const m=r.geometry_wkt.match(/LINESTRING\s*\((.*)\)/i);if(m)return{id:r.route_code,coordinates:m[1].split(',').map(p=>{const[lng,lat]=p.trim().split(/\s+/).map(Number);return[lng,lat] as [number,number]})}}catch{}return null}).filter(Boolean));
        }
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="h-full w-full flex items-center justify-center bg-gray-100"><div className="text-gray-500">加载数据中...</div></div>;

  return <SeaMapComponent mapCenter={[20,110]} mapZoom={3} showSeaMap={true} showPorts={true} showTrack={false} showTrajectories={true} allPorts={ports} selectedCountries={['CN','US','OTHER']} mockTrack={[]} customTrack={[]} trajectories={routes.map(r=>({id:r.id,segment_id:r.id,start_port:null,end_port:null,wkt_route:null,sea_area:null,ai_description:null,coordinates:r.coordinates}))} selectedTrajectory={null} onMapClick={()=>{}} />;
}

type Modality = 'text'|'image'|'excel'|'doc'|'md'|'json'|'trajectory'|'port'|'regulation';
const modalityIcons:Record<Modality,React.ReactNode>={text:<FileText className="w-4 h-4"/>,image:<Image className="w-4 h-4"/>,excel:<FileSpreadsheet className="w-4 h-4"/>,doc:<FileText className="w-4 h-4"/>,md:<FileText className="w-4 h-4"/>,json:<FileText className="w-4 h-4"/>,trajectory:<FileSpreadsheet className="w-4 h-4"/>,port:<FileText className="w-4 h-4"/>,regulation:<FileText className="w-4 h-4"/>};
const modalityLabels:Record<Modality,string>={text:'文本',image:'图片',excel:'Excel',doc:'文档',md:'MD',json:'JSON',trajectory:'航迹',port:'港口',regulation:'规章制度'};

interface KnowledgeItem { id:string; modality:string; title:string; content:string; source:string; similarity?:number; status:'embedded'|'pending'; metadata?:Record<string,unknown>; storage_url?:string; table?:string }
interface Pagination { page:number; pageSize:number; totalCount:number; totalPages:number; hasMore:boolean }

// ========== 子功能卡片定义 ==========
interface FuncCard { name:string; desc:string; icon:React.ReactNode; color:string; action:()=>void }

export default function RagPage() {
  const [showHome, setShowHome] = useState(true);
  const [activeTab, setActiveTab] = useState('rag');

  // Upload state
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{success:boolean;filename?:string;itemCount?:number;error?:string}|null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [urlInput, setUrlInput] = useState('');

  // Embed state
  const [embedStatus, setEmbedStatus] = useState<{total:number;embedded:number;pending:number}|null>(null);
  const [embedding, setEmbedding] = useState(false);
  const [autoEmbedding, setAutoEmbedding] = useState(false);
  const autoEmbeddingRef = useRef(false);
  const [embedProgress, setEmbedProgress] = useState({processed:0,failed:0});
  const [embedMsg, setEmbedMsg] = useState('');
  const [expandedSection, setExpandedSection] = useState<string|null>(null);
  const [detailItems, setDetailItems] = useState<KnowledgeItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);

  // Search state
  const [searchQuery, setSearchQuery] = useState('');
  const [searchModality, setSearchModality] = useState('');
  const [searchMode, setSearchMode] = useState<'fuzzy'|'exact'>('fuzzy');
  const [searchTag, setSearchTag] = useState('');
  const [availableTags, setAvailableTags] = useState<{name:string;count:number}[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<KnowledgeItem[]>([]);
  const [searchPagination, setSearchPagination] = useState<Pagination|null>(null);
  const [searchPage, setSearchPage] = useState(1);
  const [previewItem, setPreviewItem] = useState<KnowledgeItem|null>(null);

  // RAG state
  const [ragQuery, setRagQuery] = useState('');
  const [ragAnswer, setRagAnswer] = useState('');
  const [ragSources, setRagSources] = useState<{title?:string;content?:string;source?:string}[]>([]);
  const [ragLoading, setRagLoading] = useState(false);
  const [ragTokenLimit, setRagTokenLimit] = useState(50000);
  const [ragSessionId] = useState(()=>`session_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  const [showSourceDialog, setShowSourceDialog] = useState(false);

  const fetchEmbedStatus = useCallback(async () => {
    try { const d=await(await fetch('/api/embed')).json(); setEmbedStatus({total:d.total||0,embedded:d.embedded||0,pending:d.pending||0}); } catch {}
  }, []);
  useEffect(()=>{fetchEmbedStatus();fetchAvailableTags();const i=setInterval(fetchEmbedStatus,5000);return ()=>clearInterval(i);},[fetchEmbedStatus]);
  const fetchAvailableTags = async () => {
    try { const d=await(await fetch('/api/search?action=tags')).json(); if(d.success) setAvailableTags(d.tags||[]); } catch {}
  };

  // ========== 上传 / 向量化 / 搜索 / RAG (keep existing logic) ==========
  const handleUpload = async () => {
    const fi = fileInputRef.current; if(!fi?.files?.length) return;
    const fd = new FormData(); fd.append('file',fi.files[0]);
    setUploading(true); setUploadResult(null);
    try { const d=await(await fetch('/api/upload',{method:'POST',body:fd})).json(); setUploadResult(d); if(d.success) fetchEmbedStatus(); } catch { setUploadResult({success:false,error:'上传失败'}); } finally { setUploading(false); }
  };
  const handleUrlUpload = async () => {
    if(!urlInput.trim()) return; setUploading(true); setUploadResult(null);
    try { const d=await(await fetch('/api/upload',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:urlInput.trim()})})).json(); setUploadResult({success:d.success,filename:d.title||urlInput,itemCount:d.itemCount||0,error:d.error}); if(d.success) { setUrlInput(''); fetchEmbedStatus(); } } catch { setUploadResult({success:false,error:'网页解析失败'}); } finally { setUploading(false); }
  };
  const handleEmbed = async () => { setEmbedding(true); try { const d=await(await fetch('/api/embed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({batchSize:50})})).json(); fetchEmbedStatus(); setEmbedMsg(`处理完成: ${d.processed||0} 条成功${d.failed>0?`，${d.failed} 条失败`:''}`); } catch { setEmbedMsg('❌ 向量化请求失败'); } finally { setEmbedding(false); } };
  const toggleAutoEmbed = async () => {
    if(autoEmbedding) { autoEmbeddingRef.current=false; setAutoEmbedding(false); if(embedStatus&&embedStatus.pending>0&&confirm(`是否删除剩余 ${embedStatus.pending} 条待向量化的条目？`)) { try { const d=await(await fetch('/api/embed',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({clearAll:true})})).json(); alert(`已删除 ${d.deleted} 条待处理条目`); fetchEmbedStatus(); } catch {} } return; }
    autoEmbeddingRef.current=true; setAutoEmbedding(true); setEmbedProgress({processed:0,failed:0});
    while(autoEmbeddingRef.current) { try { const d=await(await fetch('/api/embed',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({batchSize:50})})).json(); setEmbedProgress(p=>({processed:p.processed+(d.processed||0),failed:p.failed+(d.failed||0)})); if(d.processed===0||d.pending===0) { autoEmbeddingRef.current=false; setAutoEmbedding(false); break; } await fetchEmbedStatus(); await new Promise(r=>setTimeout(r,1000)); } catch { autoEmbeddingRef.current=false; setAutoEmbedding(false); break; } }
  };
  const fetchDetailItems=async(type:'embedded'|'pending'|'all')=>{setDetailLoading(true);try{const d=await(await fetch(`/api/search?type=${type}&limit=20`)).json();setDetailItems(d.items||[])}finally{setDetailLoading(false)}};
  const toggleSection=(s:string)=>{if(expandedSection===s)setExpandedSection(null);else{setExpandedSection(s);fetchDetailItems(s as 'embedded'|'pending'|'all')}};
  const handleCancelAll=async()=>{if(!confirm('确定要删除所有待向量化的条目吗？\n\n注意：已向量化的数据不会被删除。'))return;try{const d=await(await fetch('/api/embed',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({clearAll:true})})).json();if(d.success){alert(`✅ 成功删除 ${d.deleted} 条待向量化条目`);await fetchEmbedStatus();if(expandedSection==='pending')await fetchDetailItems('pending')}else{alert(`❌ 删除失败: ${d.error||'未知错误'}`)}}catch(e){alert('取消失败')}};
  const handleCancelSingle=async(id:string)=>{if(!confirm('确定要取消该条目的向量化吗？'))return;try{const d=await(await fetch('/api/embed',{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({singleId:id})})).json();if(d.success){await fetchEmbedStatus();if(expandedSection==='pending')await fetchDetailItems('pending')}else{alert(`取消失败: ${d.error||'未知错误'}`)}}catch{}};
  const handleSearch=async(page:number=1)=>{if(!searchQuery.trim()&&!searchTag)return;setSearching(true);setSearchPage(page);try{const filter:Record<string,string>={};if(searchModality)filter.modality=searchModality;if(searchTag)filter.tags=searchTag;const d=await(await fetch('/api/search',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:searchQuery||searchTag,topK:500,threshold:0.3,mode:searchMode,filter:Object.keys(filter).length>0?filter:undefined,page,pageSize:10})})).json();setSearchResults(d.results||[]);setSearchPagination(d.pagination||null)}finally{setSearching(false)}};
  const handleRagQuery=async(opts?:{lockContext?:boolean;clearContext?:boolean;responseMode?:'brief'|'detailed';commandType?:string})=>{if(!ragQuery.trim())return;setRagLoading(true);setRagAnswer('');setRagSources([]);try{const d=await(await fetch('/api/rag',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:ragQuery,topK:Math.floor(ragTokenLimit/200),noLimit:true,sessionId:ragSessionId,...opts,stream:false})})).json();if(d.success){setRagAnswer(d.answer||'');setRagSources(d.sources||[])}else{setRagAnswer(d.error||'请求失败')}}catch{setRagAnswer('请求出错，请重试')}finally{setRagLoading(false)}};
  const getImageDescription=(item:KnowledgeItem):string=>{if(item.metadata?.description)return item.metadata.description as string;if(item.content&&item.content.length>0)return item.content.substring(0,150);return'图片已向量化，暂无描述'};

  // ========== 子功能卡片数据 ==========
  const nav = (url:string) => () => { window.location.href = url; };
  const tab = (t:string) => () => { setShowHome(false); setActiveTab(t); };

  const funcGroups:{title:string;icon:React.ReactNode;cards:FuncCard[]}[] = [
    {
      title:'核心功能', icon:<Layers className="w-3 h-3"/>,
      cards:[
        {name:'智能问答',desc:'',icon:<MessageSquare className="w-3 h-3"/>,color:'text-green-600 bg-green-100',action:tab('rag')},
        {name:'知识检索',desc:'',icon:<Search className="w-3 h-3"/>,color:'text-purple-600 bg-purple-100',action:tab('search')},
        {name:'海图显示',desc:'',icon:<Map className="w-3 h-3"/>,color:'text-cyan-600 bg-cyan-100',action:tab('sea-chart')},
      ]
    },
    {
      title:'知识管理', icon:<FileText className="w-3 h-3"/>,
      cards:[
        {name:'知识管理',desc:'',icon:<Database className="w-3 h-3"/>,color:'text-sky-600 bg-sky-100',action:nav('/manage')},
        {name:'日志看板',desc:'',icon:<BarChart3 className="w-3 h-3"/>,color:'text-indigo-600 bg-indigo-100',action:nav('/dashboard')},
      ]
    },
    {
      title:'航迹处理', icon:<GitBranch className="w-3 h-3"/>,
      cards:[
        {name:'航迹检索',desc:'',icon:<Search className="w-3 h-3"/>,color:'text-teal-600 bg-teal-100',action:nav('/trajectory')},
        {name:'航迹导入',desc:'',icon:<Upload className="w-3 h-3"/>,color:'text-lime-600 bg-lime-100',action:nav('/trajectory/upload')},
        {name:'航迹标注',desc:'',icon:<Tag className="w-3 h-3"/>,color:'text-pink-600 bg-pink-100',action:nav('/segment-label')},
        {name:'航迹训练',desc:'',icon:<Brain className="w-3 h-3"/>,color:'text-rose-600 bg-rose-100',action:nav('/trajectory-training')},
        {name:'航迹推理',desc:'',icon:<TrendingUp className="w-3 h-3"/>,color:'text-fuchsia-600 bg-fuchsia-100',action:nav('/trajectory-inference')},
      ]
    },
    {
      title:'系统管理', icon:<Cog className="w-3 h-3"/>,
      cards:[
        {name:'文件上传',desc:'',icon:<Upload className="w-3 h-3"/>,color:'text-blue-600 bg-blue-100',action:tab('upload')},
        {name:'数据维护',desc:'',icon:<Database className="w-3 h-3"/>,color:'text-amber-600 bg-amber-100',action:tab('maintain')},
        {name:'系统设置',desc:'',icon:<Settings className="w-3 h-3"/>,color:'text-gray-600 bg-gray-100',action:nav('/settings')},
        {name:'海图展示',desc:'',icon:<Map className="w-3 h-3"/>,color:'text-emerald-600 bg-emerald-100',action:nav('/sea-chart')},
        {name:'流程设计',desc:'',icon:<GitBranch className="w-3 h-3"/>,color:'text-orange-600 bg-orange-100',action:nav('/workflow')},
        {name:'流程管理',desc:'',icon:<Layers className="w-3 h-3"/>,color:'text-red-600 bg-red-100',action:nav('/workflow/manage')},
        {name:'流程编辑',desc:'',icon:<Settings className="w-3 h-3"/>,color:'text-violet-600 bg-violet-100',action:nav('/workflow/edit')},
      ]
    },
  ];

  const totalFuncs = funcGroups.reduce((s,g)=>s+g.cards.length,0);

  // ========== RENDER ==========
  return (
    <div className="min-h-screen bg-background">
      {showHome ? (
        /* ===== 首页：所有功能分组展示 ===== */
        <div className="max-w-5xl mx-auto p-3 sm:p-4">
          <div className="mb-4">
            <a href="/" className="hover:opacity-80 transition-opacity"><h1 className="text-2xl sm:text-3xl font-bold tracking-tight">ShipRag</h1></a>
            <p className="text-muted-foreground text-sm mt-1">{totalFuncs} 个子功能 · 4 个分组</p>
          </div>

          {funcGroups.map((group, gi) => (
            <div key={gi} className="mb-4">
              <h2 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-1.5">
                {group.icon}
                {group.title}
                <span className="font-normal text-xs lowercase">({group.cards.length})</span>
              </h2>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-1.5">
                {group.cards.map((card, ci) => (
                  <Card key={ci} className="cursor-pointer hover:shadow-sm transition-all active:scale-[0.97]" onClick={card.action}>
                    <CardContent className="p-1 flex flex-col items-center text-center gap-0.5">
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center ${card.color}`}>
                        {card.icon}
                      </div>
                      <h3 className="font-medium text-xs leading-tight">{card.name}</h3>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </div>
          ))}

          {/* 统计概览 */}
          {embedStatus && (
            <div className="mt-4 grid grid-cols-3 gap-3">
              <div className="p-3 bg-muted rounded-lg text-center">
                <div className="text-xl font-bold">{embedStatus.total}</div>
                <div className="text-xs text-muted-foreground">知识条目</div>
              </div>
              <div className="p-3 bg-green-100 rounded-lg text-center">
                <div className="text-xl font-bold text-green-700">{embedStatus.embedded}</div>
                <div className="text-xs text-green-600">已向量化</div>
              </div>
              <div className="p-3 bg-yellow-100 rounded-lg text-center">
                <div className="text-xl font-bold text-yellow-700">{embedStatus.pending}</div>
                <div className="text-xs text-yellow-600">待处理</div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* ===== 内嵌 Tab 页面 (同之前) ===== */
        <div className="max-w-4xl mx-auto p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <a href="/" className="hover:opacity-80 transition-opacity"><h1 className="text-lg sm:text-xl font-bold">
              ShipRag{` › ${activeTab==='rag'?'智能问答':activeTab==='search'?'知识检索':activeTab==='upload'?'文件上传':activeTab==='maintain'?'数据维护':'海图显示'}`}
            </h1></a>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">

            {/* Upload tab */}
            <TabsContent value="upload">
              <Card><CardHeader className="pb-3"><CardTitle className="text-base">文件上传</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="border-2 border-dashed rounded-lg p-4 text-center">
                    <input type="file" ref={fileInputRef} onChange={handleUpload} accept=".txt,.md,.json,.xlsx,.xls,.csv,.docx,.pdf,.pptx,.jpg,.jpeg,.png,.gif,.webp,.mp3,.wav,.m4a" className="hidden"/>
                    <Button onClick={()=>fileInputRef.current?.click()} disabled={uploading} className="w-full h-10 text-sm">{uploading?<><Loader2 className="w-4 h-4 mr-2 animate-spin"/>上传中...</>:<><Upload className="w-4 h-4 mr-2"/>选择文件</>}</Button>
                    <p className="text-xs text-muted-foreground mt-1">支持 Excel、Word、PDF、PPT、图片、音频、JSON、MD</p>
                  </div>
                  <div className="space-y-2"><Label className="text-sm">或输入网页链接</Label><div className="flex gap-2"><Input placeholder="https://example.com/article" value={urlInput} onChange={e=>setUrlInput(e.target.value)} className="flex-1 text-sm h-9"/><Button onClick={handleUrlUpload} disabled={uploading||!urlInput.trim()} size="sm" className="h-9">{uploading?<Loader2 className="w-4 h-4 animate-spin"/>:'解析'}</Button></div></div>
                  {uploadResult&&<div className={`p-3 rounded-lg text-sm ${uploadResult.success?'bg-green-100 text-green-800':'bg-red-100 text-red-800'}`}>{uploadResult.success?`✅ ${uploadResult.filename} - ${uploadResult.itemCount} 条`:`❌ ${uploadResult.error}`}</div>}
                  {embedStatus&&<div className="grid grid-cols-3 gap-2"><button onClick={()=>toggleSection('all')} className="p-3 bg-muted rounded-lg text-center"><div className="text-2xl font-bold">{embedStatus.total}</div><div className="text-xs text-muted-foreground">知识条目</div></button><button onClick={()=>toggleSection('embedded')} className="p-3 bg-green-100 rounded-lg text-center"><div className="text-2xl font-bold text-green-700">{embedStatus.embedded}</div><div className="text-xs text-green-600">已向量化</div></button><button onClick={()=>toggleSection('pending')} className="p-3 bg-yellow-100 rounded-lg text-center"><div className="text-2xl font-bold text-yellow-700">{embedStatus.pending}</div><div className="text-xs text-yellow-600">待处理</div></button></div>}
                  {embedMsg&&<div className={embedMsg.startsWith('❌')?'p-2 rounded text-xs bg-red-100 text-red-700':'p-2 rounded text-xs bg-green-100 text-green-700'}>{embedMsg}</div>}{autoEmbedding&&<div className="space-y-2"><Progress value={(embedProgress.processed/(embedStatus?.total||1))*100}/><p className="text-xs text-center text-muted-foreground">已处理 {embedProgress.processed} 条，失败 {embedProgress.failed} 条</p></div>}
                  {expandedSection&&<div className="border rounded-lg p-3 max-h-60 overflow-y-auto space-y-2"><div className="flex justify-between items-center"><span className="text-sm font-medium">{expandedSection==='all'?'全部':expandedSection==='embedded'?'已向量化':'待处理'}</span><Button variant="ghost" size="sm" onClick={()=>setExpandedSection(null)}><X className="w-4 h-4"/></Button></div>{detailLoading?<div className="text-center py-4"><Loader2 className="w-5 h-5 animate-spin mx-auto"/></div>:detailItems.slice(0,10).map(item=><div key={item.id} className="text-xs p-2 bg-muted rounded flex justify-between"><span className="truncate flex-1">{item.title}</span><Badge variant="outline" className="ml-2 text-xs">{modalityLabels[item.modality as Modality]||item.modality}</Badge></div>)}</div>}
                  {embedding&&<div className="p-2 bg-blue-50 rounded text-xs text-blue-700"><Loader2 className="w-3 h-3 inline animate-spin mr-1"/>正在执行向量化...</div>}{embedStatus&&embedStatus.pending>0&&<div className="space-y-2"><Button onClick={toggleAutoEmbed} disabled={embedding} className="w-full h-11" variant={autoEmbedding?"destructive":"default"}>{autoEmbedding?<><Pause className="w-4 h-4 mr-2"/>停止向量化</>:<><Play className="w-4 h-4 mr-2"/>自动向量化 ({embedStatus.pending} 条)</>}</Button><div className="grid grid-cols-2 gap-2"><Button onClick={handleEmbed} disabled={embedding||autoEmbedding} variant="outline" className="h-10">{embedding?<><Loader2 className="w-4 h-4 mr-1 animate-spin"/>处理中</>:<>单次处理</>}</Button><Button onClick={handleCancelAll} variant="destructive" disabled={autoEmbedding} className="h-10">全部取消</Button></div></div>}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Search tab */}
            <TabsContent value="search">
              <Card><CardHeader className="pb-3"><CardTitle className="text-base">智能检索</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <Input placeholder="输入检索内容..." value={searchQuery} onChange={e=>setSearchQuery(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleSearch(1)} className="h-11 text-base"/>
                  <div className="grid grid-cols-2 gap-2"><select className="h-10 px-3 border rounded-md text-sm" value={searchMode} onChange={e=>setSearchMode(e.target.value as 'fuzzy'|'exact')}><option value="fuzzy">🔍 模糊搜索</option><option value="exact">🎯 精确搜索</option></select><select className="h-10 px-3 border rounded-md text-sm" value={searchModality} onChange={e=>setSearchModality(e.target.value)}><option value="">全部类型</option><option value="excel">Excel</option><option value="text">文本</option><option value="doc">文档</option><option value="image">图片</option></select></div>
                  <select className="h-10 px-3 border rounded-md text-sm w-full" value={searchTag} onChange={e=>{setSearchTag(e.target.value);if(e.target.value)handleSearch(1)}}><option value="">全部标签</option>{availableTags.slice(0,20).map(t=><option key={t.name} value={t.name}>🏷️ {t.name} ({t.count})</option>)}</select>
                  <Button onClick={()=>handleSearch(1)} disabled={searching} className="w-full h-11">{searching?<><Loader2 className="w-4 h-4 mr-2 animate-spin"/>搜索中...</>:<><Search className="w-4 h-4 mr-2"/>搜索</>}</Button>
                  {searchPagination&&searchPagination.totalCount>0&&<div className="flex justify-between items-center text-sm text-muted-foreground px-1"><span>共 {searchPagination.totalCount} 条结果</span><span>第 {searchPagination.page}/{searchPagination.totalPages} 页</span></div>}
                  <div className="space-y-2">{searchResults.map((result,index)=><div key={result.id||index} className="p-2 bg-muted rounded-lg cursor-pointer hover:bg-muted/80" onClick={()=>setPreviewItem(result)}><div className="flex gap-2">{result.modality==='image'&&result.metadata&&('imageUrl' in result.metadata||'storageUrl' in result.metadata)&&<img src={(result.metadata.imageUrl||result.metadata.storageUrl) as string} alt={result.title} className="w-16 h-16 object-cover rounded border shrink-0"/>}<div className="flex-1 min-w-0"><div className="flex items-center gap-1 mb-1"><Badge variant="outline" className="text-xs shrink-0">{modalityLabels[result.modality as Modality]||result.modality}</Badge><span className="font-medium text-xs truncate">{result.modality==='regulation'?result.source:result.title}</span>{result.similarity!==undefined&&<span className="text-xs text-green-600 font-bold ml-auto shrink-0">{(result.similarity*100).toFixed(0)}%</span>}<Eye className="w-3 h-3 text-muted-foreground shrink-0"/></div>{result.modality==='image'?<p className="text-xs text-blue-600 line-clamp-2">📷 {getImageDescription(result)||'暂无描述'}</p>:result.modality==='excel'?<p className="text-xs text-muted-foreground line-clamp-2">📊 {result.content?.substring(0,100)}</p>:<p className="text-xs text-muted-foreground line-clamp-2">{result.content?.substring(0,100)}</p>}</div></div></div>)}</div>
                  {searchPagination&&searchPagination.totalPages>1&&<div className="flex justify-center gap-2"><Button variant="outline" size="sm" disabled={searchPage<=1||searching} onClick={()=>handleSearch(searchPage-1)}><ChevronLeft className="w-4 h-4"/></Button><span className="flex items-center px-3 text-sm">{searchPage}/{searchPagination.totalPages}</span><Button variant="outline" size="sm" disabled={!searchPagination.hasMore||searching} onClick={()=>handleSearch(searchPage+1)}><ChevronRight className="w-4 h-4"/></Button></div>}
                </CardContent>
              </Card>
            </TabsContent>

            {/* RAG tab */}
            <TabsContent value="rag">
              <Card><CardHeader className="pb-3"><CardTitle className="text-base">RAG 智能问答</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center gap-2 p-2 bg-muted rounded-lg"><Settings className="w-4 h-4 text-muted-foreground"/><span className="text-xs text-muted-foreground">Token上限:</span><input type="range" min="10000" max="100000" step="5000" value={ragTokenLimit} onChange={e=>setRagTokenLimit(Number(e.target.value))} className="flex-1 h-2"/><span className="text-xs font-medium w-16 text-right">{(ragTokenLimit/1000).toFixed(0)}K</span></div>
                  <Textarea placeholder="输入您的问题..." value={ragQuery} onChange={e=>setRagQuery(e.target.value)} rows={2} className="text-base"/>
                  <div className="grid grid-cols-3 gap-2"><Button variant="outline" size="sm" onClick={()=>handleRagQuery({clearContext:true})} disabled={ragLoading} className="text-xs h-8">清空上下文</Button><Button variant="outline" size="sm" onClick={()=>handleRagQuery({lockContext:true})} disabled={ragLoading} className="text-xs h-8">锁定上下文</Button><Button variant="outline" size="sm" onClick={()=>handleRagQuery({responseMode:'brief'})} disabled={ragLoading} className="text-xs h-8">精简回答</Button></div>
                  <div className="grid grid-cols-3 gap-2"><Button variant="outline" size="sm" onClick={()=>handleRagQuery({responseMode:'detailed'})} disabled={ragLoading} className="text-xs h-8">详细回答</Button><Button variant="outline" size="sm" onClick={()=>handleRagQuery({commandType:'chart_annotation'})} disabled={ragLoading} className="text-xs h-8">查询海图标注</Button><Button variant="outline" size="sm" onClick={()=>handleRagQuery({commandType:'channel_regulation'})} disabled={ragLoading} className="text-xs h-8">航道通航规范</Button></div>
                  <Button onClick={()=>handleRagQuery()} disabled={ragLoading} className="w-full h-11">{ragLoading?<><Loader2 className="w-4 h-4 mr-2 animate-spin"/>思考中...</>:<><Send className="w-4 h-4 mr-2"/>提问</>}</Button>
                </CardContent>
              </Card>
              {ragAnswer&&<div className="p-3 bg-muted rounded-lg mt-3"><div className="flex items-start gap-2"><MessageSquare className="w-4 h-4 mt-1 text-primary shrink-0"/><div className="flex-1 whitespace-pre-wrap text-sm">{ragAnswer}</div></div><div className="flex items-center gap-2 mt-3 pt-3 border-t border-border"><Button variant="outline" size="sm" onClick={()=>{const c=`问题：${ragQuery}\n\n回答：\n${ragAnswer}\n\n来源：\n${ragSources.map(s=>`- ${s.title||'未知来源'}`).join('\n')}`;const b=new Blob([c],{type:'text/plain;charset=utf-8'});const u=URL.createObjectURL(b);const a=document.createElement('a');a.href=u;a.download=`海图问答_${new Date().toISOString().slice(0,10)}.txt`;a.click();URL.revokeObjectURL(u)}} className="text-xs h-7"><Download className="w-3 h-3 mr-1"/>导出回答</Button>{ragSources.length>0&&<Button variant="outline" size="sm" onClick={()=>setShowSourceDialog(true)} className="text-xs h-7"><FileText className="w-3 h-3 mr-1"/>查看来源({ragSources.length})</Button>}</div></div>}
            </TabsContent>

            {/* Maintain tab */}
            <TabsContent value="maintain">
              <Card><CardHeader className="pb-3"><CardTitle className="text-base">数据维护</CardTitle></CardHeader><CardContent><DataMaintainPanel/></CardContent></Card>
            </TabsContent>

            {/* Sea-chart tab */}
            <TabsContent value="sea-chart">
              <Card><CardHeader className="pb-3"><CardTitle className="text-base">海图显示</CardTitle></CardHeader><CardContent><div className="h-[600px] w-full rounded-lg overflow-hidden border"><SeaChartEmbed/></div></CardContent></Card>
            </TabsContent>
          </Tabs>
        </div>
      )}

      {/* ===== Preview modal (shared) ===== */}
      {previewItem&&<div className="fixed inset-0 bg-black/50 flex items-center justify-center p-2 z-50" onClick={()=>setPreviewItem(null)}><div className="bg-background rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e=>e.stopPropagation()}><div className="p-3 border-b flex justify-between items-center sticky top-0 bg-background"><div className="flex items-center gap-2"><Badge variant="outline">{modalityLabels[previewItem.modality as Modality]||previewItem.modality}</Badge><span className="font-medium text-sm">{previewItem.modality==='regulation'?previewItem.source:previewItem.title}</span></div><Button variant="ghost" size="sm" onClick={()=>setPreviewItem(null)}><X className="w-4 h-4"/></Button></div><div className="p-3 space-y-3">{previewItem.modality==='image'&&<div className="space-y-2">{previewItem.metadata&&('imageUrl' in previewItem.metadata||'storageUrl' in previewItem.metadata)&&<img src={(previewItem.metadata.imageUrl||previewItem.metadata.storageUrl) as string} alt={previewItem.title} className="w-full max-h-64 object-contain rounded-lg border"/>}<div className="p-2 bg-blue-50 rounded-lg"><p className="text-xs text-blue-800 font-medium mb-1">图片描述</p><p className="text-sm text-blue-700">{getImageDescription(previewItem)}</p></div></div>}{previewItem.modality==='excel'&&<div className="overflow-x-auto"><table className="w-full text-xs border-collapse"><tbody>{previewItem.content.split(', ').map((f,i)=>{const[k,v]=f.split(': ');return<tr key={i} className={i%2===0?'bg-muted/50':''}><td className="border px-2 py-1 font-medium w-1/3">{k}</td><td className="border px-2 py-1">{v}</td></tr>})}</tbody></table></div>}{previewItem.modality!=='image'&&previewItem.modality!=='excel'&&<div className="p-2 bg-muted rounded-lg"><p className="text-xs font-medium mb-1">摘要</p><p className="text-sm whitespace-pre-wrap break-all">{previewItem.content}</p></div>}<div className="flex justify-between text-xs text-muted-foreground pt-2 border-t"><span>来源: {previewItem.source}</span>{previewItem.similarity!==undefined&&<span className="text-green-600 font-medium">相似度: {(previewItem.similarity*100).toFixed(1)}%</span>}</div></div></div></div>}

      {/* ===== Source dialog (shared) ===== */}
      {showSourceDialog&&<div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={()=>setShowSourceDialog(false)}><div className="bg-background rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden" onClick={e=>e.stopPropagation()}><div className="p-3 border-b flex items-center justify-between"><h3 className="font-semibold text-sm">📚 引用来源</h3><Button variant="ghost" size="sm" onClick={()=>setShowSourceDialog(false)} className="h-7 w-7 p-0"><X className="w-4 h-4"/></Button></div><div className="p-3 overflow-y-auto max-h-[calc(80vh-60px)]">{ragSources.map((source,idx)=><div key={idx} className="p-3 bg-muted rounded-lg mb-2 last:mb-0"><div className="flex items-center gap-2 mb-2"><FileText className="w-4 h-4 text-primary"/><span className="font-medium text-sm">{source.title||`来源 ${idx+1}`}</span></div><div className="text-xs text-muted-foreground bg-background p-2 rounded border max-h-32 overflow-y-auto">{source.content?source.content.substring(0,500)+(source.content.length>500?'...':''):'无内容'}</div>{source.source&&<div className="text-[10px] text-muted-foreground mt-1">文件: {source.source}</div>}</div>)}</div></div></div>}
    </div>
  );
}
