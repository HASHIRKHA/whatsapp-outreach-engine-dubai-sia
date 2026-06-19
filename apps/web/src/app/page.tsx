'use client';

import React from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell,
} from 'recharts';
import { formatDistanceToNow } from 'date-fns';
import { DashLayout } from '@/components/DashLayout';
import { StatusBadge } from '@/components/Badge';
import { CardSkeleton, SkeletonRows } from '@/components/Skeleton';
import { EmptyState } from '@/components/EmptyState';
import { apiFetch } from '@/lib/api';
import type { OverviewResponse } from '@/types/api';

const fetcher = (url: string) => apiFetch<OverviewResponse>(url);
type Period = 'today' | '7d' | '30d';

/* ── Inline SVG icons ──────────────────────────────────────── */
const IcSessions = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/>
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/>
  </svg>
);
const IcMessages = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>
);
const IcReply = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
  </svg>
);
const IcCloud = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
  </svg>
);
const IcWifi = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/>
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/>
  </svg>
);
const IcArrow = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>
  </svg>
);
const IcEmpty = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/>
  </svg>
);

/* ── Custom recharts tooltip ───────────────────────────────── */
function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: 'rgba(12,12,12,0.95)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 8,
      padding: '8px 14px',
      backdropFilter: 'blur(12px)',
    }}>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color: '#25d366' }}>{payload[0]?.value ?? 0}</div>
      <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>messages</div>
    </div>
  );
}

/* ── Main page ─────────────────────────────────────────────── */
export default function DashboardPage() {
  const { data, isLoading, mutate } = useSWR<OverviewResponse>('/analytics/overview', fetcher, { refreshInterval: 15000 });
  const [period, setPeriod] = React.useState<Period>('7d');

  const sessions = data?.sessionPool ?? [];
  const recent = data?.recentActivity ?? [];

  const chartData = React.useMemo(() => {
    const daily = data?.dailyMessages ?? [];
    if (period === 'today') return daily.slice(-1);
    if (period === '7d') return daily.slice(-7);
    return daily;
  }, [data?.dailyMessages, period]);

  const totalInPeriod = chartData.reduce((s, d) => s + d.count, 0);

  return (
    <DashLayout title="Dashboard" onRefresh={() => mutate()}>

      {/* ── Metric cards ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 16 }}>
        {isLoading ? (
          <><CardSkeleton /><CardSkeleton /><CardSkeleton /></>
        ) : (
          <>
            {/* Active Sessions */}
            <div className="glass-accent anim-1" style={{ borderRadius: 14, padding: '20px 22px', position: 'relative', overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', top: -30, right: -30, width: 100, height: 100,
                borderRadius: '50%', background: 'rgba(37,211,102,0.06)', filter: 'blur(20px)',
              }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'rgba(37,211,102,0.15)', border: '1px solid rgba(37,211,102,0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#25d366',
                }}>
                  <IcSessions />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: '#25d366', fontWeight: 500 }}>
                  <span className="pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#25d366', display: 'inline-block' }} />
                  LIVE
                </div>
              </div>
              <div style={{ fontSize: 36, fontWeight: 600, lineHeight: 1, letterSpacing: '-1px', color: '#fff', marginBottom: 6 }}>
                {data?.activeSessions ?? 0}
              </div>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginBottom: 16 }}>Active sessions</div>
              <Link href="/sessions" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#25d366', textDecoration: 'none', fontWeight: 500 }}>
                Manage sessions <IcArrow />
              </Link>
            </div>

            {/* Messages Today */}
            <div className="glass anim-2" style={{ borderRadius: 14, padding: '20px 22px', position: 'relative', overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', bottom: -20, right: -20, width: 80, height: 80,
                borderRadius: '50%', background: 'rgba(96,165,250,0.05)', filter: 'blur(16px)',
              }} />
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'rgba(96,165,250,0.1)', border: '1px solid rgba(96,165,250,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#60a5fa',
                }}>
                  <IcMessages />
                </div>
              </div>
              <div style={{ fontSize: 36, fontWeight: 600, lineHeight: 1, letterSpacing: '-1px', color: '#fff', marginBottom: 6 }}>
                {(data?.messagesToday ?? 0).toLocaleString()}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Messages today</div>
              <Link href="/analytics" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#60a5fa', textDecoration: 'none', fontWeight: 500 }}>
                View analytics <IcArrow />
              </Link>
            </div>

            {/* Reply Rate */}
            <div className="glass anim-3" style={{ borderRadius: 14, padding: '20px 22px', position: 'relative', overflow: 'hidden' }}>
              <div style={{
                position: 'absolute', top: -20, left: -20, width: 80, height: 80,
                borderRadius: '50%', background: 'rgba(167,139,250,0.05)', filter: 'blur(16px)',
              }} />
              <div style={{ marginBottom: 20 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: 'rgba(167,139,250,0.1)', border: '1px solid rgba(167,139,250,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: '#a78bfa',
                }}>
                  <IcReply />
                </div>
              </div>
              <div style={{ fontSize: 36, fontWeight: 600, lineHeight: 1, letterSpacing: '-1px', color: '#fff', marginBottom: 6 }}>
                {data?.replyRate ?? 0}%
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 16 }}>Reply rate · {data?.hotReplies ?? 0} hot</div>
              <Link href="/replies" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#a78bfa', textDecoration: 'none', fontWeight: 500 }}>
                View replies <IcArrow />
              </Link>
            </div>
          </>
        )}
      </div>

      {/* ── Middle row: Session Pool + Chart ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 12, marginBottom: 16 }}>

        {/* Session Pool */}
        <div className="glass anim-4" style={{ borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Session Pool</div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{sessions.length} connected</div>
            </div>
            <Link href="/sessions" style={{
              background: 'rgba(37,211,102,0.12)',
              border: '1px solid rgba(37,211,102,0.18)',
              color: '#25d366',
              borderRadius: 8,
              padding: '6px 14px',
              fontSize: 12,
              fontWeight: 500,
              textDecoration: 'none',
              transition: 'all 0.15s',
            }}>
              Add session
            </Link>
          </div>

          {sessions.length === 0 ? (
            <EmptyState
              icon={<IcEmpty />}
              title="No sessions configured"
              subtitle="Connect a WhatsApp number to start sending"
            />
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
              {sessions.map((s) => (
                <Link key={s.id} href="/sessions" style={{ textDecoration: 'none' }}>
                  <div
                    className="glass-card-hover"
                    style={{
                      background: 'rgba(255,255,255,0.025)',
                      border: '1px solid rgba(255,255,255,0.05)',
                      borderRadius: 10,
                      padding: '12px 14px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                      <div style={{ overflow: 'hidden' }}>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {s.phoneNumber ?? s.label}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{s.label}</div>
                      </div>
                      <StatusBadge status={s.status} />
                    </div>

                    {/* Mode badge */}
                    <div style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 10, fontWeight: 500,
                      color: s.mode === 'CLOUD_API' ? '#60a5fa' : '#a78bfa',
                      background: s.mode === 'CLOUD_API' ? 'rgba(96,165,250,0.1)' : 'rgba(167,139,250,0.1)',
                      border: `1px solid ${s.mode === 'CLOUD_API' ? 'rgba(96,165,250,0.15)' : 'rgba(167,139,250,0.15)'}`,
                      borderRadius: 12, padding: '2px 8px', marginBottom: 10,
                    }}>
                      <span style={{ color: 'inherit' }}>{s.mode === 'CLOUD_API' ? <IcCloud /> : <IcWifi />}</span>
                      {s.mode === 'CLOUD_API' ? 'Cloud API' : 'WebSocket'}
                    </div>

                    {/* Warmup bar */}
                    {s.warmupDay < 15 && (
                      <div style={{ marginBottom: 8 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: 'var(--text-muted)', marginBottom: 3 }}>
                          <span>Warmup</span>
                          <span>Day {s.warmupDay}/14</span>
                        </div>
                        <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1 }}>
                          <div style={{ height: '100%', width: `${Math.min((s.warmupDay / 14) * 100, 100)}%`, background: '#25d366', borderRadius: 1, transition: 'width 0.4s' }} />
                        </div>
                      </div>
                    )}

                    <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {s.dailySent} sent today
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Message Volume Chart */}
        <div className="glass anim-5" style={{ borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>Volume</div>
              <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: '-0.5px' }}>
                {totalInPeriod.toLocaleString()}
              </div>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>messages</div>
            </div>
            <div style={{ display: 'flex', gap: 3 }}>
              {(['today', '7d', '30d'] as Period[]).map((p) => (
                <button key={p} onClick={() => setPeriod(p)} style={{
                  background: period === p ? 'rgba(37,211,102,0.15)' : 'rgba(255,255,255,0.04)',
                  color: period === p ? '#25d366' : 'var(--text-muted)',
                  border: period === p ? '1px solid rgba(37,211,102,0.2)' : '1px solid rgba(255,255,255,0.05)',
                  borderRadius: 6, padding: '4px 10px', fontSize: 11,
                  fontWeight: period === p ? 500 : 400, cursor: 'pointer', fontFamily: 'inherit',
                  transition: 'all 0.15s',
                }}>
                  {p === 'today' ? 'Today' : p === '7d' ? '7d' : '30d'}
                </button>
              ))}
            </div>
          </div>

          {chartData.length === 0 ? (
            <div style={{ height: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
              No data yet
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={chartData} margin={{ top: 0, right: 0, bottom: 0, left: -28 }}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: '#444', fontSize: 9 }}
                  tickFormatter={(v: string) => v.slice(5)}
                  axisLine={false} tickLine={false}
                />
                <YAxis tick={{ fill: '#444', fontSize: 9 }} axisLine={false} tickLine={false} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(37,211,102,0.04)' }} />
                <Bar dataKey="count" radius={[3, 3, 0, 0]} maxBarSize={28}>
                  {chartData.map((_, i) => (
                    <Cell
                      key={i}
                      fill={i === chartData.length - 1 ? '#25d366' : 'rgba(37,211,102,0.35)'}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* ── Recent Activity ── */}
      <div className="glass anim-6" style={{ borderRadius: 14, padding: '20px 22px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-primary)' }}>Recent Activity</div>
            <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>Latest message events</div>
          </div>
          {recent.length > 0 && (
            <Link href="/analytics" style={{ fontSize: 12, color: 'var(--text-secondary)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              View all <IcArrow />
            </Link>
          )}
        </div>

        {isLoading ? (
          <SkeletonRows rows={5} cols={5} />
        ) : recent.length === 0 ? (
          <EmptyState
            icon={<IcEmpty />}
            title="No activity yet"
            subtitle="Launch a campaign and messages will appear here"
            action={
              <Link href="/campaigns/new" style={{
                background: 'rgba(37,211,102,0.12)', border: '1px solid rgba(37,211,102,0.2)',
                color: '#25d366', borderRadius: 8, padding: '8px 18px',
                fontSize: 12, fontWeight: 500, textDecoration: 'none',
              }}>
                Create Campaign
              </Link>
            }
          />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr>
                {['Contact', 'Campaign', 'Status', 'Time', 'Mode'].map((h) => (
                  <th key={h} style={{
                    textAlign: 'left', padding: '0 12px 10px 0',
                    fontSize: 10, fontWeight: 500, color: 'var(--text-muted)',
                    letterSpacing: '0.8px', textTransform: 'uppercase',
                    borderBottom: '1px solid rgba(255,255,255,0.05)',
                  }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {recent.slice(0, 8).map((msg, i) => (
                <tr
                  key={msg.id}
                  style={{
                    borderBottom: '1px solid rgba(255,255,255,0.04)',
                    animation: `fadeSlideUp 0.4s cubic-bezier(0.16,1,0.3,1) ${i * 0.04}s both`,
                  }}
                >
                  <td style={{ padding: '11px 12px 11px 0' }}>
                    <div style={{ fontWeight: 500, fontSize: 12, color: 'var(--text-primary)' }}>{msg.phone}</div>
                    {msg.contactName && (
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>{msg.contactName}</div>
                    )}
                  </td>
                  <td style={{ padding: '11px 12px 11px 0', color: 'var(--text-secondary)', fontSize: 12, maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {msg.campaignName || '—'}
                  </td>
                  <td style={{ padding: '11px 12px 11px 0' }}>
                    <StatusBadge status={msg.status} />
                  </td>
                  <td style={{ padding: '11px 12px 11px 0', color: 'var(--text-muted)', fontSize: 11 }}>
                    {msg.sentAt ? formatDistanceToNow(new Date(msg.sentAt), { addSuffix: true }) : '—'}
                  </td>
                  <td style={{ padding: '11px 0 11px 0' }}>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', gap: 4,
                      fontSize: 10, fontWeight: 500,
                      color: msg.mode === 'CLOUD_API' ? '#60a5fa' : '#a78bfa',
                    }}>
                      {msg.mode === 'CLOUD_API' ? <IcCloud /> : <IcWifi />}
                      {msg.mode === 'CLOUD_API' ? 'API' : 'WS'}
                    </span>
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
