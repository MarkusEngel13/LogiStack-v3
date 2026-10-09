import { useMemo, useState } from 'react';
import { RANK_CHARS } from '../../core/cards';
import type { HandRecord, SeatNo } from '../../core/hand/types';
import { READ_TAGS, type ShowdownRead } from '../../core/players/reads';
import type { SeatStyle } from '../../core/players/style';
import { CELL_NAMES } from '../../core/ranges/hands';
import { Button, inputClass } from '../controls';
import { playerTypeColor } from '../playerTypes';
import { addReads, builtInId, loadPlayers, loadProfiles, savePlayer, seatStyleOfPlayer, type SavedPlayer } from '../players/store';
import { HandGrid } from './LiveHand';

export interface Relink {
  seat: SeatNo;
  name: string;
  style: SeatStyle;
}

/**
 * "Showdown I saw": a hand between other players, kept as a read on the player who showed.
 * Tap who showed, his hand on the grid, what he did with it (a tag or two), save. A seat that
 * isn't one of your saved players becomes one (name it), so his reads add up from now on.
 */
export function SeenShowdown({ hand, onClose, onSaved }: { hand: HandRecord; onClose: () => void; onSaved: (relinks: Relink[], count: number) => void }) {
  const seats = hand.players.filter((p) => p.seat !== hand.hero && !p.sittingOut);
  const saved = useMemo(() => new Set(loadPlayers().map((p) => p.id)), []);
  const [picked, setPicked] = useState<SeatNo[]>([]);
  const [shown, setShown] = useState<Record<number, string>>({});
  const [tags, setTags] = useState<Record<number, string[]>>({});
  const [names, setNames] = useState<Record<number, string>>({});
  const [target, setTarget] = useState<SeatNo | null>(null);
  const [board, setBoard] = useState<number[]>([]);
  const [note, setNote] = useState('');

  const seatOf = (seat: SeatNo) => hand.players.find((p) => p.seat === seat)!;
  const isSaved = (seat: SeatNo) => {
    const id = seatOf(seat).style?.playerId;
    return !!id && saved.has(id);
  };
  const toggle = (seat: SeatNo) => {
    if (picked.includes(seat)) {
      setPicked(picked.filter((s) => s !== seat));
      if (target === seat) setTarget(null);
    } else {
      setPicked([...picked, seat]);
      setTarget(seat);
    }
  };
  const grid = target ?? picked.find((s) => !shown[s]) ?? null;
  const ready = picked.length > 0 && picked.every((s) => shown[s]);

  const save = () => {
    const profiles = loadProfiles();
    const relinks: Relink[] = [];
    const at = new Date().toISOString();
    for (const seat of picked) {
      const p = seatOf(seat);
      const read: ShowdownRead = {
        id: crypto.randomUUID(),
        at,
        hand: shown[seat]!,
        ...(board.length ? { board: board.map((r) => RANK_CHARS[r]).join('') } : {}),
        tags: tags[seat] ?? [],
        ...(note.trim() ? { note: note.trim() } : {}),
        session: hand.session ?? hand.id,
      };
      const id = p.style?.playerId;
      if (id && saved.has(id)) {
        addReads(id, [read]);
        continue;
      }
      // a new saved player from this seat: his profile (or type) and the name you gave him
      const name = (names[seat] ?? p.name).trim() || p.name;
      const pl: SavedPlayer = {
        id: crypto.randomUUID(),
        name,
        profileId: p.style?.profileId ?? builtInId(p.playerType || 'Unknown'),
        overrides: {},
        reads: [read],
      };
      savePlayer(pl);
      relinks.push({ seat, name, style: seatStyleOfPlayer(pl, profiles) });
    }
    onSaved(relinks, picked.length);
  };

  return (
    <div className="space-y-4 rounded-xl border border-accent/40 bg-surface p-4">
      <div className="flex items-center justify-between">
        <h2 className="font-bold">👀 Showdown I saw</h2>
        <Button variant="ghost" onClick={onClose} className="!px-2">
          ✕
        </Button>
      </div>

      <section className="space-y-2">
        <h3 className="text-sm font-semibold text-muted">Who showed?</h3>
        <div className="grid grid-cols-3 gap-1.5">
          {seats.map((p) => {
            const on = picked.includes(p.seat);
            return (
              <button
                key={p.seat}
                type="button"
                onClick={() => toggle(p.seat)}
                className={`min-h-11 truncate rounded-lg border px-2 py-1.5 text-left text-xs font-semibold ${on ? 'border-accent bg-accent/15 text-ink' : 'border-line bg-surface-2 text-muted'}`}
                style={{ borderLeft: `4px solid ${playerTypeColor(p.playerType) ?? 'var(--color-line)'}` }}
              >
                {p.name}
              </button>
            );
          })}
        </div>
      </section>

      {grid !== null && (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-muted">{seatOf(grid).name} showed:</h3>
          <HandGrid
            onPick={(cell) => {
              setShown({ ...shown, [grid]: CELL_NAMES[cell]! });
              setTarget(null);
            }}
          />
        </section>
      )}

      {picked
        .filter((s) => shown[s])
        .map((seat) => {
          const on = tags[seat] ?? [];
          const flip = (id: string) => setTags({ ...tags, [seat]: on.includes(id) ? on.filter((x) => x !== id) : [...on, id] });
          return (
            <section key={seat} className="space-y-2 border-t border-line pt-3">
              <div className="flex items-center gap-2">
                <span className="font-semibold">{seatOf(seat).name}</span>
                <button type="button" onClick={() => setTarget(seat)} className="rounded border border-line bg-surface-2 px-2 py-0.5 font-mono text-sm" title="Change">
                  {shown[seat]}
                </button>
                {!isSaved(seat) && <span className="text-[11px] text-faint">new player</span>}
              </div>
              {!isSaved(seat) && (
                <input
                  className={inputClass}
                  value={names[seat] ?? seatOf(seat).name}
                  onChange={(e) => setNames({ ...names, [seat]: e.target.value })}
                  placeholder="His name"
                  aria-label="His name"
                />
              )}
              <p className="text-xs text-faint">What did he do with it? (optional)</p>
              <div className="flex flex-wrap gap-1">
                {READ_TAGS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => flip(t.id)}
                    className={`min-h-9 rounded-md border px-2 py-1 text-xs ${on.includes(t.id) ? 'border-accent bg-accent text-accent-ink font-semibold' : 'border-line bg-surface-2 text-ink'}`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </section>
          );
        })}

      {ready && (
        <>
          <section className="space-y-2 border-t border-line pt-3">
            <div className="flex items-baseline justify-between">
              <h3 className="text-sm font-semibold text-muted">Board (optional)</h3>
              <span className="font-mono text-sm">
                {board.map((r) => RANK_CHARS[r]).join(' ') || '–'}
                {board.length > 0 && (
                  <button type="button" className="ml-2 text-xs text-muted underline" onClick={() => setBoard([])}>
                    clear
                  </button>
                )}
              </span>
            </div>
            <div className="grid grid-cols-13 gap-1">
              {Array.from({ length: 13 }, (_, i) => 12 - i).map((r) => (
                <button
                  key={r}
                  type="button"
                  disabled={board.length >= 5}
                  onClick={() => setBoard([...board, r])}
                  className="h-9 rounded border border-line bg-surface-2 text-sm font-bold disabled:opacity-30"
                >
                  {RANK_CHARS[r]}
                </button>
              ))}
            </div>
          </section>
          <textarea className={`${inputClass} min-h-16`} placeholder="Note (optional)" value={note} onChange={(e) => setNote(e.target.value)} />
        </>
      )}

      <Button variant="primary" className="w-full !py-3" disabled={!ready} onClick={save}>
        Save {picked.length > 1 ? `${picked.length} reads` : 'the read'}
      </Button>
    </div>
  );
}
