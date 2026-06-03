'use client';

import { useEffect } from 'react';

// 工作流入口 - 重定向到管理页面
export default function WorkflowPage() {
  useEffect(() => {
    window.location.href = '/workflow/manage';
  }, []);
  
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="text-gray-400">正在跳转到工作流管理...</div>
    </div>
  );
}
