/**
 * What the API checks before anything touches the database, and the names other users see. No
 * database in here, so it is tested on its own (checks.test.ts); worker/index.ts uses it.
 */

import { DIMENSIONS, type Dimension, type SpotTags } from '../src/core/advice/spot';
import type { AdviceUpload, ServerAdvice } from '../src/shared/api';
import { isKind, isPlan, isQuizItemId, type Kind, type Plan, type Role } from '../src/shared/plans';

export type Checked<T> = { ok: true; value: T } | { ok: false; message: string };
const bad = (message: string): { ok: false; message: string } => ({ ok: false, message });

const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isDimension = (x: string): x is Dimension => Object.hasOwn(DIMENSIONS, x);

/** The admins named in ADMIN_EMAILS (comma-separated, any case). */
export const adminEmails = (raw: string | undefined): string[] =>
  (raw ?? '').toLowerCase().split(',').map((s) => s.trim()).filter(Boolean);

/** A part of the path, decoded (the app encodes ids: day:2026-10-10 -> day%3A2026-10-10); null if broken. */
export function pathPart(s: string | undefined): string | null {
  try {
    return s ? decodeURIComponent(s) : null;
  } catch {
    return null;
  }
}

// ---- items ---------------------------------------------------------------------------------------

/** Quiz items only go by the names the quiz store uses (state, history, day:YYYY-MM-DD). */
export const itemIdAllowed = (kind: Kind, id: string): boolean => kind !== 'quiz' || isQuizItemId(id);

/** Who shared a profile, as others see it: never the email. Admins share as "LogiStack". */
export async function ownerName(email: string, admin: boolean): Promise<string> {
  return admin ? 'LogiStack' : pseudonym(email);
}

/** A stable name for a user that doesn't give away the email: "player-" + 6 hex of its SHA-256. */
export async function pseudonym(email: string): Promise<string> {
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`logistack:${email.trim().toLowerCase()}`));
  return `player-${[...new Uint8Array(hash).slice(0, 3)].map((b) => b.toString(16).padStart(2, '0')).join('')}`;
}

/** Saved items per user and kind, from the GROUP BY rows (kinds without items left out). */
export function itemCounts(rows: readonly { owner: string; kind: string; n: number }[]): Map<string, Partial<Record<Kind, number>>> {
  const out = new Map<string, Partial<Record<Kind, number>>>();
  for (const r of rows) {
    if (!isKind(r.kind) || !r.n) continue;
    const counts = out.get(r.owner) ?? {};
    counts[r.kind] = r.n;
    out.set(r.owner, counts);
  }
  return out;
}

// ---- users ---------------------------------------------------------------------------------------

export const NOTE_MAX = 500;
const ROLES: readonly Role[] = ['user', 'editor', 'admin'];

export interface UserPatch {
  plan?: Plan;
  role?: Role;
  /** null = no note. */
  note?: string | null;
  /** Only ever cleared. */
  premiumRequest?: null;
}

/** An admin's change to a user (AdminUserPatch): known plans and roles, a note of at most 500 characters ('' = none). */
export function checkUserPatch(raw: unknown): Checked<UserPatch> {
  if (!isObject(raw)) return bad('Send an object: { plan?, role?, note?, premiumRequest? }.');
  const out: UserPatch = {};
  if (raw.plan !== undefined) {
    if (!isPlan(raw.plan)) return bad('Unknown plan.');
    out.plan = raw.plan;
  }
  if (raw.role !== undefined) {
    if (!ROLES.includes(raw.role as Role)) return bad('Unknown role.');
    out.role = raw.role as Role;
  }
  if (raw.note !== undefined) {
    if (raw.note !== null && typeof raw.note !== 'string') return bad('The note is text (or null).');
    const note = (raw.note ?? '').trim();
    if (note.length > NOTE_MAX) return bad(`A note keeps at most ${NOTE_MAX} characters.`);
    out.note = note || null;
  }
  if (raw.premiumRequest !== undefined) {
    if (raw.premiumRequest !== null) return bad('A Premium request can only be cleared (null).');
    out.premiumRequest = null;
  }
  return { ok: true, value: out };
}

// ---- advice --------------------------------------------------------------------------------------

/** The moment of a hand in the playbook's words: only known dimensions and values, arrays of strings. */
export function checkTags(raw: unknown): Checked<SpotTags> {
  if (!isObject(raw)) return bad('tags: an object of the moment\'s words (core/advice/spot.ts).');
  const tags = Object.fromEntries(Object.keys(DIMENSIONS).map((d) => [d, [] as string[]])) as SpotTags;
  for (const [dim, values] of Object.entries(raw)) {
    if (!isDimension(dim)) return bad(`Unknown dimension "${dim}".`);
    if (!Array.isArray(values) || !values.every((v) => typeof v === 'string')) return bad(`tags.${dim}: an array of strings.`);
    const known: readonly string[] = DIMENSIONS[dim];
    const unknown = values.find((v) => !known.includes(v));
    if (unknown !== undefined) return bad(`Unknown ${dim} "${unknown}".`);
    tags[dim] = [...new Set(values as string[])];
  }
  return { ok: true, value: tags };
}

export const PART_MAX = 400;
const BOOK_MAX = 100;
const ID_MAX = 128;
const TEXT_MAX = 4000;

/** One piece of advice as it may be stored: only the fields of ServerAdvice, nothing else gets through. */
function checkAdvice(raw: unknown, i: number): Checked<ServerAdvice> {
  const where = `entries[${i}]`;
  if (!isObject(raw)) return bad(`${where}: an object.`);
  const { id, title, advice, when, strength } = raw;
  if (typeof id !== 'string' || !id || id.length > ID_MAX) return bad(`${where}.id: text of 1-${ID_MAX} characters.`);
  if (typeof title !== 'string' || title.length > TEXT_MAX) return bad(`${where}.title: text.`);
  if (typeof advice !== 'string' || !advice || advice.length > TEXT_MAX) return bad(`${where}.advice: text.`);
  if (typeof strength !== 'number' || !Number.isFinite(strength) || strength < 0) return bad(`${where}.strength: a number of 0 or more.`);
  if (!isObject(when)) return bad(`${where}.when: an object of the moments it applies to.`);
  // the shape only: a word the app doesn't know yet just never matches (dropping it would widen the advice)
  for (const [dim, values] of Object.entries(when)) {
    if (!Array.isArray(values) || !values.every((v) => typeof v === 'string' && v.length <= 64)) return bad(`${where}.when.${dim}: an array of words.`);
  }
  return { ok: true, value: { id, title, advice, when: when as ServerAdvice['when'], strength } };
}

/** One part of a book upload (AdviceUpload): a name, part < parts, at most 400 well-formed entries. */
export function checkAdviceUpload(raw: unknown): Checked<AdviceUpload> {
  if (!isObject(raw)) return bad('Send an object: { book, part, parts, entries }.');
  const { book, part, parts, entries } = raw;
  if (typeof book !== 'string' || !book.trim() || book.length > BOOK_MAX) return bad(`book: a name of 1-${BOOK_MAX} characters.`);
  if (!Number.isInteger(parts) || (parts as number) < 1 || (parts as number) > 100) return bad('parts: a whole number from 1 to 100.');
  if (!Number.isInteger(part) || (part as number) < 0 || (part as number) >= (parts as number)) return bad('part: a whole number from 0 to parts - 1.');
  if (!Array.isArray(entries)) return bad('entries: an array.');
  if (entries.length > PART_MAX) return bad(`At most ${PART_MAX} entries a part.`);
  const out: ServerAdvice[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = checkAdvice(entries[i], i);
    if (!e.ok) return e;
    out.push(e.value);
  }
  return { ok: true, value: { book: book.trim(), part: part as number, parts: parts as number, entries: out } };
}
