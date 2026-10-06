import { describe, expect, test } from 'vitest';
import { parseCards } from '../cards';
import { rangeVsRange } from '../equity/field';
import { classifyHand } from '../handClass';
import { parseRange } from '../ranges/notation';
import { answer, drawStrength, NEUTRAL, PRESETS, rangeAnswer, withStatuses, type ComboFacts, type Spot } from './response';

const cards = (text: string) => parseCards(text.split(' '));
const spot = (betShare: number, extra: Partial<Spot> = {}): Spot => ({
  pot: 1000,
  bet: 1000 * betShare,
  bb: 100,
  villainStack: 10_000,
  villainInvested: 500,
  ...extra,
});
const facts = (equity: number, draw = 0): ComboFacts => ({ equity, classEquity: equity, draw });
const SIZES = [0.1, 0.25, 0.4, 0.66, 0.9, 1.25, 2, 3];

describe('one combo', () => {
  test('the answers are probabilities', () => {
    for (const p of Object.values(PRESETS)) {
      for (const s of SIZES) {
        for (const e of [0.05, 0.3, 0.5, 0.8, 0.97]) {
          const a = answer(p, spot(s), facts(e, 0.5));
          expect(a.fold + a.call + a.raise).toBeCloseTo(1, 9);
          for (const v of [a.fold, a.call, a.raise]) expect(v).toBeGreaterThanOrEqual(0);
        }
      }
    }
  });

  test('a neutral, noise-free player calls exactly when calling is +EV (the pot-odds rule)', () => {
    for (const s of SIZES) {
      const needed = s / (1 + 2 * s);
      expect(answer(NEUTRAL, spot(s), facts(needed + 0.02)).call).toBeGreaterThan(0.99);
      expect(answer(NEUTRAL, spot(s), facts(needed - 0.02)).fold).toBeGreaterThan(0.99);
    }
  });

  // Above 50 % equity a bigger bet is worth calling more, so only weaker hands are checked; and
  // suspicious players (negative bigBetRead) read overbets as bluffs, see the next test.
  test('bigger bets never make a hand below 50 % continue more (players who respect or ignore big bets)', () => {
    for (const p of Object.values(PRESETS).filter((x) => x.bigBetRead >= 0)) {
      for (const e of [0.1, 0.2, 0.3, 0.4, 0.45]) {
        let before = 1;
        for (const s of SIZES) {
          const a = answer(p, spot(s), facts(e));
          const cont = a.call + a.raise;
          expect(cont).toBeLessThanOrEqual(before + 1e-9);
          before = cont;
        }
      }
    }
  });

  test('suspicious players call an overbet at least as often as a pot-size bet; respectful ones fold more', () => {
    const cont = (name: string, s: number, e: number) => {
      const a = answer(PRESETS[name]!, spot(s), facts(e));
      return a.call + a.raise;
    };
    expect(cont('Maniac', 2, 0.42)).toBeGreaterThanOrEqual(cont('Maniac', 1, 0.42) - 0.02);
    expect(cont('Nit', 2, 0.6)).toBeLessThan(cont('Nit', 1, 0.6) - 0.5); // a 60 % bluff-catcher: calls pot, folds 2x pot
  });

  test('stronger hands never continue less (without draws in play)', () => {
    for (const p of Object.values(PRESETS)) {
      for (const s of SIZES) {
        let before = 0;
        for (let e = 0; e <= 1.0001; e += 0.05) {
          const a = answer(p, spot(s), facts(e));
          expect(a.call + a.raise).toBeGreaterThanOrEqual(before - 1e-9);
          before = a.call + a.raise;
        }
      }
    }
  });

  test('strong hands raise small bets more than big ones', () => {
    const p = PRESETS.Reg!;
    const small = answer(p, spot(0.18), facts(0.95)).raise;
    const pot = answer(p, spot(1), facts(0.95)).raise;
    expect(small).toBeGreaterThan(0.8);
    expect(pot).toBeLessThan(small - 0.3);
  });

  test('no raise when calling puts the villain all in', () => {
    expect(answer(PRESETS.Maniac!, spot(2, { villainStack: 1500 }), facts(0.9)).raise).toBe(0);
  });

  test('absolute money: an 80 % pot river shove scares a reg more at 400 BB deep than at 100 BB', () => {
    const p = PRESETS.Reg!;
    // same share of the pot and of the stack: 80 BB into 100 BB, or 300 BB into 375 BB
    const normal = answer(p, { pot: 10_000, bet: 8000, bb: 100, villainStack: 8000, villainInvested: 2000 }, facts(0.45));
    const deep = answer(p, { pot: 37_500, bet: 30_000, bb: 100, villainStack: 30_000, villainInvested: 7500 }, facts(0.45));
    expect(deep.fold).toBeGreaterThan(normal.fold + 0.2);
  });

  test('sunk cost: with most of the stack in, the same call happens more often', () => {
    const p = PRESETS.Fish!;
    const fresh = answer(p, spot(1, { villainInvested: 200, villainStack: 9800 }), facts(0.3));
    const committed = answer(p, spot(1, { villainInvested: 6000, villainStack: 4000 }), facts(0.3));
    expect(committed.call + committed.raise).toBeGreaterThan(fresh.call + fresh.raise);
  });

  test('draws pull: a nut flush draw continues more than a hand of equal equity without one', () => {
    const p = PRESETS.Fish!;
    const nfd = drawStrength(classifyHand(cards('Ac 4c') as [number, number], cards('Jc 9d 5c')));
    expect(nfd).toBe(1);
    const withDraw = answer(p, spot(0.9), facts(0.33, nfd));
    const without = answer(p, spot(0.9), facts(0.33, 0));
    expect(withDraw.call + withDraw.raise).toBeGreaterThan(without.call + without.raise + 0.05);
  });

  test('statuses: a drinking reg fears big calls less, a tilted one calls more', () => {
    const p = PRESETS.Reg!;
    const deep = { pot: 37_500, bet: 30_000, bb: 100, villainStack: 30_000, villainInvested: 7500 };
    const sober = answer(p, deep, facts(0.45));
    const drunk = answer(withStatuses(p, ['drinking']), deep, facts(0.45));
    const tilted = answer(withStatuses(p, ['tilt']), spot(1), facts(0.3));
    expect(drunk.fold).toBeLessThan(sober.fold);
    expect(tilted.call + tilted.raise).toBeGreaterThan(answer(p, spot(1), facts(0.3)).call + answer(p, spot(1), facts(0.3)).raise);
  });

  test('god-mode overrides move one class only', () => {
    const p = { ...PRESETS.Reg!, overrides: { 'top-pair': { call: 0.5 } } };
    const tp = answer(p, spot(1), { ...facts(0.4), made: 'top-pair' });
    const mp = answer(p, spot(1), { ...facts(0.4), made: 'second-pair' });
    expect(tp.call).toBeGreaterThan(mp.call + 0.15);
  });
});

describe('a whole range on a real flop', () => {
  // Hero (BTN open, c-bets) against a BB defence on Jc 9d 5c
  const board = cards('Jc 9d 5c');
  const hero = parseRange('22+, A2s+, K8s+, Q9s+, J9s+, T8s+, 97s+, 86s+, 75s+, 65s, 54s, A8o+, KTo+, QTo+, JTo');
  const villain = parseRange('22-TT, A2s-AQs, K2s-KJs, Q5s-QJs, J7s-JTs, T7s+, 96s+, 85s+, 74s+, 63s+, 52s+, 43s, A9o-AQo, KTo-KQo, QTo+, JTo, T9o, 98o');
  const villainEquity = rangeVsRange(hero, villain, board).players[1]!.vsField;

  // Against tiny bets a reg calls nearly everything on price while a station still folds its air,
  // so the order only has to hold from half pot up.
  test('from half pot up a station folds less than a reg, a reg less than a nit', () => {
    for (const s of SIZES.filter((x) => x >= 0.5)) {
      const at = (name: string) => rangeAnswer(PRESETS[name]!, spot(s), villain, villainEquity, board).fold;
      expect(at('Whale')).toBeLessThan(at('Reg'));
      expect(at('Reg')).toBeLessThan(at('Nit'));
    }
  });

  test('sets never fold, even a nit against a 3x pot overbet', () => {
    for (const s of SIZES) expect(rangeAnswer(PRESETS.Nit!, spot(s), villain, villainEquity, board).byClass.set.fold).toBeLessThan(0.05);
  });

  test('air folds far more than top pair', () => {
    const r = rangeAnswer(PRESETS.Reg!, spot(1), villain, villainEquity, board);
    expect(r.byClass.set.fold).toBeLessThan(0.05);
    expect(r.byClass.air.fold).toBeGreaterThan(r.byClass['top-pair'].fold + 0.3);
    expect(r.fold + r.call + r.raise).toBeCloseTo(1, 9);
  });
});
