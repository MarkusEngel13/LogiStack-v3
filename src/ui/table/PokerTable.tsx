import type { ReactNode } from 'react';
import { PlayingCard } from '../cards/PlayingCard';
import { seatSlots, slotOfSeat, type SeatSlot } from './geometry';

/** Everything a seat plate shows. The table knows nothing about hands or drafts. */
export interface SeatView {
  seat: number;
  empty: boolean;
  name: string;
  stackText: string;
  position?: string;
  typeColor?: string;
  icons: string[];
  isHero: boolean;
  toAct: boolean;
  folded: boolean;
  sittingOut: boolean;
  /** Cards to draw above the plate: a number is a face, null a card back. Leave out for none. */
  cards?: (number | null)[];
  /** Bet in front of the player, already formatted. */
  betText?: string;
  selected?: boolean;
  /** Last action on this street ("Raise", "Call", ...) or the amount won at the end. */
  action?: { text: string; tone: ActionTone };
  winner?: boolean;
}

export type ActionTone = 'bet' | 'call' | 'check' | 'fold' | 'allin' | 'post' | 'win' | 'info';

export const TONE_COLORS: Record<ActionTone, { bg: string; fg: string }> = {
  bet: { bg: '#c62828', fg: '#ffffff' },
  allin: { bg: '#7f1414', fg: '#ffffff' },
  call: { bg: '#1f8a4c', fg: '#ffffff' },
  check: { bg: '#4b5563', fg: '#ffffff' },
  fold: { bg: '#2b2b2b', fg: '#9b9b9b' },
  post: { bg: '#a16207', fg: '#ffffff' },
  win: { bg: '#16a34a', fg: '#ffffff' },
  info: { bg: '#333333', fg: '#f1f1f1' },
};

interface Props {
  size: number;
  /** Seat drawn at the bottom centre (Hero). */
  anchorSeat: number;
  seats: SeatView[];
  buttonSeat: number | null;
  center?: ReactNode;
  onSeatClick?: (seat: number) => void;
}

// Sizes in cqw: percent of the table component's width.
const PLATE_W = 13.5;
const PLATE_H = 5.4;
const CARD_W = 4.4;

export function PokerTable({ size, anchorSeat, seats, buttonSeat, center, onSeatClick }: Props) {
  const slots = seatSlots(size);
  const slotFor = (seat: number) => slots[slotOfSeat(seat, anchorSeat, size)]!;

  return (
    <div className="w-full" style={{ containerType: 'inline-size' }}>
      <div style={{ padding: '10.5cqw 8.5cqw 6cqw' }}>
        <div className="relative" style={{ aspectRatio: '2 / 1' }}>
          {/* rail */}
          <div
            className="absolute inset-0 rounded-full"
            style={{ background: 'var(--rail)', border: '0.4cqw solid var(--rail-edge)', boxShadow: '0 1cqw 3cqw rgba(0,0,0,0.6)' }}
          />
          {/* felt */}
          <div
            className="absolute rounded-full"
            style={{
              inset: '6% 3%',
              background: 'radial-gradient(ellipse at center, var(--felt-center) 0%, var(--felt) 70%)',
              boxShadow: 'inset 0 0 3cqw rgba(0,0,0,0.6)',
            }}
          />
          <div className="absolute rounded-full" style={{ inset: '9% 4.5%', border: '0.2cqw solid var(--felt-line)', opacity: 0.85 }} />
          {/* watermark */}
          <div
            className="pointer-events-none absolute inset-0 flex items-center justify-center font-black tracking-tight select-none"
            style={{ fontSize: '5cqw', color: 'var(--text)', opacity: 0.05 }}
          >
            LogiStack
          </div>
          {center && <div className="absolute inset-0 flex items-center justify-center">{center}</div>}

          {seats.map((s) => (s.betText ? <Bet key={`bet-${s.seat}`} slot={slotFor(s.seat)} text={s.betText} /> : null))}

          {buttonSeat !== null && buttonSeat < size && <DealerButton slot={slotFor(buttonSeat)} />}

          {seats.map((s) => (
            <SeatPlate key={s.seat} view={s} slot={slotFor(s.seat)} onClick={onSeatClick} />
          ))}
        </div>
      </div>
    </div>
  );
}

function Bet({ slot, text }: { slot: SeatSlot; text: string }) {
  return (
    <div
      className="absolute flex items-center gap-[0.5cqw] font-bold whitespace-nowrap"
      style={{ left: `${slot.bet.x}%`, top: `${slot.bet.y}%`, transform: 'translate(-50%, -50%)', fontSize: '1.35cqw', color: 'var(--chip-text)' }}
    >
      <span>{text}</span>
      <span
        className="inline-block rounded-full"
        style={{
          width: '1.7cqw',
          height: '1.7cqw',
          background: 'radial-gradient(circle, #d8d8d8 0 30%, #2f6fd6 31% 100%)',
          border: '0.25cqw dashed #ffffff',
          boxShadow: '0 0.2cqw 0.4cqw rgba(0,0,0,0.6)',
        }}
      />
    </div>
  );
}

function DealerButton({ slot }: { slot: SeatSlot }) {
  return (
    <div
      className="absolute flex items-center justify-center rounded-full font-black"
      style={{
        left: `${slot.button.x}%`,
        top: `${slot.button.y}%`,
        width: '2.6cqw',
        height: '2.6cqw',
        transform: 'translate(-50%, -50%)',
        background: 'var(--dealer)',
        color: 'var(--dealer-text)',
        fontSize: '1.5cqw',
        boxShadow: '0 0.3cqw 0.8cqw rgba(0,0,0,0.6)',
      }}
    >
      D
    </div>
  );
}

function SeatPlate({ view, slot, onClick }: { view: SeatView; slot: SeatSlot; onClick?: (seat: number) => void }) {
  const dim = view.folded || view.sittingOut;
  const border = view.winner
    ? '0.22cqw solid #22c55e'
    : view.toAct
    ? '0.22cqw solid var(--accent)'
    : view.selected
      ? '0.22cqw solid var(--accent-strong)'
      : view.empty
        ? '0.15cqw dashed var(--plate-border)'
        : '0.12cqw solid var(--plate-border)';

  return (
    <div
      className="absolute"
      style={{ left: `${slot.plate.x}%`, top: `${slot.plate.y}%`, transform: 'translate(-50%, -50%)', zIndex: view.selected ? 3 : 2 }}
    >
      {view.cards && view.cards.length > 0 && (
        <div
          className="absolute left-1/2 flex gap-[0.3cqw]"
          style={{ bottom: `calc(100% - ${PLATE_H * 0.18}cqw)`, transform: 'translateX(-50%)', opacity: dim ? 0.45 : 1 }}
        >
          {view.cards.map((c, i) => (
            <PlayingCard key={i} card={c} width={`${CARD_W}cqw`} />
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={onClick ? () => onClick(view.seat) : undefined}
        className={`relative flex flex-col items-center justify-center overflow-hidden text-center ${onClick ? 'cursor-pointer' : 'cursor-default'}`}
        style={{
          width: `${PLATE_W}cqw`,
          height: `${PLATE_H}cqw`,
          borderRadius: '0.6cqw',
          border,
          background: view.empty ? 'rgba(20,20,20,0.6)' : 'linear-gradient(180deg, var(--plate-top), var(--plate))',
          boxShadow: view.winner
            ? '0 0 1.6cqw rgba(34,197,94,0.6)'
            : view.toAct
              ? '0 0 1.4cqw rgba(242,107,29,0.55)'
              : '0 0.4cqw 1cqw rgba(0,0,0,0.55)',
          opacity: dim ? 0.55 : 1,
        }}
      >
        {view.typeColor && !view.empty && (
          <span className="absolute top-0 bottom-0 left-0" style={{ width: '0.5cqw', background: view.typeColor }} />
        )}
        {view.icons.length > 0 && (
          <span className="absolute leading-none" style={{ right: '0.45cqw', top: '0.35cqw', fontSize: '1.3cqw' }}>
            {view.icons.join('')}
          </span>
        )}
        <span
          className="max-w-[80%] truncate leading-tight"
          style={{ fontSize: '1.5cqw', color: view.empty ? 'var(--text-faint)' : view.isHero ? 'var(--accent-strong)' : 'var(--text-muted)' }}
        >
          {view.name}
        </span>
        <span className="leading-tight font-bold" style={{ fontSize: '1.75cqw', color: view.empty ? 'var(--text-faint)' : 'var(--text)' }}>
          {view.stackText}
        </span>
      </button>

      {/* Tabs on the bottom edge, clear of the name and the cards: position left, action right */}
      {view.action && (
        <span
          className="pointer-events-none absolute font-bold whitespace-nowrap"
          style={{
            bottom: '-1cqw',
            right: '0.6cqw',
            fontSize: '1.05cqw',
            padding: '0.05cqw 0.6cqw',
            borderRadius: '0.4cqw',
            background: TONE_COLORS[view.action.tone].bg,
            color: TONE_COLORS[view.action.tone].fg,
            boxShadow: '0 0.2cqw 0.5cqw rgba(0,0,0,0.5)',
          }}
        >
          {view.action.text}
        </span>
      )}
      {view.position && (
        <span
          className="pointer-events-none absolute font-bold whitespace-nowrap"
          style={{
            bottom: '-0.95cqw',
            left: view.action ? '0.6cqw' : '50%',
            transform: view.action ? undefined : 'translateX(-50%)',
            fontSize: '1cqw',
            padding: '0.05cqw 0.6cqw',
            borderRadius: '0.4cqw',
            background: 'var(--surface-3)',
            border: '0.1cqw solid var(--plate-border)',
            color: view.position === 'BTN' ? 'var(--accent-strong)' : 'var(--text-muted)',
            opacity: dim ? 0.55 : 1,
          }}
        >
          {view.position}
        </span>
      )}
    </div>
  );
}
