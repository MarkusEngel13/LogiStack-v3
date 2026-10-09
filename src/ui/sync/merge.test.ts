import { describe, expect, test } from 'vitest';
import { hashOf, merge, type ServerItem } from './merge';

type X = { id: string; v: number };
const s = (id: string, v: number | null): ServerItem<X> => ({ id, data: v === null ? null : { id, v }, deleted: v === null });
const shadowOf = (...xs: X[]) => Object.fromEntries(xs.map((x) => [x.id, hashOf(x)]));

describe('merging one kind', () => {
  test('first sync: everything local goes up, everything remote comes down', () => {
    const m = merge([{ id: 'a', v: 1 }], [s('b', 2)], {});
    expect(m.push.map((x) => x.id)).toEqual(['a']);
    expect(m.local.map((x) => x.id).sort()).toEqual(['a', 'b']);
  });

  test('changed there only: take it; changed here only: send it', () => {
    const a1 = { id: 'a', v: 1 };
    const b1 = { id: 'b', v: 1 };
    const m = merge([a1, { id: 'b', v: 5 }], [s('a', 9), s('b', 1)], shadowOf(a1, b1));
    expect(m.local.find((x) => x.id === 'a')!.v).toBe(9);
    expect(m.push).toEqual([{ id: 'b', v: 5 }]);
  });

  test('deleted here since the last sync: delete there', () => {
    const a1 = { id: 'a', v: 1 };
    const m = merge([], [s('a', 1)], shadowOf(a1));
    expect(m.remove).toEqual(['a']);
    expect(m.local).toEqual([]);
  });

  test('deleted there, unchanged here: delete here; edited here: keep the edit', () => {
    const a1 = { id: 'a', v: 1 };
    expect(merge([a1], [s('a', null)], shadowOf(a1)).local).toEqual([]);
    const m = merge([{ id: 'a', v: 2 }], [s('a', null)], shadowOf(a1));
    expect(m.push).toEqual([{ id: 'a', v: 2 }]);
  });

  test('items that stay local are never sent', () => {
    const m = merge([{ id: 'w', v: 1 }], [], {}, (x) => x.id !== 'w');
    expect(m.push).toEqual([]);
    expect(m.local).toEqual([{ id: 'w', v: 1 }]);
  });
});
