/**
 * Saved profiles and players (the Players page), kept in this browser like hands and ranges.
 *
 * A profile is a style with a name: "Old man coffee" = Nit, Respects big bets 5. The built-in
 * types are profiles too (read-only; duplicate one to change it).
 * A player is a real person: a profile plus the sliders that differ for them. Changing a profile
 * changes every player on it, except in what the player overrides.
 */

import { SHARED_PROFILES_KEY } from '../sync/sync';
import {
  BASE_TYPES,
  complete,
  leadsLevel,
  limpTrapLevel,
  SLIDERS,
  typeSettings,
  type Leads,
  type LimpTrap,
  type OpenTell,
  type SeatStyle,
  type SliderId,
  type Sizing,
  type StyleSettings,
} from '../../core/players/style';
import type { ShowdownRead } from '../../core/players/reads';
import { QUESTIONS_VERSION } from '../../core/players/questions';
import { moveAnswer, upgrade, type Ask } from '../../core/players/versions';

export interface SavedProfile {
  id: string;
  name: string;
  note?: string;
  settings: StyleSettings;
  /** One of the built-in types: not saved, not editable. */
  builtIn?: boolean;
  /** Shared with everyone by its owner (Pro): synced to every account. */
  shared?: boolean;
  /** Someone else's shared profile (their email): read-only here. */
  sharedBy?: string;
  updatedAt?: string;
}

export interface PlayerOverrides {
  sliders?: Partial<Record<SliderId, number>>;
  sizing?: Sizing;
  /** A level; on/off (true / false) when saved before 2026-10-10. */
  limpTrap?: LimpTrap | boolean;
  /** A level; on/off (true / false) when saved before 2026-10-10. */
  leads?: Leads | boolean;
  openBB?: number;
  openTell?: OpenTell;
}

export interface SavedPlayer {
  id: string;
  name: string;
  profileId: string;
  overrides: PlayerOverrides;
  /** Reads and tells: what to look for at the table. */
  notes?: string;
  /** The question wizard's last answers (question id → option id), to re-check later. */
  answers?: Record<string, string>;
  /** The version of the questions his answers are on (questions.ts's QUESTIONS_VERSION; none = 1). */
  answersVersion?: number;
  /** Old answers the new questions couldn't map by themselves: the Players page asks you about them. */
  review?: Ask[];
  /** Hands you saw him show down, with what he did (the live screen's "Showdown I saw"). */
  reads?: ShowdownRead[];
  /** What you told the app about him during a game (✎ on the live screen), newest last. */
  observed?: { at: string; q: string; a: string }[];
  updatedAt?: string;
}

const PROFILES_KEY = 'logistack.profiles.v1';
const PLAYERS_KEY = 'logistack.players.v1';

export const builtInId = (type: string) => `type:${type}`;

export const BUILT_IN_PROFILES: SavedProfile[] = BASE_TYPES.map((t) => ({
  id: builtInId(t),
  name: t,
  settings: typeSettings(t),
  builtIn: true,
  note: t === 'Unknown' ? 'Plays like the pool’s reg.' : undefined,
}));

function read<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

function write<T>(key: string, list: T[]): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(list));
    return true;
  } catch {
    return false;
  }
}

// profiles saved before a slider existed get it at their type's position; profiles others shared
// (sync.ts keeps them under their own key) come last, read-only
export const loadProfiles = (): SavedProfile[] => [
  ...BUILT_IN_PROFILES,
  ...read<SavedProfile>(PROFILES_KEY).map((p) => ({ ...p, settings: complete(p.settings) })),
  ...read<SavedProfile>(SHARED_PROFILES_KEY).map((p) => ({ ...p, settings: complete(p.settings) })),
];

// players answered on older questions are moved to the current ones as they are read (versions.ts):
// the clean moves made, the rest waiting in `review`; saved like this with the next change
export const loadPlayers = (): SavedPlayer[] => {
  const list = read<SavedPlayer>(PLAYERS_KEY);
  if (!list.some((p) => p.answers && (p.answersVersion ?? 1) < QUESTIONS_VERSION)) return list;
  const profiles = loadProfiles();
  return list.map((p) => upgradePlayer(p, profiles));
};

/** A player answered on older questions, moved to the current ones. */
export function upgradePlayer(pl: SavedPlayer, profiles = loadProfiles()): SavedPlayer {
  const from = pl.answersVersion ?? 1;
  if (!pl.answers || from >= QUESTIONS_VERSION) return pl;
  const { settings, answers, asks } = upgrade(playerSettings(pl, profiles), pl.answers, from);
  return {
    ...pl,
    overrides: overridesFrom(settings, profileById(pl.profileId, profiles).settings),
    answers,
    answersVersion: QUESTIONS_VERSION,
    ...(asks.length || pl.review?.length ? { review: [...(pl.review ?? []), ...asks] } : {}),
  };
}

/**
 * A player with one review question answered (`choice`; null = don't know: the answer goes, his
 * sliders stay as the old answer set them).
 */
export function reviewPlayer(pl: SavedPlayer, ask: Ask, choice: string | null, profiles = loadProfiles()): SavedPlayer {
  const review = (pl.review ?? []).filter((x) => x.q !== ask.q);
  const { [ask.q]: _drop, ...rest } = pl.answers ?? {};
  void _drop;
  if (choice === null) return { ...pl, answers: rest, review };
  const answers = { ...rest, [ask.q]: choice };
  const settings = moveAnswer(playerSettings(pl, profiles), ask.q, ask.old, choice, answers, ask.from);
  return { ...pl, overrides: overridesFrom(settings, profileById(pl.profileId, profiles).settings), answers, review };
}

export function saveProfile(p: SavedProfile): boolean {
  if (p.builtIn || p.sharedBy) return false;
  const list = read<SavedProfile>(PROFILES_KEY).filter((x) => x.id !== p.id);
  return write(PROFILES_KEY, [...list, { ...p, updatedAt: new Date().toISOString() }]);
}

/** Deletes a profile; its players move to the profile's base type (keeping their overrides). */
export function deleteProfile(id: string): boolean {
  const gone = read<SavedProfile>(PROFILES_KEY).find((p) => p.id === id);
  if (!gone) return false;
  write(
    PLAYERS_KEY,
    loadPlayers().map((pl) => (pl.profileId === id ? { ...pl, profileId: builtInId(gone.settings.base) } : pl)),
  );
  return write(PROFILES_KEY, read<SavedProfile>(PROFILES_KEY).filter((p) => p.id !== id));
}

export function savePlayer(p: SavedPlayer): boolean {
  const list = loadPlayers().filter((x) => x.id !== p.id);
  return write(PLAYERS_KEY, [...list, { ...p, updatedAt: new Date().toISOString() }]);
}

/** Adds showdown reads to a saved player. */
export function addReads(playerId: string, reads: ShowdownRead[]): boolean {
  const pl = loadPlayers().find((p) => p.id === playerId);
  if (!pl) return false;
  return savePlayer({ ...pl, reads: [...(pl.reads ?? []), ...reads] });
}

export const deletePlayer = (id: string) => write(PLAYERS_KEY, loadPlayers().filter((p) => p.id !== id));

export function profileById(id: string, profiles = loadProfiles()): SavedProfile {
  return profiles.find((p) => p.id === id) ?? BUILT_IN_PROFILES[0]!;
}

/** A player's style: the profile's, with the player's overrides on top. */
export function playerSettings(pl: SavedPlayer, profiles = loadProfiles()): StyleSettings {
  const base = profileById(pl.profileId, profiles).settings;
  const sliders = { ...base.sliders };
  for (const id of SLIDERS) {
    const v = pl.overrides.sliders?.[id];
    if (v !== undefined) sliders[id] = v;
  }
  const openTell = pl.overrides.openTell ?? base.openTell;
  return {
    base: base.base,
    sliders,
    sizing: pl.overrides.sizing ?? base.sizing,
    limpTrap: limpTrapLevel(pl.overrides.limpTrap ?? base.limpTrap),
    leads: leadsLevel(pl.overrides.leads ?? base.leads),
    ...((pl.overrides.openBB ?? base.openBB) ? { openBB: pl.overrides.openBB ?? base.openBB } : {}),
    ...(openTell ? { openTell } : {}),
  };
}

/** A player's overrides for a full style: what differs from his profile. */
export function overridesFrom(s: StyleSettings, profile: StyleSettings): PlayerOverrides {
  const o: PlayerOverrides = {};
  const sliders: Partial<Record<SliderId, number>> = {};
  for (const id of SLIDERS) if (s.sliders[id] !== profile.sliders[id]) sliders[id] = s.sliders[id];
  if (Object.keys(sliders).length) o.sliders = sliders;
  if (s.sizing !== profile.sizing) o.sizing = s.sizing;
  if (limpTrapLevel(s.limpTrap) !== limpTrapLevel(profile.limpTrap)) o.limpTrap = limpTrapLevel(s.limpTrap);
  if (leadsLevel(s.leads) !== leadsLevel(profile.leads)) o.leads = leadsLevel(s.leads);
  if (s.openBB !== profile.openBB && s.openBB) o.openBB = s.openBB;
  if ((s.openTell ?? 'no') !== (profile.openTell ?? 'no')) o.openTell = s.openTell ?? 'no';
  return o;
}

/** What a seat gets when a saved player sits down. */
export function seatStyleOfPlayer(pl: SavedPlayer, profiles = loadProfiles()): SeatStyle {
  return { label: pl.name, playerId: pl.id, profileId: pl.profileId, settings: playerSettings(pl, profiles) };
}

/** What a seat gets for a profile (an anonymous player of that style). */
export function seatStyleOfProfile(p: SavedProfile): SeatStyle {
  return { label: p.name, profileId: p.id, settings: p.settings };
}

/** Everything, for a backup file; and back. */
export const exportAll = () => ({ format: 'logistack.players/1', profiles: read<SavedProfile>(PROFILES_KEY), players: loadPlayers() });

export function importAll(data: unknown): { profiles: number; players: number } | null {
  const d = data as { format?: string; profiles?: SavedProfile[]; players?: SavedPlayer[] };
  if (!d || d.format !== 'logistack.players/1') return null;
  const profiles = (d.profiles ?? []).filter((p) => p && p.id && p.settings && !p.builtIn);
  const players = (d.players ?? []).filter((p) => p && p.id && p.profileId);
  const keepP = read<SavedProfile>(PROFILES_KEY).filter((p) => !profiles.some((x) => x.id === p.id));
  const keepPl = loadPlayers().filter((p) => !players.some((x) => x.id === p.id));
  write(PROFILES_KEY, [...keepP, ...profiles]);
  write(PLAYERS_KEY, [...keepPl, ...players]);
  return { profiles: profiles.length, players: players.length };
}
