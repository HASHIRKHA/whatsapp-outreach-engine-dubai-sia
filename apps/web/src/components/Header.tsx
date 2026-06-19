'use client';

import React from 'react';
import { useRouter } from 'next/navigation';

interface HeaderProps {
  title: string;
  onRefresh?: () => void;
}

const IconRefresh = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="23 4 23 10 17 10"/>
    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/>
  </svg>
);

const IconBell = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
    <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
  </svg>
);

export function Header({ title, onRefresh }: HeaderProps) {
  const router = useRouter();
  return (
    <header
      style={{
        height: 64,
        background: 'rgba(8,8,8,0.88)',
        backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(212,175,55,0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 28px',
        position: 'sticky',
        top: 0,
        zIndex: 50,
      }}
    >
      <div style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', letterSpacing: '-0.2px' }}>
        {title}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {onRefresh && (
          <button
            onClick={onRefresh}
            title="Refresh"
            style={iconBtnStyle}
          >
            <IconRefresh />
          </button>
        )}
        <button title="Notifications" onClick={() => router.push('/replies')} style={iconBtnStyle}>
          <IconBell />
        </button>
      </div>
    </header>
  );
}

const iconBtnStyle: React.CSSProperties = {
  background: 'rgba(212,175,55,0.04)',
  border: '1px solid rgba(212,175,55,0.1)',
  borderRadius: 7,
  color: 'rgba(212,175,55,0.5)',
  cursor: 'pointer',
  padding: 7,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'all 0.15s',
};
