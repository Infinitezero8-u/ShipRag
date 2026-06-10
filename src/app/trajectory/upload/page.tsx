'use client';

import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Upload, Loader2, FileSpreadsheet, CheckCircle, AlertCircle } from 'lucide-react';

export default function TrajectoryUploadPage() {
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<{
    success?: boolean;
    count?: number;
    message?: string;
    error?: string;
    trajectories?: any[];
  } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleUpload = async () => {
    const fileInput = fileInputRef.current;
    if (!fileInput?.files?.length) return;

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);

    setUploading(true);
    setResult(null);

    try {
      const res = await fetch('/api/trajectory', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      setResult(data);
    } catch (error) {
      setResult({ success: false, error: '上传失败' });
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-2xl mx-auto">
        {/* 顶部导航 */}
        <div className="flex items-center gap-4 mb-6">
          <a href="/" className="text-blue-600 hover:underline text-sm">← 返回</a>
          <a href="/" className="hover:opacity-80 transition-opacity"><h1 className="text-lg font-medium">🚢 航迹导入</h1></a>
        </div>

        {/* 上传表单 */}
        <Card className="mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-base">上传航迹文件</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* 文件选择 */}
            <div className="flex gap-2">
              <input
                type="file"
                ref={fileInputRef}
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={() => setResult(null)}
              />
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="flex-1"
              >
                <FileSpreadsheet className="w-4 h-4 mr-2" />
                选择 CSV 文件
              </Button>
            </div>

            {/* 文件名显示 */}
            {fileInputRef.current?.files?.[0] && (
              <div className="p-2 bg-gray-100 rounded text-sm">
                📄 {fileInputRef.current.files[0].name}
              </div>
            )}

            {/* 上传按钮 */}
            <Button
              onClick={handleUpload}
              disabled={uploading || !fileInputRef.current?.files?.length}
              className="w-full"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  上传中...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  上传并解析
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* 上传结果 */}
        {result && (
          <Card className={`mb-4 ${result.success ? 'border-green-500' : 'border-red-500'}`}>
            <CardContent className="p-4">
              <div className="flex items-start gap-2">
                {result.success ? (
                  <CheckCircle className="w-5 h-5 text-green-500 shrink-0" />
                ) : (
                  <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
                )}
                <div className="flex-1">
                  <p className="font-medium">{result.success ? '上传成功' : '上传失败'}</p>
                  <p className="text-sm text-gray-500">
                    {result.message || result.error}
                  </p>
                  {result.count && (
                    <p className="text-sm text-green-600 mt-1">
                      成功导入 {result.count} 条航迹
                    </p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* 字段说明 */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">CSV 字段说明</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <p className="text-gray-500 mb-3">
                CSV 文件需包含以下字段（支持多种命名方式）：
              </p>
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 text-gray-600">字段名</th>
                    <th className="text-left py-2 text-gray-600">别名</th>
                    <th className="text-left py-2 text-gray-600">必填</th>
                  </tr>
                </thead>
                <tbody className="text-gray-500">
                  <tr className="border-b">
                    <td className="py-2">航段编号</td>
                    <td className="py-2">segment_id, 航段ID, id</td>
                    <td className="py-2">✓</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">WKT航线</td>
                    <td className="py-2">wkt_route, wkt, 航线</td>
                    <td className="py-2">✓</td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">起港口</td>
                    <td className="py-2">start_port, 起点, 起港</td>
                    <td className="py-2"></td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">止港口</td>
                    <td className="py-2">end_port, 终点, 止港</td>
                    <td className="py-2"></td>
                  </tr>
                  <tr className="border-b">
                    <td className="py-2">途经海域</td>
                    <td className="py-2">sea_area, 海域</td>
                    <td className="py-2"></td>
                  </tr>
                  <tr>
                    <td className="py-2">航段属性</td>
                    <td className="py-2">segment_attrs, 属性</td>
                    <td className="py-2"></td>
                  </tr>
                </tbody>
              </table>
              
              <div className="mt-4 p-3 bg-blue-50 rounded">
                <p className="font-medium text-blue-700 mb-1">WKT 格式示例：</p>
                <code className="text-xs text-blue-600">
                  LINESTRING(121.47 31.23, 122.08 30.22, 123.15 29.89)
                </code>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 导航链接 */}
        <div className="mt-6 flex gap-4">
          <a href="/trajectory" className="text-blue-600 hover:underline text-sm">
            🔍 航迹检索 →
          </a>
          <a href="/sea-chart" className="text-green-600 hover:underline text-sm">
            🗺️ 海图可视化 →
          </a>
        </div>
      </div>
    </div>
  );
}
