import { useEffect, useMemo, useState } from 'react';
import type { SeatStyle } from '../../core/players/style';
import type { SimTable } from '../../core/sim/table';
import { Button, Segmented } from '../controls';
import { loadPlayers, loadProfiles, seatStyleOfPlayer } from '../players/store';
import { allCharts } from '../ranges/charts';
import { StatsGrid } from './StatsGrid';
import { meanSe, useSimRun, type SimResult } from './useSimRun';

/** The built-in pool a player is checked against (7-handed with him). */
export const BUILT_IN_POOL = ['Reg', 'Fish', 'TAG', 'Whale', 'Nit', 'LAG'];

type Opponents = 'mix' | 'mine';

/** A 7-handed table: the style in seat 0, then your other saved players or the built-in mix. */
export function poolTable(style: SeatStyle, opponents: Opponents, exceptId?: string): SimTable {
  const profiles = loadProfiles();
  const mine = opponents === 'mine' ? loadPlayers().filter((p) => p.id !== exceptId).slice(0, 6) : [];
  const others = [
    ...mine.map((p) => {
      const st = seatStyleOfPlayer(p, profiles);
      return { name: p.name, type: st.settings.base, style: st };
    }),
    ...BUILT_IN_POOL.slice(0, 6 - mine.length).map((t) => ({ name: t, type: t })),
  ];
  return { seed: 1, seats: [{ name: style.label, type: style.settings.base, style }, ...others] };
}

const KEY = 'logistack.checks.v1';
/** A short key for a style and run settings (FNV-1a over the JSON). */
const hashOf = (x: unknown) => {
  const t = JSON.stringify(x);
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
};
const loadSaved = (): Record<string, SimResult & { hands: number }> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Record<string, SimResult & { hands: number }>;
  } catch {
    return {};
  }
};

/**
 * "Over many hands": the player at a table of bots for a few hundred hands, with the tracker
 * stats that come out - the numbers to hold against the real person. Runs in the background;
 * the last result per style is kept in this browser.
 */
export function PlayerCheck({ style, exceptId }: { style: SeatStyle; exceptId?: string }) {
  const [opponents, setOpponents] = useState<Opponents>('mix');
  const [hands, setHands] = useState(300);
  const { run, start, stop } = useSimRun();
  const key = useMemo(() => hashOf([style.settings, opponents, hands]), [style.settings, opponents, hands]);
  const saved = useMemo(() => (run.running ? undefined : loadSaved()[key]), [key, run.running]);
  const shown = run.results[0] && (run.running || run.done > 0) ? { ...run.results[0], hands: run.done } : saved;
  const counts = shown?.counts['0'];

  const go = async () => {
    const table = poolTable(style, opponents, exceptId);
    await start([table], hands, allCharts());
  };
  // keep the result once a run ends (also a stopped one: it is still a sample)
  useEffect(() => {
    if (run.running || run.done === 0 || !run.results[0]) return;
    try {
      localStorage.setItem(KEY, JSON.stringify({ ...loadSaved(), [key]: { ...run.results[0], hands: run.done } }));
    } catch {
      // storage full or blocked: the result shows until the page changes
    }
  }, [run.running]); // eslint-disable-line react-hooks/exhaustive-deps

  const win = shown ? meanSe(shown.nets) : null;
  return (
    <div className="space-y-3 border-t border-line pt-4">
      <div>
        <h4 className="text-xs font-semibold text-muted">Over many hands</h4>
        <p className="mt-0.5 text-xs text-faint">
          He plays a few hundred hands at a 7-handed table of bots, 100 BB; the tracker numbers that come out. Hold them against the real person.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented<Opponents>
          size="sm"
          value={opponents}
          onChange={setOpponents}
          options={[
            { value: 'mix', label: 'Built-in mix', title: BUILT_IN_POOL.join(', ') },
            { value: 'mine', label: 'Your players', title: 'Your other saved players (filled up with built-in types)' },
          ]}
        />
        <Segmented<number> size="sm" value={hands} onChange={setHands} options={[200, 300, 500, 1000].map((n) => ({ value: n, label: String(n) }))} />
        {run.running ? (
          <Button variant="secondary" onClick={stop}>
            Stop
          </Button>
        ) : (
          <Button variant="primary" onClick={() => void go()}>
            {saved ? 'Run again' : 'Run'}
          </Button>
        )}
      </div>
      {run.running && (
        <div>
          <div className="h-1.5 overflow-hidden rounded bg-surface-3">
            <div className="h-full bg-accent transition-all" style={{ width: `${(100 * run.done) / run.total}%` }} />
          </div>
          <div className="mt-1 text-[11px] text-faint">
            {run.done} of {run.total} hands · about {Math.max(1, Math.round(((run.total - run.done) * 1.5) / 60))} min left
          </div>
        </div>
      )}
      {run.error && <p className="text-xs text-danger">{run.error}</p>}
      {counts && (
        <>
          <div className="flex items-baseline justify-between text-xs">
            <span className="text-muted">{shown!.hands} hands</span>
            {win && (
              <span className="tabular-nums" title="Win rate against these bots, ± one standard error (it swings a lot over few hands)">
                {(100 * win.mean).toFixed(0)} ± {(100 * win.se).toFixed(0)} bb/100
              </span>
            )}
          </div>
          <StatsGrid counts={counts} />
          <p className="text-[11px] text-faint">(n) = how often the spot came up; grey = fewer than 30 times, not to be trusted yet.</p>
        </>
      )}
    </div>
  );
}
