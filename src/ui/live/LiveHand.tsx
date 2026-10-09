import { useMemo, useState, type ReactNode } from 'react';
import { RANK_CHARS, cardToString, parseCard, rankOf, suitOf, type Card } from '../../core/cards';
import { HandError, legalActions, potTotal, replay } from '../../core/engine/replay';
import type { TableState } from '../../core/engine/state';
import type { HandEvent, HandRecord, SeatNo } from '../../core/hand/types';
import {
  cellCards,
  clockwise,
  flopCards,
  fractionText,
  handOver,
  handSummary,
  nextSuit,
  postflopLines,
  preflopLines,
  showdownUnknown,
  sizedAction,
  streetCard,
  usedCards,
  type Line,
  type Names,
  type Texture,
} from '../../core/live/quick';
import { CELL_NAMES, cellKind } from '../../core/ranges/hands';
import { Button, MoneyInput } from '../controls';
import { PlayingCard } from '../cards/PlayingCard';
import { formatAmount } from '../format';
import { playerTypeColor } from '../playerTypes';

const SUIT_SYMBOL = ['♠', '♥', '♦', '♣'];
const SIZES = [0.33, 0.5, 0.66, 0.75, 1];

function safeReplay(h: HandRecord): { state: TableState | null; error: string | null } {
  try {
    return { state: replay(h), error: null };
  } catch (e) {
    return { state: null, error: e instanceof HandError ? e.message : String(e) };
  }
}

/** Tap targets: big, with room for a thumb. */
function Chip({ children, onClick, active, disabled, wide, tone }: { children: ReactNode; onClick: () => void; active?: boolean; disabled?: boolean; wide?: boolean; tone?: 'accent' | 'danger' }) {
  const base = active
    ? 'border-accent bg-accent text-accent-ink font-semibold'
    : tone === 'accent'
      ? 'border-accent/60 bg-surface-2 text-ink'
      : tone === 'danger'
        ? 'border-line bg-surface-2 text-danger'
        : 'border-line bg-surface-2 text-ink';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-11 rounded-lg border px-3 py-2 text-sm leading-tight transition-colors active:scale-[0.98] disabled:opacity-30 ${base} ${wide ? 'w-full text-left' : ''}`}
    >
      {children}
    </button>
  );
}

function Step({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2.5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** The 13x13 starting hands: one tap = a hand. Blocked cells (cards in play) are dimmed. */
export function HandGrid({ onPick, blocked }: { onPick: (cell: number) => void; blocked?: (cell: number) => boolean }) {
  return (
    <div className="grid grid-cols-13 gap-px overflow-hidden rounded-lg border border-line bg-line select-none">
      {CELL_NAMES.map((name, cell) => {
        const kind = cellKind(cell);
        const off = blocked?.(cell) ?? false;
        return (
          <button
            key={cell}
            type="button"
            disabled={off}
            onClick={() => onPick(cell)}
            className={`flex aspect-square items-center justify-center text-[9px] leading-none font-semibold sm:text-[11px] disabled:opacity-20 active:bg-accent active:text-accent-ink ${
              kind === 'pair' ? 'bg-surface-3 text-ink' : kind === 'suited' ? 'bg-surface-2 text-ink' : 'bg-surface text-muted'
            }`}
          >
            {name}
          </button>
        );
      })}
    </div>
  );
}

function CardRow({ cards, onTap, width = '2.4rem' }: { cards: readonly (Card | null)[]; onTap?: (i: number) => void; width?: string }) {
  return (
    <div className="flex gap-1">
      {cards.map((c, i) =>
        c === null ? (
          <div key={i} className="rounded border border-dashed border-line" style={{ width, aspectRatio: '5 / 7' }} />
        ) : onTap ? (
          <button key={i} type="button" onClick={() => onTap(i)} title="Tap: next suit">
            <PlayingCard card={c} width={width} mini />
          </button>
        ) : (
          <PlayingCard key={i} card={c} width={width} mini />
        ),
      )}
    </div>
  );
}

/** Ranks A..2 as big keys (a rank all four of which are in play is off). */
function RankPad({ onRank, used }: { onRank: (rank: number) => void; used: ReadonlySet<Card> }) {
  const free = (r: number) => [0, 1, 2, 3].some((s) => !used.has(s * 13 + r));
  return (
    <div className="grid grid-cols-7 gap-1.5">
      {Array.from({ length: 13 }, (_, i) => 12 - i).map((r) => (
        <button
          key={r}
          type="button"
          disabled={!free(r)}
          onClick={() => onRank(r)}
          className="h-12 rounded-lg border border-line bg-surface-2 text-lg font-bold active:bg-accent active:text-accent-ink disabled:opacity-20"
        >
          {RANK_CHARS[r]}
        </button>
      ))}
    </div>
  );
}

/** One action at a time, for anything the lines don't cover. */
function ActionPad({ state, onEvent, money, currency }: { state: TableState; onEvent: (e: HandEvent) => void; money: (v: number) => string; currency: HandRecord['table']['currency'] }) {
  const legal = legalActions(state);
  const [custom, setCustom] = useState(0);
  if (!legal) return null;
  const s = state.seats.find((x) => x.seat === legal.seat)!;
  const bb = state.rules.bb;
  const pot = potTotal(state);
  const pre = state.street === 'preflop';
  const unopened = pre && state.currentBet <= state.blindLevel;
  const sizes: { label: string; to: number }[] = legal.canBet
    ? SIZES.map((f) => ({ label: fractionText(f), to: pot * f }))
    : legal.canRaise
      ? unopened
        ? [2, 2.5, 3, 4, 5].map((x) => ({ label: `${x} BB`, to: x * bb }))
        : [2.5, 3, 4].map((x) => ({ label: `${x}×`, to: state.currentBet * x }))
      : [];
  const ev = (action: HandEvent & { type: 'action' }) => onEvent(action);
  return (
    <div className="space-y-2 rounded-lg border border-line bg-surface p-3">
      <div className="text-sm">
        <span className="font-semibold">{s.name}</span> <span className="text-muted">{s.position}</span>
        {legal.toCall > 0 && <span className="text-muted"> · {money(legal.toCall)} to call</span>}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {legal.toCall > 0 && (
          <Chip tone="danger" onClick={() => ev({ type: 'action', seat: s.seat, action: 'fold' })}>
            Fold
          </Chip>
        )}
        {legal.canCheck && <Chip onClick={() => ev({ type: 'action', seat: s.seat, action: 'check' })}>Check</Chip>}
        {legal.canCall && <Chip onClick={() => ev({ type: 'action', seat: s.seat, action: 'call' })}>Call {money(legal.toCall)}</Chip>}
        {sizes.map((z) => (
          <Chip
            key={z.label}
            onClick={() => {
              const e = sizedAction(state, z.to);
              if (e) onEvent(e);
            }}
          >
            {legal.canBet ? 'Bet' : 'Raise'} {z.label}
          </Chip>
        ))}
        {(legal.canBet || legal.canRaise || legal.canCall) && (
          <Chip tone="accent" onClick={() => ev({ type: 'action', seat: s.seat, action: 'allin' })}>
            All-in {money(legal.maxTo)}
          </Chip>
        )}
      </div>
      {(legal.canBet || legal.canRaise) && (
        <div className="flex items-center gap-2">
          <div className="w-28">
            <MoneyInput value={custom} currency={currency} onChange={setCustom} />
          </div>
          <Button
            variant="secondary"
            disabled={custom <= 0}
            onClick={() => {
              const e = sizedAction(state, custom);
              if (e) onEvent(e);
            }}
          >
            {legal.canBet ? 'Bet' : 'Raise to'}
          </Button>
        </div>
      )}
    </div>
  );
}

function LineList({ lines, onPick }: { lines: Line[]; onPick: (l: Line) => void }) {
  if (lines.length === 0) return <p className="text-xs text-faint">No one-tap line fits; use the actions below.</p>;
  return (
    <div className="grid gap-1.5">
      {lines.map((l) => (
        <Chip key={l.id} wide onClick={() => onPick(l)}>
          {l.label}
        </Chip>
      ))}
    </div>
  );
}

export interface LiveHandProps {
  hand: HandRecord;
  openBB: number;
  onChange: (h: HandRecord) => void;
  /** Go to the next hand: `keep` = this one is saved (finished or to finish later). */
  onNext: (keep: boolean) => void;
  onEditTable: () => void;
  onOpenLab: (h: HandRecord) => void;
  /** "Showdown I saw": a hand between other players, as a read. */
  onSeenShowdown: () => void;
  /** ✎: what you see a player do, into his profile. */
  onPlayerInfo: () => void;
}

/**
 * Entering one hand at the live table, in as few taps as possible: your cards (one tap on the
 * grid), who saw the flop and a preflop line, then per street the board's ranks and one line,
 * and the cards shown at showdown. Anything unusual goes in action by action.
 */
export function LiveHand({ hand, openBB, onChange, onNext, onEditTable, onOpenLab, onSeenShowdown, onPlayerInfo }: LiveHandProps) {
  const [history, setHistory] = useState<HandRecord[]>([]);
  const [inPot, setInPot] = useState<SeatNo[]>(hand.hero !== undefined ? [hand.hero] : []);
  const [frac, setFrac] = useState(0.5);
  const [draft, setDraft] = useState<number[]>([]);
  const [padOpen, setPadOpen] = useState(false);
  const [showFor, setShowFor] = useState<SeatNo | null>(null);
  const [error, setError] = useState<string | null>(null);

  const { state: st, error: replayError } = useMemo(() => safeReplay(hand), [hand]);
  const hero = hand.hero;
  const money = (v: number) => formatAmount(v, hand.table.currency, hand.table.blinds.bb);
  const nameOf = (seat: SeatNo) => {
    const p = hand.players.find((x) => x.seat === seat);
    const name = p?.name ?? `Seat ${seat + 1}`;
    return name.length > 12 ? `${name.slice(0, 11)}…` : name;
  };
  const names: Names = { hero, name: nameOf };

  const commit = (next: HandRecord) => {
    const check = safeReplay(next);
    if (!check.state) {
      setError(check.error);
      return false;
    }
    setError(null);
    setHistory((h) => [...h, hand]);
    onChange(next);
    return true;
  };
  const add = (events: HandEvent[]) => {
    if (commit({ ...hand, events: [...hand.events, ...events] })) {
      setPadOpen(false);
      setDraft([]);
    }
  };
  const undo = () => {
    const prev = history.at(-1);
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
    setDraft([]);
    setError(null);
    onChange(prev);
  };

  if (!st) {
    return (
      <div className="space-y-3 p-4">
        <p className="text-sm text-danger">This hand doesn't replay: {replayError}</p>
        <Button onClick={undo} disabled={!history.length}>
          Undo
        </Button>
      </div>
    );
  }

  const heroState = hero !== undefined ? st.seats.find((s) => s.seat === hero) : undefined;
  const heroCards = heroState?.cards ?? null;
  const heroSuits = heroCards ? [...new Set(heroCards.map(suitOf))] : [];
  const used = usedCards(st);
  const over = handOver(st);
  const started = hand.events.length > 0 || !!heroCards;
  const lastIsBoard = hand.events.at(-1)?.type === 'board';

  // ---- setting the board -------------------------------------------------------------------
  const dealBoard = (ranks: number[], texture: Texture = 'rainbow', drawSuit?: number) => {
    const cards = st.needCards === 3 ? flopCards(ranks, texture, used, heroSuits, drawSuit) : (() => {
      const c = streetCard(ranks[0]!, 'blank', st.board, used, heroSuits);
      return c === null ? null : [c];
    })();
    if (!cards) {
      setError('Those cards are all in play already.');
      setDraft([]);
      return;
    }
    add([{ type: 'board', cards: cards.map(cardToString) }]);
  };
  const tapRank = (r: number) => {
    const next = [...draft, r];
    if (next.length >= st.needCards) dealBoard(next);
    else setDraft(next);
  };
  /** Changes the board cards just dealt (texture, a suit), while nothing has happened after them. */
  const redeal = (cards: Card[]) => {
    const evs = hand.events.slice(0, -1);
    const next = { ...hand, events: [...evs, { type: 'board' as const, cards: cards.map(cardToString) }] };
    commit(next);
  };
  const lastBoard = lastIsBoard ? (hand.events.at(-1) as { cards: string[] }).cards.map(parseCard) : [];
  const usedBeforeLast = new Set([...used].filter((c) => !lastBoard.includes(c)));

  // ---- the header -------------------------------------------------------------------------
  const summary = handSummary(st);
  const header = (
    <div className="sticky top-[53px] sm:top-[61px] z-30 -mx-4 space-y-2 border-b border-line bg-bg/95 px-4 py-2.5 backdrop-blur">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 text-sm">
          <span className="font-semibold">#{hand.handNo}</span>
          {heroState && <span className="text-muted"> · {heroState.position}</span>}
          <span className="whitespace-nowrap text-muted"> · {money(potTotal(st))}</span>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button variant="ghost" onClick={onPlayerInfo} className="!px-2.5" title="What I see him do: plays 70 %, min-raises... into his profile">
            ✎
          </Button>
          <Button variant="ghost" onClick={onSeenShowdown} className="!px-2.5" title="Showdown I saw: what another player showed, kept as a read on him">
            👀
          </Button>
          <Button variant="ghost" onClick={undo} disabled={!history.length} className="!px-2.5">
            ↶ Undo
          </Button>
          {!started && (
            <Button variant="ghost" onClick={onEditTable} className="!px-2.5">
              Table
            </Button>
          )}
          {started && !over && (
            <Button variant="ghost" onClick={() => onNext(true)} className="!px-2.5" title="Keep the hand as it is and finish it later (Hands page or here)">
              Later ⏭
            </Button>
          )}
        </div>
      </div>
      {(heroCards || st.board.length > 0) && (
        <div className="flex items-center gap-3">
          {heroCards && <CardRow cards={heroCards} width="1.9rem" />}
          {st.board.length > 0 && <CardRow cards={st.board} width="1.9rem" />}
        </div>
      )}
      {summary.length > 0 && (
        <div className="space-y-0.5 text-xs text-muted">
          {summary.map((line, i) => (
            <div key={i} className="truncate">
              {line}
            </div>
          ))}
        </div>
      )}
    </div>
  );

  // ---- what to tap now --------------------------------------------------------------------
  let body: ReactNode;
  const foldNext = (
    <Chip tone="danger" wide onClick={() => onNext(false)}>
      I fold · next hand
    </Chip>
  );

  if (hero !== undefined && !heroCards) {
    body = (
      <Step title="Your cards" aside={<span className="text-xs text-faint">suits come later, if they matter</span>}>
        <HandGrid
          blocked={(cell) => !cellCards(cell, used)}
          onPick={(cell) => {
            const cards = cellCards(cell, used);
            if (!cards) return;
            commit({ ...hand, players: hand.players.map((p) => (p.seat === hero ? { ...p, cards: [cardToString(cards[0]), cardToString(cards[1])] } : p)) });
          }}
        />
        {foldNext}
      </Step>
    );
  } else if (over) {
    const net = hero !== undefined ? (st.result?.net[hero] ?? 0) : 0;
    const winners = [...new Set(st.result?.pots.flatMap((p) => p.winners ?? []) ?? [])];
    body = (
      <Step title="Hand over">
        <div className="rounded-lg border border-line bg-surface p-4 text-center">
          <div className={`text-3xl font-black tabular-nums ${net > 0 ? 'text-ok' : net < 0 ? 'text-danger' : 'text-muted'}`}>
            {net > 0 ? '+' : net < 0 ? '−' : ''}
            {money(Math.abs(net))}
          </div>
          <div className="mt-1 text-sm text-muted">
            {winners.map((w) => (w === hero ? 'You' : nameOf(w))).join(' & ')} {winners.length === 1 && winners[0] !== hero ? 'wins' : 'win'}
            {st.result?.pots[0]?.winningHand ? ` · ${st.result.pots[0].winningHand}` : ''}
          </div>
        </div>
        <textarea
          className="w-full rounded-md border border-line bg-surface-2 px-3 py-2 text-sm"
          rows={2}
          placeholder="Note (optional): a read, a tell, why…"
          value={hand.notes ?? ''}
          onChange={(e) => onChange({ ...hand, notes: e.target.value })}
        />
        <Button variant="primary" className="w-full !py-3 text-base" onClick={() => onNext(true)}>
          Next hand →
        </Button>
        <Button variant="ghost" className="w-full" onClick={() => onOpenLab(hand)}>
          Open in the Lab
        </Button>
      </Step>
    );
  } else if (st.phase === 'showdown') {
    const unknown = showdownUnknown(st);
    const target = showFor ?? unknown[0]?.seat ?? null;
    body = (
      <Step title="Showdown">
        {unknown.map((s) => (
          <div key={s.seat} className="flex flex-wrap items-center gap-1.5">
            <span className="w-28 truncate text-sm font-semibold">{nameOf(s.seat)}</span>
            <Chip active={target === s.seat} onClick={() => setShowFor(s.seat)}>
              Shows…
            </Chip>
            <Chip onClick={() => add([{ type: 'muck', seat: s.seat }])}>Mucks</Chip>
          </div>
        ))}
        {hero !== undefined && heroState && !heroState.folded && !heroState.mucked && (
          <Chip tone="danger" onClick={() => add([{ type: 'muck', seat: hero }])}>
            I muck (beaten)
          </Chip>
        )}
        {target !== null && (
          <>
            <p className="text-xs text-faint">{nameOf(target)} shows:</p>
            <HandGrid
              blocked={(cell) => !cellCards(cell, used)}
              onPick={(cell) => {
                const cards = cellCards(cell, used);
                if (!cards) return;
                setShowFor(null);
                add([{ type: 'show', seat: target, cards: [cardToString(cards[0]), cardToString(cards[1])] }]);
              }}
            />
          </>
        )}
      </Step>
    );
  } else if (st.phase === 'dealing') {
    const label = st.board.length === 0 ? 'Flop' : st.board.length === 3 ? 'Turn' : 'River';
    const pending: (Card | null)[] = Array.from({ length: st.needCards }, () => null);
    body = (
      <Step title={label} aside={<span className="text-xs text-faint">ranks only · suits next</span>}>
        <div className="flex items-center gap-2">
          {draft.map((r, i) => (
            <span key={i} className="flex h-12 w-9 items-center justify-center rounded border border-line bg-surface-2 text-lg font-bold">
              {RANK_CHARS[r]}
            </span>
          ))}
          <CardRow cards={pending.slice(draft.length)} width="2.2rem" />
          {draft.length > 0 && (
            <Button variant="ghost" onClick={() => setDraft([])}>
              Clear
            </Button>
          )}
        </div>
        <RankPad onRank={tapRank} used={used} />
      </Step>
    );
  } else {
    // betting
    const pre = st.street === 'preflop';
    const preOrder = st.seats
      .filter((s) => s.dealtIn && s.seat !== hero)
      .sort((a, b) => (clockwise(st, st.blindSeats.bb, a.seat) || st.rules.tableSeats) - (clockwise(st, st.blindSeats.bb, b.seat) || st.rules.tableSeats));
    const lines = pre ? preflopLines(st, inPot, openBB, names) : postflopLines(st, frac, names);
    const noActionYet = !st.log.some((e) => e.kind === 'action' && e.street === st.street);
    body = (
      <>
        {lastIsBoard && noActionYet && (
          <Step title="Suits" aside={<span className="text-xs text-faint">tap a card to change its suit</span>}>
            <CardRow
              cards={lastBoard}
              width="2.6rem"
              onTap={(i) => {
                const others = new Set([...usedBeforeLast, ...lastBoard.filter((_, j) => j !== i)]);
                const cards = [...lastBoard];
                cards[i] = nextSuit(cards[i]!, others);
                redeal(cards);
              }}
            />
            <div className="flex flex-wrap gap-1.5">
              {lastBoard.length === 3 ? (
                <>
                  {(['rainbow', 'twotone', 'mono'] as const).map((tx) => (
                    <Chip
                      key={tx}
                      onClick={() => {
                        const c = flopCards(lastBoard.map(rankOf), tx, usedBeforeLast, heroSuits);
                        if (c) redeal(c);
                      }}
                    >
                      {{ rainbow: 'Rainbow', twotone: 'Two-tone', mono: 'Monotone' }[tx]}
                    </Chip>
                  ))}
                  {heroSuits.map((s) => (
                    <Chip
                      key={s}
                      onClick={() => {
                        const c = flopCards(lastBoard.map(rankOf), 'twotone', usedBeforeLast, heroSuits, s);
                        if (c) redeal(c);
                      }}
                    >
                      {SUIT_SYMBOL[s]} draw for you
                    </Chip>
                  ))}
                </>
              ) : (
                (['blank', 'flush'] as const).map((k) => (
                  <Chip
                    key={k}
                    onClick={() => {
                      const boardBefore = st.board.slice(0, -1);
                      const c = streetCard(rankOf(lastBoard[0]!), k, boardBefore, usedBeforeLast, heroSuits);
                      if (c !== null) redeal([c]);
                    }}
                  >
                    {k === 'blank' ? 'No flush card' : 'Flush card'}
                  </Chip>
                ))
              )}
            </div>
          </Step>
        )}

        {pre && noActionYet && (
          <Step title="Who saw the flop with you?" aside={<span className="text-xs text-faint">none = it ended preflop</span>}>
            <div className="grid grid-cols-3 gap-1.5">
              {preOrder.map((s) => {
                const on = inPot.includes(s.seat);
                return (
                  <button
                    key={s.seat}
                    type="button"
                    onClick={() => setInPot(on ? inPot.filter((x) => x !== s.seat) : [...inPot, s.seat])}
                    className={`min-h-11 rounded-lg border px-2 py-1.5 text-left text-xs leading-tight ${on ? 'border-accent bg-accent/15 text-ink' : 'border-line bg-surface-2 text-muted'}`}
                    style={{ borderLeft: `4px solid ${playerTypeColor(s.playerType) ?? 'var(--color-line)'}` }}
                  >
                    <span className="block text-[10px] text-faint">{s.position}</span>
                    <span className="block truncate font-semibold">{nameOf(s.seat)}</span>
                  </button>
                );
              })}
            </div>
          </Step>
        )}

        {!pre && noActionYet && (
          <Step title="Bet size">
            <div className="flex flex-wrap gap-1.5">
              {SIZES.map((f) => (
                <Chip key={f} active={frac === f} onClick={() => setFrac(f)}>
                  {fractionText(f)}
                </Chip>
              ))}
            </div>
          </Step>
        )}

        {(noActionYet || !pre) && (
          <Step title={pre ? 'Preflop' : st.street[0]!.toUpperCase() + st.street.slice(1)}>
            <LineList lines={lines} onPick={(l) => add(l.events)} />
          </Step>
        )}

        <div className="space-y-2">
          <button type="button" className="text-sm text-muted underline" onClick={() => setPadOpen((o) => !o)}>
            {padOpen ? 'Hide' : 'Action by action'}
          </button>
          {(padOpen || (!noActionYet && pre) || lines.length === 0) && <ActionPad state={st} onEvent={(e) => add([e])} money={money} currency={hand.table.currency} />}
        </div>
        {pre && noActionYet && foldNext}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-10">
      {header}
      <div className="mt-4 space-y-5">
        {error && <p className="rounded-md border border-danger/50 px-3 py-2 text-sm text-danger">{error}</p>}
        {body}
      </div>
    </div>
  );
}
