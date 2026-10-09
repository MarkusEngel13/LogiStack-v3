import { useEffect, useState } from 'react';

/**
 * Full screen for a table: the host draws a layer over the whole page, and where the browser has
 * its own full screen (not on an iPhone) that goes on too, plus landscape on a phone when the
 * browser allows it (Android, in full screen). It lasts from hand to hand - each new hand is a new
 * screen - and ends with ✕, Esc, or when the table is left.
 */
const session = { on: false, browser: false, screens: 0 };

/** lock() is missing from some DOM typings and from most browsers: called only when it is there. */
type Orientation = { lock?: (o: string) => Promise<void>; unlock?: () => void };

function browserFullScreen(on: boolean) {
  const orientation = (typeof screen !== 'undefined' ? screen.orientation : undefined) as Orientation | undefined;
  if (on) {
    const root = document.documentElement;
    const landscape = () => orientation?.lock?.('landscape').catch(() => {}); // not allowed here: the phone stays as it is
    if (root.requestFullscreen && !document.fullscreenElement) {
      root
        .requestFullscreen({ navigationUI: 'hide' })
        .then(() => {
          // left again before the browser was ready
          if (!session.on) return document.exitFullscreen();
          session.browser = true;
          return landscape();
        })
        .catch(() => {}); // refused: the layer alone fills the window
    } else void landscape();
  } else {
    session.browser = false;
    try {
      orientation?.unlock?.();
    } catch {
      // nothing was locked
    }
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  }
}

/** A modal (range, cards) is open over the table: Esc closes that, not the full screen. */
const modalOpen = () => !!document.querySelector('body > .fixed.inset-0');

export function useFullScreen() {
  const [full, setFull] = useState(session.on);
  const set = (on: boolean) => {
    session.on = on;
    setFull(on);
    browserFullScreen(on);
  };

  // The next hand's screen mounts as the old one goes: only when no screen follows has the table
  // been left, and the full screen ends.
  useEffect(() => {
    session.screens++;
    return () => {
      session.screens--;
      setTimeout(() => {
        if (session.screens === 0 && session.on) {
          session.on = false;
          browserFullScreen(false);
        }
      }, 0);
    };
  }, []);

  useEffect(() => {
    if (!full) return;
    const root = document.documentElement;
    const overflow = root.style.overflow;
    root.style.overflow = 'hidden'; // the page under the layer stays still
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !modalOpen()) set(false);
    };
    // the browser left its full screen by itself (Esc, the back gesture): the layer goes too
    const onChange = () => {
      if (!document.fullscreenElement && session.browser && session.on) set(false);
    };
    window.addEventListener('keydown', onKey);
    document.addEventListener('fullscreenchange', onChange);
    return () => {
      root.style.overflow = overflow;
      window.removeEventListener('keydown', onKey);
      document.removeEventListener('fullscreenchange', onChange);
    };
  }, [full]); // set only touches the session and the state

  return { full, setFull: set, toggleFull: () => set(!full) };
}

const EXPAND = 'M14 4h6v6h-2V7.41l-4.29 4.3-1.42-1.42L16.59 6H14zM4 14h2v2.59l4.29-4.3 1.42 1.42L7.41 18H10v2H4z';
const CLOSE = 'M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6z';

/** ⤢ on a table's corner; ✕ in full screen. */
export function FullScreenButton({ full, onClick, className = '' }: { full: boolean; onClick: () => void; className?: string }) {
  const title = full ? 'Leave full screen (Esc)' : 'Full screen (F)';
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={`flex items-center justify-center rounded-md border border-line bg-surface-2/85 text-muted transition-colors hover:bg-surface-3 hover:text-ink ${
        full ? 'h-10 w-10' : 'h-8 w-8'
      } ${className}`}
    >
      <svg viewBox="0 0 24 24" className={full ? 'h-5 w-5' : 'h-4 w-4'} fill="currentColor">
        <path d={full ? CLOSE : EXPAND} />
      </svg>
    </button>
  );
}
