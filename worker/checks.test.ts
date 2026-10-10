import { describe, expect, test } from 'vitest';
import { adminEmails, checkAdviceUpload, checkTags, checkUserPatch, itemCounts, itemIdAllowed, ownerName, PART_MAX, pathPart, pseudonym } from './checks';

describe('the moment of a hand sent for advice', () => {
  test('known words pass; missing dimensions are empty; repeats go', () => {
    const r = checkTags({ street: ['river'], size: ['big', 'big'], villain: ['rec', 'whale'] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.street).toEqual(['river']);
    expect(r.value.size).toEqual(['big']);
    expect(r.value.villain).toEqual(['rec', 'whale']);
    expect(r.value.board).toEqual([]);
    expect(Object.keys(r.value)).toHaveLength(12);
  });

  test('unknown dimensions or values, and anything but arrays of strings, are refused', () => {
    expect(checkTags({ mood: ['happy'] }).ok).toBe(false);
    expect(checkTags({ street: ['showdown'] }).ok).toBe(false);
    expect(checkTags({ street: 'river' }).ok).toBe(false);
    expect(checkTags({ street: [1] }).ok).toBe(false);
    expect(checkTags({ toString: ['x'] }).ok).toBe(false);
    expect(checkTags(null).ok).toBe(false);
    expect(checkTags(['river']).ok).toBe(false);
  });
});

describe('who shared a profile', () => {
  test('a stable pseudonym, never the email', async () => {
    const a = await pseudonym('Gabi@Example.com');
    expect(a).toMatch(/^player-[0-9a-f]{6}$/);
    expect(await pseudonym('gabi@example.com')).toBe(a);
    expect(await pseudonym('other@example.com')).not.toBe(a);
    expect(a).not.toContain('gabi');
  });

  test('admins share as LogiStack', async () => {
    expect(await ownerName('marius@example.com', true)).toBe('LogiStack');
    expect(await ownerName('marius@example.com', false)).toMatch(/^player-/);
  });

  test('ADMIN_EMAILS: any case, spaces, empty parts', () => {
    expect(adminEmails(' A@x.com, b@Y.com ,,')).toEqual(['a@x.com', 'b@y.com']);
    expect(adminEmails(undefined)).toEqual([]);
  });
});

describe('item routes', () => {
  test('ids come encoded from the app (sync.ts) and are decoded before the check', () => {
    expect(pathPart(encodeURIComponent('day:2026-10-10'))).toBe('day:2026-10-10');
    expect(itemIdAllowed('quiz', pathPart('day%3A2026-10-10')!)).toBe(true);
    expect(pathPart('%E0%A4%A')).toBeNull();
    expect(pathPart(undefined)).toBeNull();
  });

  test('quiz items only by the quiz store names; other kinds any id', () => {
    for (const id of ['state', 'history', 'day:2026-10-10']) expect(itemIdAllowed('quiz', id)).toBe(true);
    for (const id of ['day:today', 'state2', 'x', 'day:2026-10-10x']) expect(itemIdAllowed('quiz', id)).toBe(false);
    expect(itemIdAllowed('hand', 'any-uuid')).toBe(true);
  });

  test('items per user and kind, unknown kinds and zeros left out', () => {
    const m = itemCounts([
      { owner: 'a', kind: 'hand', n: 3 },
      { owner: 'a', kind: 'quiz', n: 2 },
      { owner: 'a', kind: 'old', n: 9 },
      { owner: 'b', kind: 'range', n: 0 },
    ]);
    expect(m.get('a')).toEqual({ hand: 3, quiz: 2 });
    expect(m.get('b')).toBeUndefined();
  });
});

describe("an admin's change to a user", () => {
  test('a note is trimmed, empty means none, at most 500 characters', () => {
    expect(checkUserPatch({ note: '  Gabi, Thursday game ' })).toEqual({ ok: true, value: { note: 'Gabi, Thursday game' } });
    expect(checkUserPatch({ note: '   ' })).toEqual({ ok: true, value: { note: null } });
    expect(checkUserPatch({ note: null })).toEqual({ ok: true, value: { note: null } });
    expect(checkUserPatch({ note: 'x'.repeat(500) }).ok).toBe(true);
    expect(checkUserPatch({ note: 'x'.repeat(501) }).ok).toBe(false);
    expect(checkUserPatch({ note: 5 }).ok).toBe(false);
  });

  test('approving a request; unknown plans and roles; a request is only ever cleared', () => {
    expect(checkUserPatch({ plan: 'premium', premiumRequest: null })).toEqual({ ok: true, value: { plan: 'premium', premiumRequest: null } });
    expect(checkUserPatch({ plan: 'gold' }).ok).toBe(false);
    expect(checkUserPatch({ role: 'owner' }).ok).toBe(false);
    expect(checkUserPatch({ premiumRequest: '2026-10-10T10:00:00Z' }).ok).toBe(false);
    expect(checkUserPatch('premium').ok).toBe(false);
    expect(checkUserPatch({})).toEqual({ ok: true, value: {} });
  });
});

describe('a part of an advice upload', () => {
  const entry = (id: string) => ({ id, title: `Title ${id}`, advice: 'Bet small.', when: { street: ['river'], size: ['big'] }, strength: 3 });
  const upload = (over: Record<string, unknown> = {}) => ({ book: 'HHP playbook', part: 0, parts: 2, entries: [entry('a'), entry('b')], ...over });

  test('a good part passes, stripped to the fields of ServerAdvice', () => {
    const r = checkAdviceUpload(upload({ entries: [{ ...entry('a'), said: 'the coach said', sources: [{ video: 'v' }], caveat: 'c' }] }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.entries[0]).toEqual(entry('a'));
    expect(Object.keys(r.value.entries[0]!).sort()).toEqual(['advice', 'id', 'strength', 'title', 'when']);
  });

  test('an empty part (a book with no advice left) passes', () => {
    expect(checkAdviceUpload(upload({ parts: 1, entries: [] })).ok).toBe(true);
  });

  test('the frame: a name, part < parts, an array of at most 400', () => {
    expect(checkAdviceUpload(upload({ book: ' ' })).ok).toBe(false);
    expect(checkAdviceUpload(upload({ part: 2 })).ok).toBe(false);
    expect(checkAdviceUpload(upload({ part: -1 })).ok).toBe(false);
    expect(checkAdviceUpload(upload({ part: 0.5 })).ok).toBe(false);
    expect(checkAdviceUpload(upload({ parts: 0 })).ok).toBe(false);
    expect(checkAdviceUpload(upload({ entries: 'all' })).ok).toBe(false);
    expect(checkAdviceUpload(upload({ entries: Array.from({ length: PART_MAX }, (_, i) => entry(`e${i}`)) })).ok).toBe(true);
    expect(checkAdviceUpload(upload({ entries: Array.from({ length: PART_MAX + 1 }, (_, i) => entry(`e${i}`)) })).ok).toBe(false);
  });

  test('each entry: id, advice, a number for strength, `when` of word arrays', () => {
    const one = (e: Record<string, unknown>) => checkAdviceUpload(upload({ entries: [e] })).ok;
    expect(one({ ...entry('a'), id: '' })).toBe(false);
    expect(one({ ...entry('a'), advice: '' })).toBe(false);
    expect(one({ ...entry('a'), strength: '3' })).toBe(false);
    expect(one({ ...entry('a'), strength: -1 })).toBe(false);
    expect(one({ ...entry('a'), when: undefined })).toBe(false);
    expect(one({ ...entry('a'), when: { street: 'river' } })).toBe(false);
    expect(one({ ...entry('a'), when: { street: [7] } })).toBe(false);
    // a word the app doesn't know yet is kept (it just never matches)
    expect(one({ ...entry('a'), when: { street: ['showdown'] } })).toBe(true);
  });
});
