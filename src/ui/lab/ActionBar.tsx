import { useState, type ReactNode } from 'react';
import { cardToString } from '../../core/cards';
import { cardsFromRange } from '../../core/motives/bot';
import { legalActions, potTotal, straddleOptions, unknownCards, type StraddleOption } from '../../core/engine/replay';
import type { TableState } from '../../core/engine/state';
import type { ActionKind, HandEvent, HandRecord } from '../../core/hand/types';
import type { Weights } from '../../core/ranges/range';
import { CardPicker } from '../cards/CardPicker';
import { PlayingCard } from '../cards/PlayingCard';
import { Button, MoneyInput } from '../controls';
import { BLIND_ICON } from '../playerTypes';
import { TONE_COLORS, type ActionTone } from '../table/PokerTable';
import { winnings, type Money } from '../replay/views';
import { sizePresets } from './sizing';

interface Props {
  hand: HandRecord;
  state: TableState;
  money: Money;
  /** Events after the cursor that a new entry would replace. */
  laterEvents: number;
  error: string | null;
  /** Each player's range at this step (the range story), for dealing a showdown hand from it. */
  ranges?: Map<number, Weights> | null;
  /** Let a bot act for the player to act: the chart before the flop, the motive model after it (dealing cards if unknown). */
  onBot?: () => void;
  botBusy?: boolean;
  /** What the last bot move was and why (its chances). */
  botNote?: string | null;
  onEvent: (ev: HandEvent) => void;
  onNewHand: () => void;
}

/** The Lab's input panel: whatever the hand needs next at the current step. */
export function ActionBar(props: Props) {
  const { state, laterEvents, error } = props;
  const key = `${state.eventsApplied}-${props.hand.events.length}-${state.toAct}`;
  return (
    <div className="space-y-3 rounded-lg border border-line bg-surface px-4 py-3">
      {laterEvents > 0 && (
        <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-sm text-warn">
          You are back in the hand. Entering something here replaces the {laterEvents} {laterEvents === 1 ? 'entry' : 'entries'} after this
          point (Undo brings {laterEvents === 1 ? 'it' : 'them'} back).
        </div>
      )}
      {state.phase === 'betting' && <BettingControls key={key} {...props} />}
      {state.phase === 'dealing' && <DealControls key={key} {...props} />}
      {state.phase === 'showdown' && <ShowdownControls key={key} {...props} />}
      {state.phase === 'complete' && <CompleteControls key={key} {...props} />}
      {props.botNote && <div className="text-sm text-muted">🤖 {props.botNote}</div>}
      {error && <div className="text-sm text-danger">{error}</div>}
    </div>
  );
}

function ToneButton({ tone, onClick, disabled, children }: { tone: ActionTone; onClick: () => void; disabled?: boolean; children: ReactNode }) {
  const c = TONE_COLORS[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-md px-4 py-2.5 text-sm font-semibold transition-[filter] hover:brightness-115 disabled:cursor-not-allowed disabled:opacity-40"
      style={{ background: c.bg, color: c.fg, border: tone === 'fold' ? '1px solid var(--border)' : undefined }}
    >
      {children}
    </button>
  );
}

function Who({ state, seat, children }: { state: TableState; seat: number; children?: ReactNode }) {
  const s = state.seats.find((x) => x.seat === seat)!;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
      <span className="font-semibold">
        {s.name} <span className="text-muted">({s.position})</span>
      </span>
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function BettingControls({ hand, state, money, onEvent, onBot, botBusy }: Props) {
  const legal = legalActions(state)!;
  const seat = state.seats.find((s) => s.seat === legal.seat)!;
  const presets = sizePresets(state, legal, hand.table.blinds.sb);
  const canAggro = legal.canBet || legal.canRaise;
  const [amount, setAmount] = useState(presets[0]?.to ?? legal.minTo);
  const [blind, setBlind] = useState(false);

  const rule = hand.houseRules?.straddle;
  const offers = straddleOptions(state).filter((o) => rule && (o.kind === 'utg' ? rule.utg : o.kind === 'button' ? rule.button : rule.restraddle));

  const act = (action: ActionKind, to?: number) =>
    onEvent({
      type: 'action',
      seat: legal.seat,
      action,
      ...(to !== undefined ? { to } : {}),
      ...(blind && (action === 'bet' || action === 'raise' || action === 'allin') ? { blind: true } : {}),
    });

  const amountOk = amount === legal.maxTo || (amount >= legal.minTo && amount <= legal.maxTo);
  const verb = legal.canBet ? 'Bet' : 'Raise to';

  return (
    <div className="space-y-3">
      {offers.map((o) => (
        <StraddleOffer key={o.seat} offer={o} hand={hand} state={state} money={money} onEvent={onEvent} />
      ))}

      <Who state={state} seat={legal.seat}>
        <span className="text-sm text-muted">to act</span>
        <span className="text-sm text-muted">
          stack {money(seat.stack)} · pot {money(potTotal(state))}
          {legal.toCall > 0 && ` · to call ${money(legal.toCall)}`}
        </span>
      </Who>

      <div className="flex flex-wrap items-center gap-2">
        {legal.toCall > 0 && (
          <ToneButton tone="fold" onClick={() => act('fold')}>
            Fold
          </ToneButton>
        )}
        {legal.canCheck ? (
          <ToneButton tone="check" onClick={() => act('check')}>
            Check
          </ToneButton>
        ) : (
          <ToneButton tone="call" onClick={() => act('call')}>
            Call {money(legal.toCall)}
            {legal.toCall >= seat.stack ? ' (all-in)' : ''}
          </ToneButton>
        )}
        {canAggro && (
          <>
            <span className="mx-1 h-8 w-px bg-line" />
            <div className="w-32">
              <MoneyInput value={amount} currency={hand.table.currency} onChange={setAmount} />
            </div>
            <ToneButton
              tone="bet"
              disabled={!amountOk}
              onClick={() => (amount >= legal.maxTo ? act('allin') : act(legal.canBet ? 'bet' : 'raise', amount))}
            >
              {amount >= legal.maxTo ? `All-in ${money(legal.maxTo)}` : `${verb} ${money(amount)}`}
            </ToneButton>
            <ToneButton tone="allin" onClick={() => act('allin')}>
              All-in {money(legal.maxTo)}
            </ToneButton>
            <label className="ml-1 flex cursor-pointer items-center gap-1.5 text-sm text-muted select-none" title="Raised without looking at the cards">
              <input type="checkbox" checked={blind} onChange={(e) => setBlind(e.target.checked)} className="h-4 w-4 accent-[var(--accent)]" />
              Blind {BLIND_ICON}
            </label>
          </>
        )}
        {onBot && (
          <Button
            variant="secondary"
            disabled={botBusy}
            onClick={onBot}
            title={`${state.board.length >= 3 ? 'The fear-and-greed model' : 'The chart for the spot, bent by player type,'} plays ${seat.name}'s cards${seat.cards ? '' : ' (dealt first)'}`}
          >
            {botBusy ? 'Bot thinking…' : '🤖 Bot plays'}
          </Button>
        )}
      </div>

      {canAggro && (
        <div className="flex flex-wrap items-center gap-1.5">
          {presets.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setAmount(p.to)}
              className={`rounded border px-2.5 py-1 text-xs tabular-nums ${
                amount === p.to ? 'border-accent bg-surface-3 text-ink' : 'border-line text-muted hover:bg-surface-3 hover:text-ink'
              }`}
            >
              {p.label} <span className="text-faint">{money(p.to)}</span>
            </button>
          ))}
          <span className="ml-2 text-xs text-faint">
            min {money(legal.minTo)} · all-in {money(legal.maxTo)}
          </span>
        </div>
      )}
    </div>
  );
}

function StraddleOffer({ offer, hand, state, money, onEvent }: { offer: StraddleOption; hand: HandRecord; state: TableState; money: Money; onEvent: (ev: HandEvent) => void }) {
  const ruleAmount = hand.houseRules?.straddle?.amount ?? 0;
  const first = state.straddlers.length === 0;
  const [amount, setAmount] = useState(first && ruleAmount > state.blindLevel ? ruleAmount : offer.suggested);
  const s = state.seats.find((x) => x.seat === offer.seat)!;
  const label = offer.kind === 'restraddle' ? 'Re-straddle?' : offer.kind === 'button' ? 'Button straddle?' : 'Straddle?';
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-line px-3 py-2">
      <span className="text-sm">
        <span className="font-semibold">{label}</span>{' '}
        <span className="text-muted">
          {s.name} ({s.position})
        </span>
      </span>
      <div className="w-28">
        <MoneyInput value={amount} currency={hand.table.currency} onChange={setAmount} />
      </div>
      <ToneButton tone="post" disabled={amount <= state.blindLevel || amount > s.stack} onClick={() => onEvent({ type: 'straddle', seat: offer.seat, amount })}>
        Straddle {money(amount)}
      </ToneButton>
      <span className="text-xs text-faint">or just act below to skip</span>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------

function DealControls({ state, onEvent }: Props) {
  const [picking, setPicking] = useState(false);
  const n = state.needCards;
  const street = state.board.length === 0 ? 'flop' : state.board.length === 3 ? 'turn' : 'river';
  const runOut = state.seats.filter((s) => s.dealtIn && !s.folded && !s.allIn).length < 2;
  const unknown = unknownCards(state);
  const taken = new Set(Array.from({ length: 52 }, (_, c) => c).filter((c) => !unknown.includes(c)));

  const random = () => {
    const pool = [...unknown];
    const cards: string[] = [];
    for (let i = 0; i < n; i++) cards.push(cardToString(pool.splice(Math.floor(Math.random() * pool.length), 1)[0]!));
    onEvent({ type: 'board', cards });
  };

  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="font-semibold">
        Deal the {street}
        {runOut && <span className="ml-2 text-sm font-normal text-muted">(no more betting: the board runs out)</span>}
      </span>
      <Button variant="primary" onClick={() => setPicking(true)}>
        Choose {n === 3 ? '3 cards' : 'the card'}
      </Button>
      <Button variant="secondary" onClick={random}>
        Random
      </Button>
      {picking && (
        <CardPicker
          count={n}
          allowUnknown={false}
          title={`The ${street}`}
          initial={null}
          taken={taken}
          onClose={() => setPicking(false)}
          onDone={(cards) => {
            setPicking(false);
            if (cards) onEvent({ type: 'board', cards });
          }}
        />
      )}
    </div>
  );
}

function ShowCardsPicker({ state, seat, onEvent, onClose }: { state: TableState; seat: number; onEvent: (ev: HandEvent) => void; onClose: () => void }) {
  const unknown = unknownCards(state);
  const taken = new Set(Array.from({ length: 52 }, (_, c) => c).filter((c) => !unknown.includes(c)));
  const name = state.seats.find((s) => s.seat === seat)?.name ?? `Seat ${seat + 1}`;
  return (
    <CardPicker
      allowUnknown={false}
      title={`${name} shows`}
      initial={null}
      taken={taken}
      onClose={onClose}
      onDone={(cards) => {
        onClose();
        if (cards) onEvent({ type: 'show', seat, cards: [cards[0]!, cards[1]!] });
      }}
    />
  );
}

function ShowdownControls({ state, money, ranges, onEvent, onNewHand }: Props) {
  const [picking, setPicking] = useState<number | null>(null);
  const live = state.seats.filter((s) => s.dealtIn && !s.folded);
  const resolved = state.result?.resolved ?? false;
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">
          Showdown{' '}
          <span className="text-sm font-normal text-muted">
            {resolved ? `· pot ${money(potTotal(state))} settled` : '· enter the unknown hands, or muck them, to settle the pot'}
          </span>
        </span>
        <Button variant="primary" onClick={onNewHand}>
          New hand, same table
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {live.map((s) => (
          <div key={s.seat} className="flex items-center gap-2 rounded-md border border-line bg-surface-2 px-3 py-2">
            <span className="text-sm">{s.name}</span>
            {s.mucked ? (
              <span className="text-xs text-faint">mucked</span>
            ) : s.cards ? (
              <span className="flex gap-0.5">
                {s.cards.map((c) => (
                  <PlayingCard key={c} card={c} width="22px" mini />
                ))}
              </span>
            ) : (
              <>
                <span className="text-xs text-faint">cards unknown</span>
                <Button variant="secondary" onClick={() => setPicking(s.seat)}>
                  Show…
                </Button>
                {ranges?.get(s.seat) && (
                  <Button
                    variant="secondary"
                    title="Deal a hand from what is left of their range after the hand's actions"
                    onClick={() => {
                      const cards = cardsFromRange(state, ranges.get(s.seat)!);
                      if (cards) onEvent({ type: 'show', seat: s.seat, cards });
                    }}
                  >
                    From range
                  </Button>
                )}
              </>
            )}
            {!s.mucked && (
              <Button variant="ghost" onClick={() => onEvent({ type: 'muck', seat: s.seat })}>
                Muck
              </Button>
            )}
          </div>
        ))}
      </div>
      {picking !== null && <ShowCardsPicker state={state} seat={picking} onEvent={onEvent} onClose={() => setPicking(null)} />}
    </div>
  );
}

function CompleteControls({ state, money, onEvent, onNewHand }: Props) {
  const [picking, setPicking] = useState(false);
  const winner = state.seats.find((s) => s.dealtIn && !s.folded)!;
  const won = winnings(state.result).get(winner.seat) ?? 0;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <span className="font-semibold">
        {winner.name} wins {money(won)}
        <span className="ml-1 text-sm font-normal text-muted">without a showdown</span>
      </span>
      {!winner.shown && (
        <Button variant="secondary" onClick={() => (winner.cards ? onEvent({ type: 'show', seat: winner.seat }) : setPicking(true))}>
          {winner.name} shows the cards
        </Button>
      )}
      <Button variant="primary" onClick={onNewHand}>
        New hand, same table
      </Button>
      {picking && <ShowCardsPicker state={state} seat={winner.seat} onEvent={onEvent} onClose={() => setPicking(false)} />}
    </div>
  );
}
