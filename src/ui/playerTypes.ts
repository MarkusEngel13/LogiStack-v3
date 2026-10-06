/** Player types and their colors (v2 colors, plus Fish). Shown as a stripe on the seat plate. */
export const PLAYER_TYPES = [
  { id: 'Unknown', color: '#5c5c5c' },
  { id: 'Reg', color: '#e8c547' },
  { id: 'TAG', color: '#ff8c00' },
  { id: 'LAG', color: '#ff3b3b' },
  { id: 'Nit', color: '#9a9a9a' },
  { id: 'Fish', color: '#4ade80' },
  { id: 'Whale', color: '#00ced1' },
  { id: 'Maniac', color: '#da70d6' },
] as const;

export const playerTypeColor = (id: string | undefined) =>
  id ? (PLAYER_TYPES.find((t) => t.id === id)?.color ?? '#5c5c5c') : undefined;

/**
 * Status badges on the seat plate. Drinking comes in two phases (alcohol stimulates while it rises,
 * sedates while it falls): lively = looser and more aggressive, tired = looser and more calling.
 */
export const STATUS_TAGS = [
  { id: 'winning', label: 'Winning', icon: '🏆' },
  { id: 'tilt', label: 'On tilt', icon: '🔥' },
  { id: 'drinking', label: 'Drinking, lively', icon: '🍺' },
  { id: 'drinking-tired', label: 'Drinking, tired', icon: '🥴' },
] as const;

/** Statuses that exclude each other: a player is lively or tired, not both. */
const EXCLUSIVE: readonly (readonly string[])[] = [['drinking', 'drinking-tired']];

/** Switch a status on or off; switching one on drops the ones it excludes. */
export function toggleStatus<T extends string>(tags: readonly T[], tag: T): T[] {
  if (tags.includes(tag)) return tags.filter((t) => t !== tag);
  const others = EXCLUSIVE.find((g) => g.includes(tag)) ?? [];
  return [...tags.filter((t) => !others.includes(t)), tag];
}

export const BLIND_ICON = '🙈';
export const SQUID_ICON = '🦑';

export const statusIcon = (tag: string) => STATUS_TAGS.find((t) => t.id === tag)?.icon ?? '🏷️';
