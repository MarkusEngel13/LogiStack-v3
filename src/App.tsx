import { lazy, Suspense, useState } from 'react';
import type { HandRecord } from './core/hand/types';
import { Button } from './ui/controls';
import { HomePage, MODULES, type ModuleId } from './ui/home/HomePage';
import { nextHandNo, saveHand } from './ui/library';
import { OptionsModal } from './ui/OptionsModal';
import { leaveScreen } from './ui/ranges/unsavedGuard';
import { AccountBadge } from './ui/sync/AccountBadge';
import { SettingsProvider } from './ui/settings';
import { ToastProvider } from './ui/toast';
import { HandWizard } from './ui/wizard/HandWizard';

// modules load when first opened (the start page and the wizard stay in the main file)
const RangesPage = lazy(() => import('./ui/ranges/RangesPage').then((m) => ({ default: m.RangesPage })));
const EquityPage = lazy(() => import('./ui/equity/EquityPage').then((m) => ({ default: m.EquityPage })));
const PlayersPage = lazy(() => import('./ui/players/PlayersPage').then((m) => ({ default: m.PlayersPage })));
const HandScreen = lazy(() => import('./ui/replay/HandScreen').then((m) => ({ default: m.HandScreen })));
const LivePage = lazy(() => import('./ui/live/LivePage').then((m) => ({ default: m.LivePage })));
const HandsList = lazy(() => import('./ui/HandsList').then((m) => ({ default: m.HandsList })));
const GymPage = lazy(() => import('./ui/gym/GymPage').then((m) => ({ default: m.GymPage })));

/** The start page, a module, or two screens inside the Lab: a new hand and one open hand. */
type Page = 'home' | ModuleId | 'new' | 'hand';

/** Playing at a table: the bots play everyone but you (the Lab's switch, remembered there). */
function botsPlayTheOthers() {
  try {
    localStorage.setItem('logistack.autoBots', '1');
  } catch {
    // storage blocked: switch "Bots play the others" on in the Lab
  }
}

export default function App() {
  const [page, setPageNow] = useState<Page>('home');
  // every move to another screen asks first when the current one holds unsaved work (a range)
  const setPage = (p: Page) => leaveScreen(() => setPageNow(p));
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [wizardKey, setWizardKey] = useState(0);
  const [open, setOpen] = useState<{ hand: HandRecord; editable: boolean; from: ModuleId } | null>(null);

  /** A hand opens in the Lab's hand screen; "back" returns to the module it came from. */
  const openHand = (hand: HandRecord, editable: boolean, from: ModuleId = 'lab') => {
    setOpen({ hand, editable, from });
    setPage('hand');
  };

  const newHand = () => {
    setWizardKey((k) => k + 1);
    setPage('new');
  };

  const editCopy = (hand: HandRecord) => {
    const copy: HandRecord = {
      ...hand,
      id: crypto.randomUUID(),
      handNo: nextHandNo(),
      createdAt: new Date().toISOString(),
      title: `${hand.title ?? 'Hand'} (copy)`,
    };
    saveHand(copy);
    openHand(copy, true, open?.from ?? 'lab');
  };

  // the module a screen belongs to, for the menu's highlight
  const current: ModuleId | null = page === 'home' ? null : page === 'new' ? 'lab' : page === 'hand' ? (open?.from ?? 'lab') : page;

  const nav = (
    <>
      {MODULES.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => setPage(m.id)}
          className={`shrink-0 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap sm:px-3 ${current === m.id ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'}`}
        >
          {m.name}
        </button>
      ))}
    </>
  );

  return (
    <SettingsProvider>
      <ToastProvider>
      <div className="min-h-screen">
        <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
          {/* a computer: one row; a phone: the logo, account and options on top, the modules wrapping under them */}
          <div className="mx-auto max-w-[1500px] px-3 py-2 sm:px-6 sm:py-3">
            <div className="flex items-center justify-between gap-2 sm:gap-4">
              <div className="flex min-w-0 items-center gap-3 sm:gap-8">
                <button type="button" onClick={() => setPage('home')} className="shrink-0 text-lg font-black tracking-tight" title="Start page">
                  Logi<span className="text-accent">Stack</span>
                </button>
                <nav className="hidden min-w-0 flex-wrap gap-1 sm:flex">{nav}</nav>
              </div>
              <div className="flex shrink-0 items-center gap-1">
                <AccountBadge />
                <Button variant="ghost" onClick={() => setOptionsOpen(true)} title="Options" className="shrink-0 !px-2.5 sm:!px-3.5">
                  ⚙<span className="hidden sm:inline"> Options</span>
                </Button>
              </div>
            </div>
            <nav className="-mx-1 mt-1 flex flex-wrap gap-0.5 sm:hidden">{nav}</nav>
          </div>
        </header>

        <Suspense fallback={<div className="px-6 py-10 text-sm text-muted">Loading…</div>}>
          {page === 'home' && <HomePage onOpen={setPage} />}
          {page === 'new' && (
            <HandWizard
              key={wizardKey}
              onCreated={(hand) => {
                saveHand(hand);
                openHand(hand, true); // straight into the Lab to enter the actions
              }}
            />
          )}
          {page === 'live' && <LivePage onOpenHand={(h) => openHand(h, true, 'live')} />}
          {page === 'lab' && <HandsList onOpen={(h, editable) => openHand(h, editable)} onNew={newHand} />}
          {page === 'gym' && (
            <GymPage
              onStart={(hand, mode) => {
                if (mode === 'play') botsPlayTheOthers();
                saveHand(hand);
                openHand(hand, true, 'gym');
              }}
              onOpen={(hand) => openHand(hand, true, 'gym')}
            />
          )}
          {page === 'players' && (
            <PlayersPage
              onOpenHand={(hand, mode) => {
                if (mode === 'play') botsPlayTheOthers();
                saveHand(hand);
                openHand(hand, true, 'players');
              }}
            />
          )}
          {page === 'ranges' && <RangesPage />}
          {page === 'equity' && <EquityPage />}
          {page === 'hand' && open && (
            <HandScreen
              key={`${open.hand.id}-${open.editable}`}
              initial={open.hand}
              editable={open.editable}
              onBack={() => setPage(open.from)}
              backLabel={MODULES.find((m) => m.id === open.from)?.name}
              onNewHand={newHand}
              onNextHand={(next) => {
                saveHand(next);
                openHand(next, true, open.from);
              }}
              onEditCopy={editCopy}
            />
          )}
        </Suspense>

        {optionsOpen && <OptionsModal onClose={() => setOptionsOpen(false)} />}
      </div>
      </ToastProvider>
    </SettingsProvider>
  );
}
