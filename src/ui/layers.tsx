import { createContext, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/**
 * One layer at a time, and always a way back. What used to be windows on top of windows is now:
 *
 * - **panel**: the inspector. On a computer a column on the right (the page stays in view and
 *   moves aside), on a phone a sheet from the bottom. A panel opened from a panel replaces it;
 *   the trail at the top ("Decision › Gabi's range › Edit") goes back to any step.
 * - **page**: a long task (the question wizard, the exploit check) over the module's content,
 *   full width, with ← Back.
 * - **popover**: a small picker (the card picker) next to where you tapped; on a phone a sheet.
 * - **dialog**: the few real windows (Options, the account, "unsaved changes").
 *
 * Back always works: ← in the frame, Esc, and the phone's back button or gesture (each layer is
 * a step in the browser history). Layers below the top one stay mounted, so going back finds
 * them as they were.
 */

export type LayerKind = 'panel' | 'page' | 'popover';

interface Layer {
  id: string;
  kind: LayerKind;
  title: string;
  wide: boolean | 'xl';
  body: HTMLDivElement;
  subtitle: HTMLDivElement;
  footer: HTMLDivElement;
  close: () => void;
  /** Where the pointer was when it opened (popovers sit next to it). */
  at: { x: number; y: number } | null;
}

interface Host {
  add: (l: Layer) => void;
  remove: (id: string) => void;
  retitle: (id: string, title: string, wide: boolean | 'xl') => void;
}

const LayerContext = createContext<Host | null>(null);

/** The last place a pointer went down (popovers open next to it). */
let lastPointer: { x: number; y: number } | null = null;

const DESKTOP = '(min-width: 1024px)';
function useDesktop() {
  const [d, setD] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(DESKTOP).matches);
  useEffect(() => {
    const m = window.matchMedia?.(DESKTOP);
    if (!m) return;
    const on = () => setD(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return d;
}

/** Puts a layer's element (portal target) into the frame. */
function Slot({ el, className }: { el: HTMLElement; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const box = ref.current;
    if (!box) return;
    box.appendChild(el);
    return () => {
      if (el.parentNode === box) box.removeChild(el);
    };
  }, [el]);
  return <div ref={ref} className={className} />;
}

export function LayerHost({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Layer[]>([]);
  const stackRef = useRef<Layer[]>([]);
  stackRef.current = stack;
  /** Browser history steps we added for open layers, and pops we caused ourselves (a layer closed by a tap). */
  const depth = useRef(0);
  const ownPops = useRef(0);
  const desktop = useDesktop();

  const host = useMemo<Host>(
    () => ({
      add: (l) => setStack((s) => [...s, l]),
      remove: (id) => setStack((s) => s.filter((x) => x.id !== id)),
      retitle: (id, title, wide) => setStack((s) => s.map((x) => (x.id === id && (x.title !== title || x.wide !== wide) ? { ...x, title, wide } : x))),
    }),
    [],
  );

  // one browser history step per open layer, so the phone's back closes the top one
  useEffect(() => {
    try {
      while (depth.current < stack.length) {
        window.history.pushState({ logistackLayer: depth.current + 1 }, '');
        depth.current++;
      }
      if (depth.current > stack.length) {
        const k = depth.current - stack.length;
        depth.current = stack.length;
        ownPops.current++;
        window.history.go(-k);
      }
    } catch {
      // history blocked (some embedded views): Back still works in the frame
    }
  }, [stack.length]);

  // the phone's back button / gesture, the browser's back: close the top layer
  useEffect(() => {
    const onPop = () => {
      if (ownPops.current > 0) {
        ownPops.current--;
        return;
      }
      if (depth.current > 0) depth.current--; // that step is gone already
      stackRef.current.at(-1)?.close();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || document.querySelector('[data-dialog]')) return;
      stackRef.current.at(-1)?.close();
    };
    const onDown = (e: PointerEvent) => (lastPointer = { x: e.clientX, y: e.clientY });
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown, true);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown, true);
    };
  }, []);

  // which layers show: the top one; under a popover the layer below too; under a panel the page below
  const visible = new Set<string>();
  for (let i = stack.length - 1; i >= 0; i--) {
    const l = stack[i]!;
    visible.add(l.id);
    if (l.kind === 'popover') continue;
    if (l.kind === 'panel') {
      const page = stack.slice(0, i).reverse().find((x) => x.kind === 'page');
      if (page) visible.add(page.id);
    }
    break;
  }
  const panel = stack.find((l) => l.kind === 'panel' && visible.has(l.id));
  const trail = stack.filter((l) => l.kind !== 'popover');

  // on a computer the page moves aside for the inspector
  const width = panel ? (panel.wide === 'xl' ? 'min(900px, 58vw)' : 'min(720px, 50vw)') : '0px';
  useLayoutEffect(() => {
    document.documentElement.style.setProperty('--inspector-w', desktop && panel ? width : '0px');
  }, [desktop, panel, width]);

  /** Close every layer above index i (top first). */
  const backTo = (i: number) => {
    const above = stackRef.current.slice(i + 1).reverse();
    for (const l of above) l.close();
  };

  const frameHead = (l: Layer, i: number) => {
    const steps = trail.filter((t) => stack.indexOf(t) <= i);
    return (
      <div className="sticky top-0 z-10 border-b border-line bg-surface px-3 py-2 sm:px-4">
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => l.close()} className="flex h-9 shrink-0 items-center gap-1 rounded-md px-2 text-sm text-muted hover:bg-surface-2 hover:text-ink" aria-label="Back">
            ← <span className="hidden sm:inline">Back</span>
          </button>
          <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm whitespace-nowrap" aria-label="Where you are">
            {steps.map((t, k) => {
              const last = k === steps.length - 1;
              return (
                <span key={t.id} className="flex items-center gap-1">
                  {k > 0 && <span className="text-faint">›</span>}
                  {last ? (
                    <span className="truncate font-bold">{t.title}</span>
                  ) : (
                    <button type="button" className="truncate text-muted hover:text-ink" onClick={() => backTo(stack.indexOf(t))}>
                      {t.title}
                    </button>
                  )}
                </span>
              );
            })}
          </nav>
          {stack.length > 1 && (
            <button type="button" onClick={() => backTo(-1)} className="shrink-0 px-2 text-xl leading-none text-muted hover:text-ink" aria-label="Close all" title="Close all">
              ×
            </button>
          )}
        </div>
        <Slot el={l.subtitle} className="mt-0.5 text-xs text-muted has-[>div:empty]:hidden" />
      </div>
    );
  };

  const frameBody = (l: Layer) => (
    <>
      <Slot el={l.body} className="p-3 sm:p-5" />
      <Slot el={l.footer} className="sticky bottom-0 flex justify-end gap-2 border-t border-line bg-surface px-4 py-3 has-[>div:empty]:hidden" />
    </>
  );

  return (
    <LayerContext.Provider value={host}>
      {children}
      {stack.map((l, i) => {
        const shown = visible.has(l.id);
        if (l.kind === 'page') {
          return (
            <div
              key={l.id}
              className={`fixed inset-x-0 bottom-0 z-40 overflow-auto bg-bg ${shown ? '' : 'hidden'}`}
              style={{ top: 'var(--header-h, 0px)', right: panel && desktop ? 'var(--inspector-w)' : 0 }}
            >
              <div className="mx-auto max-w-4xl">
                {frameHead(l, i)}
                {frameBody(l)}
              </div>
            </div>
          );
        }
        if (l.kind === 'popover') {
          const p = l.at ?? { x: window.innerWidth / 2, y: window.innerHeight / 3 };
          const w = Math.min(560, window.innerWidth - 16);
          const left = Math.max(8, Math.min(p.x - w / 2, window.innerWidth - w - 8));
          const below = p.y < window.innerHeight * 0.55;
          return (
            <div key={l.id} className={shown ? '' : 'hidden'}>
              {!desktop && <div className="fixed inset-0 z-[54]" style={{ background: 'var(--overlay)' }} onClick={() => l.close()} />}
              <div
                className={`fixed z-[55] overflow-auto border border-line bg-surface shadow-2xl ${desktop ? 'rounded-xl' : 'inset-x-0 bottom-0 max-h-[80dvh] rounded-t-xl'}`}
                style={desktop ? { left, width: w, maxHeight: '70vh', ...(below ? { top: p.y + 12 } : { bottom: window.innerHeight - p.y + 12 }) } : undefined}
              >
                <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-2">
                  <span className="truncate text-sm font-bold">{l.title}</span>
                  <button type="button" onClick={() => l.close()} className="text-xl leading-none text-muted hover:text-ink" aria-label="Close">
                    ×
                  </button>
                </div>
                <Slot el={l.subtitle} className="px-4 pt-2 text-xs text-muted has-[>div:empty]:hidden" />
                {frameBody(l)}
              </div>
            </div>
          );
        }
        // panel: the inspector on a computer, a sheet from the bottom on a phone
        return desktop ? (
          <aside
            key={l.id}
            className={`fixed right-0 bottom-0 z-40 overflow-auto border-l border-line bg-surface shadow-2xl ${shown ? '' : 'hidden'}`}
            style={{ top: 'var(--header-h, 0px)', width }}
          >
            {frameHead(l, i)}
            {frameBody(l)}
          </aside>
        ) : (
          <div key={l.id} className={shown ? '' : 'hidden'}>
            <div className="fixed inset-0 z-40" style={{ background: 'var(--overlay)' }} onClick={() => l.close()} />
            <div className="fixed inset-x-0 bottom-0 z-40 max-h-[90dvh] overflow-auto rounded-t-xl border-t border-line bg-surface shadow-2xl">
              <div className="mx-auto mt-1.5 h-1 w-10 rounded-full bg-surface-3" />
              {frameHead(l, i)}
              {frameBody(l)}
            </div>
          </div>
        );
      })}
    </LayerContext.Provider>
  );
}

let nextLayer = 1;

/** A layer: its content (and subtitle, footer) are portalled into the host's frame. */
export function LayerView({
  kind,
  title,
  subtitle,
  footer,
  wide = false,
  onClose,
  children,
}: {
  kind: LayerKind;
  title: string;
  subtitle?: ReactNode;
  footer?: ReactNode;
  wide?: boolean | 'xl';
  onClose: () => void;
  children: ReactNode;
}) {
  const host = useContext(LayerContext)!;
  const [els] = useState(() => {
    const footer = document.createElement('div');
    footer.style.display = 'contents'; // its buttons line up in the frame's footer bar
    return { body: document.createElement('div'), subtitle: document.createElement('div'), footer };
  });
  const [id] = useState(() => `layer-${nextLayer++}`);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    host.add({ id, kind, title, wide, ...els, close: () => closeRef.current(), at: lastPointer });
    return () => host.remove(id);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(() => host.retitle(id, title, wide), [title, wide]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <>
      {createPortal(children, els.body)}
      {subtitle !== undefined && createPortal(subtitle, els.subtitle)}
      {footer !== undefined && createPortal(footer, els.footer)}
    </>
  );
}

/** Inside a LayerHost (the app), or not (tests, a page on its own). */
export const useLayerHost = () => useContext(LayerContext);
