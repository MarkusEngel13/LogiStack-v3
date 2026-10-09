import type { CSSProperties, ReactNode } from 'react';

/** The modules, in the order of the menu: id, name, card, what it is for. */
export const MODULES = [
  { id: 'live', name: 'Live', rank: 'A', suit: '♠', what: 'Tonight’s table, hand by hand' },
  { id: 'lab', name: 'Lab', rank: 'K', suit: '♥', what: 'Your hands: replay, study, what if' },
  { id: 'gym', name: 'Gym', rank: 'Q', suit: '♣', what: 'Watch the bots, play against them' },
  { id: 'players', name: 'Players', rank: 'J', suit: '♦', what: 'Your opponents and their styles' },
  { id: 'ranges', name: 'PF Ranges', rank: '10', suit: '♠', what: 'Preflop charts, yours and the library' },
  { id: 'equity', name: 'Equity', rank: '9', suit: '♥', what: 'Hands and ranges against each other' },
] as const;

export type ModuleId = (typeof MODULES)[number]['id'];

const RED = new Set(['♥', '♦']);

/**
 * The start page: one playing card per module (LogiStack v2's design). The cards fly in, then each
 * icon draws itself; the animation lives in index.css (.module-card).
 */
export function HomePage({ onOpen }: { onOpen: (id: ModuleId) => void }) {
  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:py-12">
      <div className="mb-8 text-center sm:mb-12">
        <h1 className="font-serif text-4xl font-black tracking-tight sm:text-5xl">
          LOGI<span className="text-accent">STACK</span>
        </h1>
        <div className="mt-3 flex items-center justify-center gap-3">
          <span className="hidden h-px w-8 bg-accent sm:block" />
          <p className="text-[10px] font-bold tracking-[0.15em] whitespace-nowrap text-accent uppercase sm:text-xs sm:tracking-[0.2em]">See their ranges · play the exploit</p>
          <span className="hidden h-px w-8 bg-accent sm:block" />
        </div>
      </div>
      {/* a phone: three across, so all six fit on one screen */}
      <div className="grid grid-cols-3 gap-3 sm:gap-6 lg:grid-cols-6" style={{ perspective: '1000px' }}>
        {MODULES.map((m, i) => (
          <ModuleCard key={m.id} index={i} rank={m.rank} suit={m.suit} name={m.name} what={m.what} onClick={() => onOpen(m.id)}>
            {ICONS[m.id]}
          </ModuleCard>
        ))}
      </div>
    </div>
  );
}

function ModuleCard({
  index,
  rank,
  suit,
  name,
  what,
  onClick,
  children,
}: {
  index: number;
  rank: string;
  suit: string;
  name: string;
  what: string;
  onClick: () => void;
  children: ReactNode;
}) {
  const suitColor = RED.has(suit) ? 'var(--suit-h)' : 'var(--text-muted)';
  const corner = (
    <>
      <span className="font-serif text-base font-bold text-accent sm:text-xl">{rank}</span>
      <span className="-mt-1 text-sm sm:text-lg" style={{ color: suitColor }}>
        {suit}
      </span>
    </>
  );
  return (
    <button
      type="button"
      onClick={onClick}
      title={what}
      className="module-card group relative mx-auto flex aspect-[2.5/3.5] w-full max-w-[170px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-xl border border-line bg-surface shadow-lg focus:outline-none"
      style={{ '--i': index } as CSSProperties}
    >
      {/* the felt-like glow in the middle */}
      <span className="pointer-events-none absolute inset-0 opacity-40" style={{ background: 'radial-gradient(circle at center, var(--surface-3), var(--surface) 60%, var(--bg))' }} />
      <span className="absolute top-2.5 left-3 flex flex-col items-center leading-none select-none">{corner}</span>
      <span className="pointer-events-none absolute -top-10 -right-6 rotate-12 font-serif text-[7.5rem] leading-none text-accent opacity-10 select-none">{suit}</span>
      <span className="absolute right-3 bottom-2.5 flex rotate-180 flex-col items-center leading-none select-none">{corner}</span>
      <span className="relative z-10 mb-2 h-10 w-10 text-muted transition-colors duration-300 group-hover:text-accent sm:mb-3 sm:h-16 sm:w-16">{children}</span>
      <span className="relative z-10 border-b border-transparent pb-1 font-serif text-[11px] tracking-wider whitespace-nowrap text-ink uppercase transition-colors group-hover:border-accent/50 sm:text-base sm:tracking-widest">
        {name}
      </span>
      <span className="module-shine pointer-events-none absolute inset-0 z-20 bg-gradient-to-tr from-transparent via-white/10 to-transparent" />
    </button>
  );
}

/** Line icons; every stroke is drawn in its turn (--s). */
function Icon({ children }: { children: ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" className="module-icon h-full w-full" fill="none" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
      {children}
    </svg>
  );
}

const s = (n: number) => ({ pathLength: 1, style: { '--s': n } as CSSProperties });

const ICONS: Record<ModuleId, ReactNode> = {
  // a table seen from above, the dealer button and two cards in front of Hero
  live: (
    <Icon>
      <rect x="2.5" y="6" width="19" height="11" rx="5.5" {...s(0)} />
      <rect x="4.5" y="8" width="15" height="7" rx="3.5" {...s(1)} />
      <circle cx="16" cy="11.5" r="1.2" {...s(2)} />
      <path d="M10 19.5l1-3.5 2.2.6-1 3.5z" {...s(3)} />
      <path d="M12.6 20.1l1.6-3.3 2 1-1.6 3.2z" {...s(4)} />
    </Icon>
  ),
  // the microscope (v2's Lab)
  lab: (
    <Icon>
      <path d="M6 18h12" {...s(0)} />
      <path d="M12 18V6" {...s(1)} />
      <path d="M9 13h6" {...s(2)} />
      <path d="M12 6a2 2 0 1 0 0-4 2 2 0 0 0 0 4z" {...s(3)} />
      <circle cx="12" cy="21" r="1" {...s(4)} />
    </Icon>
  ),
  // the robot (v2's Gym)
  gym: (
    <Icon>
      <rect x="4" y="4" width="16" height="12" rx="2" {...s(0)} />
      <path d="M12 4V2" {...s(1)} />
      <path d="M9 10h.01" strokeWidth="2" {...s(2)} />
      <path d="M15 10h.01" strokeWidth="2" {...s(2)} />
      <path d="M9 14h6" {...s(3)} />
      <path d="M3 16l-1 2M21 16l1 2" {...s(4)} />
      <rect x="7" y="16" width="10" height="5" rx="1" {...s(5)} />
    </Icon>
  ),
  // two players, one behind the other
  players: (
    <Icon>
      <circle cx="9" cy="8" r="3" {...s(0)} />
      <path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5" {...s(1)} />
      <circle cx="16.5" cy="9" r="2.4" {...s(2)} />
      <path d="M15.5 14.2c2.6-.3 4.6 1.4 5 4.3" {...s(3)} />
    </Icon>
  ),
  // the 13x13 grid (v2's Preflop)
  ranges: (
    <Icon>
      <rect x="3" y="3" width="18" height="18" rx="2" {...s(0)} />
      <path d="M9 3v18" {...s(1)} />
      <path d="M15 3v18" {...s(2)} />
      <path d="M3 9h18" {...s(3)} />
      <path d="M3 15h18" {...s(4)} />
    </Icon>
  ),
  // a scale: one range weighed against another
  equity: (
    <Icon>
      <path d="M12 3v17" {...s(0)} />
      <path d="M8 20h8" {...s(1)} />
      <path d="M4 7h16" {...s(2)} />
      <path d="M4 7l-2.5 6h5z" {...s(3)} />
      <path d="M20 7l-2.5 6h5z" {...s(4)} />
    </Icon>
  ),
};
