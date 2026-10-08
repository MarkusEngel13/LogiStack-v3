import { describe, expect, test } from 'vitest';
import { applyEvent, replaySteps } from '../engine/replay';
import type { HandEvent, HandRecord } from '../hand/types';
import { LIBRARY } from '../ranges/library';
import type { ChartChoice } from '../ranges/spot';
import { chenPoints, CELL_PERCENTILE } from '../ranges/strength';
import { cellByName } from '../ranges/hands';
import { preflopChoice, preflopFacing } from './preflop';

const CHARTS: ChartChoice[] = LIBRARY.map((r) => ({ ...r }));

/** 6-max, blinds 50/100, 100 BB; seat 0 = LJ, 1 HJ, 2 CO, 3 BTN, 4 SB, 5 BB. */
function hand(who: { seat: number; type?: string; cards: [string, string] }, events: HandEvent[]): HandRecord {
  return {
    format: 'logistack.hand/0',
    id: 'preflop-test',
    createdAt: '2026-10-07T12:00:00Z',
    table: { seats: 6, venue: 'casino', currency: { code: 'EUR', minorPerMajor: 100 }, blinds: { sb: 50, bb: 100 } },
    button: 3,
    hero: 3,
    players: [0, 1, 2, 3, 4, 5].map((seat) => ({
      seat,
      name: `P${seat}`,
      stack: 10000,
      ...(seat === who.seat ? { cards: who.cards, ...(who.type ? { playerType: who.type } : {}) } : {}),
    })),
    events,
  };
}

function choose(h: HandRecord) {
  const steps = replaySteps(h);
  const state = steps[steps.length - 1]!;
  return { c: preflopChoice(state, CHARTS, () => 0.5), state, step: steps.length - 1 };
}

const p = (c: ReturnType<typeof choose>['c'], ...labels: RegExp[]) =>
  c.options.filter((o) => labels.some((l) => l.test(o.label))).reduce((s, o) => s + o.p, 0);

const folds = (n: number): HandEvent[] => Array.from({ length: n }, (_, i) => ({ type: 'action', seat: i, action: 'fold' }));
const btnOpen: HandEvent[] = [...folds(3), { type: 'action', seat: 3, action: 'raise', to: 250 }, { type: 'action', seat: 4, action: 'fold' }];

describe('hand strength order', () => {
  test('Chen points: AA 20, AKs 12, 72o low; the order puts AA first', () => {
    expect(chenPoints(cellByName('AA')!)).toBe(20);
    expect(chenPoints(cellByName('AKs')!)).toBe(12);
    expect(chenPoints(cellByName('72o')!)).toBeLessThan(2);
    expect(CELL_PERCENTILE[cellByName('AA')!]).toBeLessThan(0.01);
    expect(CELL_PERCENTILE[cellByName('72o')!]).toBeGreaterThan(0.9);
  });
});

describe('bots before the flop', () => {
  test('first in from the lowjack, a Reg opens aces to 3 BB and folds 7-2', () => {
    const aa = choose(hand({ seat: 0, cards: ['As', 'Ah'] }, []));
    expect(aa.c.event).toEqual({ type: 'action', seat: 0, action: 'raise', to: 300 });
    expect(p(aa.c, /Raise/, /All-in/)).toBeGreaterThan(0.95);
    const trash = choose(hand({ seat: 0, cards: ['7c', '2d'] }, [])).c;
    expect(p(trash, /Fold/)).toBeGreaterThan(0.95);
  });

  test('the big blind folds 7-2 to a button open and plays ace-king suited', () => {
    expect(p(choose(hand({ seat: 5, cards: ['7c', '2d'] }, btnOpen)).c, /Fold/)).toBeGreaterThan(0.95);
    expect(p(choose(hand({ seat: 5, cards: ['Ad', 'Kd'] }, btnOpen)).c, /Fold/)).toBeLessThan(0.05);
  });

  // HHP: recreational players limp and call instead of raising; whales play most hands; nits fold more.
  test('types: a Fish limps hands a Reg opens, a whale defends wider, a nit folds more', () => {
    const kj = (type?: string) => choose(hand({ seat: 0, type, cards: ['Kc', 'Jd'] }, [])).c;
    expect(p(kj('Fish'), /Limp/)).toBeGreaterThan(0.3);
    expect(p(kj(), /Limp/)).toBe(0);
    const k7 = (type?: string) => choose(hand({ seat: 5, type, cards: ['Kc', '7d'] }, btnOpen)).c;
    expect(1 - p(k7('Whale'), /Fold/)).toBeGreaterThan(1 - p(k7(), /Fold/));
    const a9 = (type?: string) => choose(hand({ seat: 0, type, cards: ['Ac', '9d'] }, [])).c;
    expect(p(a9('Nit'), /Fold/)).toBeGreaterThanOrEqual(p(a9(), /Fold/));
  });

  test('isolating a limper from the button: 6 BB + 1 per limper; facing an open, the spot is right', () => {
    const limp: HandEvent[] = [{ type: 'action', seat: 0, action: 'call' }, ...folds(3).slice(1)];
    const { c } = choose(hand({ seat: 3, cards: ['As', 'Kd'] }, limp));
    const iso = c.options.find((o) => /Raise/.test(o.label))!;
    expect(iso.event).toEqual({ type: 'action', seat: 3, action: 'raise', to: 700 });
    const s = replaySteps(hand({ seat: 5, cards: ['7c', '2d'] }, btnOpen));
    expect(preflopFacing(s[s.length - 1]!, 5)).toMatchObject({ scenario: 'vs RFI BTN', raises: 1, inPosition: false });
  });

  // Marius's 25c game (2026-10-08, for orientation): regs open 3 or 4 BB, fish mainly 3, TAGs and
  // maniacs sometimes 5, maniacs now and then 8.
  test('open sizes by type: regs 3-4 BB, fish mostly 3, maniacs up to 8', () => {
    const opens = (type?: string) => {
      const steps = replaySteps(hand({ seat: 0, type, cards: ['As', 'Ah'] }, []));
      let s = 11;
      const rand = () => {
        s = (s * 1664525 + 1013904223) % 4294967296;
        return s / 4294967296;
      };
      const sizes = new Map<number, number>();
      for (let i = 0; i < 300; i++) {
        const e = preflopChoice(steps[steps.length - 1]!, CHARTS, rand).event;
        if (e.type === 'action' && e.action === 'raise') sizes.set(e.to! / 100, (sizes.get(e.to! / 100) ?? 0) + 1 / 300);
      }
      return sizes;
    };
    const reg = opens();
    expect([...reg.keys()].sort()).toEqual([3, 4]);
    expect(opens('Fish').get(3)).toBeGreaterThan(0.7);
    const maniac = opens('Maniac');
    expect(maniac.get(8)).toBeGreaterThan(0.05);
    expect(maniac.get(5)).toBeGreaterThan(0.1);
  });

  test('the big blind after limps can check, never folds; every option is a legal action', () => {
    const limps: HandEvent[] = [{ type: 'action', seat: 0, action: 'call' }, ...folds(4).slice(1), { type: 'action', seat: 4, action: 'call' }];
    const { c, state, step } = choose(hand({ seat: 5, cards: ['7c', '2d'] }, limps));
    expect(c.options.some((o) => o.label === 'Fold')).toBe(false);
    expect(p(c, /Check/)).toBeGreaterThan(0.9);
    for (const o of c.options) expect(() => applyEvent(state, o.event, step)).not.toThrow();
    const open = choose(hand({ seat: 5, cards: ['Ad', 'Kd'] }, btnOpen));
    for (const o of open.c.options) expect(() => applyEvent(open.state, o.event, open.step)).not.toThrow();
  });
});
