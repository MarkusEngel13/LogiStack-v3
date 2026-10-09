import { MIN_CASES, STAT_LABELS, type Counts, type Ratio, type StatId } from '../../core/sim/stats';

/** The stats shown in the app, grouped as a tracker would (the full set is in the CLI report). */
const GROUPS: { title: string; ids: StatId[] }[] = [
  { title: 'Before the flop', ids: ['vpip', 'pfr', 'limp', 'threeBet', 'foldTo3Bet'] },
  { title: 'As the raiser', ids: ['cbetFlop', 'cbetHU', 'cbetMW', 'cbetTurn', 'cbetRiver'] },
  { title: 'Against bets', ids: ['foldToCbet', 'raiseCbet', 'checkRaise', 'lead', 'foldSmall', 'foldMedium', 'foldLarge'] },
  { title: 'Showdown', ids: ['wtsd', 'wsd'] },
];

const pct = (r: Ratio) => (r.of ? Math.round((100 * r.n) / r.of) : null);

/** Tracker stats of one seat, each with how often the spot came up; a second column to compare. */
export function StatsGrid({ counts, compare, labels }: { counts: Counts; compare?: Counts; labels?: [string, string] }) {
  return (
    <div className="space-y-3 text-xs">
      {labels && compare && (
        <div className="grid grid-cols-[minmax(0,1fr)_56px_56px] text-faint">
          <span />
          <span className="text-right">{labels[0]}</span>
          <span className="text-right">{labels[1]}</span>
        </div>
      )}
      {GROUPS.map((g) => (
        <div key={g.title}>
          <div className="mb-1 font-semibold text-muted">{g.title}</div>
          {g.ids.map((id) => (
            <Row key={id} id={id} a={counts.stats[id]} b={compare?.stats[id]} />
          ))}
        </div>
      ))}
    </div>
  );
}

function Cell({ r }: { r?: Ratio }) {
  if (!r) return <span />;
  const v = pct(r);
  const shaky = r.of < MIN_CASES;
  return (
    <span className={`text-right tabular-nums ${shaky ? 'text-faint' : 'text-ink'}`} title={`${r.n} of ${r.of}`}>
      {v === null ? '–' : `${v} %`}
      <span className="ml-1 text-[10px] text-faint">({r.of})</span>
    </span>
  );
}

function Row({ id, a, b }: { id: StatId; a: Ratio; b?: Ratio }) {
  return (
    <div className={`grid ${b ? 'grid-cols-[minmax(0,1fr)_56px_56px]' : 'grid-cols-[minmax(0,1fr)_80px]'} items-baseline gap-2 py-0.5`} title={STAT_LABELS[id].long}>
      <span className="truncate text-muted">{STAT_LABELS[id].long}</span>
      <Cell r={a} />
      {b && <Cell r={b} />}
    </div>
  );
}
