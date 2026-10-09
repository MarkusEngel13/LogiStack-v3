/**
 * Showdown reads: hands you saw a player show down (when you weren't in the pot, or were), with
 * what he did with them. Each tag leans one slider (or one of the style's switches) up or down;
 * the reads of a player add up to suggestions next to his sliders - "4 reads say Sticky up".
 * Nothing moves by itself: you decide.
 */

import type { SliderId, StyleSettings } from './style';
import { SLIDERS } from './style';

export interface ReadTag {
  id: string;
  label: string;
  street: 'preflop' | 'postflop';
  /** The slider it leans (+1 = up, -1 = down), or a switch it votes for. */
  lean?: { slider: SliderId; dir: 1 | -1 };
  flag?: 'limpTrap' | 'leads';
}

export const READ_TAGS: readonly ReadTag[] = [
  { id: 'limp', label: 'Limped', street: 'preflop', lean: { slider: 'pfAggr', dir: -1 } },
  { id: 'coldcall', label: 'Called a raise with it', street: 'preflop', lean: { slider: 'loose', dir: 1 } },
  { id: 'trash', label: 'Played trash', street: 'preflop', lean: { slider: 'loose', dir: 1 } },
  { id: '3bet', label: '3-bet it', street: 'preflop', lean: { slider: 'pfAggr', dir: 1 } },
  { id: 'flat', label: 'Only called with a big hand', street: 'preflop', lean: { slider: 'pfAggr', dir: -1 } },
  { id: 'limpraise', label: 'Limp-raised', street: 'preflop', flag: 'limpTrap' },
  { id: 'calldown', label: 'Called down light', street: 'postflop', lean: { slider: 'sticky', dir: 1 } },
  { id: 'chase', label: 'Chased a draw', street: 'postflop', lean: { slider: 'sticky', dir: 1 } },
  { id: 'bluff', label: 'Bluffed', street: 'postflop', lean: { slider: 'bluffs', dir: 1 } },
  { id: 'thin', label: 'Bet thin for value', street: 'postflop', lean: { slider: 'postAggr', dir: 1 } },
  { id: 'xr', label: 'Check-raised', street: 'postflop', lean: { slider: 'postAggr', dir: 1 } },
  { id: 'slowplay', label: 'Slowplayed a big hand', street: 'postflop', lean: { slider: 'postAggr', dir: -1 } },
  { id: 'barrel', label: 'Bet every street', street: 'postflop', lean: { slider: 'cbet', dir: 1 } },
  { id: 'nocbet', label: 'Didn’t c-bet', street: 'postflop', lean: { slider: 'cbet', dir: -1 } },
  { id: 'lead', label: 'Led into the raiser', street: 'postflop', flag: 'leads' },
  { id: 'sizetell', label: 'His size gave it away', street: 'postflop' },
];

export const tagById = (id: string) => READ_TAGS.find((t) => t.id === id);

export interface ShowdownRead {
  id: string;
  /** ISO time it was entered. */
  at: string;
  /** What he showed: a grid hand ("KQo", "77"). */
  hand: string;
  /** Board ranks, if you noted them ("K72T"). */
  board?: string;
  tags: string[];
  note?: string;
  /** The live sitting it came from. */
  session?: string;
}

export interface ReadSuggestion {
  slider: SliderId;
  /** Net votes: positive = up. */
  votes: number;
  /** Reads that lean this slider at all. */
  of: number;
  from: number;
  to: number;
}

/**
 * What a player's reads suggest for his sliders, against his current settings: one step per
 * slider in the direction the votes lean (net two votes or more, or one when it's the only read
 * on that slider), never past 1 or 5. Switches: on when two or more reads show the line.
 */
export function readSuggestions(reads: readonly ShowdownRead[], settings: StyleSettings): { sliders: ReadSuggestion[]; flags: ('limpTrap' | 'leads')[] } {
  const votes = new Map<SliderId, { net: number; of: number }>();
  const flags = new Map<'limpTrap' | 'leads', number>();
  for (const r of reads) {
    for (const id of r.tags) {
      const t = tagById(id);
      if (t?.lean) {
        const v = votes.get(t.lean.slider) ?? { net: 0, of: 0 };
        votes.set(t.lean.slider, { net: v.net + t.lean.dir, of: v.of + 1 });
      }
      if (t?.flag) flags.set(t.flag, (flags.get(t.flag) ?? 0) + 1);
    }
  }
  const sliders: ReadSuggestion[] = [];
  for (const slider of SLIDERS) {
    const v = votes.get(slider);
    if (!v || v.net === 0) continue;
    if (Math.abs(v.net) < 2 && v.of > 1) continue;
    const from = settings.sliders[slider];
    const to = Math.max(1, Math.min(5, Math.round(from) + Math.sign(v.net)));
    if (to === from) continue;
    sliders.push({ slider, votes: v.net, of: v.of, from, to });
  }
  const on = [...flags.entries()].filter(([f, n]) => n >= 2 && !settings[f]).map(([f]) => f);
  return { sliders, flags: on };
}

/** How many reads lean each way on each slider, for the summary line ("Sticky ↑3"). */
export function readTally(reads: readonly ShowdownRead[]): { slider: SliderId; net: number }[] {
  const net = new Map<SliderId, number>();
  for (const r of reads) for (const id of r.tags) {
    const t = tagById(id);
    if (t?.lean) net.set(t.lean.slider, (net.get(t.lean.slider) ?? 0) + t.lean.dir);
  }
  return SLIDERS.filter((s) => (net.get(s) ?? 0) !== 0).map((slider) => ({ slider, net: net.get(slider)! }));
}
