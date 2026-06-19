'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

interface Contact { id: string; phone: string; name?: string | null; }

const NAV = [
  { label: 'Dashboard',  href: '/',          icon: '⊞' },
  { label: 'Sessions',   href: '/sessions',   icon: '📡' },
  { label: 'Campaigns',  href: '/campaigns',  icon: '📊' },
  { label: 'Contacts',   href: '/contacts',   icon: '👥' },
  { label: 'Templates',  href: '/templates',  icon: '📄' },
  { label: 'Replies',    href: '/replies',    icon: '💬' },
  { label: 'Analytics',  href: '/analytics',  icon: '📈' },
  { label: 'Settings',   href: '/settings',   icon: '⚙️' },
];

interface Props { open: boolean; onClose: () => void; }

export function GlobalSearch({ open, onClose }: Props) {
  const [query, setQuery] = useState('');
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [searching, setSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    setQuery('');
    setContacts([]);
    const t = setTimeout(() => inputRef.current?.focus(), 40);
    return () => clearTimeout(t);
  }, [open]);

  useEffect(() => {
    if (query.trim().length < 2) { setContacts([]); return; }
    setSearching(true);
    const t = setTimeout(() => {
      apiFetch<{ data: Contact[] }>(`/contacts?search=${encodeURIComponent(query.trim())}&take=6`)
        .then(r => setContacts(r.data))
        .catch(() => setContacts([]))
        .finally(() => setSearching(false));
    }, 280);
    return () => clearTimeout(t);
  }, [query]);

  const go = useCallback((href: string) => {
    router.push(href);
    onClose();
  }, [router, onClose]);

  if (!open || typeof document === 'undefined') return null;

  const showNav = query.trim().length < 2;

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 999,
          background: 'rgba(0,0,0,0.72)',
          backdropFilter: 'blur(6px)',
          WebkitBackdropFilter: 'blur(6px)',
        }}
      />
      <div style={{
        position: 'fixed', top: '18%', left: '50%', transform: 'translateX(-50%)',
        zIndex: 1000, width: 540, maxWidth: 'calc(100vw - 32px)',
        background: 'rgba(12,12,12,0.98)',
        border: '1px solid rgba(212,175,55,0.22)',
        borderRadius: 16,
        boxShadow: '0 32px 96px rgba(0,0,0,0.8)',
        overflow: 'hidden',
      }}>
        {/* Input row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="rgba(212,175,55,0.5)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
          </svg>
          <input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => { if (e.key === 'Escape') onClose(); }}
            placeholder="Search contacts, navigate pages..."
            style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text-primary)', fontSize: 14, fontFamily: 'inherit' }}
          />
          <span style={{ fontSize: 10, fontFamily: 'monospace', color: 'var(--text-muted)', background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 4, padding: '2px 5px' }}>ESC</span>
        </div>

        {/* Results */}
        <div style={{ maxHeight: 380, overflowY: 'auto', padding: '6px 0 10px' }}>
          {showNav ? (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', padding: '4px 16px 6px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                Quick Navigation
              </div>
              {NAV.map(n => (
                <SearchRow key={n.href} icon={n.icon} label={n.label} sub="page" onClick={() => go(n.href)} />
              ))}
            </div>
          ) : searching ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>Searching…</div>
          ) : contacts.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', fontSize: 12, color: 'var(--text-muted)' }}>
              No contacts matching &ldquo;{query}&rdquo;
            </div>
          ) : (
            <div>
              <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-muted)', padding: '4px 16px 6px', letterSpacing: '1px', textTransform: 'uppercase' }}>
                Contacts · {contacts.length} found
              </div>
              {contacts.map(c => (
                <SearchRow
                  key={c.id}
                  icon="👤"
                  label={c.phone}
                  sub={c.name ?? ''}
                  onClick={() => go(`/contacts?search=${encodeURIComponent(c.phone)}`)}
                />
              ))}
              <ViewAll query={query} onGo={go} />
            </div>
          )}
        </div>
      </div>
    </>,
    document.body,
  );
}

function SearchRow({ icon, label, sub, onClick }: { icon: string; label: string; sub: string; onClick: () => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px',
        cursor: 'pointer',
        background: hover ? 'rgba(212,175,55,0.06)' : 'transparent',
        transition: 'background 0.1s',
      }}
    >
      <span style={{ fontSize: 14, width: 20, textAlign: 'center', flexShrink: 0 }}>{icon}</span>
      <span style={{ flex: 1, fontSize: 13, color: 'var(--text-primary)' }}>{label}</span>
      {sub && (
        <span style={{ fontSize: 11, color: 'var(--text-muted)', background: 'rgba(255,255,255,0.04)', borderRadius: 4, padding: '1px 6px', flexShrink: 0 }}>
          {sub}
        </span>
      )}
    </div>
  );
}

function ViewAll({ query, onGo }: { query: string; onGo: (href: string) => void }) {
  const [hover, setHover] = useState(false);
  return (
    <div
      onClick={() => onGo(`/contacts?search=${encodeURIComponent(query.trim())}`)}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        margin: '4px 16px 0', padding: '8px 14px',
        borderTop: '1px solid rgba(255,255,255,0.05)',
        fontSize: 12, color: '#D4AF37', cursor: 'pointer', textAlign: 'center',
        borderRadius: 8,
        background: hover ? 'rgba(212,175,55,0.06)' : 'transparent',
        transition: 'background 0.12s',
      }}
    >
      View all contacts matching &ldquo;{query}&rdquo; →
    </div>
  );
}
