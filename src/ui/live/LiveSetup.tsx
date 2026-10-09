import { useMemo, useState } from 'react';
import { BASE_TYPES } from '../../core/players/style';
import { Button, Field, MoneyInput, TextInput, inputClass } from '../controls';
import { formatAmount } from '../format';
import { playerTypeColor } from '../playerTypes';
import { loadPlayers, loadProfiles, seatStyleOfPlayer, seatStyleOfProfile } from '../players/store';
import { seatsFromHero, tableFromList, type LiveSeat, type LiveTable } from './liveStore';

/** What a player's picker shows: a saved player, a profile or a plain type. */
function seatValue(p: LiveSeat): string {
  if (p.style?.playerId) return `player:${p.style.playerId}`;
  if (p.style?.profileId && !p.style.profileId.startsWith('type:')) return `profile:${p.style.profileId}`;
  return `type:${p.playerType || 'Unknown'}`;
}

const MAX_PLAYERS = 10;

/** A line of the list; the id keeps a player's line (and the button) when lines move. */
interface Row {
  id: number;
  p: LiveSeat;
}

/**
 * Tonight's table: you, then the players in seat order clockwise from your left (your saved
 * players, profiles or just a type), with their stacks. No button: each hand starts with a tap on
 * it. Also used between hands to change the table (someone leaves, rebuys, sits out, sits down).
 */
export function LiveSetup({ initial, editing, onDone, onCancel }: { initial: LiveTable; editing?: boolean; onDone: (t: LiveTable) => void; onCancel?: () => void }) {
  const [t, setT] = useState<LiveTable>(initial);
  // you first, then clockwise; the button's line is remembered for changes between hands
  const [rows, setRows] = useState<Row[]>(() => seatsFromHero(initial).map((seat) => ({ id: seat, p: initial.players[seat]! })));
  const [nextId, setNextId] = useState(initial.seats);
  const { players, profiles } = useMemo(() => ({ players: loadPlayers().sort((a, b) => a.name.localeCompare(b.name)), profiles: loadProfiles() }), []);
  const custom = profiles.filter((p) => !p.builtIn);
  const money = (v: number) => formatAmount(v, t.currency, t.blinds.bb);

  const setSeat = (i: number, patch: Partial<LiveSeat>) => setRows((xs) => xs.map((x, j) => (j === i ? { ...x, p: { ...x.p, ...patch } } : x)));
  const pick = (i: number, value: string) => {
    const stack = rows[i]!.p.stack;
    const [kind, id] = value.split(/:(.*)/s) as [string, string];
    let p: LiveSeat | null = null;
    if (kind === 'type') p = { name: id === 'Unknown' ? `Seat ${i + 1}` : `${id} ${i + 1}`, stack, playerType: id };
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
        p = { name: `${pr.name} ${i + 1}`, stack, playerType: style.settings.base, style };
      }
    }
    if (p) setRows((xs) => xs.map((x, j) => (j === i ? { ...x, p: { ...p, ...(x.p.sittingOut ? { sittingOut: true } : {}) } } : x)));
  };
  const moveUp = (i: number) => setRows((xs) => (i <= 1 ? xs : [...xs.slice(0, i - 1), xs[i]!, xs[i - 1]!, ...xs.slice(i + 1)]));
  const remove = (i: number) => setRows((xs) => xs.filter((_, j) => j !== i));
  const addPlayer = () => {
    setRows((xs) => [...xs, { id: nextId, p: { name: `Seat ${xs.length + 1}`, stack: t.startStack, playerType: 'Unknown' } }]);
    setNextId((n) => n + 1);
  };
  const done = () =>
    onDone(
      tableFromList(
        t,
        rows.map((r) => r.p),
        rows.findIndex((r) => r.id === initial.button),
      ),
    );

  const seated = rows.filter((r) => !r.p.sittingOut).length;
  const takenPlayers = new Set(rows.map((r) => r.p.style?.playerId).filter(Boolean));
  const smallKey = 'h-9 w-8 shrink-0 rounded-md border border-line text-muted disabled:opacity-20';

  return (
    <div className="mx-auto max-w-lg space-y-5 px-4 py-5">
      <div>
        <h1 className="text-xl font-bold">{editing ? 'Change the table' : 'Tonight’s table'}</h1>
        <p className="mt-1 text-sm text-muted">
          {editing ? 'Stacks and players for the next hand.' : 'Once per sitting. Each hand then starts with a tap on the button and your cards.'}
        </p>
      </div>

      {!editing && (
        <>
          <Field label="Name">
            <TextInput value={t.name} onChange={(name) => setT({ ...t, name })} placeholder="Home game" />
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
                onChange={(startStack) => {
                  setRows((xs) => xs.map((r) => (r.p.stack === t.startStack ? { ...r, p: { ...r.p, stack: startStack } } : r)));
                  setT({ ...t, startStack });
                }}
              />
            </Field>
          </div>
        </>
      )}

      <Field label="Players, clockwise from you" hint="The first after you sits on your left. Stacks only matter when they're short.">
        <ul className="space-y-1.5">
          {rows.map(({ id, p }, i) => (
            <li key={id} className={`flex items-center gap-1.5 ${p.sittingOut ? 'opacity-50' : ''}`}>
              <span className="w-4 shrink-0 text-right text-xs text-faint">{i + 1}</span>
              <span className="h-7 w-1 shrink-0 rounded" style={{ background: i === 0 ? 'var(--color-accent)' : (playerTypeColor(p.playerType) ?? 'transparent') }} />
              {i === 0 ? (
                <span className={`${inputClass} min-w-0 flex-1 !py-2 font-semibold`}>★ You</span>
              ) : (
                <select className={`${inputClass} min-w-0 flex-1 !px-2 !py-2`} value={seatValue(p)} onChange={(e) => pick(i, e.target.value)} aria-label={`Player ${i + 1}`}>
                  {players.length > 0 && (
                    <optgroup label="Your players">
                      {players.map((pl) => (
                        <option key={pl.id} value={`player:${pl.id}`} disabled={takenPlayers.has(pl.id) && seatValue(p) !== `player:${pl.id}`}>
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
              )}
              <div className="w-20 shrink-0">
                <MoneyInput value={p.stack} currency={t.currency} commitOnBlur onChange={(stack) => setSeat(i, { stack })} />
              </div>
              {i === 0 ? (
                <span className={editing ? 'w-[6.75rem] shrink-0' : 'w-[4.375rem] shrink-0'} />
              ) : (
                <>
                  <button type="button" disabled={i <= 1} onClick={() => moveUp(i)} className={smallKey} title="One seat to the left (earlier)">
                    ↑
                  </button>
                  {editing && (
                    <button type="button" onClick={() => setSeat(i, { sittingOut: !p.sittingOut })} className={`${smallKey} text-[11px]`} title={p.sittingOut ? 'Back in' : 'Sitting out'}>
                      {p.sittingOut ? 'in' : 'out'}
                    </button>
                  )}
                  <button type="button" disabled={rows.length <= 2} onClick={() => remove(i)} className={smallKey} title="Left the table">
                    ✕
                  </button>
                </>
              )}
            </li>
          ))}
        </ul>
        {rows.length < MAX_PLAYERS && (
          <button type="button" onClick={addPlayer} className="mt-2 min-h-11 w-full rounded-lg border border-dashed border-line text-sm text-muted">
            + Player (sits on your right)
          </button>
        )}
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
          <Button variant="primary" disabled={seated < 2} onClick={done}>
            {editing ? 'Save' : 'Start'}
          </Button>
        </div>
      </div>
    </div>
  );
}
