/**
 * The playbook: the Strategy Bible streamlined into pieces of advice, each tied to the moments of
 * a hand it applies to (`when`, in the words of spot.ts). The playbook itself is private study
 * material built from the creators' videos: it never ships with the app - the user loads it from
 * their own copy (Strategy Bible folder, `playbook/*.json`).
 */

import type { Dimension, SpotTags } from './spot';

export interface PlaybookSource {
  claim: string;
  video: string;
  title?: string;
  /** The video at the moment (YouTube link with &t=). */
  url?: string;
  speaker?: string;
  quote?: string;
}

export interface PlaybookEntry {
  id: string;
  title: string;
  /** What to do. */
  advice: string;
  /** What the opponent does here and why. */
  read?: string;
  /** What drives the opponent: fear-outdrawn, greed-value, ... (decide.ts's motives in HHP's words). */
  motive?: string | null;
  /** The coaches' own words for it. */
  said?: string | null;
  caveat?: string | null;
  /** The moments it applies to; absent for general advice (mental game, study, bankroll). */
  when?: Partial<Record<Dimension, string[]>>;
  /** Distinct videos that say it. */
  strength: number;
  sources: PlaybookSource[];
}

export interface Playbook {
  format: 'logistack.playbook/1';
  name: string;
  built: string;
  entries: PlaybookEntry[];
}

/** What an entry needs to be matched to a moment (the full entry, or the server's copy). */
type Matchable = Pick<PlaybookEntry, 'when' | 'strength'>;

export interface AdviceMatch<E extends Matchable = PlaybookEntry> {
  entry: E;
  /** How many of the moment's dimensions it names (the more specific, the more relevant). */
  specificity: number;
  score: number;
}

/**
 * The advice for a moment: every entry whose `when` fits (each dimension it names must share a
 * value with the moment's tags), the most specific first, then the best sourced. General advice
 * (no `when`) never shows up here.
 */
export function matchAdvice<E extends Matchable = PlaybookEntry>(entries: readonly E[], tags: SpotTags, limit = 3): AdviceMatch<E>[] {
  const out: AdviceMatch<E>[] = [];
  for (const entry of entries) {
    const when = entry.when;
    if (!when) continue;
    let specificity = 0;
    let fits = true;
    for (const [dim, wanted] of Object.entries(when) as [Dimension, string[]][]) {
      if (!wanted?.length) continue;
      const have = tags[dim] ?? [];
      if (!wanted.some((v) => have.includes(v))) {
        fits = false;
        break;
      }
      specificity++;
    }
    if (!fits || specificity === 0) continue;
    out.push({ entry, specificity, score: specificity + 0.5 * Math.log2(1 + entry.strength) });
  }
  return out.sort((a, b) => b.score - a.score || b.entry.strength - a.entry.strength).slice(0, limit);
}

// ---- the server's copy ("Consider this" for other users) -----------------------------------------

/**
 * What goes to the server for other users: the advice in our own words and when it applies. The
 * coaches' words (said, quotes), their names, the videos and the caveats stay in the admin's file.
 */
export interface ServerAdvice {
  id: string;
  title: string;
  advice: string;
  when: Partial<Record<Dimension, string[]>>;
  strength: number;
}

/** Names that mark an entry as someone's own words or story: those entries don't go up. */
const NAMED = /\b(charlie|carrel|hungry ?horse|hhp|dominik|nitsche|spraggy|mariano|rampage|epiphany|youtube|video|vlog|podcast)\b/i;

/** The entries other users may see, stripped to `ServerAdvice` (only those tied to moments of a hand). */
export function serverAdvice(p: Playbook): ServerAdvice[] {
  return p.entries
    .filter((e) => e.when && Object.values(e.when).some((v) => v?.length) && !NAMED.test(`${e.title} ${e.advice}`))
    .map((e) => ({ id: e.id, title: e.title, advice: e.advice, when: e.when!, strength: e.strength }));
}

/** A loaded file, checked enough not to break the screen (a wrong file is refused, not half-used). */
export function parsePlaybook(raw: unknown): Playbook {
  const p = raw as Partial<Playbook>;
  if (!p || p.format !== 'logistack.playbook/1' || !Array.isArray(p.entries)) {
    throw new Error('Not a LogiStack playbook (format logistack.playbook/1).');
  }
  const entries = p.entries.filter((e): e is PlaybookEntry => !!e && typeof e.title === 'string' && typeof e.advice === 'string' && Array.isArray(e.sources));
  return { format: 'logistack.playbook/1', name: p.name ?? 'Playbook', built: p.built ?? '', entries };
}
