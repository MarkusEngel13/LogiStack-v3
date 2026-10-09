import { useEffect, useState } from 'react';
import { PLAN_LABELS, PLANS, type Kind, type Plan, type Role } from '../../shared/plans';
import { Button, inputClass, Modal } from '../controls';
import { useSyncStatus } from './useSyncStatus';

const KIND_LABEL: Record<Kind, string> = { hand: 'hands', player: 'players', profile: 'profiles', range: 'charts', settings: 'settings', fishy: 'marks' };

/**
 * Top right: who is logged in, the plan, and whether everything is synced. Nothing at all when the
 * app runs local-only (no server, or `npm run dev`).
 */
export function AccountBadge() {
  const s = useSyncStatus();
  const [open, setOpen] = useState(false);
  const [admin, setAdmin] = useState(false);
  if (!s.account) return null;
  const notSynced = Object.entries(s.notSynced).filter(([, n]) => (n ?? 0) > 0) as [Kind, number][];
  const dot = s.state === 'error' || notSynced.length ? 'bg-warn' : s.state === 'syncing' ? 'bg-muted animate-pulse' : 'bg-ok';
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm text-muted hover:bg-surface-2 hover:text-ink" title="Account and sync">
        <span className={`inline-block h-2 w-2 rounded-full ${dot}`} />
        <span className="hidden sm:inline">{s.account.email.split('@')[0]}</span>
        <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[11px] font-semibold text-ink">{s.account.role === 'admin' ? 'Admin' : PLAN_LABELS[s.account.plan]}</span>
      </button>
      {open && (
        <Modal title="Account" onClose={() => setOpen(false)}>
          <div className="space-y-3 text-sm">
            <p>
              Logged in as <b>{s.account.email}</b> · {PLAN_LABELS[s.account.plan]} plan
              {s.account.role !== 'user' && <span className="text-muted"> · {s.account.role}</span>}
            </p>
            <p className="text-muted">
              {s.state === 'synced' && 'Everything is synced: your hands, players, profiles and charts follow you to any device.'}
              {s.state === 'syncing' && 'Syncing…'}
              {s.state === 'error' && `Sync problem: ${s.message ?? 'unknown'}. Your data is safe in this browser; it syncs again on the next change.`}
            </p>
            {notSynced.length > 0 && (
              <p className="rounded-md border border-warn px-3 py-2 text-warn">
                Kept in this browser only: {notSynced.map(([k, n]) => `${n} ${KIND_LABEL[k]}`).join(', ')}. {s.message}
              </p>
            )}
            <div className="grid grid-cols-3 gap-2 text-xs text-muted">
              {(['hand', 'player', 'profile', 'range'] as Kind[]).map((k) => {
                const max = s.account!.limits.items[k];
                return (
                  <div key={k} className="rounded-md bg-surface-2 px-2 py-1.5">
                    <div className="text-ink tabular-nums">
                      {s.account!.usage[k] ?? 0}
                      {max !== null && ` / ${max}`}
                    </div>
                    {KIND_LABEL[k]}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-faint">Your playbook never leaves this browser.</p>
            {s.account.role === 'admin' && (
              <Button onClick={() => setAdmin(true)} className="mt-2">
                Users and plans…
              </Button>
            )}
          </div>
        </Modal>
      )}
      {admin && <AdminModal onClose={() => setAdmin(false)} />}
    </>
  );
}

interface UserRow {
  email: string;
  plan: Plan;
  role: Role;
  seenAt: string;
  items: number;
}

/** Admin: everyone who has logged in, with their plan and role. */
function AdminModal({ onClose }: { onClose: () => void }) {
  const [users, setUsers] = useState<UserRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = () =>
    fetch('/api/admin/users')
      .then((r) => r.json() as Promise<{ users?: UserRow[]; message?: string }>)
      .then((b) => (b.users ? setUsers(b.users) : setError(b.message ?? 'Could not load the users.')))
      .catch((e: unknown) => setError(String(e)));
  useEffect(() => void load(), []);
  const update = (email: string, patch: { plan?: Plan; role?: Role }) =>
    fetch(`/api/admin/users/${encodeURIComponent(email)}`, { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(patch) })
      .then(() => load())
      .catch((e: unknown) => setError(String(e)));

  return (
    <Modal title="Users and plans" onClose={onClose} wide>
      <p className="mb-3 text-sm text-muted">Everyone who has logged in at least once. A friend has to log in once before you can set their plan.</p>
      {error && <p className="mb-3 text-sm text-danger">{error}</p>}
      {!users ? (
        <p className="text-sm text-muted">Loading…</p>
      ) : (
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted">
            <tr>
              <th className="py-1">Email</th>
              <th>Plan</th>
              <th>Role</th>
              <th className="text-right">Items</th>
              <th className="text-right">Last seen</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.email} className="border-t border-line">
                <td className="py-1.5">{u.email}</td>
                <td>
                  <select className={`${inputClass} py-1`} value={u.plan} onChange={(e) => void update(u.email, { plan: e.target.value as Plan })}>
                    {PLANS.map((p) => (
                      <option key={p} value={p}>
                        {PLAN_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  <select className={`${inputClass} py-1`} value={u.role} onChange={(e) => void update(u.email, { role: e.target.value as Role })}>
                    {(['user', 'editor', 'admin'] as Role[]).map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="text-right tabular-nums">{u.items}</td>
                <td className="text-right text-xs text-muted">{u.seenAt.slice(0, 10)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}
