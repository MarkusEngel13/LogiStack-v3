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
    const style = { label: 'Min', settings: { ...typeSettings('Reg'), openBB: 2 } };
    const hand: HandRecord = {
      format: 'logistack.hand/0',
      id: 'min',
      createdAt: '2026-10-09T00:00:00Z',
      table: { seats: 6, venue: 'home', currency: { code: 'EUR', minorPerMajor: 100 }, blinds: { sb: 10, bb: 25 } },
      button: 3,
      players: [0, 1, 2, 3, 4, 5].map((seat) => ({ seat, name: `P${seat}`, stack: 2500, ...(seat === 0 ? { cards: ['As', 'Ad'] as [string, string], playerType: 'Reg', style } : {}) })),
      events: [],
    };
    const st = replaySteps(hand)[0]!;
    const c = preflopChoice(st, charts, () => 0.99);
    const e = c.options.find((o) => o.event.type === "action" && o.event.action === "raise")!.event;
    expect(e).toMatchObject({ action: "raise", to: 50 });
  });
});
