import { useState, type CSSProperties, type ReactNode } from 'react';
import { PLAN_LABELS, type Limits, type Plan, type Role } from '../../shared/plans';
import { useAdminNews } from '../admin/adminStore';
import { leftToday } from '../quiz/quizStore';
import { useSyncStatus } from '../sync/useSyncStatus';

/** The modules, in the order of the menu: id, name, card, what it is for. */
export const MODULES = [
  { id: 'live', name: 'Live', rank: 'A', suit: '♠', what: 'Tonight’s table, hand by hand' },
  { id: 'lab', name: 'Lab', rank: 'K', suit: '♥', what: 'Your hands: replay, study, what if' },
  { id: 'gym', name: 'Gym', rank: 'Q', suit: '♣', what: 'Play · Watch · Quiz' },
  { id: 'players', name: 'Players', rank: 'J', suit: '♦', what: 'Your opponents and their styles' },
  { id: 'ranges', name: 'PF Ranges', rank: '10', suit: '♠', what: 'Preflop charts, yours and the library' },
  { id: 'equity', name: 'Equity', rank: '9', suit: '♥', what: 'Hands and ranges against each other' },
] as const;

/** The admin's own module: the Joker, outside the deck everyone else sees. */
export const ADMIN_MODULE = { id: 'admin', name: 'Admin', what: 'Users, plans, Premium requests and the advice users see' } as const;

export type ModuleId = (typeof MODULES)[number]['id'] | typeof ADMIN_MODULE.id;

const RED = new Set(['♥', '♦']);

/** The Joker card's and the menu's badge: open requests first, else who joined since the last visit. */
export function adminBadge(n: { requests: number; newUsers: number }): string | undefined {
  if (n.requests) return `${n.requests} request${n.requests === 1 ? '' : 's'}`;
  if (n.newUsers) return `${n.newUsers} new`;
  return undefined;
}

/**
 * The start page: one playing card per module (LogiStack v2's design). The cards fly in, then each
 * icon draws itself; the animation lives in index.css (.module-card). The admin also gets the
 * Joker (the dashboard); everyone else logged in gets a welcome note until they close it.
 */
export function HomePage({ onOpen }: { onOpen: (id: ModuleId) => void }) {
  const left = leftToday();
  const { account } = useSyncStatus();
  const isAdmin = account?.role === 'admin';
  const adminNews = useAdminNews(isAdmin);
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
      {account && !isAdmin && <Welcome email={account.email} plan={account.plan} limits={account.limits} role={account.role} />}
      {/* a phone: three across, so all six fit on one screen */}
      <div className="grid grid-cols-3 gap-3 sm:gap-6 lg:grid-cols-6" style={{ perspective: '1000px' }}>
        {MODULES.map((m, i) => (
          <ModuleCard key={m.id} index={i} rank={m.rank} suit={m.suit} name={m.name} what={m.what} onClick={() => onOpen(m.id)} badge={m.id === 'gym' && left !== 0 ? (left === null ? 'Quiz' : `${left} left`) : undefined}>
            {ICONS[m.id]}
          </ModuleCard>
        ))}
        {/* the Joker lies apart from the deck: centred under it, one card wide */}
        {isAdmin && (
          <div className="col-start-2 flex justify-center lg:col-span-2 lg:col-start-3">
            <div className="w-full lg:w-[calc(50%-0.75rem)]">
              <ModuleCard
                index={MODULES.length}
                joker
                name={ADMIN_MODULE.name}
                what={ADMIN_MODULE.what}
                onClick={() => onOpen('admin')}
                badge={adminBadge(adminNews)}
              >
                {ICONS.admin}
              </ModuleCard>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- the welcome note for users ----------------------------------------------------------------

const WELCOME_KEY = 'logistack.welcome.v1';

function closedFor(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(WELCOME_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/** What a plan gives, in a few words each ("20 hands", "1 tip per moment of a hand"). */
export function planPerks(l: Limits): string[] {
  const kept = (k: 'hand' | 'player' | 'profile' | 'range', one: string, many: string) => {
    const n = l.items[k];
    return n === null ? null : `${n} ${n === 1 ? one : many}`;
  };
  const counted = [kept('hand', 'hand', 'hands'), kept('player', 'player', 'players'), kept('profile', 'profile', 'profiles'), kept('range', 'chart', 'charts')].filter((x): x is string => !!x);
  return [
    ...(counted.length ? counted : ['as many hands, players, profiles and charts as you like']),
    l.quizPractice ? 'any quiz, any time' : 'the day’s quiz set',
    `${l.advicePerSpot} tip${l.advicePerSpot === 1 ? '' : 's'} per moment of a hand`,
    ...(l.stats ? ['stats on your players'] : []),
    ...(l.shareProfiles ? ['share your profiles'] : []),
  ];
}

/** A first hello: the plan, where the data lives, where to ask for more. Closed once per email. */
function Welcome({ email, plan, limits, role }: { email: string; plan: Plan; limits: Limits; role: Role }) {
  const [closed, setClosed] = useState(() => closedFor().includes(email));
  if (closed) return null;
  const close = () => {
    setClosed(true);
    try {
      localStorage.setItem(WELCOME_KEY, JSON.stringify([...closedFor(), email]));
    } catch {
      // storage blocked: it shows again next time
    }
  };
  const user = role === 'user';
  return (
    <div className="relative mx-auto mb-8 max-w-2xl overflow-hidden rounded-xl border border-line bg-surface px-4 py-4 shadow-lg sm:mb-12 sm:px-6 sm:py-5">
      <span className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-accent" />
      <button type="button" onClick={close} className="absolute top-2 right-2 px-2 text-xl leading-none text-muted hover:text-ink" aria-label="Close">
        ×
      </button>
      <h2 className="pr-6 font-serif text-lg font-bold sm:text-xl">Welcome, {email.split('@')[0]}</h2>
      <p className="mt-2 text-sm text-muted">
        {user ? (
          <>
            You are on <b className="text-ink">{PLAN_LABELS[plan]}</b>:
          </>
        ) : (
          `As an ${role} you have every feature.`
        )}
      </p>
      {user && (
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {planPerks(limits).map((p) => (
            <li key={p} className="rounded-full border border-line bg-surface-2 px-2.5 py-1 text-xs text-ink">
              {p}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-sm text-muted">Everything you save is kept on the server, so it follows you to your phone and your computer. Nobody else sees it.</p>
      <p className="mt-2 text-sm text-muted">
        {user && plan === 'free'
          ? 'Want more? Ask for Premium under your account (top right). That is also where you ask to have your account and data deleted.'
          : 'To have your account and data deleted, see your account (top right).'}
      </p>
      <div className="mt-3 flex justify-end">
        <button type="button" onClick={close} className="rounded-md px-3 py-1.5 text-sm font-semibold text-accent hover:bg-surface-2">
          Got it
        </button>
      </div>
    </div>
  );
}

function ModuleCard({
  index,
  rank,
  suit,
  joker = false,
  name,
  what,
  onClick,
  badge,
  children,
}: {
  index: number;
  rank?: string;
  suit?: string;
  /** The admin's card: JOKER down the corners, a star, a faint red tint. */
  joker?: boolean;
  name: string;
  what: string;
  onClick: () => void;
  /** A small tag at the top (the Gym: today's quiz questions left; the Joker: requests, new users). */
  badge?: string | undefined;
  children: ReactNode;
}) {
  const suitColor = suit && RED.has(suit) ? 'var(--suit-h)' : 'var(--text-muted)';
  const corner = joker ? (
    <span className="flex flex-col items-center font-serif text-[8px] leading-[1.1] font-bold sm:text-[10px]" style={{ color: 'var(--suit-h)' }}>
      {'JOKER'.split('').map((c, i) => (
        <span key={i}>{c}</span>
      ))}
      <span className="mt-0.5 text-[10px] sm:text-xs">★</span>
    </span>
  ) : (
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
      style={{ '--i': index, ...(joker ? { borderColor: 'color-mix(in srgb, var(--suit-h) 30%, var(--border))' } : {}) } as CSSProperties}
    >
      {/* the felt-like glow in the middle */}
      <span className="pointer-events-none absolute inset-0 opacity-40" style={{ background: 'radial-gradient(circle at center, var(--surface-3), var(--surface) 60%, var(--bg))' }} />
      {joker && <span className="pointer-events-none absolute inset-0" style={{ background: 'color-mix(in srgb, var(--suit-h) 7%, transparent)' }} />}
      <span className="absolute top-2.5 left-3 flex flex-col items-center leading-none select-none">{corner}</span>
      <span
        className="pointer-events-none absolute -top-10 -right-6 rotate-12 font-serif text-[7.5rem] leading-none opacity-10 select-none"
        style={{ color: joker ? 'var(--suit-h)' : 'var(--accent)' }}
      >
        {joker ? '★' : suit}
      </span>
      <span className="absolute right-3 bottom-2.5 flex rotate-180 flex-col items-center leading-none select-none">{corner}</span>
      {badge && <span className="absolute top-2 right-2 z-30 rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-bold whitespace-nowrap text-accent-ink sm:px-2 sm:text-[11px]">{badge}</span>}
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
  // the Joker's hat: three points with bells on a band
  admin: (
    <Icon>
      <rect x="4.5" y="16.5" width="15" height="3.5" rx="1" {...s(0)} />
      <path d="M5 16.5C5 13 4 10.6 2.6 9.2c3 .2 5.6 1.8 6.9 4.3" {...s(1)} />
      <path d="M9.5 13.5C10 9.6 10.9 6.6 12 4.4c1.1 2.2 2 5.2 2.5 9.1" {...s(2)} />
      <path d="M14.5 13.5c1.3-2.5 3.9-4.1 6.9-4.3-1.4 1.4-2.4 3.8-2.4 7.3" {...s(3)} />
      <circle cx="2.4" cy="7.9" r="1.1" {...s(4)} />
      <circle cx="12" cy="3.1" r="1.1" {...s(4)} />
      <circle cx="21.6" cy="7.9" r="1.1" {...s(4)} />
      <path d="M12 17.3l.9.95-.9.95-.9-.95z" {...s(5)} />
    </Icon>
  ),
};

/** The Joker's hat on its own (the admin's entry in the phone menu). */
export function AdminIcon({ className = '' }: { className?: string }) {
  return <span className={`inline-block ${className}`}>{ICONS.admin}</span>;
}
