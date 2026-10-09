import { describe, expect, test } from 'vitest';
import { initialState, replaySteps } from '../engine/replay';
import type { HandRecord } from '../hand/types';
import { MOTIVE_PRESETS, NEUTRAL, profileFor } from '../motives/profile';
import { STYLES, preflopChoice } from '../motives/preflop';
import { LIBRARY } from '../ranges/library';
import type { ChartChoice } from '../ranges/spot';
import { postflopRow, preflopPreview } from './preview';
import { at, BASE_TYPES, complete, leadsLevel, limpTrapLevel, movedSliders, styleMotives, stylePreflop, typePreset, typeSettings, type Leads, type StyleSettings } from './style';

const charts: ChartChoice[] = LIBRARY.map((r) => ({ id: r.id, label: r.label, scenario: r.scenario, positions: r.positions, stack: r.stack, env: r.env, chart: r.chart }));
const fish = typeSettings('Fish');
const withSlider = (s: StyleSettings, id: keyof StyleSettings['sliders'], v: number): StyleSettings => ({ ...s, sliders: { ...s.sliders, [id]: v } });

describe('sliders', () => {
  test('3 is the neutral profile and the reg charts', () => {
    expect(at('stickiness', 3)).toBe(NEUTRAL.stickiness);
    expect(at('aggression', 3)).toBe(NEUTRAL.aggression);
    expect(at('respect', 3)).toBe(NEUTRAL.respect);
    expect(at('foldBelief', 3)).toBe(NEUTRAL.foldBelief);
    expect(at('width', 3)).toBe(STYLES.Reg!.width);
    expect(at('raises', 3)).toBe(STYLES.Reg!.raises);
    expect(at('limp', 3)).toBe(0);
  });

  test('half steps are halfway', () => {
    expect(at('stickiness', 3.5)).toBeCloseTo((at('stickiness', 3) + at('stickiness', 4)) / 2);
  });

  test("a type at its own slider positions is exactly its preset", () => {
    for (const t of BASE_TYPES) {
      const s = typeSettings(t);
      expect(movedSliders(s)).toEqual([]);
      expect({ ...styleMotives(s, MOTIVE_PRESETS), name: '' }).toEqual({ ...typePreset(t, MOTIVE_PRESETS), name: '' });
      expect(stylePreflop(s, STYLES)).toEqual(STYLES[t] ?? STYLES.Reg);
      expect(STYLES[t] ?? (t === 'Unknown' ? STYLES.Reg : undefined), t).toBeDefined();
    }
  });

  test('the weak-tight rec: a fish who plays few hands, rarely bets and folds to pressure', () => {
    const p = typePreset('Weak-tight rec', MOTIVE_PRESETS);
    const fishy = MOTIVE_PRESETS.Fish!;
    expect(p.name).toBe('Weak-tight rec');
    expect(p.rangeReading).toBe(fishy.rangeReading); // thinks about his own hand
    expect(p.respect).toBe(at('respect', 5));
    expect(p.stickiness).toBeLessThan(fishy.stickiness);
    expect(p.cbetHabit!).toBeLessThan(fishy.cbetHabit!);
    expect(STYLES['Weak-tight rec']!.width).toBe(at('width', 2.5));
    // a moved slider still works on top of it
    const more = styleMotives({ ...typeSettings('Weak-tight rec'), sliders: { ...typeSettings('Weak-tight rec').sliders, bluffs: 3 } }, MOTIVE_PRESETS);
    expect(more.embarrassment).toBe(at('embarrassment', 3));
    expect(more.respect).toBe(p.respect);
  });

  test('settings saved with the switches on/off read as levels', () => {
    expect([limpTrapLevel(true), limpTrapLevel(false), limpTrapLevel(undefined), limpTrapLevel(2)]).toEqual([1, 0, 0, 2]);
    expect([leadsLevel(true), leadsLevel(false), leadsLevel(3)]).toEqual([2, 0, 3]);
    const old = { ...fish, limpTrap: true, leads: true } as unknown as StyleSettings;
    expect(complete(old)).toMatchObject({ limpTrap: 1, leads: 2 });
    expect(stylePreflop(old, STYLES).limpTrap).toBe(1);
    expect(styleMotives(old, MOTIVE_PRESETS).expectsBet).toBe(styleMotives({ ...fish, leads: 2 }, MOTIVE_PRESETS).expectsBet);
  });

  test('a moved slider changes only its own weights', () => {
    const p = styleMotives(withSlider(fish, 'bluffs', 3), MOTIVE_PRESETS);
    expect(p.embarrassment).toBe(at('embarrassment', 3));
    expect(p.stickiness).toBe(MOTIVE_PRESETS.Fish!.stickiness);
    expect(p.fear).toBe(MOTIVE_PRESETS.Fish!.fear);
  });

  test('the slider positions of the types are near their presets', () => {
    // the positions are a rounded inverse of the mapping: each one within half a step
    for (const t of ['Reg', 'Nit', 'Fish', 'Whale', 'Maniac']) {
      const p = MOTIVE_PRESETS[t]!;
      const s = typeSettings(t).sliders;
      const near = (knob: Parameters<typeof at>[0], v: number, real: number) => {
        const lo = Math.min(at(knob, v - 0.5), at(knob, v + 0.5));
        const hi = Math.max(at(knob, v - 0.5), at(knob, v + 0.5));
        expect(real, `${t} ${knob}`).toBeGreaterThanOrEqual(lo - 1e-9);
        expect(real, `${t} ${knob}`).toBeLessThanOrEqual(hi + 1e-9);
      };
      near('stickiness', s.sticky, p.stickiness);
      near('respect', s.respect, p.respect);
      near('aggression', s.postAggr, p.aggression);
    }
  });
});

describe('what the sliders do', () => {
  test('loose plays more hands, preflop aggression turns limps into raises', () => {
    const tight = preflopPreview(stylePreflop(withSlider(fish, 'loose', 2), STYLES), charts);
    const loose = preflopPreview(stylePreflop(withSlider(fish, 'loose', 5), STYLES), charts);
    expect(1 - loose[1]!.fold).toBeGreaterThan(1 - tight[1]!.fold);
    const passive = preflopPreview(stylePreflop(withSlider(fish, 'pfAggr', 1), STYLES), charts);
    const aggro = preflopPreview(stylePreflop(withSlider(fish, 'pfAggr', 4), STYLES), charts);
    expect(passive[1]!.call).toBeGreaterThan(0.1); // limps first in
    expect(aggro[1]!.call).toBe(0);
    expect(aggro[1]!.raise).toBeGreaterThan(passive[1]!.raise);
  });

  test('sticky calls more on the river, bluffs bluffs more', () => {
    const call = (v: number) => postflopRow(styleMotives(withSlider(fish, 'sticky', v), MOTIVE_PRESETS), 'river-call').share;
    expect(call(5)).toBeGreaterThan(call(2));
    const bluff = (v: number) => postflopRow(styleMotives(withSlider(typeSettings('Reg'), 'bluffs', v), MOTIVE_PRESETS), 'river-bluff').share;
    expect(bluff(4)).toBeGreaterThan(bluff(1));
  });

  test('bluffs follow the calibration: rarely at 2, a quarter of the air at 3, most at 5', () => {
    const bluff = (v: number) => postflopRow(styleMotives(withSlider(typeSettings('Reg'), 'bluffs', v), MOTIVE_PRESETS), 'river-bluff').share;
    expect(bluff(2)).toBeLessThan(0.12);
    expect(bluff(3)).toBeGreaterThan(0.12);
    expect(bluff(3)).toBeLessThan(0.4);
    expect(bluff(5)).toBeGreaterThan(0.65);
  });

  test('respect folds one pair to a big river bet', () => {
    const call = (v: number) => postflopRow(styleMotives(withSlider(fish, 'respect', v), MOTIVE_PRESETS), 'river-call').share;
    expect(call(1)).toBeGreaterThan(call(5));
  });

  test('a donk-leader leads strong hands into the raiser, more of them the more often he leads', () => {
    const lead = (leads: Leads) => postflopRow(styleMotives({ ...fish, leads }, MOTIVE_PRESETS), 'lead').share;
    const [never, rarely, sometimes, often] = ([0, 1, 2, 3] as const).map(lead);
    expect(rarely).toBeGreaterThan(never! + 0.05);
    expect(sometimes).toBeGreaterThan(rarely! + 0.05);
    expect(often).toBeGreaterThan(sometimes!);
  });
});

describe('a seat with a style', () => {
  const hand = (style?: StyleSettings, cards: [string, string] = ['As', 'Ad']): HandRecord => ({
    format: 'logistack.hand/0',
    id: 'h',
    createdAt: '2026-10-08T00:00:00Z',
    table: { seats: 6, venue: 'home', currency: { code: 'EUR', minorPerMajor: 100 }, blinds: { sb: 10, bb: 25 } },
    button: 5,
    players: [0, 1, 2, 3, 4, 5].map((seat) => ({
      seat,
      name: `P${seat}`,
      stack: 2500,
      playerType: 'Fish',
      ...(seat === 2 && style ? { style: { label: 'Dan', settings: style } } : {}),
      ...(seat === 2 ? { cards } : {}),
    })),
    events: [],
  });

  test('the bots play the style', () => {
    const s = initialState(hand({ ...fish, sliders: { ...fish.sliders, sticky: 5 } }));
    const dan = s.seats.find((x) => x.seat === 2)!;
    expect(profileFor(dan).stickiness).toBe(at('stickiness', 5));
    expect(profileFor(dan).name).toBe('Dan');
    expect(profileFor(s.seats.find((x) => x.seat === 3)!).stickiness).toBe(MOTIVE_PRESETS.Fish!.stickiness);
  });

  test('a limp-reraiser limps aces first in: half of them with a monster, most when he does it often', () => {
    // seat 2 is UTG+1 of six (first to act is seat 2 after blinds at 0 and 1)
    const limp = (s: StyleSettings, cards?: [string, string]) =>
      preflopChoice(replaySteps(hand(s, cards)).at(-1)!, charts, () => 0.5)
        .options.filter((o) => o.label === 'Limp')
        .reduce((a, o) => a + o.p, 0);
    expect(limp(fish)).toBe(0);
    expect(limp({ ...fish, limpTrap: 1 })).toBeCloseTo(0.5);
    expect(limp({ ...fish, limpTrap: true } as unknown as StyleSettings)).toBeCloseTo(0.5); // saved before the levels
    expect(limp({ ...fish, limpTrap: 2 })).toBeCloseTo(0.8);
    // often: tens, nines and AQ limp-reraise too, so his limps are never capped (a reg raises them otherwise)
    const regTrap = (limpTrap: 0 | 1 | 2) => ({ ...typeSettings('Reg'), limpTrap });
    for (const cards of [['Td', 'Tc'], ['Ah', 'Qc'], ['9d', '9c']] as [string, string][]) {
      expect(limp(regTrap(1), cards)).toBe(0);
      expect(limp(regTrap(2), cards)).toBeCloseTo(0.5);
    }
    expect(limp(regTrap(2), ['8d', '8c'])).toBe(0);
  });
});

describe('the C-bets slider', () => {
  const cb = (s: StyleSettings, spot: 'cbet' | 'barrel') => postflopRow(styleMotives(s, MOTIVE_PRESETS), spot).share;

  test('up always means more c-bets and barrels, from any type', () => {
    for (const t of ['Nit', 'Fish', 'Reg']) {
      const s = typeSettings(t);
      const home = s.sliders.cbet;
      expect(cb(withSlider(s, 'cbet', home + 0.5), 'cbet'), t).toBeGreaterThan(cb(s, 'cbet'));
      expect(cb(withSlider(s, 'cbet', 5), 'barrel'), t).toBeGreaterThan(cb(withSlider(s, 'cbet', 1), 'barrel') + 0.4);
    }
  });

  test("a player who never raises after the flop but bets every street with the initiative", () => {
    const s = withSlider(withSlider(typeSettings('Fish'), 'postAggr', 1), 'cbet', 5);
    const p = styleMotives(s, MOTIVE_PRESETS);
    expect(postflopRow(p, 'cbet').share).toBeGreaterThan(0.75);
    expect(postflopRow(p, 'barrel').share).toBeGreaterThan(0.75);
    const facing = postflopRow(p, 'cbet-faced').split!.find((x) => x.label === 'Raise')!.share;
    expect(facing).toBeLessThan(0.12);
  });

  test('settings saved before the slider existed keep the type', () => {
    const old = { ...fish, sliders: { ...fish.sliders } } as StyleSettings;
    delete (old.sliders as Partial<StyleSettings['sliders']>).cbet;
    expect(movedSliders(old)).toEqual([]);
    expect(styleMotives(old, MOTIVE_PRESETS).cbetHabit).toBe(MOTIVE_PRESETS.Fish!.cbetHabit);
  });
});
