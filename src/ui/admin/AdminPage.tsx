import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { AdminUser } from '../../shared/api';
import { PLAN_LABELS } from '../../shared/plans';
import { Button, inputClass, Section, Segmented } from '../controls';
import { AdminIcon } from '../home/HomePage';
import { errorText } from '../sync/request';
import { useSyncStatus } from '../sync/useSyncStatus';
import { useToast } from '../toast';
import { AdviceSection } from './AdviceSection';
import { lastVisit, loadUsers, markVisit, patchUser, useAdminUsers } from './adminStore';
import { ActivityDot, PlanPill, UserTags } from './parts';
import { PlansTable } from './PlansTable';
import { UserPanel } from './UserPanel';
import { ago, dayOf, fits, isNew, ITEM_LABEL, joinsPerWeek, listView, overLimit, overview, totalItems, usage, type UserFilter, type UserSort } from './users';

/** Sections sit under the sticky header when jumped to. */
const JUMP = 'scroll-mt-[calc(var(--header-h,0px)+0.75rem)]';

/**
 * The admin's dashboard: the numbers at a glance, Premium requests, every user (a table on a
 * computer, cards on a phone, one user in the inspector), the plans, and the advice users see.
 * Laid out by the page's own width (container queries), so it reflows when the inspector opens.
 */
export function AdminPage() {
  const { users, error, loading } = useAdminUsers();
  const me = useSyncStatus().account?.email;
  // the visit before this one: who joined since then is "new"
  const [since] = useState(lastVisit);
  useEffect(() => {
    void loadUsers();
    markVisit();
  }, []);
  const now = Date.now();
  const [filter, setFilter] = useState<UserFilter>('all');
  const [selected, setSelected] = useState<string | null>(null);
  const usersRef = useRef<HTMLDivElement>(null);
  const requestsRef = useRef<HTMLDivElement>(null);
  const open = users?.find((u) => u.email === selected);

  const toUsers = (f: UserFilter) => {
    setFilter(f);
    usersRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="@container mx-auto max-w-6xl px-3 py-5 sm:px-6 sm:py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl border p-2" style={{ color: 'var(--suit-h)', borderColor: 'color-mix(in srgb, var(--suit-h) 35%, var(--border))', background: 'color-mix(in srgb, var(--suit-h) 8%, transparent)' }}>
            <AdminIcon className="h-full w-full" />
          </span>
          <div>
            <h1 className="text-xl font-bold">Admin</h1>
            <p className="text-xs text-muted">Who uses LogiStack, their plans and requests, and the advice they see.</p>
          </div>
        </div>
        <Button variant="ghost" onClick={() => void loadUsers()} disabled={loading} title="Load the users again">
          ↻ {loading ? 'Loading…' : 'Refresh'}
        </Button>
      </div>

      {error && <p className="mb-5 rounded-md border border-danger px-3 py-2 text-sm text-danger">Could not load the users: {error}</p>}

      {users && <Tiles users={users} now={now} onUsers={toUsers} onRequests={() => requestsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />}

      <div className="mt-5 grid gap-5 @4xl:grid-cols-[minmax(0,1fr)_minmax(0,24rem)]">
        <div className="min-w-0 space-y-5">
          {/* each its own container: rows and the table follow the column's width */}
          <div ref={requestsRef} className={`@container ${JUMP}`}>
            <Requests users={users} now={now} onOpen={setSelected} />
          </div>
          <div ref={usersRef} className={`@container ${JUMP}`}>
            {users ? (
              <UsersSection users={users} now={now} since={since} me={me} filter={filter} onFilter={setFilter} onOpen={setSelected} />
            ) : (
              <Section title="Users">
                <p className="text-sm text-muted">{error ? 'No list.' : 'Loading the users…'}</p>
              </Section>
            )}
          </div>
        </div>
        <div className="min-w-0 space-y-5">
          <AdviceSection />
          <PlansTable />
        </div>
      </div>

      {open && <UserPanel key={open.email} user={open} self={open.email === me} fresh={isNew(open, since, now)} now={now} onClose={() => setSelected(null)} />}
    </div>
  );
}

// ---- the numbers at a glance -------------------------------------------------------------------

function Tile({ label, value, hint, title, tone, onClick, children }: { label: string; value: number; hint: ReactNode; title?: string; tone?: 'warn'; onClick?: () => void; children?: ReactNode }) {
  const body = (
    <>
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1.5 flex items-end justify-between gap-2">
        <span className={`text-3xl leading-none font-bold tabular-nums ${tone === 'warn' ? 'text-warn' : 'text-ink'}`}>{value}</span>
        {children}
      </div>
      <div className="mt-2 text-[11px] leading-snug text-faint">{hint}</div>
    </>
  );
  const cls = `rounded-lg border bg-surface px-3.5 py-3 text-left sm:px-4 ${tone === 'warn' ? 'border-warn/60' : 'border-line'}`;
  return onClick ? (
    <button type="button" onClick={onClick} title={title} className={`${cls} transition-colors hover:border-accent/70`}>
      {body}
    </button>
  ) : (
    <div className={cls} title={title}>
      {body}
    </div>
  );
}

/** Joins per week, the last 8 weeks; this week in the accent. */
function Joins({ weeks }: { weeks: number[] }) {
  const max = Math.max(1, ...weeks);
  return (
    <span className="flex h-6 items-end gap-[2px]" aria-label="Joins per week, the last 8 weeks">
      {weeks.map((n, i) => (
        <span
          key={i}
          title={`${n} joined ${i === weeks.length - 1 ? 'this week' : `${weeks.length - 1 - i} week${weeks.length - 1 - i === 1 ? '' : 's'} before`}`}
          className={`w-[4px] rounded-t-sm ${i === weeks.length - 1 ? 'bg-accent' : 'bg-muted/45'}`}
          style={{ height: `${Math.max(n ? 18 : 6, (n / max) * 100)}%` }}
        />
      ))}
    </span>
  );
}

function Tiles({ users, now, onUsers, onRequests }: { users: AdminUser[]; now: number; onUsers: (f: UserFilter) => void; onRequests: () => void }) {
  const o = overview(users, now);
  return (
    <div className="grid grid-cols-2 gap-2.5 @xl:grid-cols-3 @5xl:grid-cols-6 sm:gap-3">
      <Tile label="Users" value={o.users} hint="everyone who logged in" onClick={() => onUsers('all')}>
        <Joins weeks={joinsPerWeek(users, now)} />
      </Tile>
      <Tile label="New this week" value={o.newWeek} hint="joined in the last 7 days" onClick={() => onUsers('new')} />
      <Tile label="Active this week" value={o.activeWeek} hint="seen in the last 7 days" />
      <Tile
        label="Active, 30 days"
        value={o.active30}
        hint="≈ the Cloudflare seats in use"
        title={`A Cloudflare seat lapses after 2 weeks without a login: ${o.active14} were seen in the last 14 days.`}
      />
      <Tile label="Premium and Pro" value={o.paid} hint={`${o.users - o.paid} on Free`} />
      <Tile label="Open requests" value={o.requests} hint={o.requests ? 'waiting for you' : 'nobody waiting'} {...(o.requests ? { tone: 'warn' as const, onClick: onRequests } : {})} />
    </div>
  );
}

// ---- Premium requests --------------------------------------------------------------------------

function Requests({ users, now, onOpen }: { users: AdminUser[] | null; now: number; onOpen: (email: string) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const open = (users ?? []).filter((u) => u.premiumRequest).sort((a, b) => a.premiumRequest!.localeCompare(b.premiumRequest!));
  const act = async (u: AdminUser, approve: boolean) => {
    setBusy(u.email);
    try {
      await patchUser(u.email, approve ? { plan: 'premium', premiumRequest: null } : { premiumRequest: null });
      toast({ text: approve ? `${u.email} is on Premium now` : `Declined: ${u.email} stays on ${PLAN_LABELS[u.plan]} and can ask again` });
    } catch (e) {
      toast({ text: `Not saved: ${errorText(e)}` });
    } finally {
      setBusy(null);
    }
  };
  if (!users) return null;
  return (
    <Section title="Premium requests" aside={open.length > 0 && <span className="rounded-full bg-warn/15 px-2 py-0.5 text-xs font-semibold text-warn">{open.length} open</span>}>
      {open.length === 0 ? (
        <p className="text-sm text-muted">Nobody is waiting. When a Free user asks for Premium under their account, it shows here.</p>
      ) : (
        <ul className="space-y-2">
          {open.map((u) => {
            const full = usage(u).filter((x) => x.max !== null && x.count >= x.max && x.kind !== 'settings');
            return (
              <li key={u.email} className="flex flex-col gap-3 rounded-md border border-line bg-surface-2 px-3.5 py-3 @lg:flex-row @lg:items-center">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => onOpen(u.email)} title="Open the user">
                  <div className="truncate font-semibold">{u.email}</div>
                  {u.note && <div className="truncate text-xs text-muted">{u.note}</div>}
                  <div className="mt-0.5 text-xs text-faint">
                    asked {ago(u.premiumRequest!, now)} · {totalItems(u)} items
                    {full.length > 0 && <span className="text-warn"> · full: {full.map((x) => ITEM_LABEL[x.kind].toLowerCase()).join(', ')}</span>}
                  </div>
                </button>
                <div className="flex shrink-0 gap-2">
                  <Button variant="primary" disabled={busy === u.email} onClick={() => void act(u, true)} className="flex-1 @lg:flex-none">
                    Approve
                  </Button>
                  <Button disabled={busy === u.email} onClick={() => void act(u, false)} className="flex-1 @lg:flex-none">
                    Decline
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

// ---- every user --------------------------------------------------------------------------------

const SORTS: { value: UserSort; label: string }[] = [
  { value: 'newest', label: 'Newest first' },
  { value: 'seen', label: 'Last seen' },
  { value: 'items', label: 'Most items' },
];

function UsersSection({
  users,
  now,
  since,
  me,
  filter,
  onFilter,
  onOpen,
}: {
  users: AdminUser[];
  now: number;
  since: string | null;
  me: string | undefined;
  filter: UserFilter;
  onFilter: (f: UserFilter) => void;
  onOpen: (email: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<UserSort>('newest');
  const list = listView(users, { query, filter, sort }, now);
  const count = (f: UserFilter) => users.filter((u) => fits(u, f, now)).length;
  const fresh = users.filter((u) => isNew(u, since, now)).length;
  const label = (text: string, f: UserFilter) => (
    <>
      {text} <span className="opacity-60">{count(f)}</span>
    </>
  );
  const filters: { value: UserFilter; label: ReactNode; title?: string }[] = [
    { value: 'all', label: label('All', 'all') },
    { value: 'free', label: label('Free', 'free') },
    { value: 'premium', label: label('Premium', 'premium') },
    { value: 'pro', label: label('Pro', 'pro') },
    { value: 'requests', label: label('Requests', 'requests') },
    { value: 'new', label: label('New', 'new'), title: 'Joined in the last 7 days' },
  ];
  const overNote = (u: AdminUser) => {
    const over = overLimit(u);
    return over.length ? `Over the ${PLAN_LABELS[u.plan]} limit: ${over.map((x) => `${x.count} ${ITEM_LABEL[x.kind].toLowerCase()} of ${x.max}`).join(', ')}` : null;
  };

  return (
    <Section title="Users" aside={<span className="text-xs text-muted">{list.length === users.length ? `${users.length}` : `${list.length} of ${users.length}`}</span>}>
      <div className="flex flex-col gap-2 @xl:flex-row">
        <input type="search" className={inputClass} value={query} placeholder="Search email or note" onChange={(e) => setQuery(e.target.value)} />
        <select className={`${inputClass} @xl:w-44 @xl:shrink-0`} value={sort} onChange={(e) => setSort(e.target.value as UserSort)} aria-label="Order">
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="mt-2">
        <Segmented size="sm" value={filter} options={filters} onChange={onFilter} />
      </div>
      {fresh > 0 && (
        <p className="mt-2.5 text-xs text-muted">
          <span className="font-semibold text-ok">{fresh} new</span> since your last visit{since ? ` (${dayOf(since)})` : ' (this week)'}.
        </p>
      )}

      {list.length === 0 ? (
        <p className="mt-4 text-sm text-muted">Nobody fits.</p>
      ) : (
        <>
          {/* a computer: a table */}
          <table className="mt-3 hidden w-full text-sm @xl:table">
            <thead className="text-left text-xs text-muted">
              <tr className="border-b border-line">
                <th className="py-2 pr-3 font-medium">User</th>
                <th className="py-2 pr-3 font-medium">Plan</th>
                <th className="py-2 pr-3 text-right font-medium">Items</th>
                <th className="py-2 pr-3 font-medium">Joined</th>
                <th className="py-2 pr-3 font-medium">Last seen</th>
                <th className="w-6" />
              </tr>
            </thead>
            <tbody>
              {list.map((u) => {
                const over = overNote(u);
                return (
                  <tr key={u.email} onClick={() => onOpen(u.email)} className="group cursor-pointer border-b border-line/60 last:border-0 hover:bg-surface-2">
                    <td className="w-full max-w-0 py-2.5 pr-3 pl-1">
                      <div className="flex min-w-0 items-center gap-1.5">
                        <span className="truncate font-medium">{u.email}</span>
                        {u.email === me && <span className="shrink-0 text-xs text-faint">you</span>}
                        <UserTags user={u} fresh={isNew(u, since, now)} />
                      </div>
                      {u.note && <div className="truncate text-xs text-muted">{u.note}</div>}
                    </td>
                    <td className="py-2.5 pr-3">
                      <PlanPill plan={u.plan} />
                    </td>
                    <td className="py-2.5 pr-3 text-right tabular-nums">
                      {over && (
                        <span className="mr-1 font-bold text-danger" title={over}>
                          !
                        </span>
                      )}
                      {totalItems(u)}
                    </td>
                    <td className="py-2.5 pr-3 text-xs whitespace-nowrap text-muted">{dayOf(u.createdAt)}</td>
                    <td className="py-2.5 pr-3 text-xs whitespace-nowrap">
                      <span className="flex items-center gap-1.5">
                        <ActivityDot seenAt={u.seenAt} now={now} />
                        {ago(u.seenAt, now)}
                      </span>
                    </td>
                    <td className="py-2.5 text-right">
                      <button type="button" className="px-1 text-lg leading-none text-faint group-hover:text-accent" aria-label={`Open ${u.email}`} onClick={(e) => {
                          e.stopPropagation();
                          onOpen(u.email);
                        }}
                      >
                        ›
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* a phone (or the page beside the inspector): cards */}
          <ul className="mt-3 space-y-2 @xl:hidden">
            {list.map((u) => {
              const over = overNote(u);
              return (
                <li key={u.email}>
                  <button type="button" onClick={() => onOpen(u.email)} className="w-full rounded-md border border-line bg-surface-2 px-3.5 py-3 text-left transition-colors hover:border-accent/60">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-semibold">{u.email}</span>
                      <span className="text-lg leading-none text-faint">›</span>
                    </div>
                    {u.note && <div className="truncate text-xs text-muted">{u.note}</div>}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <PlanPill plan={u.plan} />
                      <UserTags user={u} fresh={isNew(u, since, now)} />
                      <span className="ml-auto flex items-center gap-1.5 whitespace-nowrap">
                        <ActivityDot seenAt={u.seenAt} now={now} />
                        {ago(u.seenAt, now)} · {totalItems(u)} items
                        {over && <span className="font-bold text-danger">!</span>}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        </>
      )}
      <p className="mt-3 text-xs text-faint">Everyone who has logged in at least once. A red ! marks someone over their plan’s limits (a plan lowered later).</p>
    </Section>
  );
}
