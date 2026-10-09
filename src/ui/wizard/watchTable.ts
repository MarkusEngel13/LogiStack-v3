/**
 * The gym's watch table: a 6-max casino game of bots with mixed player types and no Hero, set up
 * like the wizard would (same defaults, same checks), so the bots can play every seat while you watch.
 */

import { DERIVED, typeSettings } from '../../core/players/style';
import { defaultDraft, newPlayer, type WizardDraft } from './draft';

/** The types a watch table mixes (Unknown plays like a Reg, so it adds nothing to watch). */
export const WATCH_TYPES = ['Reg', 'TAG', 'LAG', 'Nit', 'Weak-tight rec', 'Fish', 'Whale', 'Maniac'] as const;

export function watchDraft(rand: () => number = Math.random, size = 6): WizardDraft {
  const base = defaultDraft();
  const bb = base.blinds.bb;
  const types = Array.from({ length: size }, () => WATCH_TYPES[Math.floor(rand() * WATCH_TYPES.length)]!);
  const seats = types.map((type, seat) => {
    const same = types.filter((t) => t === type).length;
    const nth = types.slice(0, seat + 1).filter((t) => t === type).length;
    const name = same > 1 ? `${type} ${nth}` : type;
    // a type without a motive preset of its own (style.ts's DERIVED) plays through its sliders
    const style = DERIVED[type] ? { style: { label: name, settings: typeSettings(type) } } : {};
    return { ...newPlayer(seat, bb), name, playerType: type, ...style };
  });
  return {
    ...base,
    tableSize: size,
    venue: 'casino',
    tableName: 'Watch table',
    seats,
    heroSeat: null,
    button: Math.floor(rand() * size),
  };
}
