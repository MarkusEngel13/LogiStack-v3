import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { cardToString, parseCard, rankOf, suitOf, type Card } from '../../core/cards';
import { HandError, potTotal, replay } from '../../core/engine/replay';
import type { TableState } from '../../core/engine/state';
import type { CardStr, HandEvent, HandRecord, SeatNo } from '../../core/hand/types';
import {
  clockwise,
  flopCards,
  handOver,
  handSummary,
  makeRoom,
  nextSuit,
  softCards,
  streetCard,
  streetKinds,
  usedCards,
  withHoleCards,
} from '../../core/live/quick';
import { heroNet, heroOut } from '../../core/live/tap';
import { PlayingCard } from '../cards/PlayingCard';
import { Button } from '../controls';
import { formatAmount } from '../format';
import { playerTypeColor } from '../playerTypes';
import { ActionPanel } from './ActionPanel';
import { BoardInput } from './BoardInput';
import { HoleCards } from './HoleCards';
import { loadPrefs, savePrefs, type LivePrefs } from './liveStore';
import { Key, Step } from './parts';
import { ShowdownPanel } from './ShowdownPanel';

export { HandGrid } from './HandGrid';

const SUIT_SYMBOL = ['♠', '♥', '♦', '♣'];

function safeReplay(h: HandRecord): { state: TableState | null; error: string | null } {
  try {
    return { state: replay(h), error: null };
  } catch (e) {
    return { state: null, error: e instanceof HandError ? e.message : String(e) };
  }
}

function CardRow({ cards, onTap, width = '2.4rem' }: { cards: readonly Card[]; onTap?: (i: number) => void; width?: string }) {
  return (
    <div className="flex gap-1">
      {cards.map((c, i) =>
        onTap ? (
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

export interface LiveHandProps {
  hand: HandRecord;
  /** Your usual open in big blinds: where the amount box starts before anyone raised. */
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
 * Entering one hand at the live table, as it happens: a tap on the button seat, your cards, then
 * per street the player who acts and what he does (everyone before him passes), the board's cards,
 * and the cards seen at showdown - those at any moment, before you forget them.
 */
export function LiveHand({ hand, openBB, onChange, onNext, onEditTable, onOpenLab, onSeenShowdown, onPlayerInfo }: LiveHandProps) {
  const [history, setHistory] = useState<HandRecord[]>([]);
  const [prefs, setPrefs] = useState<LivePrefs>(loadPrefs);
  /** The showdown panel, opened from the header before the hand gets there. */
  const [seen, setSeen] = useState(false);
  /** The board entered as ranks (its suits a guess): the number of events when it went in. */
  const [ranksAt, setRanksAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** The button seats, opened again after your cards are in. */
  const [buttonOpen, setButtonOpen] = useState(false);

  const { state: st, error: replayError } = useMemo(() => safeReplay(hand), [hand]);
  // the next step (a street, the board, the showdown) starts at the top of the page
  const stage = st ? `${st.phase}-${st.street}` : '';
  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [stage]);
  const hero = hand.hero;
  const money = (v: number) => formatAmount(v, hand.table.currency, hand.table.blinds.bb);
  const nameOf = (seat: SeatNo) => {
    const p = hand.players.find((x) => x.seat === seat);
    const name = p?.name ?? `Seat ${seat + 1}`;
    return name.length > 12 ? `${name.slice(0, 11)}…` : name;
  };
  const changePrefs = (p: Partial<LivePrefs>) => {
    const next = { ...prefs, ...p };
    setPrefs(next);
    savePrefs(next);
  };

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
  const add = (events: HandEvent[], base: HandRecord = hand) => commit({ ...base, events: [...base.events, ...events] });
  const undo = () => {
    const prev = history.at(-1);
    if (!prev) return;
    setHistory((h) => h.slice(0, -1));
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

  // ---- cards -----------------------------------------------------------------------------
  /** A seat's hole cards: kept in the setup, or as his show once the hand is at showdown. */
  const setCards = (seat: SeatNo, cards: [Card, Card], guessed: boolean) => {
    const room = makeRoom(hand, cards, seat);
    if (!room) {
      setError('Those cards are in play already.');
      return;
    }
    const strs: [CardStr, CardStr] = [cardToString(cards[0]), cardToString(cards[1])];
    const showAt = room.events.findIndex((e) => e.type === 'show' && e.seat === seat && !!e.cards);
    if (showAt >= 0) {
      commit({ ...room, events: room.events.map((e, i) => (i === showAt ? { type: 'show' as const, seat, cards: strs } : e)) });
      return;
    }
    if (st.phase === 'showdown' && !st.seats.find((s) => s.seat === seat)?.cards) {
      add([{ type: 'show', seat, cards: strs }], room);
      return;
    }
    commit(withHoleCards(room, seat, strs, guessed));
  };

  const dealExact = (cards: Card[]) => {
    const room = makeRoom(hand, cards);
    if (!room) {
      setError('Those cards are in play already.');
      return;
    }
    if (add([{ type: 'board', cards: cards.map(cardToString) }], room)) setRanksAt(null);
  };
  const dealRanks = (ranks: number[]) => {
    const one = st.needCards === 1 ? streetCard(ranks[0]!, 'blank', st.board, used, heroSuits) : null;
    const cards = st.needCards === 3 ? flopCards(ranks, 'rainbow', used, heroSuits) : one === null ? null : [one];
    if (!cards) {
      setError('Those cards are all in play already.');
      return;
    }
    if (add([{ type: 'board', cards: cards.map(cardToString) }])) setRanksAt(hand.events.length + 1);
  };
  /** Changes the board cards just dealt (texture, a suit), while nothing has happened after them. */
  const redeal = (cards: Card[]) => commit({ ...hand, events: [...hand.events.slice(0, -1), { type: 'board', cards: cards.map(cardToString) }] });
  const lastBoard = lastIsBoard ? (hand.events.at(-1) as { cards: string[] }).cards.map(parseCard) : [];
  const usedBeforeLast = new Set([...used].filter((c) => !lastBoard.includes(c)));

  // ---- the header -------------------------------------------------------------------------
  const summary = handSummary(st);
  const header = (
    <div className="sticky top-[53px] z-30 -mx-4 space-y-1.5 border-b border-line bg-bg/95 px-4 py-2 backdrop-blur sm:top-[61px]">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-sm">
          <span className="font-semibold">#{hand.handNo}</span>
          {heroState?.position && <span className="text-muted"> · {heroState.position}</span>}
          <span className="text-muted"> · pot {money(potTotal(st))}</span>
        </div>
        <div className="flex shrink-0 gap-0.5">
          <Button variant="ghost" onClick={onPlayerInfo} className="!px-2.5" title="What I see him do: plays 70 %, min-raises... into his profile">
            ✎
          </Button>
          <Button variant="ghost" onClick={onSeenShowdown} className="!px-2.5" title="Showdown I saw: what another player showed, kept as a read on him">
            👀
          </Button>
          <Button variant="ghost" onClick={undo} disabled={!history.length} className="!px-2.5" title="Undo">
            ↶
          </Button>
          {!started && (
            <Button variant="ghost" onClick={onEditTable} className="!px-2.5">
              Table
            </Button>
          )}
          {started && !over && (
            <Button variant="ghost" onClick={() => onNext(true)} className="!px-2.5" title="Keep the hand as it is and finish it later (Hands page or here)">
              Later
            </Button>
          )}
        </div>
      </div>
      {started && (
        <div className="flex items-center gap-3">
          {heroCards && <CardRow cards={heroCards} width="1.9rem" />}
          {st.board.length > 0 && <CardRow cards={st.board} width="1.9rem" />}
          {!over && st.phase !== 'showdown' && (
            <Button variant={seen ? 'primary' : 'secondary'} onClick={() => setSeen((x) => !x)} className="ml-auto shrink-0" title="Cards shown at the table: put them in now, the actions later">
              Showdown
            </Button>
          )}
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

  // ---- the button: one tap at the start of the hand ----------------------------------------
  const fromHero = st.seats
    .filter((s) => s.dealtIn)
    .map((s) => s.seat)
    .sort((a, b) => clockwise(st, hero ?? 0, a) - clockwise(st, hero ?? 0, b));
  const buttonStep = (
    <Step title="Button" aside={<span className="text-xs text-faint">tap the seat with the dealer chip</span>}>
      <div className="grid grid-cols-5 gap-1">
        {fromHero.map((seat) => {
          const s = st.seats.find((x) => x.seat === seat)!;
          const on = st.button === seat;
          return (
            <button
              key={seat}
              type="button"
              onClick={() => {
                if (!on) commit({ ...hand, button: seat });
                setButtonOpen(false);
              }}
              className={`relative min-h-11 min-w-0 rounded-lg border px-1 py-1 text-left text-[11px] leading-tight ${on ? 'border-accent bg-accent/15 text-ink' : 'border-line bg-surface-2 text-muted'}`}
              style={{ borderLeft: `3px solid ${seat === hero ? 'var(--color-accent)' : (playerTypeColor(s.playerType) ?? 'var(--color-line)')}` }}
            >
              <span className="block truncate font-semibold">{seat === hero ? 'You' : nameOf(seat)}</span>
              <span className="block text-[10px] text-faint">{s.position}</span>
              {on && (
                <span className="absolute -top-1.5 -right-1 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-white text-[10px] font-black text-black shadow">
                  D
                </span>
              )}
            </button>
          );
        })}
      </div>
    </Step>
  );

  /** After your cards: the button in one line, tap to change it until the first action. */
  const buttonLine = buttonOpen ? (
    buttonStep
  ) : (
    <button type="button" onClick={() => setButtonOpen(true)} className="flex w-full items-center gap-2 text-left text-xs text-muted">
      <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-line bg-white text-[10px] font-black text-black">D</span>
      <span className="min-w-0 truncate">
        {st.button === hero ? 'You' : nameOf(st.button)}
        {heroState?.position && ` · you're ${heroState.position}`}
      </span>
      <span className="ml-auto shrink-0 underline">change</span>
    </button>
  );

  // ---- what to tap now --------------------------------------------------------------------
  const foldNext = (
    <Key tone="danger" onClick={() => onNext(false)} className="w-full !text-base">
      I fold · next hand
    </Key>
  );
  const showdownPanel = (onClose?: () => void) => (
    <ShowdownPanel
      hand={hand}
      state={st}
      mode={prefs.hole}
      onMode={(hole) => changePrefs({ hole })}
      nameOf={nameOf}
      onCards={setCards}
      onMuck={(seat) => add([{ type: 'muck', seat }])}
      onClose={onClose}
    />
  );

  /** You folded while others play on: your result is known, the rest of the hand is optional. */
  const out = !over && heroOut(st, hero);
  const lost = heroNet(st, hero) ?? 0;
  const outBox = out && (
    <div className="space-y-2 rounded-lg border border-line bg-surface p-3">
      <p className="text-sm">
        You folded{lost < 0 ? ` (−${money(-lost)})` : ''}. The rest of the hand is optional.
      </p>
      <Button variant="primary" className="w-full !py-3 text-base" onClick={() => onNext(true)}>
        Next hand →
      </Button>
    </div>
  );

  let body: ReactNode;
  if (seen && !over && st.phase !== 'showdown') {
    body = showdownPanel(() => setSeen(false));
  } else if (hero !== undefined && !heroCards) {
    body = (
      <>
        {foldNext}
        {hand.events.length === 0 && buttonStep}
        <Step title="Your cards">
          <HoleCards
            mode={prefs.hole}
            onMode={(hole) => changePrefs({ hole })}
            taken={used}
            soft={softCards(hand, hero)}
            board={st.board}
            onPick={(cards, guessed) => setCards(hero, cards, guessed)}
          />
        </Step>
      </>
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
    body = showdownPanel();
  } else if (st.phase === 'dealing') {
    body = (
      <BoardInput
        key={hand.events.length}
        label={st.board.length === 0 ? 'Flop' : st.board.length === 3 ? 'Turn' : 'River'}
        need={st.needCards}
        mode={prefs.board}
        onMode={(board) => changePrefs({ board })}
        taken={used}
        soft={softCards(hand)}
        onCards={dealExact}
        onRanks={dealRanks}
      />
    );
  } else {
    // betting
    const pre = st.street === 'preflop';
    const noActionYet = !st.log.some((e) => e.kind === 'action' && e.street === st.street);
    const heroActed = st.log.some((e) => e.kind === 'action' && e.seat === hero);
    const boardBefore = st.board.slice(0, st.board.length - lastBoard.length);
    body = (
      <>
        {hand.events.length === 0 && buttonLine}

        {lastIsBoard && noActionYet && ranksAt === hand.events.length && (
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
                    <Key
                      key={tx}
                      onClick={() => {
                        const c = flopCards(lastBoard.map(rankOf), tx, usedBeforeLast, heroSuits);
                        if (c) redeal(c);
                      }}
                    >
                      {{ rainbow: 'Rainbow', twotone: 'Two-tone', mono: 'Monotone' }[tx]}
                    </Key>
                  ))}
                  {heroSuits.map((s) => (
                    <Key
                      key={s}
                      onClick={() => {
                        const c = flopCards(lastBoard.map(rankOf), 'twotone', usedBeforeLast, heroSuits, s);
                        if (c) redeal(c);
                      }}
                    >
                      {SUIT_SYMBOL[s]} draw for you
                    </Key>
                  ))}
                </>
              ) : (
                streetKinds(boardBefore).map(({ kind, label }) => (
                  <Key
                    key={kind}
                    onClick={() => {
                      const c = streetCard(rankOf(lastBoard[0]!), kind, boardBefore, usedBeforeLast, heroSuits);
                      if (c !== null) redeal([c]);
                    }}
                  >
                    {label}
                  </Key>
                ))
              )}
            </div>
          </Step>
        )}

        <Step title={pre ? 'Preflop · who acts?' : `${st.street[0]!.toUpperCase()}${st.street.slice(1)} · who acts?`}>
          <ActionPanel
            key={hand.events.length}
            state={st}
            hero={hero}
            nameOf={nameOf}
            money={money}
            currency={hand.table.currency}
            openBB={openBB}
            onEvents={(events) => add(events)}
          />
        </Step>

        {pre && !heroActed && !out && foldNext}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 pb-10">
      {header}
      <div className="mt-4 space-y-5">
        {error && <p className="rounded-md border border-danger/50 px-3 py-2 text-sm text-danger">{error}</p>}
        {!seen && outBox}
        {body}
      </div>
    </div>
  );
}
