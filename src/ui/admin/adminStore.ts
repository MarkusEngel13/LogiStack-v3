import { useEffect, useSyncExternalStore } from 'react';
import type { AdminUser, AdminUserPatch } from '../../shared/api';
import { errorText, request } from '../sync/request';
import { news } from './users';

/**
 * The user list for the admin, one copy for the page: the start page's Joker card and the menu
 * show its news (open Premium requests, users new since the last visit), the dashboard shows it
 * all. Small on purpose, so it stays in the main file while the dashboard loads when opened.
 */

interface UsersState {
  users: AdminUser[] | null;
  error: string | null;
  loading: boolean;
}

let state: UsersState = { users: null, error: null, loading: false };
const subs = new Set<() => void>();
const emit = (patch: Partial<UsersState>) => {
  state = { ...state, ...patch };
  subs.forEach((f) => f());
};
const subscribe = (f: () => void) => {
  subs.add(f);
  return () => void subs.delete(f);
};

let inflight: Promise<void> | null = null;

export function loadUsers(): Promise<void> {
  if (inflight) return inflight;
  emit({ loading: true });
  inflight = request<{ users?: AdminUser[] }>('GET', 'admin/users')
    .then((b) => {
      if (!Array.isArray(b.users)) throw new Error('The server sent no user list.');
      emit({ users: b.users, error: null });
    })
    .catch((e: unknown) => emit({ error: errorText(e) }))
    .finally(() => {
      inflight = null;
      emit({ loading: false });
    });
  return inflight;
}

/** Changes a user on the server, then here (throws the server's words when it says no). */
export async function patchUser(email: string, patch: AdminUserPatch): Promise<void> {
  await request('PUT', `admin/users/${encodeURIComponent(email)}`, patch);
  emit({ users: state.users?.map((u) => (u.email === email ? { ...u, ...patch } : u)) ?? null });
}

/** Deletes a user and everything they saved. */
export async function deleteUser(email: string): Promise<void> {
  await request('DELETE', `admin/users/${encodeURIComponent(email)}`);
  emit({ users: state.users?.filter((u) => u.email !== email) ?? null });
}

/** The list; loads it the first time an admin needs it. */
export function useAdminUsers(enabled = true): UsersState {
  const s = useSyncExternalStore(subscribe, () => state);
  useEffect(() => {
    if (enabled && !state.users && !state.loading && !state.error) void loadUsers();
  }, [enabled]);
  return s;
}

// ---- the admin's last visit to the dashboard (this browser only) -------------------------------

const VISIT_KEY = 'logistack.admin.visit.v1';
let visit: string | null = (() => {
  try {
    return localStorage.getItem(VISIT_KEY);
  } catch {
    return null;
  }
})();
const visitSubs = new Set<() => void>();

export const lastVisit = () => visit;

/** The dashboard was opened: users who joined before now are no longer news. */
export function markVisit() {
  visit = new Date().toISOString();
  try {
    localStorage.setItem(VISIT_KEY, visit);
  } catch {
    // storage blocked: the badge forgets the visit on reload
  }
  visitSubs.forEach((f) => f());
}

/** Open requests and new users, for the badges (nothing when not admin). */
export function useAdminNews(enabled: boolean) {
  const { users } = useAdminUsers(enabled);
  const since = useSyncExternalStore(
    (f) => {
      visitSubs.add(f);
      return () => void visitSubs.delete(f);
    },
    () => visit,
  );
  return enabled && users ? news(users, since, Date.now()) : { requests: 0, newUsers: 0 };
}
