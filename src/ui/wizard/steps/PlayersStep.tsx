import { useState, type Dispatch, type SetStateAction } from 'react';
import { parseCard } from '../../../core/cards';
import type { PlayerTag } from '../../../core/hand/types';
import { CardPicker } from '../../cards/CardPicker';
import { PlayingCard } from '../../cards/PlayingCard';
import { Button, Field, MoneyInput, TextInput, Toggle } from '../../controls';
import { formatAmount } from '../../format';
import { PLAYER_TYPES, STATUS_TAGS } from '../../playerTypes';
import { useSettings } from '../../settings';
import { PokerTable } from '../../table/PokerTable';
import { newPlayer, previewPositions, type DraftPlayer, type WizardDraft } from '../draft';
import { draftSeatViews } from '../seatViews';

interface Props {
  draft: WizardDraft;
  setDraft: Dispatch<SetStateAction<WizardDraft>>;
}

export function PlayersStep({ draft, setDraft }: Props) {
  const { settings } = useSettings();
  const [selected, setSelected] = useState<number>(draft.heroSeat ?? 0);
  const seat = Math.min(selected, draft.tableSize - 1);
  const positions = previewPositions(draft);

  const updateSeat = (fn: (p: DraftPlayer) => DraftPlayer) =>
    setDraft((d) => ({ ...d, seats: d.seats.map((p, i) => (i === seat && p ? fn(p) : p)) }));

  const filled = draft.seats.filter(Boolean).length;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="rounded-lg border border-line bg-surface/60 p-2">
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 pt-2">
          <p className="text-sm text-muted">
            Click a seat to edit it. {filled} of {draft.tableSize} seats taken.
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              disabled={filled === draft.tableSize}
              onClick={() => setDraft((d) => ({ ...d, seats: d.seats.map((p, i) => p ?? newPlayer(i, d.blinds.bb)) }))}
            >
              Fill empty seats
            </Button>
            <Button
              variant="ghost"
              disabled={!draft.seats[seat]}
              title="Give every player the stack of the selected player"
              onClick={() => {
                const stack = draft.seats[seat]?.stack;
                if (stack) setDraft((d) => ({ ...d, seats: d.seats.map((p) => (p ? { ...p, stack } : p)) }));
              }}
            >
              Same stack for all
            </Button>
          </div>
        </div>
        <PokerTable
          size={draft.tableSize}
          anchorSeat={draft.heroSeat ?? 0}
          buttonSeat={draft.button}
          seats={draftSeatViews(draft, { positions, selected: seat, amounts: settings.amounts, showAllCards: true })}
          onSeatClick={setSelected}
        />
      </div>

      <PlayerEditor draft={draft} setDraft={setDraft} seat={seat} position={positions.get(seat)} updateSeat={updateSeat} />
    </div>
  );
}

function PlayerEditor({
  draft,
  setDraft,
  seat,
  position,
  updateSeat,
}: Props & { seat: number; position?: string; updateSeat: (fn: (p: DraftPlayer) => DraftPlayer) => void }) {
  const [picking, setPicking] = useState(false);
  const p = draft.seats[seat] ?? null;
  const c = draft.currency;

  if (!p) {
    return (
      <aside className="rounded-lg border border-line bg-surface p-5">
        <h3 className="mb-1 text-sm font-bold tracking-wider uppercase">Seat {seat + 1}</h3>
        <p className="mb-4 text-sm text-muted">This seat is empty.</p>
        <Button
          variant="primary"
          onClick={() => setDraft((d) => ({ ...d, seats: d.seats.map((x, i) => (i === seat ? newPlayer(i, d.blinds.bb) : x)) }))}
        >
          Add a player here
        </Button>
      </aside>
    );
  }

  const isHero = draft.heroSeat === seat;
  const hasButton = draft.button === seat;
  const bb = draft.blinds.bb;
  /** Add or remove whole big blinds; never below 1 BB. */
  const addBB = (n: number) => updateSeat((x) => ({ ...x, stack: Math.max(bb, x.stack + n * bb) }));
  const toggleTag = (tag: PlayerTag) =>
    updateSeat((x) => ({ ...x, tags: x.tags.includes(tag) ? x.tags.filter((t) => t !== tag) : [...x.tags, tag] }));

  // Cards held by everyone else, so the picker can grey them out
  const taken = new Set(draft.seats.flatMap((x, i) => (i !== seat && x?.cards ? x.cards.map(parseCard) : [])));

  return (
    <aside className="space-y-5 rounded-lg border border-line bg-surface p-5">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold tracking-wider uppercase">
          Seat {seat + 1}
          {position && <span className="ml-2 rounded bg-surface-3 px-1.5 py-0.5 text-xs text-muted">{position}</span>}
        </h3>
        <Button
          variant="danger"
          onClick={() =>
            setDraft((d) => ({
              ...d,
              seats: d.seats.map((x, i) => (i === seat ? null : x)),
              heroSeat: d.heroSeat === seat ? null : d.heroSeat,
            }))
          }
        >
          Empty seat
        </Button>
      </div>

      <Field label="Name">
        <TextInput value={p.name} onChange={(name) => updateSeat((x) => ({ ...x, name }))} />
      </Field>

      <Field label="Stack" hint={`= ${formatAmount(p.stack, c, bb, 'bb')} · ↑/↓ in the field: ±1 BB, with Shift ±10 BB`}>
        <MoneyInput
          value={p.stack}
          currency={c}
          onChange={(stack) => updateSeat((x) => ({ ...x, stack }))}
          onStep={(dir, big) => addBB(dir * (big ? 10 : 1))}
        />
        <div className="mt-2 grid grid-cols-6 gap-1">
          {[-50, -10, -1, 1, 10, 50].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => addBB(n)}
              className="rounded border border-line bg-surface-2 py-1 text-xs text-muted tabular-nums hover:bg-surface-3 hover:text-ink"
            >
              {n > 0 ? `+${n}` : `−${-n}`}
            </button>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-5 gap-1">
          {[50, 100, 150, 200, 300].map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => updateSeat((x) => ({ ...x, stack: n * bb }))}
              className={`rounded border py-1 text-xs tabular-nums ${
                p.stack === n * bb ? 'border-accent bg-surface-3 text-ink' : 'border-line text-muted hover:bg-surface-3 hover:text-ink'
              }`}
            >
              {n} BB
            </button>
          ))}
        </div>
      </Field>

      <Field label="Player type">
        <div className="flex flex-wrap gap-1.5">
          {PLAYER_TYPES.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => updateSeat((x) => ({ ...x, playerType: x.playerType === t.id ? '' : t.id }))}
              className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs ${
                p.playerType === t.id ? 'border-accent bg-surface-3 text-ink' : 'border-line text-muted hover:text-ink'
              }`}
            >
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: t.color }} />
              {t.id}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Status">
        <div className="flex flex-wrap gap-1.5">
          {STATUS_TAGS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => toggleTag(t.id)}
              className={`rounded-md border px-2.5 py-1 text-xs ${
                p.tags.includes(t.id) ? 'border-accent bg-surface-3 text-ink' : 'border-line text-muted hover:text-ink'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Hole cards" hint="Optional. Leave unknown if you didn't see them.">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setPicking(true)} className="flex gap-1.5">
            {p.cards ? (
              p.cards.map((cs) => <PlayingCard key={cs} card={parseCard(cs)} width="42px" />)
            ) : (
              <>
                <PlayingCard card={null} width="42px" />
                <PlayingCard card={null} width="42px" />
              </>
            )}
          </button>
          <Button variant="secondary" onClick={() => setPicking(true)}>
            {p.cards ? 'Change' : 'Set cards'}
          </Button>
        </div>
      </Field>

      <div className="space-y-3 border-t border-line pt-4">
        <Toggle
          checked={isHero}
          onChange={(on) => setDraft((d) => ({ ...d, heroSeat: on ? seat : null }))}
          label="This is me (Hero)"
          hint="Hero is drawn at the bottom of the table."
        />
        <Toggle checked={p.sittingOut} onChange={(sittingOut) => updateSeat((x) => ({ ...x, sittingOut }))} label="Sitting out" hint="Seated but not dealt in." />
        <Button variant={hasButton ? 'secondary' : 'primary'} disabled={hasButton} onClick={() => setDraft((d) => ({ ...d, button: seat }))}>
          {hasButton ? 'Has the dealer button' : 'Give the dealer button to this seat'}
        </Button>
      </div>

      {picking && (
        <CardPicker
          title={`Hole cards for ${p.name}`}
          initial={p.cards}
          taken={taken}
          onClose={() => setPicking(false)}
          onDone={(cards) => {
            updateSeat((x) => ({ ...x, cards }));
            setPicking(false);
          }}
        />
      )}
    </aside>
  );
}
