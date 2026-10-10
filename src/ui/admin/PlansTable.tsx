import type { ReactNode } from 'react';
import { KINDS, LIMITS, PLANS, type Limits } from '../../shared/plans';
import { Section } from '../controls';
import { PlanPill } from './parts';
import { ITEM_LABEL } from './users';

const unlimited = (
  <span className="text-muted" title="No limit">
    ∞
  </span>
);
const yes = (on: boolean) => (on ? <span className="text-ok">✓</span> : <span className="text-faint">–</span>);

const FEATURES: { label: string; hint?: string; value: (l: Limits) => ReactNode }[] = [
  { label: 'Quizzes', value: (l) => (l.quizPractice ? 'any' : 'day’s set') },
  { label: 'Advice per moment', hint: '“Consider this”', value: (l) => l.advicePerSpot },
  { label: 'Explorer', hint: 'bet sizes, what if, EV tables', value: (l) => yes(l.explorer) },
  { label: 'Stats reports', value: (l) => yes(l.stats) },
  { label: 'Share profiles', value: (l) => yes(l.shareProfiles) },
];

/** What each plan may do (shared/plans.ts), read-only: the one table the server enforces too. */
export function PlansTable() {
  const group = (title: string) => (
    <tr>
      <td colSpan={PLANS.length + 1} className="pt-4 pb-1 text-[11px] font-semibold tracking-wider text-faint uppercase">
        {title}
      </td>
    </tr>
  );
  const row = (key: string, label: ReactNode, cells: ReactNode[]) => (
    <tr key={key} className="border-t border-line/60">
      <td className="py-1.5 pr-2">{label}</td>
      {cells.map((c, i) => (
        <td key={i} className="px-1 py-1.5 text-center tabular-nums">
          {c}
        </td>
      ))}
    </tr>
  );
  return (
    <Section title="Plans">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th />
            {PLANS.map((p) => (
              <th key={p} className="w-[22%] px-1 pb-1 text-center font-normal">
                <PlanPill plan={p} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {group('Saved items')}
          {KINDS.map((k) => row(k, ITEM_LABEL[k], PLANS.map((p) => LIMITS[p].items[k] ?? unlimited)))}
          {group('Features')}
          {FEATURES.map((f) =>
            row(
              f.label,
              <>
                {f.label}
                {f.hint && <span className="block text-[11px] text-faint">{f.hint}</span>}
              </>,
              PLANS.map((p) => f.value(LIMITS[p])),
            ),
          )}
        </tbody>
      </table>
      <p className="mt-4 text-xs text-faint">Editors and admins get everything, whatever their plan. The server holds to the item limits; the features are shown in the app. Prices live with the payment provider.</p>
    </Section>
  );
}
