/**
 * Guess the stack (v2's "Stack Size", its five-level ladder): a stack drawn as real towers of
 * chips, in your own chip set, stacked the way the player's type stacks - a Nit's neat towers of
 * twenty, a Reg's mix, a nervous short-stacker's little piles, a Fish's slob of heights and loose
 * chips. Levels:
 *   1 Rookie   - neat towers, pick from five amounts
 *   2 Grinder  - real stacks, type the amount (within a big blind or 2 %)
 *   3 Shark    - a dirty stack: one high chip hidden in a low tower; exact
 *   4 Pro      - the pot (splashed) and a bet: the equity needed to call
 *   5 Wizard   - the pot and your stack: the geometric bet to be all-in on the river
 * Everything is data (chip indices, tower heights, small offsets), the screen only draws it.
 */

import { between, newId, pick, shuffled, type Question, type Rand } from './types';

export interface ChipDef {
  /** In minor units of the set's currency (cents). */
  value: number;
  /** Face colour and the edge stripes. */
  color: string;
  stripe: string;
}

export interface ChipSet {
  id: string;
  name: string;
  currency: { code: string; minorPerMajor: number };
  /** The game the set is for: the blinds (minor units). */
  blinds: { sb: number; bb: number };
  /** Lowest value first. */
  chips: ChipDef[];
}

export const CHIP_PRESETS: ChipSet[] = [
  {
    id: 'home',
    name: 'Home game €0.10/€0.25',
    currency: { code: 'EUR', minorPerMajor: 100 },
    blinds: { sb: 10, bb: 25 },
    chips: [
      { value: 10, color: '#f4f4f0', stripe: '#2563eb' },
      { value: 25, color: '#dc2626', stripe: '#f4f4f0' },
      { value: 100, color: '#16a34a', stripe: '#f4f4f0' },
      { value: 500, color: '#1f2937', stripe: '#e5e7eb' },
      { value: 2500, color: '#7c3aed', stripe: '#facc15' },
    ],
  },
  {
    id: 'casino',
    name: 'Casino $1/$2',
    currency: { code: 'USD', minorPerMajor: 100 },
    blinds: { sb: 100, bb: 200 },
    chips: [
      { value: 100, color: '#f4f4f0', stripe: '#334155' },
      { value: 500, color: '#dc2626', stripe: '#f4f4f0' },
      { value: 2500, color: '#16a34a', stripe: '#f4f4f0' },
      { value: 10000, color: '#111827', stripe: '#e5e7eb' },
      { value: 50000, color: '#7c3aed', stripe: '#f4f4f0' },
      { value: 100000, color: '#eab308', stripe: '#1f2937' },
    ],
  },
];

/** How a player stacks his chips. */
export type StackStyle = 'neat' | 'human' | 'nervous' | 'slob';

/** The player types' habits at the table (v2: reg / nervous / slob). */
export const STYLE_OF_TYPE: Record<string, StackStyle[]> = {
  Nit: ['neat'],
  Reg: ['neat', 'human'],
  TAG: ['neat', 'human'],
  'Weak-tight rec': ['nervous', 'human'],
  LAG: ['human', 'slob'],
  Fish: ['slob', 'human', 'nervous'],
  Whale: ['slob'],
  Maniac: ['slob'],
};

export interface Tower {
  /** Chip indices into the set, bottom to top. */
  chips: number[];
  /** Small sideways offsets per chip (px at the drawing's scale), for a stack that isn't a cylinder. */
  jitter: number[];
}

export interface Scene {
  label?: string;
  /** Towers in rows, front row first. */
  rows: Tower[][];
  /** Chips lying loose in front (index, x and y offsets in chip widths). */
  loose: { chip: number; x: number; y: number }[];
  /** A splashed pile (a pot): chips scattered, no towers. */
  splash?: { chip: number; x: number; y: number }[];
}

// ---- making a stack -----------------------------------------------------------------------------

function gaussian(rand: Rand, mean: number, sd: number) {
  const u = 1 - rand();
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) * sd + mean;
}

/** A stack's value in big blinds: around 100 BB (v2: 135 ± 40), never under 10. */
export function stackBB(rand: Rand, mean = 100, sd = 35): number {
  return Math.max(10, Math.min(400, Math.round(gaussian(rand, mean, sd))));
}

/**
 * The chips for an amount, the way a cashier and a player's game leave them (v2's "greedy-random
 * cashier"): a working stack of the small chips, then the big ones, sometimes a few fewer to mix.
 * Returns chip indices (high first). The amount is rounded down to the smallest chip.
 */
export function makeChips(set: ChipSet, amount: number, rand: Rand): number[] {
  const order = set.chips.map((c, i) => ({ ...c, i })).sort((a, b) => b.value - a.value);
  const smallest = order[order.length - 1]!;
  let left = Math.floor(amount / smallest.value) * smallest.value;
  const out: number[] = [];
  // a working stack of small chips (10-20)
  const base = between(rand, 10, 20);
  if (left > base * smallest.value * 2) {
    for (let k = 0; k < base; k++) out.push(smallest.i);
    left -= base * smallest.value;
  }
  order.forEach((c, k) => {
    if (left < c.value) return;
    let take = Math.floor(left / c.value);
    const next = order[k + 1];
    // now and then a few fewer, so the next chip down shows too (not when that would mean a flood)
    if (next && c.value / next.value <= 10 && take > 0 && rand() < 0.4) take = Math.max(0, take - between(rand, 1, 2));
    for (let n = 0; n < take; n++) out.push(c.i);
    left -= take * c.value;
  });
  while (left >= smallest.value) {
    out.push(smallest.i);
    left -= smallest.value;
  }
  return out;
}

export const valueOf = (set: ChipSet, chips: readonly number[]) => chips.reduce((t, i) => t + set.chips[i]!.value, 0);

const jitterFor = (rand: Rand, n: number, amount: number) => Array.from({ length: n }, () => Math.round((rand() - 0.5) * amount * 10) / 10);

/** Towers for a pile of chips, in a style. The highest chips stand at the back, as most players keep them. */
export function stackUp(chips: number[], style: StackStyle, rand: Rand): Scene {
  const byChip = new Map<number, number>();
  for (const c of chips) byChip.set(c, (byChip.get(c) ?? 0) + 1);
  const kinds = [...byChip.keys()].sort((a, b) => a - b); // low chips first (front)
  const towers: Tower[] = [];
  const loose: Scene['loose'] = [];
  for (const chip of kinds) {
    let n = byChip.get(chip)!;
    // the slob leaves a few chips lying around
    if (style === 'slob' && n > 4 && rand() < 0.5) {
      const k = between(rand, 1, 3);
      for (let j = 0; j < k; j++) loose.push({ chip, x: Math.round((rand() - 0.5) * 60) / 10, y: Math.round(rand() * 6) / 10 });
      n -= k;
    }
    while (n > 0) {
      const h =
        style === 'neat' ? 20 : style === 'human' ? (rand() < 0.7 ? 20 : between(rand, 8, 15)) : style === 'nervous' ? between(rand, 5, 12) : between(rand, 3, 24);
      const take = Math.min(n, h);
      const jit = style === 'neat' ? 0.6 : style === 'human' ? 1.2 : style === 'nervous' ? 1.4 : 3;
      towers.push({ chips: Array.from({ length: take }, () => chip), jitter: jitterFor(rand, take, jit) });
      n -= take;
    }
  }
  // the slob mixes colours: some towers get a few chips of the neighbouring tower on top
  if (style === 'slob' && towers.length > 1) {
    for (let t = 0; t < towers.length - 1; t++) {
      if (rand() < 0.35 && towers[t + 1]!.chips.length > 3) {
        const k = between(rand, 1, 3);
        const moved = towers[t + 1]!.chips.splice(-k, k);
        towers[t + 1]!.jitter.splice(-k, k);
        towers[t]!.chips.push(...moved);
        towers[t]!.jitter.push(...jitterFor(rand, k, 3));
      }
    }
  }
  const kept = towers.filter((t) => t.chips.length > 0);
  // the front row takes the low chips, at most 6 towers a row; the slob shuffles the order
  const ordered = style === 'slob' ? shuffled(rand, kept) : kept;
  const rows: Tower[][] = [];
  for (let i = 0; i < ordered.length; i += 6) rows.push(ordered.slice(i, i + 6));
  return { rows, loose };
}

/** A splashed pot: the chips scattered in an oval, a few little piles of two or three. */
export function splash(chips: number[], rand: Rand): Scene {
  const out: { chip: number; x: number; y: number }[] = [];
  for (const chip of shuffled(rand, chips)) {
    const a = rand() * Math.PI * 2;
    const r = Math.sqrt(rand());
    out.push({ chip, x: Math.round(Math.cos(a) * r * 30) / 10, y: Math.round(Math.sin(a) * r * 12) / 10 });
  }
  return { rows: [], loose: [], splash: out };
}

/** One high chip slipped into a low tower (not at the top or bottom): the dirty stack. */
function makeDirty(set: ChipSet, scene: Scene, rand: Rand): { scene: Scene; hidden: number } | null {
  const towers = scene.rows.flat().filter((t) => t.chips.length >= 6);
  if (!towers.length) return null;
  const t = pick(rand, towers);
  const low = t.chips[0]!;
  const higher = set.chips.map((c, i) => ({ c, i })).filter((x) => x.c.value > set.chips[low]!.value);
  if (!higher.length) return null;
  const hi = pick(rand, higher).i;
  const at = between(rand, 2, t.chips.length - 3);
  t.chips[at] = hi;
  return { scene, hidden: set.chips[hi]!.value - set.chips[low]!.value };
}

// ---- the questions --------------------------------------------------------------------------------

const TYPES_FOR_LEVEL: Record<number, string[]> = {
  1: ['Nit'],
  2: ['Nit', 'Reg', 'Weak-tight rec', 'Fish'],
  3: ['Reg', 'Fish', 'Maniac', 'Weak-tight rec'],
};

/** Five amounts around the answer for level 1 (5-30 % off, rounded to the smallest chip). */
function options(set: ChipSet, value: number, rand: Rand): number[] {
  const unit = set.chips[0]!.value;
  const opts = new Set([value]);
  for (let guard = 0; opts.size < 5 && guard < 100; guard++) {
    const off = (rand() < 0.5 ? -1 : 1) * (0.05 + rand() * 0.25);
    opts.add(Math.max(unit, Math.round((value * (1 + off)) / unit) * unit));
  }
  return shuffled(rand, [...opts]);
}

const money = (set: ChipSet, v: number) => {
  const major = v / set.currency.minorPerMajor;
  const sym = set.currency.code === 'EUR' ? '€' : set.currency.code === 'USD' ? '$' : set.currency.code === 'GBP' ? '£' : '';
  return `${sym}${Number.isInteger(major) ? major : major.toFixed(2)}`;
};

/** The geometric bet: the same share of the pot on each of `streets` streets puts the stack in. */
export function geometricBet(pot: number, stack: number, streets: number): number {
  const f = Math.pow((pot + 2 * stack) / pot, 1 / streets);
  return (pot * (f - 1)) / 2;
}

export function stackQuestion(set: ChipSet, level: number, rand: Rand): Question {
  const id = newId(rand);
  const bb = set.blinds.bb;
  const base = { id, quiz: 'stack' as const, level, money: set.currency };
  const chipsData = set.chips;

  if (level <= 3) {
    const who = pick(rand, TYPES_FOR_LEVEL[level]!);
    const style: StackStyle = level === 1 ? 'neat' : pick(rand, STYLE_OF_TYPE[who] ?? ['human']);
    const amount = stackBB(rand) * bb;
    const chips = makeChips(set, amount, rand);
    let scene = stackUp(chips, style, rand);
    let value = valueOf(set, chips);
    let dirtyNote = '';
    if (level === 3) {
      const d = makeDirty(set, scene, rand);
      if (d) {
        scene = d.scene;
        value += d.hidden;
        dirtyNote = ' Look at every tower: one chip of a higher colour hides in a low tower.';
      }
    }
    const data = { chips: chipsData, scenes: [scene], who, style };
    const prompt = `${who === 'Nit' ? 'A Nit' : `A ${who}`}'s stack: how much is it?`;
    const counts = new Map<number, number>();
    for (const t of scene.rows.flat()) for (const c of t.chips) counts.set(c, (counts.get(c) ?? 0) + 1);
    for (const l of scene.loose) counts.set(l.chip, (counts.get(l.chip) ?? 0) + 1);
    const breakdown = [...counts.entries()]
      .sort((a, b) => set.chips[b[0]]!.value - set.chips[a[0]]!.value)
      .map(([c, n]) => `${n} × ${money(set, set.chips[c]!.value)}`)
      .join(' + ');
    const explain = `${breakdown} = ${money(set, value)} (${Math.round(value / bb)} BB).${dirtyNote}`;
    if (level === 1) {
      const opts = options(set, value, rand);
      return {
        ...base,
        type: 'count',
        prompt,
        data,
        choices: opts.map((v) => ({ id: String(v), label: money(set, v) })),
        answer: { kind: 'choice', id: String(value) },
        explain,
      };
    }
    return {
      ...base,
      type: level === 3 ? 'count-dirty' : 'count',
      prompt,
      data,
      unit: set.currency.code,
      answer: level === 3 ? { kind: 'number', value, tolerance: 0 } : { kind: 'number', value, tolerance: bb, relative: 0.02 },
      explain,
    };
  }

  if (level === 4) {
    // the pot in the middle, his bet in front of him: what equity do you need to call?
    const potChips = makeChips(set, between(rand, 6, 40) * bb, rand);
    const pot = valueOf(set, potChips);
    const frac = pick(rand, [0.33, 0.5, 0.66, 0.75, 1, 1.25]);
    const betChips = makeChips(set, Math.max(bb, Math.round((pot * frac) / set.chips[0]!.value) * set.chips[0]!.value), rand);
    const bet = valueOf(set, betChips);
    const need = (100 * bet) / (pot + 2 * bet);
    return {
      ...base,
      type: 'pot-odds',
      prompt: 'He bets into this pot. What equity do you need to call?',
      data: { chips: chipsData, scenes: [{ ...splash(potChips, rand), label: 'The pot' }, { ...stackUp(betChips, 'human', rand), label: 'His bet' }] },
      unit: '%',
      answer: { kind: 'number', value: Math.round(need * 10) / 10, tolerance: 2 },
      explain: `Pot ${money(set, pot)}, bet ${money(set, bet)}: you call ${money(set, bet)} to win ${money(set, pot + 2 * bet)} in all, so you need ${money(set, bet)} ÷ ${money(set, pot + 2 * bet)} = ${need.toFixed(1)} %.`,
    };
  }

  // level 5: the pot and your stack - the geometric bet over the turn and river
  const potChips = makeChips(set, between(rand, 8, 30) * bb, rand);
  const pot = valueOf(set, potChips);
  const stackChips = makeChips(set, between(rand, 20, 120) * bb, rand);
  const stack = valueOf(set, stackChips);
  const streets = pick(rand, [2, 2, 3]);
  const b = geometricBet(pot, stack, streets);
  return {
    ...base,
    type: 'geometric',
    prompt: `${streets === 2 ? 'The turn' : 'The flop'}: you want to be all-in by the river with equal-sized bets (pot-relative), called each time. How much do you bet now?`,
    data: { chips: chipsData, scenes: [{ ...splash(potChips, rand), label: 'The pot' }, { ...stackUp(stackChips, 'neat', rand), label: 'Your stack (effective)' }] },
    unit: set.currency.code,
    answer: { kind: 'number', value: Math.round(b), relative: 0.07 },
    explain: `Pot ${money(set, pot)}, stack ${money(set, stack)}, ${streets} streets: the pot must grow by f = ((${money(set, pot)} + 2 × ${money(set, stack)}) ÷ ${money(set, pot)})^(1/${streets}) = ${Math.pow((pot + 2 * stack) / pot, 1 / streets).toFixed(2)} each street, so bet pot × (f − 1) ÷ 2 = ${money(set, Math.round(b))} (${Math.round((100 * b) / pot)} % pot).`,
  };
}
