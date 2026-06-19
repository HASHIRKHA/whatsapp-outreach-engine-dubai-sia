'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import useSWR from 'swr';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { DashLayout } from '@/components/DashLayout';
import { StatusBadge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { SkeletonRows } from '@/components/Skeleton';
import { useToast, ToastProvider } from '@/components/Toast';
import { apiFetch } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import type { Campaign, CampaignStats, CampaignMessage, SmartList, Session } from '@/types/api';

interface CampaignAnalytics {
  stats: CampaignStats;
  dailyBreakdown: Array<{ date: string; count: number }>;
  variants: Array<{ text: string; sent: number; replied: number; rate: number; weight: number }>;
}

/* ── SVG Icons ─────────────────────────────────────────────── */
const IcSend = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>;
const IcCheck2 = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>;
const IcEye = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>;
const IcReply = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>;
const IcAlert = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>;
const IcClock = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>;
const IcSparkle = () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2l2.5 7.5H22l-6.5 4.7 2.5 7.5L12 17.3 5.5 22l2.5-7.5L1 9.7h7.5z"/></svg>;
const IcList = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>;
const IcUsers = () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>;

/* ── Stat card ──────────────────────────────────────────────── */
function StatCard({ label, value, color, icon, animClass }: { label: string; value: number; color: string; icon: React.ReactNode; animClass: string }) {
  return (
    <div className={`glass ${animClass}`} style={{ borderRadius: 12, padding: '16px 18px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: -20, right: -20, width: 60, height: 60, borderRadius: '50%', background: `${color}08`, filter: 'blur(12px)' }} />
      <div style={{ color, marginBottom: 10, display: 'flex', justifyContent: 'center' }}>{icon}</div>
      <div style={{ fontSize: 28, fontWeight: 600, color, letterSpacing: '-0.5px', lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 5, textTransform: 'uppercase', letterSpacing: '0.8px' }}>{label}</div>
    </div>
  );
}

/* ── Launch Modal ───────────────────────────────────────────── */
function LaunchModal({ campaignId, campaignMode, onClose, onLaunched }: {
  campaignId: string;
  campaignMode: 'CLOUD_API' | 'BAILEYS';
  onClose: () => void;
  onLaunched: () => void;
}) {
  const { toast } = useToast();
  const [tab, setTab] = useState<'lists' | 'all'>('lists');
  const [loading, setLoading] = useState(false);
  const [selectedListId, setSelectedListId] = useState<string | null>(null);
  const [selectedSessionIds, setSelectedSessionIds] = useState<string[] | null>(null);

  const { data: smartLists = [], isLoading: listsLoading } = useSWR<SmartList[]>(
    '/smart-lists',
    (url: string) => apiFetch<SmartList[]>(url),
  );
  const { data: allContactsData } = useSWR<{ total: number }>(
    '/contacts?take=1&valid=true',
    (url: string) => apiFetch<{ total: number }>(url),
  );
  const { data: allSessions = [] } = useSWR<Session[]>(
    '/sessions',
    (url: string) => apiFetch<Session[]>(url),
  );
  const totalValidContacts = allContactsData?.total ?? 0;

  const onlineSessions = allSessions.filter(
    (s) => s.status === 'ONLINE' && s.mode === campaignMode,
  );
  const effectiveSessionIds = selectedSessionIds ?? onlineSessions.map((s) => s.id);

  const toggleSession = (id: string) => {
    const current = selectedSessionIds ?? onlineSessions.map((s) => s.id);
    setSelectedSessionIds(current.includes(id) ? current.filter((s) => s !== id) : [...current, id]);
  };

  const doLaunch = async (payload: { smartListId?: string; contactIds?: string[]; launchAll?: boolean }) => {
    if (effectiveSessionIds.length === 0) {
      toast('Select at least one session to run the campaign from', 'error');
      return;
    }
    const allSelected = effectiveSessionIds.length === onlineSessions.length;
    setLoading(true);
    try {
      await apiFetch(`/campaigns/${campaignId}/launch`, {
        method: 'POST',
        body: JSON.stringify({
          ...payload,
          ...(!allSelected ? { sessionIds: effectiveSessionIds } : {}),
        }),
      });
      toast('Campaign launched!', 'success');
      onLaunched();
      onClose();
    } catch (err) { toast(String(err), 'error'); }
    finally { setLoading(false); }
  };

  const handleLaunchFromList = () => {
    if (!selectedListId) return;
    void doLaunch({ smartListId: selectedListId });
  };

  const handleLaunchAll = () => {
    if (!totalValidContacts) { toast('No valid contacts found', 'error'); return; }
    void doLaunch({ launchAll: true });
  };

  const tabBtn = (active: boolean): React.CSSProperties => ({
    flex: 1,
    padding: '8px 0',
    background: active ? 'rgba(255,255,255,0.07)' : 'transparent',
    border: 'none',
    borderBottom: `2px solid ${active ? '#25d366' : 'transparent'}`,
    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    cursor: 'pointer',
    fontSize: 12,
    fontWeight: active ? 600 : 400,
    fontFamily: 'inherit',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    transition: 'all 0.15s',
  });

  return (
    <Modal open onClose={onClose} title="Launch Campaign" width={500}>
      {/* Tabs */}
      <div style={{ display: 'flex', borderBottom: '1px solid rgba(255,255,255,0.06)', marginBottom: 18 }}>
        <button style={tabBtn(tab === 'lists')} onClick={() => setTab('lists')}>
          <IcList /> From Smart List
        </button>
        <button style={tabBtn(tab === 'all')} onClick={() => setTab('all')}>
          <IcUsers /> All Contacts
        </button>
      </div>

      {tab === 'lists' && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14 }}>
            Pick a Smart List — only those contacts will receive messages.
          </div>
          {listsLoading ? (
            <div style={{ padding: '20px 0' }}><SkeletonRows rows={3} cols={2} /></div>
          ) : smartLists.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '30px 0', color: 'var(--text-muted)', fontSize: 13 }}>
              No Smart Lists yet.<br />
              <span style={{ fontSize: 12 }}>Go to Contacts → select contacts → "Save as Smart List"</span>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 320, overflowY: 'auto' }}>
              {smartLists.map((list) => {
                const selected = selectedListId === list.id;
                return (
                  <div
                    key={list.id}
                    onClick={() => setSelectedListId(selected ? null : list.id)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '12px 14px',
                      borderRadius: 10,
                      border: `1px solid ${selected ? 'rgba(37,211,102,0.4)' : 'rgba(255,255,255,0.07)'}`,
                      background: selected ? 'rgba(37,211,102,0.08)' : 'rgba(255,255,255,0.02)',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                    }}
                  >
                    <span style={{ fontSize: 20 }}>📋</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, color: selected ? '#25d366' : 'var(--text-primary)' }}>
                        {list.name}
                      </div>
                      {list.description && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{list.description}</div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontSize: 18, fontWeight: 600, color: selected ? '#25d366' : 'var(--text-primary)', letterSpacing: '-0.5px' }}>
                        {list.contactCount}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                        contacts
                      </div>
                    </div>
                    {selected && (
                      <div style={{ width: 18, height: 18, borderRadius: '50%', background: '#25d366', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button loading={loading} disabled={!selectedListId} onClick={handleLaunchFromList}>
              Launch to {selectedListId ? (smartLists.find((l) => l.id === selectedListId)?.contactCount ?? 0) : 0} contacts
            </Button>
          </div>
        </div>
      )}

      {tab === 'all' && (
        <div>
          <div style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.2)', borderRadius: 10, padding: '14px 16px', marginBottom: 18 }}>
            <div style={{ fontSize: 13, color: '#f59e0b', fontWeight: 500, marginBottom: 4 }}>Send to all valid contacts</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)', lineHeight: 1.5 }}>
              This will send to <strong style={{ color: 'var(--text-primary)' }}>{totalValidContacts}</strong> valid contacts.
              For targeted sends, use a Smart List instead.
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <Button variant="outline" onClick={onClose}>Cancel</Button>
            <Button loading={loading} onClick={handleLaunchAll} disabled={totalValidContacts === 0}>
              Launch to all {totalValidContacts} contacts
            </Button>
          </div>
        </div>
      )}

      {/* Session picker — always shown */}
      {onlineSessions.length > 0 && (
        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 500, letterSpacing: '0.8px', textTransform: 'uppercase', marginBottom: 10 }}>
            Run from sessions
            <span style={{ marginLeft: 8, fontWeight: 400, letterSpacing: 0, textTransform: 'none' }}>
              ({effectiveSessionIds.length}/{onlineSessions.length} selected)
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {onlineSessions.map((s) => {
              const isSelected = effectiveSessionIds.includes(s.id);
              return (
                <div
                  key={s.id}
                  onClick={() => toggleSession(s.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10,
                    padding: '10px 12px', borderRadius: 8, cursor: 'pointer', transition: 'all 0.15s',
                    border: `1px solid ${isSelected ? 'rgba(37,211,102,0.3)' : 'rgba(255,255,255,0.06)'}`,
                    background: isSelected ? 'rgba(37,211,102,0.05)' : 'rgba(255,255,255,0.02)',
                  }}
                >
                  <div style={{
                    width: 16, height: 16, borderRadius: 4, flexShrink: 0,
                    border: `1.5px solid ${isSelected ? '#25d366' : 'rgba(255,255,255,0.2)'}`,
                    background: isSelected ? '#25d366' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isSelected && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </div>
                  <div style={{ flex: 1, overflow: 'hidden' }}>
                    <div style={{ fontSize: 12, fontWeight: 500, color: isSelected ? '#25d366' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.phoneNumber ?? s.label}
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                      Day {s.warmupDay} · {s.dailySent} sent today
                    </div>
                  </div>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#25d366', flexShrink: 0, display: 'inline-block' }} />
                </div>
              );
            })}
          </div>
        </div>
      )}

      {onlineSessions.length === 0 && (
        <div style={{ marginTop: 16, paddingTop: 14, borderTop: '1px solid rgba(255,255,255,0.05)', fontSize: 12, color: 'var(--text-muted)', textAlign: 'center' }}>
          No ONLINE {campaignMode === 'CLOUD_API' ? 'Cloud API' : 'WebSocket'} sessions available.
        </div>
      )}
    </Modal>
  );
}

function CampaignDetailContent() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const { toast } = useToast();
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState<string[]>([]);
  const [launchOpen, setLaunchOpen] = useState(false);

  const { data: campaign, mutate: mutateCampaign } = useSWR<Campaign>(`/campaigns/${id}`, (url: string) => apiFetch<Campaign>(url));
  const { data: stats, mutate: mutateStats } = useSWR<CampaignStats>(`/campaigns/${id}/stats`, (url: string) => apiFetch<CampaignStats>(url), { refreshInterval: 8000 });
  const { data: analytics } = useSWR<CampaignAnalytics>(`/analytics/campaign/${id}`, (url: string) => apiFetch<CampaignAnalytics>(url), { refreshInterval: 30000 });
  const { data: messages, isLoading: msgsLoading } = useSWR<CampaignMessage[]>(`/campaigns/${id}/messages?take=20`, (url: string) => apiFetch<CampaignMessage[]>(url), { refreshInterval: 15000 });

  useEffect(() => {
    const socket = getSocket();
    const handleStats = (payload: { campaignId: string } & Record<string, number>) => {
      if (payload.campaignId === id) mutateStats();
    };
    socket.on('campaign:stats', handleStats);
    return () => { socket.off('campaign:stats', handleStats); };
  }, [id, mutateStats]);

  const handlePause = async () => {
    try {
      await apiFetch(`/campaigns/${id}/pause`, { method: 'POST' });
      toast('Campaign paused', 'success');
      mutateCampaign();
    } catch (err) { toast(String(err), 'error'); }
  };

  const handleResume = async () => {
    try {
      await apiFetch(`/campaigns/${id}/resume`, { method: 'POST' });
      toast('Campaign resumed', 'success');
      mutateCampaign();
    } catch (err) { toast(String(err), 'error'); }
  };

  const handleAiOptimize = async () => {
    const topVariant = analytics?.variants?.sort((a, b) => b.rate - a.rate)[0];
    const brief = topVariant
      ? `Improve this WhatsApp message for better reply rates: "${topVariant.text}"`
      : 'Generate high-converting WhatsApp outreach messages';
    setAiLoading(true);
    try {
      const result = await apiFetch<{ messages: string[] }>('/ai/generate-templates', {
        method: 'POST',
        body: JSON.stringify({ brief, audience: 'existing prospects', tone: 'Friendly', count: 5 }),
      });
      setAiSuggestions(result.messages?.slice(0, 3) ?? []);
      toast('AI suggestions ready', 'success');
    } catch (err) { toast(String(err), 'error'); }
    finally { setAiLoading(false); }
  };

  const STAT_ITEMS = [
    { key: 'queued' as const, label: 'Queued', color: '#888', icon: <IcClock />, anim: 'anim-1' },
    { key: 'sent' as const, label: 'Sent', color: '#60a5fa', icon: <IcSend />, anim: 'anim-2' },
    { key: 'delivered' as const, label: 'Delivered', color: '#25d366', icon: <IcCheck2 />, anim: 'anim-3' },
    { key: 'read' as const, label: 'Read', color: '#4ade80', icon: <IcEye />, anim: 'anim-4' },
    { key: 'replied' as const, label: 'Replied', color: '#86efac', icon: <IcReply />, anim: 'anim-5' },
    { key: 'failed' as const, label: 'Failed', color: '#ef4444', icon: <IcAlert />, anim: 'anim-6' },
  ] as const;

  const handleDelete = async () => {
    if (!confirm('Delete this campaign? This cannot be undone.')) return;
    try {
      await apiFetch(`/campaigns/${id}`, { method: 'DELETE' });
      toast('Campaign deleted', 'success');
      router.push('/campaigns');
    } catch (err) { toast(String(err), 'error'); }
  };

  // DRAFT and PAUSED campaigns can both launch new contacts (dedup prevents re-sending to existing)
  const isLaunchable = campaign?.status === 'DRAFT' || campaign?.status === 'PAUSED';
  const isPaused = campaign?.status === 'PAUSED';
  const isRunning = campaign?.status === 'RUNNING';

  return (
    <DashLayout title={campaign?.name ?? 'Campaign'} onRefresh={() => { mutateCampaign(); mutateStats(); }}>
      {/* Back + Header */}
      <div style={{ marginBottom: 20 }}>
        <button
          onClick={() => router.push('/campaigns')}
          style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 6, padding: '4px 0', fontFamily: 'inherit', marginBottom: 12 }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
          Campaigns
        </button>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <h1 style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.3px' }}>{campaign?.name ?? '...'}</h1>
            {campaign && <StatusBadge status={campaign.status} />}
            {campaign?.mediaFilename && (
              <a
                href={campaign.mediaUrl ?? '#'}
                target="_blank"
                rel="noopener noreferrer"
                title={`Attachment: ${campaign.mediaFilename}`}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 5,
                  background: 'rgba(212,175,55,0.08)', border: '1px solid rgba(212,175,55,0.2)',
                  borderRadius: 8, padding: '3px 10px', fontSize: 11,
                  color: '#D4AF37', textDecoration: 'none', fontWeight: 500,
                  maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                {campaign.mediaFilename}
              </a>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="outline" loading={aiLoading} onClick={handleAiOptimize} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <IcSparkle />AI Optimize
            </Button>
            {isRunning && <Button variant="danger" onClick={handlePause}>Pause</Button>}
            {isPaused && <Button onClick={handleResume}>Resume</Button>}
            {isLaunchable && <Button onClick={() => setLaunchOpen(true)}>Launch</Button>}
            <button
              onClick={() => void handleDelete()}
              title="Delete campaign"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.15)', borderRadius: 8, color: '#ef4444', cursor: 'pointer', padding: '0 12px', height: 34, display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontFamily: 'inherit' }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* 6 Stat cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 10, marginBottom: 18 }}>
        {STAT_ITEMS.map(({ key, label, color, icon, anim }) => (
          <StatCard key={key} label={label} value={stats?.[key] ?? 0} color={color} icon={icon} animClass={anim} />
        ))}
      </div>

      {/* AI Suggestions */}
      {aiSuggestions.length > 0 && (
        <div className="glass-accent anim-1" style={{ borderRadius: 14, padding: '20px 22px', marginBottom: 18 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <IcSparkle />
            <span style={{ fontSize: 13, fontWeight: 500, color: '#25d366' }}>AI Optimized Variants</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>· Click to copy</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {aiSuggestions.map((msg, i) => (
              <div
                key={i}
                onClick={() => { void navigator.clipboard.writeText(msg); toast('Copied!', 'success'); }}
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: '12px 14px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6, cursor: 'pointer', transition: 'all 0.15s' }}
              >
                {msg}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Area chart */}
      {analytics?.dailyBreakdown && analytics.dailyBreakdown.length > 0 && (
        <div className="glass" style={{ borderRadius: 14, padding: '20px 22px', marginBottom: 18 }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 16 }}>Message Volume</div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={analytics.dailyBreakdown} margin={{ top: 0, right: 0, bottom: 0, left: -20 }}>
              <defs>
                <linearGradient id="cgGreen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#25d366" stopOpacity={0.2}/>
                  <stop offset="95%" stopColor="#25d366" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)"/>
              <XAxis dataKey="date" tick={{ fill: '#444', fontSize: 9 }} tickFormatter={(v: string) => v.slice(5)} axisLine={false} tickLine={false}/>
              <YAxis tick={{ fill: '#444', fontSize: 9 }} axisLine={false} tickLine={false}/>
              <Tooltip contentStyle={{ background: 'rgba(12,12,12,0.95)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 8, fontSize: 12 }}/>
              <Area type="monotone" dataKey="count" stroke="#25d366" strokeWidth={2} fill="url(#cgGreen)" dot={false} name="Messages"/>
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: analytics?.variants?.length ? '3fr 2fr' : '1fr', gap: 18, marginBottom: 18 }}>
        {/* Message log */}
        <div className="glass" style={{ borderRadius: 14, padding: '20px 22px' }}>
          <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 16 }}>Recent Messages</div>
          {msgsLoading ? (
            <SkeletonRows rows={5} cols={4} />
          ) : !messages?.length ? (
            <div style={{ color: 'var(--text-muted)', fontSize: 12, padding: '20px 0', textAlign: 'center' }}>No messages yet</div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr>
                  {['Phone', 'Message', 'Status', 'Sent'].map((h) => (
                    <th key={h} style={{ textAlign: 'left', padding: '0 12px 10px 0', fontSize: 10, fontWeight: 500, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {messages.slice(0, 15).map((m) => (
                  <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                    <td style={{ padding: '9px 12px 9px 0', fontWeight: 500, color: 'var(--text-primary)', fontSize: 11 }}>{m.phone ?? m.contactId.slice(0, 8) + '…'}</td>
                    <td style={{ padding: '9px 12px 9px 0', color: 'var(--text-muted)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.renderedText}
                    </td>
                    <td style={{ padding: '9px 12px 9px 0' }}>
                      <StatusBadge status={m.status} />
                    </td>
                    <td style={{ padding: '9px 0', color: 'var(--text-muted)', fontSize: 10 }}>
                      {m.sentAt ? new Date(m.sentAt).toLocaleTimeString() : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Variants */}
        {analytics?.variants && analytics.variants.length > 0 && (
          <div className="glass" style={{ borderRadius: 14, padding: '20px 22px' }}>
            <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 16 }}>Message Variants</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {analytics.variants.map((v, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.025)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: 10, padding: '12px 14px' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.text}</div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                    <span style={{ fontSize: 10, color: v.rate > 10 ? '#25d366' : 'var(--text-muted)' }}>{v.rate}% reply</span>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{v.sent} sent</span>
                  </div>
                  <div style={{ height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 1 }}>
                    <div style={{ height: '100%', width: `${v.weight}%`, background: '#25d366', borderRadius: 1 }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Launch Modal */}
      {launchOpen && campaign && (
        <LaunchModal
          campaignId={id}
          campaignMode={campaign.mode}
          onClose={() => setLaunchOpen(false)}
          onLaunched={() => { mutateCampaign(); mutateStats(); }}
        />
      )}
    </DashLayout>
  );
}

export default function CampaignDetailPage() {
  return (
    <ToastProvider>
      <CampaignDetailContent />
    </ToastProvider>
  );
}
