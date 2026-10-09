/**
 * Tracker-style stats from bot hands: what HoldemManager would show for each player type, so the
 * profiles can be checked against the people at the table. Each hand is counted on its own
 * (`countHand`, from the engine's action log) and the counts add up (`addCounts`); the report is
 * a table of shares, each with how many times the spot came up (few cases = shaky number).
 */

import type { TableState } from '../engine/state';

/** One stat: times it happened out of times it could have. */
export interface Ratio {
  n: number;
  of: number;
}

export const STAT_IDS = [
  'vpip',
  'pfr',
  'limp',
  'threeBet',
  'foldTo3Bet',
  'cbetFlop',
  'cbetTurn',
  'cbetRiver',
  'foldToCbet',
  'raiseCbet',
  'lead',
  'foldSmall',
  'foldMedium',
  'foldLarge',
  'checkRaise',
  'wtsd',
  'wsd',
] as const;
export type StatId = (typeof STAT_IDS)[number];

export const STAT_LABELS: Record<StatId, { short: string; long: string }> = {
  vpip: { short: 'VPIP', long: 'puts money in voluntarily before the flop' },
  pfr: { short: 'PFR', long: 'raises before the flop' },
  limp: { short: 'Limp', long: 'limps when nobody has raised (open limp or overlimp)' },
  threeBet: { short: '3-bet', long: 're-raises a single raise' },
  foldTo3Bet: { short: 'F 3B', long: 'folds to a 3-bet after raising' },
  cbetFlop: { short: 'CB F', long: 'preflop raiser bets the flop when he can' },
  cbetTurn: { short: 'CB T', long: 'bets the turn again after a flop c-bet, when he can' },
  cbetRiver: { short: 'CB R', long: 'bets the river again after the turn, when he can' },
  foldToCbet: { short: 'F CB', long: 'folds to a flop c-bet' },
  raiseCbet: { short: 'R CB', long: 'raises a flop c-bet' },
  lead: { short: 'Lead', long: 'bets into the preflop raiser on the flop (donk)' },
  foldSmall: { short: 'F ≤⅓', long: 'folds to a first bet of up to 40 % pot (any street after the flop)' },
  foldMedium: { short: 'F ½-¾', long: 'folds to a first bet of 40-80 % pot' },
  foldLarge: { short: 'F ≥pot', long: 'folds to a first bet of 80 % pot or more' },
  checkRaise: { short: 'XR', long: 'check-raises when he checks and someone bets' },
  wtsd: { short: 'WTSD', long: 'goes to showdown after seeing the flop' },
  wsd: { short: 'W$SD', long: 'wins (some of) the pot at showdown' },
};

export interface Counts {
  hands: number;
  /** Chips won or lost, in big blinds. */
  netBB: number;
  stats: Record<StatId, Ratio>;
}

export const emptyCounts = (): Counts => ({
  hands: 0,
  netBB: 0,
  stats: Object.fromEntries(STAT_IDS.map((id) => [id, { n: 0, of: 0 }])) as Record<StatId, Ratio>,
});

export function addCounts(a: Counts, b: Counts): Counts {
  const out = emptyCounts();
  out.hands = a.hands + b.hands;
  out.netBB = a.netBB + b.netBB;
  for (const id of STAT_IDS) out.stats[id] = { n: a.stats[id].n + b.stats[id].n, of: a.stats[id].of + b.stats[id].of };
  return out;
}

type Action = Extract<TableState['log'][number], { kind: 'action' }>;

/**
 * Counts for every seat dealt in, from the hand's final state (`final.log` has every action with
 * its street, size and the pot after it). `key` names the group a seat counts for (its type).
 */
export function countHand(final: TableState, key: (seat: number) => string): Map<string, Counts> {
  const out = new Map<string, Counts>();
  const bb = final.rules.bb;
  const seats = final.seats.filter((s) => s.dealtIn);
  const c = (seat: number) => {
    const k = key(seat);
    let x = out.get(k);
    if (!x) out.set(k, (x = emptyCounts()));
    return x;
  };
  const yes = (seat: number, id: StatId, did: boolean) => {
    const r = c(seat).stats[id];
    r.of++;
    if (did) r.n++;
  };

  const actions = final.log.filter((e): e is Action => e.kind === 'action');
  const on = (street: Action['street']) => actions.filter((a) => a.street === street);

  for (const s of seats) {
    c(s.seat).hands++;
    c(s.seat).netBB += (final.result?.net[s.seat] ?? 0) / bb;
  }

  // ---- before the flop ----
  const pre = on('preflop');
  let raises = 0;
  let pfrSeat: number | null = null;
  const voluntary = new Set<number>();
  const raised = new Set<number>();
  const decided = new Set<number>(); // first decision counted for limp / 3-bet chances
  const opener = { seat: -1 };
  for (const a of pre) {
    const first = !decided.has(a.seat);
    decided.add(a.seat);
    if (a.action === 'call' || a.action === 'bet' || a.action === 'raise') voluntary.add(a.seat);
    if (first && raises === 0) yes(a.seat, 'limp', a.action === 'call');
    if (raises === 1 && a.seat !== opener.seat) yes(a.seat, 'threeBet', a.action === 'raise');
    if (raises === 2 && a.seat === opener.seat) yes(a.seat, 'foldTo3Bet', a.action === 'fold');
    if (a.action === 'raise' || a.action === 'bet') {
      raises++;
      raised.add(a.seat);
      pfrSeat = a.seat;
      if (raises === 1) opener.seat = a.seat;
    }
  }
  // every seat that had a decision (a big blind who gets a walk had none, as in trackers)
  for (const s of seats) {
    if (!decided.has(s.seat)) continue;
    yes(s.seat, 'vpip', voluntary.has(s.seat));
    yes(s.seat, 'pfr', raised.has(s.seat));
  }

  // ---- after the flop ----
  const sawFlop = new Set(on('flop').map((a) => a.seat));
  let lastAggressor = pfrSeat;
  let barrel: number | null = pfrSeat; // who may c-bet this street (bet the street before)
  for (const street of ['flop', 'turn', 'river'] as const) {
    const acts = on(street);
    if (acts.length === 0) break;
    let betSeen = false;
    let firstBet: { seat: number; size: number } | null = null;
    const checked = new Set<number>();
    const answered = new Set<number>();
    let nextBarrel: number | null = null;
    let pfrActed = false;
    for (const a of acts) {
      const potBefore = a.potAfter - a.added;
      if (!betSeen) {
        // nobody has bet yet on this street
        if (barrel !== null && a.seat === barrel) {
          yes(a.seat, street === 'flop' ? 'cbetFlop' : street === 'turn' ? 'cbetTurn' : 'cbetRiver', a.action === 'bet');
        } else if (street === 'flop' && pfrSeat !== null && !pfrActed && a.seat !== pfrSeat && sawFlop.has(pfrSeat)) {
          // acting before the preflop raiser: a bet is a lead into him
          yes(a.seat, 'lead', a.action === 'bet');
        }
        if (a.seat === pfrSeat) pfrActed = true;
        if (a.action === 'check') checked.add(a.seat);
        if (a.action === 'bet') {
          betSeen = true;
          firstBet = { seat: a.seat, size: potBefore > 0 ? a.added / potBefore : 1 };
          if (a.seat === barrel) nextBarrel = a.seat;
          lastAggressor = a.seat;
        }
        continue;
      }
      // facing the first bet (not yet a raise on top of it): fold by size, c-bet answers, check-raise
      if (firstBet && !answered.has(a.seat) && a.seat !== firstBet.seat) {
        answered.add(a.seat);
        const raisedYet = acts.slice(0, acts.indexOf(a)).some((x) => x.action === 'raise');
        if (!raisedYet) {
          const id: StatId = firstBet.size <= 0.4 ? 'foldSmall' : firstBet.size < 0.8 ? 'foldMedium' : 'foldLarge';
          yes(a.seat, id, a.action === 'fold');
          if (street === 'flop' && firstBet.seat === pfrSeat) {
            yes(a.seat, 'foldToCbet', a.action === 'fold');
            yes(a.seat, 'raiseCbet', a.action === 'raise');
          }
          if (checked.has(a.seat)) yes(a.seat, 'checkRaise', a.action === 'raise');
        }
      }
      if (a.action === 'raise') lastAggressor = a.seat;
    }
    barrel = nextBarrel;
  }
  void lastAggressor;

  // ---- showdown ----
  const atShowdown = final.result?.showdown ? final.seats.filter((s) => s.dealtIn && !s.folded).map((s) => s.seat) : [];
  for (const seat of sawFlop) yes(seat, 'wtsd', atShowdown.includes(seat));
  for (const seat of atShowdown) yes(seat, 'wsd', (final.result?.net[seat] ?? 0) > 0);
  return out;
}

// ---- the report --------------------------------------------------------------------------------

/** Below this many cases a share is shown in brackets: too few to trust. */
export const MIN_CASES = 30;

export function formatReport(groups: Map<string, Counts>, title: string): string {
  const rows = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  const head = ['Type', 'Hands', 'bb/100', ...STAT_IDS.map((id) => STAT_LABELS[id].short)];
  const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
  const pct = (r: Ratio) => {
    if (r.of === 0) return '–';
    const v = `${Math.round((100 * r.n) / r.of)}`;
    return r.of < MIN_CASES ? `(${v})` : v;
  };
  const out = [
    `### ${title}`,
    '',
    line(head),
    line(head.map(() => '---')),
    ...rows.map(([k, c]) => line([k, String(c.hands), (c.hands ? (100 * c.netBB) / c.hands : 0).toFixed(1), ...STAT_IDS.map((id) => pct(c.stats[id]))])),
    '',
    'Shares in %. (x) = fewer than 30 cases so far. Cases per stat:',
    '',
    line(['Type', ...STAT_IDS.map((id) => STAT_LABELS[id].short)]),
    line(['---', ...STAT_IDS.map(() => '---')]),
    ...rows.map(([k, c]) => line([k, ...STAT_IDS.map((id) => String(c.stats[id].of))])),
    '',
    ...STAT_IDS.map((id) => `- **${STAT_LABELS[id].short}**: ${STAT_LABELS[id].long}`),
  ];
  return out.join('\n');
}
