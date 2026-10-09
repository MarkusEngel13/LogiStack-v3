import { describe, expect, it } from 'vitest';
import { replaySteps } from '../engine/replay';
import type { HandRecord } from '../hand/types';
import { preflopChoice, STYLES } from '../motives/preflop';
import { LIBRARY } from '../ranges/library';
import type { ChartChoice } from '../ranges/spot';
import { applyAnswers, handsPlayed, tableSizeId } from './questions';
import { stylePreflop, typeSettings, type StyleSettings } from './style';

const charts: ChartChoice[] = LIBRARY.map((r) => ({ ...r }));
const preflopOf = (s: StyleSettings) => stylePreflop(s, STYLES);

describe('facts told during a game', () => {
  it('"plays 70 %" sets Loose to play about that at the table size', () => {
    const s = applyAnswers({ hands: 'pct70', table: tableSizeId(9) }, typeSettings('Fish'), charts, preflopOf);
    expect(Math.abs(handsPlayed(preflopOf(s), charts, 9) - 0.7)).toBeLessThan(0.12);
    const few = applyAnswers({ hands: 'pct15', table: '9' }, typeSettings('Fish'), charts, preflopOf);
    expect(few.sliders.loose).toBeLessThan(s.sliders.loose);
  });

  it('"calls or min-raises": passive preflop, opens 2 BB, the rest kept', () => {
    const start = { ...typeSettings('Reg'), sliders: { ...typeSettings('Reg').sliders, bluffs: 5 } };
    const s = applyAnswers({ firstIn: 'limp', open: '2' }, start, charts, preflopOf);
    expect(s.sliders.pfAggr).toBe(1);
    expect(s.openBB).toBe(2);
    expect(s.sliders.bluffs).toBe(5);
  });

  it('a min-raiser bot opens to 2 BB', () => {
    expect(openTo({ ...typeSettings('Reg'), openBB: 2 })).toBe(50);
  });

  it('a raise size told as a band opens at its middle: 3-4 BB = 3.5 BB', () => {
    const s = applyAnswers({ open: '3-4' }, typeSettings('Reg'), charts, preflopOf);
    expect(openTo(s)).toBe(Math.round((3.5 * 25) / 5) * 5);
  });

  it('a size tell: bigger with strong hands, or small with them', () => {
    const at4 = { ...typeSettings('Reg'), openBB: 4 };
    expect(openTo({ ...at4, openTell: 'strong' })).toBe(150); // aces: 6 BB
    expect(openTo({ ...at4, openTell: 'strong' }, ['Kd', 'Td'])).toBe(100); // the rest: his 4 BB
    expect(openTo({ ...at4, openTell: 'weak' })).toBe(65); // aces: two thirds (2.67 BB, to whole chips of 5)
    expect(openTo({ ...at4, openTell: 'weak' }, ['Kd', 'Td'])).toBe(100);
    expect(openTo({ ...at4, openTell: 'no' })).toBe(100);
  });
});

/** What a bot with this style raises to first in, under the gun of six at 10/25 (in chips). */
function openTo(settings: StyleSettings, cards: [string, string] = ['As', 'Ad']): number {
  const style = { label: 'Him', settings };
  const hand: HandRecord = {
    format: 'logistack.hand/0',
    id: 'open',
    createdAt: '2026-10-09T00:00:00Z',
    table: { seats: 6, venue: 'home', currency: { code: 'EUR', minorPerMajor: 100 }, blinds: { sb: 10, bb: 25 } },
    button: 3,
    players: [0, 1, 2, 3, 4, 5].map((seat) => ({ seat, name: `P${seat}`, stack: 2500, ...(seat === 0 ? { cards, playerType: 'Reg', style } : {}) })),
    events: [],
  };
  const st = replaySteps(hand)[0]!;
  const c = preflopChoice(st, charts, () => 0.99);
  const e = c.options.find((o) => o.event.type === 'action' && o.event.action === 'raise')!.event;
  return (e as { to: number }).to;
}
