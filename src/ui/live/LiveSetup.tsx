import { useMemo, useState } from 'react';
import { BASE_TYPES } from '../../core/players/style';
import { Button, Field, MoneyInput, Segmented, TextInput, inputClass } from '../controls';
import { formatAmount } from '../format';
import { playerTypeColor } from '../playerTypes';
import { loadPlayers, loadProfiles, seatStyleOfPlayer, seatStyleOfProfile } from '../players/store';
import { HERO_NAME, type LiveSeat, type LiveTable } from './liveStore';

/** What a seat's picker shows: you, a saved player, a profile or a plain type. */
function seatValue(t: LiveTable, seat: number): string {
  const p = t.players[seat];
  if (seat === t.hero) return 'me';
  if (!p) return '';
  if (p.style?.playerId) return `player:${p.style.playerId}`;
  if (p.style?.profileId && !p.style.profileId.startsWith('type:')) return `profile:${p.style.profileId}`;
  return `type:${p.playerType || 'Unknown'}`;
}

/**
 * Tonight's table: who sits where (your saved players, profiles or just a type), you, the
 * button, blinds and stacks. Also used between hands to change the table (someone leaves,
 * rebuys, a new player sits down).
 */
export function LiveSetup({ initial, editing, onDone, onCancel }: { initial: LiveTable; editing?: boolean; onDone: (t: LiveTable) => void; onCancel?: () => void }) {
  const [t, setT] = useState<LiveTable>(initial);
  const { players, profiles } = useMemo(() => ({ players: loadPlayers().sort((a, b) => a.name.localeCompare(b.name)), profiles: loadProfiles() }), []);
  const custom = profiles.filter((p) => !p.builtIn);
  const money = (v: number) => formatAmount(v, t.currency, t.blinds.bb);

  const resize = (seats: number) =>
    setT((x) => {
      const ps = Array.from({ length: seats }, (_, i) => x.players[i] ?? null);
      const hero = x.hero < seats ? x.hero : 0;
      ps[hero] = ps[hero] ?? { name: HERO_NAME, stack: x.startStack, playerType: '' };
      return { ...x, seats, players: ps, hero, button: x.button < seats ? x.button : seats - 1 };
    });

  const pick = (seat: number, value: string) =>
    setT((x) => {
      const ps = [...x.players];
      const stack = ps[seat]?.stack ?? x.startStack;
      let hero = x.hero;
      if (value === 'me') {
        // you move here; your old seat becomes an unknown player
        if (hero !== seat) ps[hero] = { name: `Seat ${hero + 1}`, stack: ps[hero]?.stack ?? x.startStack, playerType: 'Unknown' };
        hero = seat;
        ps[seat] = { name: HERO_NAME, stack, playerType: '' };
        return { ...x, players: ps, hero };
      }
      if (seat === hero) return x; // pick "you" on another seat to move
      const [kind, id] = value.split(/:(.*)/s) as [string, string];
      let p: LiveSeat | null = null;
      if (kind === 'type') p = { name: id === 'Unknown' ? `Seat ${seat + 1}` : `${id} ${seat + 1}`, stack, playerType: id };
      if (kind === 'player') {
        const pl = players.find((y) => y.id === id);
        if (pl) {
          const style = seatStyleOfPlayer(pl, profiles);
          p = { name: pl.name, stack, playerType: style.settings.base, style };
        }
      }
      if (kind === 'profile') {
        const pr = profiles.find((y) => y.id === id);
        if (pr) {
          const style = seatStyleOfProfile(pr);
          p = { name: `${pr.name} ${seat + 1}`, stack, playerType: style.settings.base, style };
        }
      }
      ps[seat] = p;
      return { ...x, players: ps };
    });

  const setSeat = (seat: number, patch: Partial<LiveSeat>) =>
    setT((x) => {
      const ps = [...x.players];
      if (ps[seat]) ps[seat] = { ...ps[seat]!, ...patch };
      return { ...x, players: ps };
    });

  const seated = t.players.filter((p) => p && !p.sittingOut).length;
  const takenPlayers = new Set(t.players.map((p) => p?.style?.playerId).filter(Boolean));
  const buttonOk = !!t.players[t.button];

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-5">
      <div>
        <h1 className="text-xl font-bold">{editing ? 'Change the table' : 'Tonight’s table'}</h1>
        <p className="mt-1 text-sm text-muted">
          {editing ? 'Stacks, seats and the button for the next hand.' : 'Once per sitting. After this every hand starts with only your cards to tap.'}
        </p>
      </div>

      {!editing && (
        <>
          <Field label="Name">
            <TextInput value={t.name} onChange={(name) => setT({ ...t, name })} placeholder="Home game" />
          </Field>
          <Field label="Seats">
            <Segmented<number> value={t.seats} onChange={resize} options={[6, 7, 8, 9, 10].map((n) => ({ value: n, label: String(n) }))} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="SB">
              <MoneyInput value={t.blinds.sb} currency={t.currency} commitOnBlur onChange={(sb) => setT({ ...t, blinds: { ...t.blinds, sb } })} />
            </Field>
            <Field label="BB">
              <MoneyInput value={t.blinds.bb} currency={t.currency} commitOnBlur onChange={(bb) => setT({ ...t, blinds: { ...t.blinds, bb } })} />
            </Field>
            <Field label="Buy-in">
              <MoneyInput
                value={t.startStack}
                currency={t.currency}
                commitOnBlur
                onChange={(startStack) => setT({ ...t, startStack, players: t.players.map((p) => (p && p.stack === t.startStack ? { ...p, stack: startStack } : p)) })}
              />
            </Field>
          </div>
          <Field label="Your usual open" hint="One tap opens this; each limper adds a big blind.">
            <Segmented<number> value={t.openBB} onChange={(openBB) => setT({ ...t, openBB })} options={[2, 2.5, 3, 4, 5].map((n) => ({ value: n, label: `${n} BB` }))} />
          </Field>
        </>
      )}

      <Field label="Players" hint="D = the button for the first hand. Stacks only matter when they're short.">
        <ul className="space-y-1.5">
          {t.players.map((p, seat) => {
            const value = seatValue(t, seat);
            return (
              <li key={seat} className={`flex items-center gap-1.5 ${p?.sittingOut ? 'opacity-50' : ''}`}>
                <span className="w-5 shrink-0 text-right text-xs text-faint">{seat + 1}</span>
                <span className="h-7 w-1 shrink-0 rounded" style={{ background: seat === t.hero ? 'var(--color-accent)' : (playerTypeColor(p?.playerType) ?? 'transparent') }} />
                <select className={`${inputClass} min-w-0 flex-1 !py-2`} value={value} onChange={(e) => pick(seat, e.target.value)} aria-label={`Seat ${seat + 1}`}>
                  <option value="">— empty —</option>
                  <option value="me">★ You</option>
                  {players.length > 0 && (
                    <optgroup label="Your players">
                      {players.map((pl) => (
                        <option key={pl.id} value={`player:${pl.id}`} disabled={takenPlayers.has(pl.id) && value !== `player:${pl.id}`}>
                          {pl.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {custom.length > 0 && (
                    <optgroup label="Profiles">
                      {custom.map((pr) => (
                        <option key={pr.id} value={`profile:${pr.id}`}>
                          {pr.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  <optgroup label="Types">
                    {BASE_TYPES.map((ty) => (
                      <option key={ty} value={`type:${ty}`}>
                        {ty}
                      </option>
                    ))}
                  </optgroup>
                </select>
                {p && (
                  <div className="w-20 shrink-0">
                    <MoneyInput value={p.stack} currency={t.currency} commitOnBlur onChange={(stack) => setSeat(seat, { stack })} />
                  </div>
                )}
                <button
                  type="button"
                  disabled={!p}
                  onClick={() => setT({ ...t, button: seat })}
                  title="Button"
                  className={`h-9 w-9 shrink-0 rounded-full border text-xs font-bold disabled:opacity-20 ${t.button === seat ? 'border-white bg-white text-black' : 'border-line text-faint'}`}
                >
                  D
                </button>
                {editing && p && seat !== t.hero && (
                  <button type="button" onClick={() => setSeat(seat, { sittingOut: !p.sittingOut })} className="w-10 shrink-0 text-[11px] text-muted underline">
                    {p.sittingOut ? 'back' : 'out'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </Field>

      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-faint">
          {seated} players · {money(t.blinds.sb)}/{money(t.blinds.bb)}
        </span>
        <div className="flex gap-2">
          {onCancel && (
            <Button variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button variant="primary" disabled={seated < 2 || !buttonOk} onClick={() => onDone(t)}>
            {editing ? 'Save' : 'Start'}
          </Button>
        </div>
      </div>
    </div>
  );
}
