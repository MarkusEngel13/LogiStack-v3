import { currentPots, potOdds, potTotal } from '../../core/engine/replay';
import type { TableState } from '../../core/engine/state';
import { PlayingCard } from '../cards/PlayingCard';
import { TableLogo } from '../table/PokerTable';
import type { Money } from './views';

const BOARD_CARD_W = 4.9; // cqw
const GAP = 1.3; // cqw between pot box, board and logo

/**
 * The felt, top to bottom: HM3-style pot box (pot, pot odds for the player facing a bet, side
 * pots, result lines), the board, the logo. The board sits on the table's centre line; the pot box
 * grows upward and the logo hangs below, so neither ever moves the cards.
 */
export function TableCenter({ state, money, summary = [] }: { state: TableState; money: Money; summary?: string[] }) {
  const odds = potOdds(state);
  const collected = currentPots(state, false).filter((p) => p.amount > 0);

  return (
    <div className="relative">
      <div
        className="absolute left-1/2 text-center leading-tight"
        style={{
          bottom: `calc(100% + ${GAP}cqw)`,
          transform: 'translateX(-50%)',
          width: 'max-content',
          background: 'var(--pot-bg)',
          border: '0.1cqw solid var(--pot-border)',
          color: 'var(--pot-text)',
          borderRadius: '0.6cqw',
          padding: '0.7cqw 1.8cqw',
          minWidth: '14cqw',
          boxShadow: '0 0.4cqw 1cqw rgba(0,0,0,0.5)',
        }}
      >
        <div className="font-bold" style={{ fontSize: '1.55cqw' }}>
          Pot: {money(potTotal(state))}
        </div>
        {odds && (
          <div style={{ fontSize: '1.15cqw', color: 'var(--pot-muted)' }}>
            Pot odds: {odds.ratio.toFixed(2)}:1 ({odds.percent.toFixed(1)}%)
          </div>
        )}
        {collected.length > 1 && (
          <div style={{ fontSize: '1.05cqw', color: 'var(--pot-muted)' }}>
            {collected.map((p, i) => `${i === 0 ? 'Main' : `Side ${i}`} ${money(p.amount)}`).join(' · ')}
          </div>
        )}
        {summary.map((line) => (
          <div key={line} style={{ fontSize: '1.1cqw', color: line.startsWith('7-2') || line.includes('squid') ? '#4ade80' : 'var(--pot-muted)' }}>
            {line}
          </div>
        ))}
      </div>

      <div className="flex" style={{ gap: '0.5cqw' }}>
        {[0, 1, 2, 3, 4].map((i) =>
          state.board[i] !== undefined ? (
            <PlayingCard key={i} card={state.board[i]!} width={`${BOARD_CARD_W}cqw`} />
          ) : (
            <div
              key={i}
              style={{ width: `${BOARD_CARD_W}cqw`, aspectRatio: '5 / 7', borderRadius: '0.5cqw', border: '0.12cqw dashed var(--board-slot)' }}
            />
          ),
        )}
      </div>

      <div className="absolute left-1/2" style={{ top: `calc(100% + ${GAP}cqw)`, transform: 'translateX(-50%)' }}>
        <TableLogo size="2.6cqw" />
      </div>
    </div>
  );
}
