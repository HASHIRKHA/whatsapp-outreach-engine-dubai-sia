'use client';

import React, { useEffect, useState } from 'react';
import useSWR from 'swr';
import { DashLayout } from '@/components/DashLayout';
import { Badge, StatusBadge } from '@/components/Badge';
import { Button } from '@/components/Button';
import { Modal } from '@/components/Modal';
import { EmptyState } from '@/components/EmptyState';
import { CardSkeleton } from '@/components/Skeleton';
import { useToast, ToastProvider } from '@/components/Toast';
import { apiFetch } from '@/lib/api';
import { getSocket } from '@/lib/socket';
import QRCode from 'react-qr-code';
import type { Session } from '@/types/api';

function getWarmupCap(warmupDay: number, dailyLimit = 200): number {
  if (warmupDay <= 2) return 10;
  if (warmupDay <= 5) return 25;
  if (warmupDay <= 9) return 50;
  if (warmupDay <= 13) return 100;
  if (warmupDay <= 20) return 150;
  return dailyLimit;
}

const fetcher = (url: string) => apiFetch<Session[]>(url);

/* ── SVG Icons ─────────────────────────────────────────────── */
const IcCloud = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z"/>
  </svg>
);
const IcWifi = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/>
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/>
  </svg>
);
const IcCamera = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
    <circle cx="12" cy="13" r="4"/>
  </svg>
);
const IcHash = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/>
    <line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/>
  </svg>
);
const IcTrash = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
    <path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
  </svg>
);
const IcPhone = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <rect x="5" y="2" width="14" height="20" rx="2"/><line x1="12" y1="18" x2="12.01" y2="18"/>
  </svg>
);
const IcShield = () => (
  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
  </svg>
);
const IcEmpty = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 12.55a11 11 0 0 1 14.08 0"/><path d="M1.42 9a16 16 0 0 1 21.16 0"/>
    <path d="M8.53 16.11a6 6 0 0 1 6.95 0"/><circle cx="12" cy="20" r="1" fill="currentColor"/>
  </svg>
);

/* ── Shared style helpers ───────────────────────────────────── */
const inputStyle: React.CSSProperties = {
  width: '100%',
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  borderRadius: 8,
  padding: '10px 14px',
  color: 'var(--text-primary)',
  fontSize: 13,
  outline: 'none',
  fontFamily: 'inherit',
};
const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 500,
  color: 'var(--text-muted)',
  marginBottom: 6,
  letterSpacing: '0.8px',
  textTransform: 'uppercase',
};

/* ── Session Card ───────────────────────────────────────────── */
function SessionCard({ session: s, dailyLimit, onDisconnect, onDelete, onReconnect }: { session: Session; dailyLimit: number; onDisconnect: () => void; onDelete: () => void; onReconnect: () => void }) {
  const fp = s.fingerprint as { deviceModel?: string } | null;
  const isOnline = s.status === 'ONLINE';

  return (
    <div
      className="glass glass-card-hover"
      style={{ borderRadius: 14, padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 0 }}
    >
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
        <div style={{ overflow: 'hidden', flex: 1, marginRight: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
            {isOnline && (
              <span className="pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: '#25d366', display: 'inline-block', flexShrink: 0 }} />
            )}
            <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {s.phoneNumber ?? s.label}
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{s.label}</div>
        </div>
        <StatusBadge status={s.status} />
      </div>

      {/* Mode badge */}
      <div style={{ marginBottom: 16 }}>
        <Badge variant={s.mode === 'CLOUD_API' ? 'cloud' : 'ws'} size="sm">
          {s.mode === 'CLOUD_API' ? 'Cloud API' : 'WebSocket'}
        </Badge>
      </div>

      {/* Warmup */}
      {s.warmupDay < 22 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
            <span>Warmup</span>
            <span>Day {s.warmupDay} / 21</span>
          </div>
          <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
            <div style={{ height: '100%', width: `${Math.min((s.warmupDay / 21) * 100, 100)}%`, background: '#25d366', borderRadius: 2, transition: 'width 0.4s' }} />
          </div>
        </div>
      )}

      {/* Daily usage */}
      {(() => {
        const cap = getWarmupCap(s.warmupDay, dailyLimit);
        return (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
              <span>Daily usage</span>
              <span>{s.dailySent} / {cap}</span>
            </div>
            <div style={{ height: 3, background: 'rgba(255,255,255,0.06)', borderRadius: 2 }}>
              <div style={{
                height: '100%',
                width: `${Math.min((s.dailySent / cap) * 100, 100)}%`,
                background: s.dailySent >= cap ? '#ef4444' : s.dailySent >= cap * 0.8 ? '#f59e0b' : '#25d366',
                borderRadius: 2, transition: 'width 0.4s',
              }} />
            </div>
          </div>
        );
      })()}

      {/* Meta info */}
      {fp?.deviceModel && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
          <IcPhone />{fp.deviceModel}
        </div>
      )}
      {s.proxyId && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, color: 'var(--text-muted)', marginBottom: 4 }}>
          <IcShield />Proxy assigned
        </div>
      )}

      {/* Actions */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 14, marginTop: 10, display: 'flex', gap: 8, alignItems: 'center' }}>
        {s.status === 'OFFLINE' && (
          <Button size="sm" onClick={onReconnect}>Reconnect</Button>
        )}
        {s.status === 'CONNECTING' && (
          <Button size="sm" variant="outline" onClick={onDisconnect}>Cancel</Button>
        )}
        {s.status === 'ONLINE' && (
          <Button size="sm" variant="danger" onClick={onDisconnect}>Disconnect</Button>
        )}
        <button
          onClick={onDelete}
          title="Delete session"
          style={{ marginLeft: 'auto', background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.12)', borderRadius: 7, color: '#ef4444', cursor: 'pointer', width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.15s' }}
        >
          <IcTrash />
        </button>
      </div>
    </div>
  );
}

/* ── Mode option card ───────────────────────────────────────── */
function ModeCard({ value: _value, active, icon, title, desc, onClick }: { value: string; active: boolean; icon: React.ReactNode; title: string; desc: string; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        border: `1px solid ${active ? 'rgba(37,211,102,0.3)' : 'rgba(255,255,255,0.06)'}`,
        borderRadius: 12,
        padding: '16px 18px',
        cursor: 'pointer',
        background: active ? 'rgba(37,211,102,0.07)' : 'rgba(255,255,255,0.02)',
        transition: 'all 0.15s',
      }}
    >
      <div style={{ color: active ? '#25d366' : 'var(--text-muted)', marginBottom: 10 }}>{icon}</div>
      <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4, color: 'var(--text-primary)' }}>{title}</div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5 }}>{desc}</div>
    </div>
  );
}

/* ── Main content ───────────────────────────────────────────── */
function SessionsContent() {
  const { data, isLoading, mutate } = useSWR<Session[]>('/sessions', fetcher, { refreshInterval: 5000 });
  const { data: settings } = useSWR<{ dailyLimit: number }>('/settings', (url: string) => apiFetch<{ dailyLimit: number }>(url));
  const dailyLimit = settings?.dailyLimit ?? 200;
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [mode, setMode] = useState<'CLOUD_API' | 'BAILEYS'>('BAILEYS');
  const [label, setLabel] = useState('');
  const [subMethod, setSubMethod] = useState<'qr' | 'pairing'>('qr');
  const [pairingPhone, setPairingPhone] = useState('');
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [connectLoading, setConnectLoading] = useState(false);
  const [qrData, setQrData] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [cloudApiData, setCloudApiData] = useState({ phoneNumberId: '', wabaId: '' });
  const [reconnectId, setReconnectId] = useState<string | null>(null);
  const [reconnectQr, setReconnectQr] = useState<string | null>(null);

  useEffect(() => {
    const socket = getSocket();
    const handleStatus = ({ sessionId, status }: { sessionId: string; status: string }) => {
      mutate(
        (prev) => prev?.map((s) => (s.id === sessionId ? { ...s, status: status as Session['status'] } : s)),
        false,
      );
      if (status === 'ONLINE' && createdId === sessionId) {
        setModalOpen(false);
        toast('Session connected!', 'success');
      }
      if (status === 'ONLINE' && reconnectId === sessionId) {
        setReconnectId(null);
        setReconnectQr(null);
        toast('Session reconnected!', 'success');
      }
    };
    const handleQr = ({ sessionId, qr }: { sessionId: string; qr: string }) => {
      if (createdId === sessionId) setQrData(qr);
      if (reconnectId === sessionId) setReconnectQr(qr);
    };
    socket.on('session:status', handleStatus);
    socket.on('session:qr', handleQr);
    return () => {
      socket.off('session:status', handleStatus);
      socket.off('session:qr', handleQr);
    };
  }, [createdId, reconnectId, mutate, toast]);

  // Auto-trigger connect when entering step 3 so the user sees QR/pairing immediately
  // without needing to click an extra button.
  useEffect(() => {
    if (step === 3 && createdId && !qrData && !pairingCode && !connectLoading) {
      void handleConnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, createdId]);

  const handleCreate = async () => {
    setConnectLoading(true);
    try {
      const session = await apiFetch<Session>('/sessions', {
        method: 'POST',
        body: JSON.stringify({ label: label || `Session ${Date.now()}`, mode, ...(mode === 'CLOUD_API' ? { cloudApi: cloudApiData } : {}) }),
      });
      setCreatedId(session.id);
      if (mode === 'BAILEYS') { setStep(3); }
      else { toast('Session created', 'success'); setModalOpen(false); mutate(); }
    } catch (err) { toast(String(err), 'error'); }
    finally { setConnectLoading(false); }
  };

  const handleConnect = async () => {
    if (!createdId) return;
    setConnectLoading(true);
    try {
      if (subMethod === 'qr') {
        await apiFetch(`/sessions/${createdId}/connect`, { method: 'POST', body: JSON.stringify({ method: 'qr' }) });
      } else {
        const result = await apiFetch<{ method: string; code?: string }>(`/sessions/${createdId}/connect`, { method: 'POST', body: JSON.stringify({ method: 'pairing', phone: pairingPhone }) });
        if (result.code) setPairingCode(result.code);
      }
    } catch (err) { toast(String(err), 'error'); }
    finally { setConnectLoading(false); }
  };

  const handleReconnect = async (id: string) => {
    setReconnectId(id);
    setReconnectQr(null);
    try {
      await apiFetch(`/sessions/${id}/connect`, { method: 'POST', body: JSON.stringify({ method: 'qr' }) });
      mutate();
    } catch (err) {
      setReconnectId(null);
      toast(String(err), 'error');
    }
  };

  const handleDisconnect = async (id: string) => {
    try {
      await apiFetch(`/sessions/${id}/disconnect`, { method: 'POST' });
      toast('Session disconnected', 'success');
      mutate();
    } catch (err) { toast(String(err), 'error'); }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this session? This cannot be undone.')) return;
    try {
      await apiFetch(`/sessions/${id}`, { method: 'DELETE' });
      toast('Session deleted', 'success');
      mutate();
    } catch (err) { toast(String(err), 'error'); }
  };

  const resetModal = () => { setStep(1); setLabel(''); setSubMethod('qr'); setPairingPhone(''); setCreatedId(null); setQrData(null); setPairingCode(null); setModalOpen(false); };

  const sessions = data ?? [];

  return (
    <DashLayout title="Sessions" onRefresh={() => mutate()}>
      {/* Header bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
        <div>
          <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
            {sessions.length} session{sessions.length !== 1 ? 's' : ''} · {sessions.filter((s) => s.status === 'ONLINE').length} online
          </div>
        </div>
        <Button onClick={() => setModalOpen(true)}>Add Session</Button>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {[1, 2, 3].map((i) => <CardSkeleton key={i} />)}
        </div>
      ) : sessions.length === 0 ? (
        <EmptyState
          icon={<IcEmpty />}
          title="No sessions configured"
          subtitle="Connect a WhatsApp number to start sending campaigns"
          action={<Button onClick={() => setModalOpen(true)}>Add Session</Button>}
        />
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {sessions.map((s, i) => (
            <div key={s.id} className={`anim-${Math.min(i + 1, 6) as 1 | 2 | 3 | 4 | 5 | 6}`}>
              <SessionCard
                session={s}
                dailyLimit={dailyLimit}
                onDisconnect={() => handleDisconnect(s.id)}
                onDelete={() => handleDelete(s.id)}
                onReconnect={() => handleReconnect(s.id)}
              />
            </div>
          ))}
        </div>
      )}

      {/* Reconnect QR Modal */}
      {reconnectId && (
        <Modal open onClose={() => { setReconnectId(null); setReconnectQr(null); }} title="Reconnect Session" width={400}>
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            {reconnectQr ? (
              <div>
                <div style={{ background: '#fff', padding: 16, borderRadius: 12, display: 'inline-block', marginBottom: 18, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                  <QRCode value={reconnectQr} size={200} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, marginBottom: 6 }}>Scan with WhatsApp</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <span className="pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#25d366', display: 'inline-block' }} />
                  Waiting for scan...
                </div>
              </div>
            ) : (
              <div style={{ padding: '32px 0' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, marginBottom: 8 }}>
                  <span className="pulse" style={{ width: 7, height: 7, borderRadius: '50%', background: '#25d366', display: 'inline-block' }} />
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>Initializing session...</span>
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>QR code will appear here shortly</div>
              </div>
            )}
            <div style={{ marginTop: 20, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
              <Button variant="ghost" onClick={() => { setReconnectId(null); setReconnectQr(null); }}>Close</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Add Session Modal */}
      <Modal open={modalOpen} onClose={resetModal} title="Add New Session" width={520}>
        {/* Step indicator */}
        <div style={{ display: 'flex', gap: 0, marginBottom: 24 }}>
          {['Mode', 'Connect', 'Pair'].map((s, i) => (
            <React.Fragment key={s}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: i + 1 < step ? '#25d366' : i + 1 === step ? 'rgba(37,211,102,0.15)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${i + 1 <= step ? 'rgba(37,211,102,0.4)' : 'rgba(255,255,255,0.07)'}`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 600,
                  color: i + 1 < step ? '#000' : i + 1 === step ? '#25d366' : 'var(--text-muted)',
                }}>
                  {i + 1 < step ? (
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                  ) : i + 1}
                </div>
                <div style={{ fontSize: 10, color: i + 1 === step ? 'var(--text-primary)' : 'var(--text-muted)' }}>{s}</div>
              </div>
              {i < 2 && <div style={{ flex: 1, height: 1, background: i + 1 < step ? '#25d366' : 'rgba(255,255,255,0.06)', marginTop: 14, alignSelf: 'flex-start' }} />}
            </React.Fragment>
          ))}
        </div>

        {/* Step 1: Mode */}
        {step === 1 && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              <ModeCard value="CLOUD_API" active={mode === 'CLOUD_API'} icon={<IcCloud />} title="Cloud API" desc="Official Meta Business. Compliant, 100K+/day." onClick={() => setMode('CLOUD_API')} />
              <ModeCard value="BAILEYS" active={mode === 'BAILEYS'} icon={<IcWifi />} title="WebSocket" desc="Any WhatsApp number. Zero cost, instant setup." onClick={() => setMode('BAILEYS')} />
            </div>
            <div style={{ marginBottom: 20 }}>
              <label style={labelStyle}>Session Label</label>
              <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Main Number" style={inputStyle} />
            </div>
            {mode === 'CLOUD_API' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
                <input value={cloudApiData.phoneNumberId} onChange={(e) => setCloudApiData((d) => ({ ...d, phoneNumberId: e.target.value }))} placeholder="Phone Number ID" style={inputStyle} />
                <input value={cloudApiData.wabaId} onChange={(e) => setCloudApiData((d) => ({ ...d, wabaId: e.target.value }))} placeholder="WABA ID" style={inputStyle} />
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Access token read from META_ACCESS_TOKEN env var.</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={resetModal}>Cancel</Button>
              {mode === 'BAILEYS' ? (
                <Button onClick={() => setStep(2)}>Next</Button>
              ) : (
                <Button loading={connectLoading} onClick={handleCreate}>Create Session</Button>
              )}
            </div>
          </div>
        )}

        {/* Step 2: Connection method */}
        {step === 2 && (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 20 }}>
              {([
                { value: 'qr' as const, icon: <IcCamera />, title: 'QR Code', desc: 'Scan with WhatsApp on your phone' },
                { value: 'pairing' as const, icon: <IcHash />, title: 'Pairing Code', desc: 'Enter a code in Linked Devices' },
              ]).map((opt) => (
                <ModeCard key={opt.value} value={opt.value} active={subMethod === opt.value} icon={opt.icon} title={opt.title} desc={opt.desc} onClick={() => setSubMethod(opt.value)} />
              ))}
            </div>
            {subMethod === 'pairing' && (
              <div style={{ marginBottom: 20 }}>
                <label style={labelStyle}>Phone Number (E.164)</label>
                <input value={pairingPhone} onChange={(e) => setPairingPhone(e.target.value)} placeholder="+1234567890" style={inputStyle} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button loading={connectLoading} onClick={handleCreate}>Connect</Button>
            </div>
          </div>
        )}

        {/* Step 3: QR / Pairing display */}
        {step === 3 && (
          <div style={{ textAlign: 'center', padding: '8px 0' }}>
            {qrData ? (
              <div>
                <div style={{ background: '#fff', padding: 16, borderRadius: 12, display: 'inline-block', marginBottom: 18, boxShadow: '0 8px 32px rgba(0,0,0,0.3)' }}>
                  <QRCode value={qrData} size={200} />
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, marginBottom: 6 }}>Scan with WhatsApp</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                  <span className="pulse" style={{ width: 6, height: 6, borderRadius: '50%', background: '#25d366', display: 'inline-block' }} />
                  Waiting for scan...
                </div>
              </div>
            ) : pairingCode ? (
              <div>
                <div style={{ background: 'rgba(37,211,102,0.08)', border: '1px solid rgba(37,211,102,0.2)', borderRadius: 12, padding: '28px 32px', display: 'inline-block', marginBottom: 18 }}>
                  <div style={{ fontSize: 36, fontWeight: 700, color: '#25d366', letterSpacing: 6, fontFamily: 'monospace' }}>
                    {pairingCode}
                  </div>
                </div>
                <div style={{ fontSize: 13, color: 'var(--text-primary)', fontWeight: 500, marginBottom: 6 }}>Enter this code in WhatsApp</div>
                <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Settings → Linked Devices → Link a Device</div>
              </div>
            ) : (
              <div style={{ padding: '24px 0' }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
                  Click to {subMethod === 'qr' ? 'generate QR code' : 'get pairing code'}
                </div>
                <Button loading={connectLoading} onClick={handleConnect}>
                  {subMethod === 'qr' ? 'Show QR Code' : 'Get Pairing Code'}
                </Button>
              </div>
            )}
            <div style={{ marginTop: 24, borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: 16 }}>
              <Button variant="ghost" onClick={resetModal}>Close</Button>
            </div>
          </div>
        )}
      </Modal>
    </DashLayout>
  );
}

export default function SessionsPage() {
  return (
    <ToastProvider>
      <SessionsContent />
    </ToastProvider>
  );
}
