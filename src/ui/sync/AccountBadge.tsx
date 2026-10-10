import { useState } from 'react';
import { LIMITS, PLAN_LABELS, type Kind } from '../../shared/plans';
import { dayOf } from '../admin/users';
import { Button, Modal } from '../controls';
import { planPerks } from '../home/HomePage';
import { errorText, request } from './request';
import { updateAccount } from './sync';
import { useSyncStatus } from './useSyncStatus';

const KIND_LABEL: Record<Kind, string> = { hand: 'hands', player: 'players', profile: 'profiles', range: 'charts', settings: 'settings', fishy: 'marks', quiz: 'quiz days' };

/**
 * Top right: who is logged in, the plan, and whether everything is synced. Nothing at all when the
 * app runs local-only (no server, or `npm run dev`). A Free user asks for Premium here; the admin
 * finds the way to the dashboard.
 */
export function AccountBadge({ onAdmin }: { onAdmin?: () => void }) {
  const s = useSyncStatus();
  const [open, setOpen] = useState(false);
  if (!s.account) return null;
  const a = s.account;
  const isAdmin = a.role === 'admin';
  const canAsk = a.plan === 'free' && a.role === 'user';
  const notSynced = Object.entries(s.notSynced).filter(([, n]) => (n ?? 0) > 0) as [Kind, number][];
  const dot = s.state === 'error' || notSynced.length ? 'bg-warn' : s.state === 'syncing' ? 'bg-muted animate-pulse' : 'bg-ok';
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-ink" title="Account and sync">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
        <span className="hidden sm:inline">{a.email.split('@')[0]}</span>
        <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[11px] font-semibold text-ink">{isAdmin ? 'Admin' : PLAN_LABELS[a.plan]}</span>
      </button>
      {open && (
        <Modal kind="dialog" title="Account" onClose={() => setOpen(false)}>
          <div className="space-y-3 text-sm">
            <p>
              Logged in as <b>{a.email}</b> · {PLAN_LABELS[a.plan]} plan
              {a.role !== 'user' && <span className="text-muted"> · {a.role}</span>}
            </p>
            <p className="text-muted">
              {s.state === 'synced' && 'Everything is synced: your hands, players, profiles and charts follow you to any device.'}
              {s.state === 'syncing' && 'Syncing…'}
              {s.state === 'error' && `Sync problem: ${s.message ?? 'unknown'}. Your data is safe in this browser; it syncs again on the next change.`}
            </p>
            {notSynced.length > 0 && (
              <div className="rounded-md border border-warn px-3 py-2">
                <p className="text-warn">
                  Kept in this browser only: {notSynced.map(([k, n]) => `${n} ${KIND_LABEL[k]}`).join(', ')}. {s.message}
                </p>
                {canAsk && (
                  <div className="mt-2">
                    <PremiumRequest asked={a.premiumRequest} />
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-3 gap-2 text-xs text-muted">
              {(['hand', 'player', 'profile', 'range'] as Kind[]).map((k) => {
                const max = a.limits.items[k];
                return (
                  <div key={k} className="rounded-md bg-surface-2 px-2 py-1.5">
                    <div className="text-ink tabular-nums">
                      {a.usage[k] ?? 0}
                      {max !== null && ` / ${max}`}
                    </div>
                    {KIND_LABEL[k]}
                  </div>
                );
              })}
            </div>
            {canAsk && notSynced.length === 0 && (
              <div className="rounded-md border border-line px-3 py-2.5">
                <div className="font-semibold">Premium</div>
                <p className="mt-0.5 text-xs text-muted">{planPerks(LIMITS.premium).join(' · ')}</p>
                <div className="mt-2.5">
                  <PremiumRequest asked={a.premiumRequest} />
                </div>
              </div>
            )}
            {!isAdmin && <p className="text-xs text-faint">To delete your account and data, ask the admin.</p>}
            {isAdmin && onAdmin && (
              <Button
                variant="primary"
                onClick={() => {
                  setOpen(false);
                  onAdmin();
                }}
              >
                Open the admin dashboard
              </Button>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

/** "Ask for Premium", or the open request with a way to take it back. */
function PremiumRequest({ asked }: { asked: string | null }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const send = async (method: 'POST' | 'DELETE') => {
    setBusy(true);
    setError(null);
    try {
      const b = await request<{ premiumRequest?: string | null }>(method, 'premium-request');
      if (method === 'POST' && typeof b.premiumRequest !== 'string') throw new Error('The server did not take the request. Try again later.');
      updateAccount({ premiumRequest: method === 'POST' ? (b.premiumRequest ?? null) : null });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {asked ? (
        <p className="text-ink">
          Asked for Premium on {dayOf(asked)} ·{' '}
          <button type="button" className="font-semibold text-accent hover:underline disabled:opacity-40" disabled={busy} onClick={() => void send('DELETE')}>
            Take back
          </button>
        </p>
      ) : (
        <Button variant="primary" disabled={busy} onClick={() => void send('POST')}>
          {busy ? 'Asking…' : 'Ask for Premium'}
        </Button>
      )}
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
    </>
  );
}
