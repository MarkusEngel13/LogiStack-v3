/**
 * Saved profiles and players (the Players page), kept in this browser like hands and ranges.
 *
 * A profile is a style with a name: "Old man coffee" = Nit, Respects big bets 5. The built-in
 * types are profiles too (read-only; duplicate one to change it).
 * A player is a real person: a profile plus the sliders that differ for them. Changing a profile
 * changes every player on it, except in what the player overrides.
 */

import {
  BASE_TYPES,
  complete,
  SLIDERS,
  typeSettings,
  type SeatStyle,
  type SliderId,
  type Sizing,
  type StyleSettings,
} from '../../core/players/style';

export interface SavedProfile {
  id: string;
  name: string;
  note?: string;
  settings: StyleSettings;
  /** One of the built-in types: not saved, not editable. */
  builtIn?: boolean;
  updatedAt?: string;
}

export interface PlayerOverrides {
  sliders?: Partial<Record<SliderId, number>>;
  sizing?: Sizing;
  limpTrap?: boolean;
  leads?: boolean;
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

// profiles saved before a slider existed get it at their type's position
export const loadProfiles = (): SavedProfile[] => [...BUILT_IN_PROFILES, ...read<SavedProfile>(PROFILES_KEY).map((p) => ({ ...p, settings: complete(p.settings) }))];
export const loadPlayers = (): SavedPlayer[] => read<SavedPlayer>(PLAYERS_KEY);

export function saveProfile(p: SavedProfile): boolean {
  if (p.builtIn) return false;
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
  return {
    base: base.base,
    sliders,
    sizing: pl.overrides.sizing ?? base.sizing,
    limpTrap: pl.overrides.limpTrap ?? base.limpTrap,
    leads: pl.overrides.leads ?? base.leads,
  };
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
