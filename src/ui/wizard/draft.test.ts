import { describe, expect, test } from 'vitest';
import { replay } from '../../core/engine/replay';
import { CURRENCIES } from '../format';
import {
  defaultDraft,
  niceRound,
  previewPositions,
  resizeTable,
  setBlinds,
  setCurrency,
  straddlesFor,
  toHandRecord,
  validateDraft,
  type WizardDraft,
} from './draft';

const meta = { id: 'test', createdAt: '2026-10-04T00:00:00Z', handNo: 7 };

function draft(patch: (d: WizardDraft) => WizardDraft = (d) => d) {
  return patch(defaultDraft());
}

describe('wizard draft', () => {
  test('the default draft is a valid 9-handed hand', () => {
    const check = validateDraft(draft());
    expect(check.errors).toEqual([]);
    expect(check.state!.seats.filter((s) => s.dealtIn)).toHaveLength(9);
  });

  test('toHandRecord produces a hand the engine replays', () => {
    const rec = toHandRecord(draft(), meta);
    expect(rec).toMatchObject({ format: 'logistack.hand/0', handNo: 7, button: 0, hero: 0, events: [] });
    expect(rec.players).toHaveLength(9);
    expect(rec.table.rake).toBeUndefined(); // home game
    expect(replay(rec).toAct).not.toBeNull();
  });

  test('casino adds rake; ante and side games appear only when switched on', () => {
    const rec = toHandRecord(
      draft((d) => ({
        ...d,
        venue: 'casino',
        ante: { kind: 'bb', amount: 200 },
        sevenDeuce: { ...d.sevenDeuce, enabled: true },
      })),
      meta,
    );
    expect(rec.table.rake).toEqual({ percent: 0.05, cap: 500, noFlopNoDrop: true });
    expect(rec.table.ante).toEqual({ kind: 'bb', amount: 200 });
    expect(rec.sideGames).toEqual({
      sevenDeuce: { bounty: 500, payers: 'dealt-in', suitedCounts: false, showdownOnly: false },
      squid: undefined,
    });
  });

  test('resizing keeps the players who fit and fixes hero and button', () => {
    const d = draft((d) => ({ ...d, heroSeat: 7, button: 8 }));
    const small = resizeTable(d, 6);
    expect(small.seats).toHaveLength(6);
    expect(small.heroSeat).toBeNull();
    expect(small.button).toBe(0);
    const big = resizeTable(small, 10);
    expect(big.seats).toHaveLength(10);
    expect(big.seats[9]!.name).toBe('Player 10');
  });

  test('switching to chips keeps face values', () => {
    const d = setCurrency(draft(), CURRENCIES.find((c) => c.code === 'CHIPS')!);
    expect(d.blinds).toEqual({ sb: 1, bb: 2 });
    expect(d.seats[0]!.stack).toBe(200);
  });

  test('new big blind in a money game: stacks keep their BB depth, everything priced off the BB follows', () => {
    const d = setBlinds(draft((d) => ({ ...d, ante: { kind: 'each', amount: 200 } })), { sb: 10, bb: 25 });
    expect(d.blinds).toEqual({ sb: 10, bb: 25 });
    expect(d.seats[0]!.stack).toBe(2500); // €200 = 100 BB → €25
    expect(d.straddle.amount).toBe(50); // €4 → €0.50
    expect(d.ante.amount).toBe(25);
    expect(d.sevenDeuce.bounty).toBe(50); // €5 × 1/8 = €0.625 → €0.50
    expect(d.squid.value).toBe(50);
    expect(d.rake.cap).toBe(500); // house rule, unchanged
  });

  test('new big blind in a chip game: stacks stay, straddle and ante follow', () => {
    const chips = setCurrency(draft(), CURRENCIES.find((c) => c.code === 'CHIPS')!); // 1/2, stacks 200
    const d = setBlinds(chips, { sb: 5, bb: 10 });
    expect(d.seats[0]!.stack).toBe(200);
    expect(d.straddle.amount).toBe(20);
    expect(d.sevenDeuce.bounty).toBe(chips.sevenDeuce.bounty);
  });

  test('changing only the small blind changes nothing else', () => {
    const before = draft();
    const d = setBlinds(before, { sb: 50, bb: 200 });
    expect(d.seats).toEqual(before.seats);
    expect(d.straddle).toEqual(before.straddle);
  });

  test('niceRound picks 1 / 2 / 2.5 / 5 × 10^n', () => {
    expect(niceRound(62.5)).toBe(50);
    expect(niceRound(80)).toBe(100);
    expect(niceRound(240)).toBe(250);
    expect(niceRound(1250)).toBe(1000);
  });

  test('UTG straddle and re-straddle follow the button', () => {
    // 9 seats, button on seat 0: SB 1, BB 2, UTG 3, UTG+1 4
    const d = draft((d) => ({ ...d, straddle: { kind: 'utg', amount: 400, restraddle: true } }));
    expect(straddlesFor(d)).toEqual([
      { seat: 3, amount: 400 },
      { seat: 4, amount: 800 },
    ]);
    expect(replay(toHandRecord(d, meta)).toAct).toBe(5);
  });

  test('button (Mississippi) straddle: the small blind acts first', () => {
    const d = draft((d) => ({ ...d, straddle: { kind: 'button', amount: 400, restraddle: false } }));
    expect(straddlesFor(d)).toEqual([{ seat: 0, amount: 400 }]);
    expect(replay(toHandRecord(d, meta)).toAct).toBe(1);
  });

  test('no straddle heads-up', () => {
    const d = draft((d) => ({
      ...resizeTable(d, 2),
      straddle: { kind: 'utg', amount: 400, restraddle: false },
    }));
    expect(straddlesFor(d)).toEqual([]);
  });

  test('validation messages', () => {
    expect(validateDraft(draft((d) => ({ ...d, seats: d.seats.map((p, i) => (i < 8 ? null : p)) }))).errors).toContain(
      'At least two players must be dealt in.',
    );
    expect(validateDraft(draft((d) => ({ ...d, blinds: { sb: 300, bb: 200 } }))).errors).toContain(
      'The small blind is bigger than the big blind.',
    );
    expect(validateDraft(draft((d) => ({ ...d, seats: d.seats.map((p, i) => (i === 0 ? null : p)) }))).errors).toContain(
      'Hero sits in an empty seat.',
    );
    const dupCards = draft((d) => ({
      ...d,
      seats: d.seats.map((p, i) => (p && i < 2 ? { ...p, cards: ['As', i === 0 ? 'Kd' : 'As'] } : p)),
    }));
    expect(validateDraft(dupCards).errors.join()).toMatch(/As is already in play/);
  });

  test('positions preview works even while the draft has other errors', () => {
    const d = draft((d) => ({ ...d, blinds: { sb: 300, bb: 200 } }));
    expect(previewPositions(d).get(0)).toBe('BTN');
    expect(previewPositions(d).get(2)).toBe('BB');
  });
});
