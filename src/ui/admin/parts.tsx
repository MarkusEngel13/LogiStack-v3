import type { ReactNode } from 'react';
import type { AdminUser } from '../../shared/api';
import { PLAN_LABELS, type Plan, type Role } from '../../shared/plans';
import { ago, DAY } from './users';

/** The small pieces the dashboard repeats: plan pills, tags, the activity dot, a sub-heading. */

const PLAN_STYLE: Record<Plan, string> = {
  free: 'bg-surface-3 text-muted',
  premium: 'bg-accent/15 text-accent',
  pro: 'bg-accent text-accent-ink',
};

export function PlanPill({ plan }: { plan: Plan }) {
  return <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${PLAN_STYLE[plan]}`}>{PLAN_LABELS[plan]}</span>;
}

const TAG_STYLE = {
  warn: 'bg-warn/15 text-warn',
  ok: 'bg-ok/15 text-ok',
  plain: 'border border-line text-muted',
} as const;

export function Tag({ tone = 'plain', title, children }: { tone?: keyof typeof TAG_STYLE; title?: string; children: ReactNode }) {
  return (
    <span title={title} className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-medium whitespace-nowrap ${TAG_STYLE[tone]}`}>
      {children}
    </span>
  );
}

/** The tags after a name: an open request, new since the last visit, a role other than user. */
export function UserTags({ user, fresh }: { user: AdminUser; fresh: boolean }) {
  return (
    <>
      {user.premiumRequest && (
        <Tag tone="warn" title="Asked for Premium">
          asked
        </Tag>
      )}
      {fresh && (
        <Tag tone="ok" title="Joined since your last visit">
          new
        </Tag>
      )}
      {user.role !== 'user' && <RoleTag role={user.role} />}
    </>
  );
}

export const RoleTag = ({ role }: { role: Role }) => <Tag title={role === 'admin' ? 'Sees this dashboard; every feature' : 'Every feature, whatever the plan'}>{role}</Tag>;

/** Green: seen this week; grey: this month; hollow: longer ago. */
export function ActivityDot({ seenAt, now }: { seenAt: string; now: number }) {
  const days = (now - Date.parse(seenAt)) / DAY;
  const style = days <= 7 ? 'bg-ok' : days <= 30 ? 'bg-muted' : 'border border-muted';
  return <span className={`inline-block h-2 w-2 shrink-0 rounded-full ${style}`} title={`Last seen ${ago(seenAt, now)}`} />;
}

export function SubHeading({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <h4 className="text-xs font-semibold tracking-wider text-muted uppercase">{children}</h4>
      {aside}
    </div>
  );
}

/** A meter: count against a limit; the fill turns amber at the limit and red over it. */
export function Meter({ count, max }: { count: number; max: number | null }) {
  if (max === null) return <div className="h-1.5 rounded-full bg-surface-3" />;
  const share = max === 0 ? 1 : Math.min(1, count / max);
  const [track, fill] = count > max ? ['bg-danger/15', 'bg-danger'] : count === max ? ['bg-warn/15', 'bg-warn'] : ['bg-accent/15', 'bg-accent'];
  return (
    <div className={`h-1.5 overflow-hidden rounded-full ${track}`}>
      <div className={`h-full rounded-full ${fill}`} style={{ width: `${Math.max(count ? 4 : 0, share * 100)}%` }} />
    </div>
  );
}
