import { rankOf, suitOf, RANK_CHARS } from '../../core/cards';

const SUIT_SYMBOL = ['♠', '♥', '♦', '♣'];
const SUIT_COLOR = ['var(--suit-s)', 'var(--suit-h)', 'var(--suit-d)', 'var(--suit-c)'];

/** A card face (four-color deck) or, with card = null, a card back. `width` is any CSS length. */
export function PlayingCard({ card, width }: { card: number | null; width: string }) {
  const box = {
    width,
    aspectRatio: '5 / 7',
    borderRadius: `calc(${width} * 0.1)`,
    boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
  } as const;

  if (card === null) {
    return (
      <div
        style={{
          ...box,
          background: `repeating-linear-gradient(45deg, var(--card-back) 0 4px, var(--card-back-pattern) 4px 8px)`,
          border: `calc(${width} * 0.06) solid var(--card-face)`,
        }}
      />
    );
  }

  const rank = RANK_CHARS[rankOf(card)]!;
  const suit = suitOf(card);
  const color = SUIT_COLOR[suit];
  return (
    <div
      className="relative select-none"
      style={{ ...box, background: 'var(--card-face)', color, fontFamily: 'Georgia, "Times New Roman", serif' }}
    >
      <div
        className="absolute font-bold leading-none"
        style={{ left: `calc(${width} * 0.09)`, top: `calc(${width} * 0.07)`, fontSize: `calc(${width} * 0.42)` }}
      >
        {rank === 'T' ? '10' : rank}
      </div>
      <div
        className="absolute leading-none"
        style={{ left: `calc(${width} * 0.1)`, top: `calc(${width} * 0.52)`, fontSize: `calc(${width} * 0.3)` }}
      >
        {SUIT_SYMBOL[suit]}
      </div>
      <div
        className="absolute leading-none"
        style={{ right: `calc(${width} * 0.08)`, bottom: `calc(${width} * 0.06)`, fontSize: `calc(${width} * 0.62)` }}
      >
        {SUIT_SYMBOL[suit]}
      </div>
    </div>
  );
}
