'use client';

import React from 'react';
import { Sidebar } from './Sidebar';
import { Header } from './Header';
import { ToastProvider } from './Toast';

interface DashLayoutProps {
  title: string;
  children: React.ReactNode;
  onRefresh?: () => void;
}

export function DashLayout({ title, children, onRefresh }: DashLayoutProps) {
  return (
    <ToastProvider>
      <div style={{ display: 'flex', minHeight: '100vh', background: 'var(--bg-base)' }}>
        <Sidebar />
        <div
          style={{
            flex: 1,
            minWidth: 0,
            marginLeft: 220,
            display: 'flex',
            flexDirection: 'column',
            minHeight: '100vh',
            overflow: 'hidden',
          }}
        >
          <Header title={title} onRefresh={onRefresh} />
          <main style={{ flex: 1, padding: 24, overflowY: 'auto', overflowX: 'hidden' }}>{children}</main>
        </div>
      </div>
    </ToastProvider>
  );
}
