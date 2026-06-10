'use client';

import { useEffect } from 'react';

// 工作流入口 - 重定向到管理页面
export default function WorkflowPage() {
  useEffect(() => {
    window.location.href = '/workflow/manage';
  }, []);
  
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-50">
      <a href="/" className="hover:opacity-80 transition-opacity"><h1 className="text-lg font-bold mb-2">流程设计</h1></a>
      <div className="text-gray-400">正在跳转到工作流管理...</div>
    </div>
  );
}
