import type { ReactNode } from 'react';

/** A big key for a thumb. */
export function Key({ children, onClick, active, tone, className = '' }: { children: ReactNode; onClick: () => void; active?: boolean; tone?: 'accent' | 'danger'; className?: string }) {
  const look = active
    ? 'border-accent bg-accent text-accent-ink font-semibold'
    : tone === 'accent'
      ? 'border-accent/60 bg-surface-2 text-ink'
      : tone === 'danger'
        ? 'border-line bg-surface-2 text-danger'
        : 'border-line bg-surface-2 text-ink';
  return (
    <button type="button" onClick={onClick} className={`min-h-12 rounded-lg border px-2 py-1.5 text-sm leading-tight transition-colors active:scale-[0.98] ${look} ${className}`}>
      {children}
    </button>
  );
}

/** One step of the hand on the live screen: a small heading, then what to tap. */
export function Step({ title, aside, children }: { title: ReactNode; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-muted">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
