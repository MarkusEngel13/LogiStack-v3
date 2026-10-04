import { currentPots, potOdds, potTotal } from '../../core/engine/replay';
import type { TableState } from '../../core/engine/state';
import { PlayingCard } from '../cards/PlayingCard';
import type { Money } from './views';

/** HM3-style pot box (pot, pot odds for the player facing a bet, side pots) above the board. */
export function TableCenter({ state, money, summary = [] }: { state: TableState; money: Money; summary?: string[] }) {
  const odds = potOdds(state);
  const collected = currentPots(state, false).filter((p) => p.amount > 0);

  return (
    <div className="flex flex-col items-center" style={{ gap: '1.4cqw', marginTop: '-1cqw' }}>
      <div
        className="text-center leading-tight"
        style={{
          background: 'rgba(0,0,0,0.85)',
          border: '0.1cqw solid #2c2c2c',
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
          <div style={{ fontSize: '1.15cqw', color: 'var(--text-muted)' }}>
            Pot odds: {odds.ratio.toFixed(2)}:1 ({odds.percent.toFixed(1)}%)
          </div>
        )}
        {collected.length > 1 && (
          <div style={{ fontSize: '1.05cqw', color: 'var(--text-muted)' }}>
            {collected.map((p, i) => `${i === 0 ? 'Main' : `Side ${i}`} ${money(p.amount)}`).join(' · ')}
          </div>
        )}
        {summary.map((line) => (
          <div key={line} style={{ fontSize: '1.1cqw', color: line.startsWith('7-2') || line.includes('squid') ? '#4ade80' : 'var(--text-muted)' }}>
            {line}
          </div>
        ))}
      </div>
      <div className="flex" style={{ gap: '0.5cqw' }}>
        {[0, 1, 2, 3, 4].map((i) =>
          state.board[i] !== undefined ? (
            <PlayingCard key={i} card={state.board[i]!} width="4.9cqw" />
          ) : (
            <div
              key={i}
              style={{ width: '4.9cqw', aspectRatio: '5 / 7', borderRadius: '0.5cqw', border: '0.12cqw dashed rgba(255,255,255,0.08)' }}
            />
          ),
        )}
      </div>
    </div>
  );
}
