/**
 * The words for a moment of a hand, as the playbook uses them: a piece of HHP advice is tied to
 * some of these tags ("river, facing a big bet, the turn checked through, against a rec"), and
 * the app computes them for the player to act at any point of a hand. The vocabulary is shared
 * with the streamlining agents (the playbook brief lists the same values) - change both together.
 *
 * "I" is the player deciding, "they" the opponent: the last one who bet or raised, else the one
 * other player still in.
 */

import type { TableState, SeatState, Street } from '../engine/state';
import type { SeatNo } from '../hand/types';
import { lastCardScare, texture } from '../texture';

export const DIMENSIONS = {
  street: ['preflop', 'flop', 'turn', 'river'],
  pot: ['limped', 'srp', '3bp', '4bp'],
  players: ['hu', 'multiway'],
  position: ['ip', 'oop'],
  /** Did I raise last before the flop (the preflop raiser) or not. */
  role: ['pfr', 'caller'],
  /** first = nobody bet yet this street (first to act, or checked to); facing-raise = my own bet got raised (a check-raise, a re-raise). */
  decision: ['first', 'facing-bet', 'facing-raise'],
  /** The bet faced, against the pot before it: small up to 40 %, medium to 70 %, big to 100 %, overbet beyond, all-in. */
  size: ['small', 'medium', 'big', 'overbet', 'all-in'],
  line: [
    'they-cbet', 'they-donk', 'they-probe', 'they-stab', 'they-check-raise', 'they-double-barrel', 'they-triple-barrel',
    'they-checked', 'they-check-called', 'they-limped', 'they-raised', 'they-3bet', 'they-4bet',
    'i-cbet', 'i-checked-back', 'flop-checked-through', 'turn-checked-through',
  ],
  board: ['wet', 'static', 'paired', 'monotone', 'flush-draw', 'straight-possible', 'flush-possible', 'scare-flush', 'scare-straight', 'scare-pair', 'blank'],
  villain: ['rec', 'whale', 'reg', 'nit', 'lag', 'maniac', 'unknown'],
  status: ['winning', 'stuck', 'tilt', 'drinking'],
  /** Effective stack at the start of the hand: short under 60 BB, 100bb to 150, deep to 300, very-deep beyond. */
  depth: ['short', '100bb', 'deep', 'very-deep'],
} as const;

export type Dimension = keyof typeof DIMENSIONS;
export type SpotTags = { [D in Dimension]: string[] };

/** The playbook's opponent words for the wizard's player types. */
const VILLAIN: Record<string, string[]> = {
  Fish: ['rec'],
  Whale: ['whale', 'rec'],
  Reg: ['reg'],
  TAG: ['reg'],
  Nit: ['nit'],
  'Weak-tight rec': ['rec', 'nit'],
  LAG: ['lag'],
  Maniac: ['maniac'],
};

type Action = Extract<TableState['log'][number], { kind: 'action' }>;
const STREETS: Street[] = ['preflop', 'flop', 'turn', 'river'];

export function spotTags(state: TableState, seat: SeatNo): SpotTags {
  const me = state.seats.find((s) => s.seat === seat)!;
  const live = state.seats.filter((s) => s.dealtIn && !s.folded);
  const others = live.filter((s) => s.seat !== seat);
  const actions = state.log.filter((e): e is Action => e.kind === 'action');
  const on = (st: Street) => actions.filter((a) => a.street === st);
  const aggressive = (a: Action) => a.action === 'bet' || a.action === 'raise';
  const street = state.street;
  const now = on(street);

  // preflop: the raises make the pot type; the last raiser is the preflop raiser
  const pfRaises = on('preflop').filter(aggressive);
  const pfr = pfRaises.length ? pfRaises[pfRaises.length - 1]!.seat : null;
  const pot = ['limped', 'srp', '3bp', '4bp'][Math.min(3, pfRaises.length)]!;

  // the opponent: whoever bet or raised last (this street first, then earlier), else the one other player
  const lastAggro = [...actions].reverse().find((a) => aggressive(a) && a.seat !== seat && others.some((o) => o.seat === a.seat));
  const villain: SeatState | undefined = lastAggro ? others.find((o) => o.seat === lastAggro.seat) : others.length === 1 ? others[0] : undefined;
  const them = villain?.seat;

  // what I face now
  const owed = Math.max(0, state.currentBet - me.streetBet);
  const iBetThisStreet = now.some((a) => a.seat === seat && aggressive(a));
  // before the flop the blinds don't count as a bet: unopened (limpers or not) is "first"
  const unopened = street === 'preflop' ? pfRaises.length === 0 : owed <= 0;
  const decision = unopened ? 'first' : iBetThisStreet ? 'facing-raise' : 'facing-bet';
  // the bet faced against the pot it went into (after the flop; preflop sizes are in big blinds)
  const size: string[] = [];
  const faced = [...now].reverse().find(aggressive);
  if (decision !== 'first' && street !== 'preflop' && faced) {
    if (faced.allIn || owed >= me.stack) size.push('all-in');
    else {
      const into = faced.potAfter - faced.added;
      const f = into > 0 ? faced.added / into : 1;
      size.push(f <= 0.4 ? 'small' : f <= 0.7 ? 'medium' : f <= 1 ? 'big' : 'overbet');
    }
  }

  // position: I act after every other player still in
  const order = (s: SeatNo) => (s - state.button + state.rules.tableSeats - 1) % state.rules.tableSeats;
  const ip = street !== 'preflop' && others.every((o) => order(seat) > order(o.seat));

  // the line
  const line = new Set<string>();
  if (them !== undefined) {
    const theirs = (st: Street) => on(st).filter((a) => a.seat === them);
    const betFirst = (st: Street) => {
      const firstBet = on(st).find(aggressive);
      return firstBet?.seat;
    };
    const lastAggressorOf = (st: Street) => [...on(st)].reverse().find(aggressive)?.seat ?? null;
    // preflop words
    const pf = theirs('preflop');
    if (pf.some((a) => a.action === 'call') && !pf.some(aggressive) && pfRaises.length === 0) line.add('they-limped');
    const raiseIndex = pfRaises.map((a) => a.seat);
    raiseIndex.forEach((s, i) => {
      if (s !== them) return;
      line.add(i === 0 ? 'they-raised' : i === 1 ? 'they-3bet' : 'they-4bet');
    });
    // postflop: who had the initiative going into each street
    let initiative: SeatNo | null = pfr;
    const barrels: Street[] = [];
    for (const st of STREETS.slice(1)) {
      const acts = on(st);
      if (!acts.length && st !== street) break;
      const first = betFirst(st);
      if (first === them) {
        if (initiative === them) {
          if (st === 'flop') line.add('they-cbet');
          barrels.push(st);
        } else if (initiative === seat) {
          // they bet into me, the one with the initiative: a donk if they act first, a stab after my check
          const myCheckBefore = acts.findIndex((a) => a.seat === seat && a.action === 'check') < acts.findIndex((a) => a.seat === them && aggressive(a)) && acts.some((a) => a.seat === seat && a.action === 'check');
          line.add(myCheckBefore ? 'they-stab' : 'they-donk');
        } else if (initiative === null || !live.some((s) => s.seat === initiative)) {
          line.add('they-stab');
        }
        if (st !== 'flop' && on(STREETS[STREETS.indexOf(st) - 1]!).every((a) => a.action === 'check') && initiative !== them) line.add('they-probe');
      }
      const theirActs = acts.filter((a) => a.seat === them);
      if (theirActs.some((a) => a.action === 'check') && theirActs.some((a) => a.action === 'raise')) line.add('they-check-raise');
      if (acts.length && acts.every((a) => a.action === 'check') && st !== street) line.add(`${st}-checked-through`);
      if (first === seat && st === 'flop' && pfr === seat) line.add('i-cbet');
      if (st !== street && theirActs.some((a) => a.action === 'call') && acts.some((a) => a.seat === seat && aggressive(a))) line.add('they-check-called');
      if (st === street) {
        if (decision === 'first' && theirActs.some((a) => a.action === 'check')) line.add('they-checked');
        break;
      }
      // I checked back last street in position
      initiative = lastAggressorOf(st) ?? initiative;
    }
    if (barrels.length >= 2 && barrels.includes(street)) line.add(barrels.length >= 3 ? 'they-triple-barrel' : 'they-double-barrel');
    const prev = STREETS[STREETS.indexOf(street) - 1];
    if (prev && prev !== 'preflop') {
      const p = on(prev);
      const mine = p.filter((a) => a.seat === seat);
      if (p.length && p.every((a) => a.action === 'check') && mine.length && order(seat) > Math.max(...others.map((o) => order(o.seat)))) line.add('i-checked-back');
    }
  }
  for (const t of ['flop-checked-through', 'turn-checked-through']) {
    const st = t.split('-')[0] as Street;
    const acts = on(st);
    if (st !== street && acts.length && acts.every((a) => a.action === 'check')) line.add(t);
  }

  // the board
  const board: string[] = [];
  if (state.board.length >= 3) {
    const tx = texture(state.board);
    if (tx.wet) board.push('wet');
    if (tx.static) board.push('static');
    if (tx.paired) board.push('paired');
    if (tx.monotone) board.push('monotone');
    if (tx.flushDraw) board.push('flush-draw');
    if (tx.straightPossible) board.push('straight-possible');
    if (tx.flushPossible) board.push('flush-possible');
    const sc = lastCardScare(state.board);
    if (sc) {
      if (sc.flush) board.push('scare-flush');
      if (sc.straight) board.push('scare-straight');
      if (sc.pair) board.push('scare-pair');
      if (!sc.flush && !sc.straight && !sc.pair) board.push('blank');
    }
  }

  // the opponent's type and statuses, the depth
  const villainTags = villain ? (VILLAIN[villain.playerType ?? ''] ?? ['unknown']) : [];
  const status = villain ? villain.tags.flatMap((t) => (t === 'drinking-tired' ? ['drinking'] : DIMENSIONS.status.includes(t as never) ? [t] : [])) : [];
  const eff = Math.min(me.startStack, Math.max(0, ...others.map((o) => o.startStack))) / state.rules.bb;
  const depth = eff < 60 ? 'short' : eff <= 150 ? '100bb' : eff <= 300 ? 'deep' : 'very-deep';

  // before the flop only those who put money in by choice count (the rest may still fold)
  const inPot = street === 'preflop' ? others.filter((o) => on('preflop').some((a) => a.seat === o.seat && (a.action === 'call' || aggressive(a)))) : others;

  return {
    street: [street],
    pot: [pot],
    players: [inPot.length > 1 ? 'multiway' : 'hu'],
    position: street === 'preflop' ? [] : [ip ? 'ip' : 'oop'],
    role: pfr === null ? [] : [pfr === seat ? 'pfr' : 'caller'],
    decision: [decision],
    size,
    line: [...line],
    board,
    villain: villainTags,
    status,
    depth: [depth],
  };
}
