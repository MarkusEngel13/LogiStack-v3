import { useId, type ReactNode } from 'react';
import { rankOf, suitOf, RANK_CHARS } from '../../core/cards';
import { useSettings, type CardFace } from '../settings';

const SUIT_SYMBOL = ['♠', '♥', '♦', '♣'];

/** Theme colours for spades, hearts, diamonds, clubs. */
export const SUIT_VARS = ['var(--suit-s)', 'var(--suit-h)', 'var(--suit-d)', 'var(--suit-c)'];

/** Colour slot for a suit: a two-colour deck paints diamonds like hearts and clubs like spades. */
export const suitTone = (suit: number, fourColor: boolean) => (fourColor ? suit : suit === 2 ? 1 : suit === 3 ? 0 : suit);

export const CARD_FACES: { id: CardFace; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'modernist', label: 'Modernist' },
  { id: 'royal', label: 'Royal' },
  { id: 'hud', label: 'HUD' },
];

/**
 * A card face or, with card = null, a card back. `width` is any CSS length. The design and the
 * four-colour deck come from Options; `face` overrides the design (previews). `mini` draws a
 * plain rank-over-suit tile for card strips in lists, where a full face is too small to read.
 */
export function PlayingCard({ card, width, face, mini = false }: { card: number | null; width: string; face?: CardFace; mini?: boolean }) {
  const { settings } = useSettings();
  const gid = `c${useId().replace(/[^\w-]/g, '')}`; // gradient ids must be unique per card
  if (card === null) return <CardBack width={width} />;

  const rank = RANK_CHARS[rankOf(card)]!;
  const suit = suitOf(card);
  const tone = suitTone(suit, settings.fourColor);
  if (mini) return <MiniCard width={width} rank={rank} suit={suit} tone={tone} />;

  const design = FACES[face ?? settings.cardFace] ?? FACES.standard;
  return (
    <svg
      viewBox="0 0 60 84"
      className="block shrink-0 select-none"
      style={{ width, aspectRatio: '5 / 7', overflow: 'visible', filter: design.shadow(tone) }}
      role="img"
      aria-label={`${rank}${'shdc'[suit]}`}
    >
      {design.draw({ rank, suit, tone, gid })}
    </svg>
  );
}

function CardBack({ width }: { width: string }) {
  return (
    <div
      className="shrink-0"
      style={{
        width,
        aspectRatio: '5 / 7',
        borderRadius: `calc(${width} * 0.1)`,
        boxShadow: '0 2px 6px rgba(0,0,0,0.5)',
        background: `repeating-linear-gradient(45deg, var(--card-back) 0 4px, var(--card-back-pattern) 4px 8px)`,
        border: `calc(${width} * 0.06) solid var(--card-face)`,
      }}
    />
  );
}

function MiniCard({ width, rank, suit, tone }: { width: string; rank: string; suit: number; tone: number }) {
  return (
    <div
      className="flex shrink-0 flex-col items-center justify-center leading-none font-bold select-none"
      style={{
        width,
        aspectRatio: '5 / 7',
        borderRadius: `calc(${width} * 0.14)`,
        background: 'var(--card-face)',
        color: SUIT_VARS[tone],
        fontFamily: 'Arial, sans-serif',
        boxShadow: '0 1px 3px rgba(0,0,0,0.5)',
      }}
    >
      <span style={{ fontSize: `calc(${width} * 0.52)`, letterSpacing: '-0.06em' }}>{rank === 'T' ? '10' : rank}</span>
      <span style={{ fontSize: `calc(${width} * 0.5)` }}>{SUIT_SYMBOL[suit]}</span>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// The four designs, ported from v2 (frontend/src/features/common/components/cards). 60 x 84 box.

interface FaceProps {
  rank: string;
  suit: number;
  /** Colour slot after the two/four-colour choice. */
  tone: number;
  /** Unique prefix for gradient ids. */
  gid: string;
}

interface Design {
  draw: (p: FaceProps) => ReactNode;
  shadow: (tone: number) => string;
}

const ten = (rank: string) => rank === 'T';

/** v2 "Default": corner index top left and bottom right, a big suit in the middle. */
const standard: Design = {
  shadow: () => 'drop-shadow(0 2px 3px rgba(0,0,0,0.45))',
  draw: ({ rank, suit, tone }) => {
    const x = ten(rank) ? 11 : 8;
    const index = (
      <>
        <text x={x} y="16" fontFamily="Arial, sans-serif" fontSize="14" fontWeight="bold" textAnchor="middle">
          {ten(rank) ? '10' : rank}
        </text>
        <text x={x} y="28" fontFamily="Arial, sans-serif" fontSize="14" textAnchor="middle">
          {SUIT_SYMBOL[suit]}
        </text>
      </>
    );
    return (
      <g style={{ color: SUIT_VARS[tone] }} fill="currentColor">
        <rect x="0" y="0" width="60" height="84" rx="6" style={{ fill: 'var(--card-face)' }} />
        {index}
        <text x="30" y="55" fontFamily="Arial, sans-serif" fontSize="48" textAnchor="middle" opacity="0.9">
          {SUIT_SYMBOL[suit]}
        </text>
        <g transform="rotate(180 30 42)">{index}</g>
        <rect x="0.5" y="0.5" width="59" height="83" rx="5.5" fill="none" stroke="#dddddd" strokeWidth="1" />
      </g>
    );
  },
};

const MODERNIST_COLORS = ['#18181b', '#ef4444', '#3b82f6', '#22c55e'];
const MODERN_FONT = "'Inter', 'Segoe UI', Arial, sans-serif";

/** v2 "Modernist": one huge rank in the middle, small suit and rank in the corners; T for ten. */
const modernist: Design = {
  shadow: () => 'drop-shadow(0 3px 5px rgba(0,0,0,0.4))',
  draw: ({ rank, suit, tone }) => {
    const color = MODERNIST_COLORS[tone];
    const corners = (
      <>
        <text x="7" y="14" fontFamily={MODERN_FONT} fontSize="13" fontWeight="bold" textAnchor="middle">
          {SUIT_SYMBOL[suit]}
        </text>
        <text x="53" y="14" fontFamily={MODERN_FONT} fontSize="13" fontWeight="bold" textAnchor="middle">
          {rank}
        </text>
      </>
    );
    return (
      <g fill={color}>
        <rect x="0" y="0" width="60" height="84" rx="4" fill="white" />
        {corners}
        <text x="30" y="64.5" fontFamily={MODERN_FONT} fontSize="64" fontWeight="900" textAnchor="middle" letterSpacing="-2">
          {rank}
        </text>
        <g transform="rotate(180 30 42)">{corners}</g>
        <rect x="0.5" y="0.5" width="59" height="83" rx="3.5" fill="none" stroke="#f4f4f5" strokeWidth="1" />
      </g>
    );
  },
};

/** Gradient stops per colour slot: silver (spades), gold (hearts), blue (diamonds), green (clubs). */
const ROYAL_METALS = [
  ['#e0e0e0', '#ffffff', '#a0a0a0'],
  ['#bf953f', '#fcf6ba', '#b38728'],
  ['#60a5fa', '#93c5fd', '#3b82f6'],
  ['#4ade80', '#86efac', '#22c55e'],
];
const ROYAL_FONT = "'Playfair Display', Georgia, 'Times New Roman', serif";

/** v2 "Royal": black card, gold and silver lettering, thin inner frame. */
const royal: Design = {
  shadow: () => 'drop-shadow(0 4px 8px rgba(0,0,0,0.6))',
  draw: ({ rank, suit, tone, gid }) => {
    const metal = `url(#${gid}-metal)`;
    const x = ten(rank) ? 13 : 8;
    const display = ten(rank) ? '10' : rank;
    const index = (
      <>
        <text x={x} y="15" fontFamily={ROYAL_FONT} fontSize="12" fontWeight="bold" textAnchor="middle">
          {display}
        </text>
        <text x={x} y="27" fontFamily={ROYAL_FONT} fontSize="12" textAnchor="middle">
          {SUIT_SYMBOL[suit]}
        </text>
      </>
    );
    return (
      <>
        <defs>
          <linearGradient id={`${gid}-metal`} x1="0%" y1="0%" x2="100%" y2="100%">
            {ROYAL_METALS[tone]!.map((c, i) => (
              <stop key={c} offset={`${i * 50}%`} stopColor={c} />
            ))}
          </linearGradient>
          <linearGradient id={`${gid}-bg`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#1a1a1a" />
            <stop offset="100%" stopColor="#0a0a0a" />
          </linearGradient>
        </defs>
        <rect x="0" y="0" width="60" height="84" rx="4" fill={`url(#${gid}-bg)`} stroke="#333" strokeWidth="0.5" />
        <g fill={metal}>
          {index}
          {['K', 'Q', 'J'].includes(rank) ? (
            <g opacity="0.8">
              <rect x="15" y="30" width="30" height="40" fill={metal} opacity="0.25" />
              <text x="30" y="55" fontFamily={ROYAL_FONT} fontSize="32" textAnchor="middle">
                {rank}
              </text>
            </g>
          ) : (
            <text x="30" y="52" fontFamily={ROYAL_FONT} fontSize="40" textAnchor="middle" opacity="0.8">
              {SUIT_SYMBOL[suit]}
            </text>
          )}
          <g transform="rotate(180 30 42)">{index}</g>
        </g>
        <rect x="4" y="4" width="52" height="76" rx="2" fill="none" stroke={metal} strokeWidth="0.5" opacity="0.5" />
      </>
    );
  },
};

const HUD_NEON = ['#00ffff', '#ff0055', '#00aaff', '#00ff66'];
const HUD_FONT = "'Oswald', 'Bahnschrift', 'Arial Narrow', sans-serif";

/** v2 "HUD": dark glass with a neon edge, rank and suit on top, a faint giant rank behind. */
const hud: Design = {
  shadow: (tone) => `drop-shadow(0 0 4px ${HUD_NEON[tone]})`,
  draw: ({ rank, suit, tone }) => {
    const neon = HUD_NEON[tone]!;
    return (
      <>
        <rect x="0" y="0" width="60" height="84" rx="2" fill="rgba(0,10,20,0.9)" stroke={neon} strokeWidth="1" />
        <line x1="0" y1="20" x2="60" y2="20" stroke={neon} strokeWidth="0.5" opacity="0.3" />
        <line x1="0" y1="64" x2="60" y2="64" stroke={neon} strokeWidth="0.5" opacity="0.3" />
        <g fill={neon}>
          <text x="30" y="16" fontFamily={HUD_FONT} fontSize="14" fontWeight="300" textAnchor="middle">
            {ten(rank) ? '10' : rank} {SUIT_SYMBOL[suit]}
          </text>
          <text x="30" y="70" fontFamily={HUD_FONT} fontSize="60" fontWeight="100" textAnchor="middle" opacity="0.15">
            {rank}
          </text>
          <text x="30" y="48" fontFamily="Arial, sans-serif" fontSize="24" textAnchor="middle" opacity="0.85">
            {SUIT_SYMBOL[suit]}
          </text>
          <rect x="20" y="70" width="20" height="4" opacity="0.5" />
          <rect x="20" y="76" width="10" height="1" opacity="0.8" />
          <rect x="32" y="76" width="8" height="1" opacity="0.8" />
        </g>
      </>
    );
  },
};

const FACES: Record<CardFace, Design> = { standard, modernist, royal, hud };
