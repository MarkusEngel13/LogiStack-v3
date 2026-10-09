import { useMemo } from 'react';
import { leadsLevel, limpTrapLevel, movedSliders, SLIDER_INFO, type SeatStyle, type StyleSettings } from '../../core/players/style';
import { Field, inputClass } from '../controls';
import { loadPlayers, loadProfiles, seatStyleOfPlayer, seatStyleOfProfile } from './store';

export interface Pick {
  /** The player's name, to put on the seat (profiles leave the name alone). */
  name?: string;
  style: SeatStyle;
}

const LIMP_TRAP_WORDS = ['', 'limp-reraises a monster', 'limp-reraises often'];
const LEADS_WORDS = ['', 'leads into the raiser rarely (monsters)', 'leads into the raiser', 'leads into the raiser often'];

/** The specials in words: limp-reraises, leads, open size and its tell. */
export function specials(s: StyleSettings): string[] {
  return [
    LIMP_TRAP_WORDS[limpTrapLevel(s.limpTrap)],
    LEADS_WORDS[leadsLevel(s.leads)],
    s.openBB ? `opens ${s.openBB} BB` : '',
    s.openTell === 'strong' ? 'opens bigger with strong hands' : s.openTell === 'weak' ? 'opens bigger with weak hands' : '',
  ].filter((x): x is string => !!x);
}

/** One line on a style: its base type and the sliders moved off it. */
export function styleSummary(style: SeatStyle): string {
  const moved = movedSliders(style.settings).map((id) => `${SLIDER_INFO[id].label} ${style.settings.sliders[id]}`);
  return [style.settings.base, ...moved, ...specials(style.settings)].join(' · ');
}

/** The wizard's "saved player" choice for a seat: a player from the Players page, or a profile. */
export function SavedPlayerPicker({ style, onPick }: { style?: SeatStyle; onPick: (p: Pick | null) => void }) {
  const { players, profiles } = useMemo(() => {
    const profiles = loadProfiles();
    return { players: loadPlayers().sort((a, b) => a.name.localeCompare(b.name)), profiles };
  }, []);
  const custom = profiles.filter((p) => !p.builtIn);
  const value = style?.playerId ? `player:${style.playerId}` : style?.profileId ? `profile:${style.profileId}` : '';

  if (players.length === 0 && custom.length === 0) {
    return (
      <Field label="Saved player">
        <p className="text-xs text-faint">None yet. Create players and profiles on the Players page.</p>
      </Field>
    );
  }

  return (
    <Field label="Saved player" hint={style ? styleSummary(style) : 'A player or profile from the Players page.'}>
      <select
        className={inputClass}
        value={value}
        onChange={(e) => {
          const [kind, id] = e.target.value.split(/:(.*)/s);
          if (kind === 'player') {
            const pl = players.find((p) => p.id === id);
            if (pl) onPick({ name: pl.name, style: seatStyleOfPlayer(pl, profiles) });
          } else if (kind === 'profile') {
            const pr = profiles.find((p) => p.id === id);
            if (pr) onPick({ style: seatStyleOfProfile(pr) });
          } else onPick(null);
        }}
      >
        <option value="">— none (use the player type below) —</option>
        {players.length > 0 && (
          <optgroup label="Players">
            {players.map((p) => (
              <option key={p.id} value={`player:${p.id}`}>
                {p.name}
              </option>
            ))}
          </optgroup>
        )}
        {custom.length > 0 && (
          <optgroup label="Profiles">
            {custom.map((p) => (
              <option key={p.id} value={`profile:${p.id}`}>
                {p.name}
              </option>
            ))}
          </optgroup>
        )}
      </select>
    </Field>
  );
}
