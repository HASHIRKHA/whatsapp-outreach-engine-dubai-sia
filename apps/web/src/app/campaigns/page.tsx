'use client';

import React, { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { DashLayout } from '@/components/DashLayout';
import { Badge, StatusBadge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { SkeletonRows } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { useToast, ToastProvider } from '@/components/Toast';
import { apiFetch } from '@/lib/api';
import type { Campaign } from '@/types/api';

type FilterStatus = 'ALL' | 'DRAFT' | 'RUNNING' | 'PAUSED' | 'DONE';

const STATUS_TABS: { label: string; value: FilterStatus; color?: string }[] = [
  { label: 'All', value: 'ALL' },
  { label: 'Draft', value: 'DRAFT' },
  { label: 'Running', value: 'RUNNING', color: '#25d366' },
  { label: 'Paused', value: 'PAUSED', color: '#f59e0b' },
  { label: 'Done', value: 'DONE', color: '#60a5fa' },
];

const IcTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);
const IcActivity = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 12h-4l-3 9L9 3l-3 9H2"/>
  </svg>
);

function CampaignsContent() {
  const { data, isLoading, mutate } = useSWR<Campaign[]>(
    '/campaigns',
    (url: string) => apiFetch<Campaign[]>(url),
    { refreshInterval: 10000 },
  );
  const { toast } = useToast();
  const [filter, setFilter] = useState<FilterStatus>('ALL');

  const all = data ?? [];
  const campaigns = all.filter((c) => filter === 'ALL' || c.status === filter);
  const counts: Record<FilterStatus, number> = {
    ALL: all.length,
    DRAFT: all.filter((c) => c.status === 'DRAFT').length,
    RUNNING: all.filter((c) => c.status === 'RUNNING').length,
    PAUSED: all.filter((c) => c.status === 'PAUSED').length,
    DONE: all.filter((c) => c.status === 'DONE').length,
  };

  const handlePause = async (id: string) => {
    try {
      await apiFetch(`/campaigns/${id}/pause`, { method: 'POST' });
      toast('Campaign paused', 'success');
      mutate();
    } catch (err) { toast(String(err), 'error'); }
  };

  const handleResume = async (id: string) => {
    try {
      await apiFetch(`/campaigns/${id}/resume`, { method: 'POST' });
      toast('Campaign resumed', 'success');
      mutate();
    } catch (err) { toast(String(err), 'error'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this campaign? This cannot be undone.')) return;
    try {
      await apiFetch(`/campaigns/${id}`, { method: 'DELETE' });
      toast('Campaign deleted', 'success');
      mutate();
    } catch (err) { toast(String(err), 'error'); }
  };

  return (
    <DashLayout title="Campaigns" onRefresh={() => mutate()}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 10 }}>
        {/* Filter tabs */}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {STATUS_TABS.map((tab) => {
            const active = filter === tab.value;
            const accentColor = tab.color ?? '#888';
            return (
              <button
                key={tab.value}
                onClick={() => setFilter(tab.value)}
                style={{
                  background: active ? (tab.color ? `${tab.color}18` : 'rgba(255,255,255,0.07)') : 'rgba(255,255,255,0.03)',
                  color: active ? (tab.color ?? 'var(--text-primary)') : 'var(--text-muted)',
                  border: `1px solid ${active ? (tab.color ? `${tab.color}30` : 'rgba(255,255,255,0.1)') : 'transparent'}`,
                  borderRadius: 8, padding: '6px 14px', fontSize: 12, fontWeight: active ? 500 : 400,
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 0.15s',
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                {tab.value !== 'ALL' && tab.color && (
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: accentColor, display: 'inline-block' }} />
                )}
                {tab.label}
                <span style={{ fontSize: 10, background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '1px 6px', color: 'var(--text-muted)' }}>
                  {counts[tab.value]}
                </span>
              </button>
            );
          })}
        </div>
        <Link href="/campaigns/new">
          <Button>New Campaign</Button>
        </Link>
      </div>

      {/* Table */}
      <div className="glass" style={{ borderRadius: 14, overflow: 'hidden', overflowX: 'auto' }}>
        {isLoading ? (
          <div style={{ padding: '20px 22px' }}><SkeletonRows rows={5} cols={5} /></div>
        ) : campaigns.length === 0 ? (
          <EmptyState
            icon={<IcActivity />}
            title={filter === 'ALL' ? 'No campaigns yet' : `No ${filter.toLowerCase()} campaigns`}
            subtitle="Create your first campaign to start reaching contacts"
            action={<Link href="/campaigns/new"><Button>New Campaign</Button></Link>}
          />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Campaign', 'Mode', 'Status', 'Created', 'Actions'].map((h) => (
                  <th key={h} style={{ textAlign: 'left', padding: '14px 18px', fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', letterSpacing: '0.8px', textTransform: 'uppercase', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)', transition: 'background 0.1s' }}>
                  <td style={{ padding: '14px 18px' }}>
                    <Link href={`/campaigns/${c.id}`} style={{ fontWeight: 500, color: 'var(--text-primary)', textDecoration: 'none', fontSize: 13 }}>
                      {c.name}
                    </Link>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <Badge variant={c.mode === 'CLOUD_API' ? 'cloud' : 'ws'} size="sm">
                      {c.mode === 'CLOUD_API' ? 'Cloud API' : 'WebSocket'}
                    </Badge>
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <StatusBadge status={c.status} />
                  </td>
                  <td style={{ padding: '14px 18px', color: 'var(--text-muted)', fontSize: 11 }}>
                    {formatDistanceToNow(new Date(c.createdAt), { addSuffix: true })}
                  </td>
                  <td style={{ padding: '14px 18px' }}>
                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <Link href={`/campaigns/${c.id}`}>
                        <Button size="sm" variant="outline">View</Button>
                      </Link>
                      {c.status === 'RUNNING' && (
                        <Button size="sm" variant="danger" onClick={() => handlePause(c.id)}>Pause</Button>
                      )}
                      {c.status === 'PAUSED' && (
                        <Button size="sm" onClick={() => handleResume(c.id)}>Resume</Button>
                      )}
                      {c.status === 'DRAFT' && (
                        <Link href={`/campaigns/${c.id}`}>
                          <Button size="sm">Launch</Button>
                        </Link>
                      )}
                      <button
                        onClick={() => handleDelete(c.id)}
                        title="Delete"
                        style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.1)', borderRadius: 6, color: '#ef4444', cursor: 'pointer', width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                      >
                        <IcTrash />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </DashLayout>
  );
}

export default function CampaignsPage() {
  return (
    <ToastProvider>
      <CampaignsContent />
    </ToastProvider>
  );
}
