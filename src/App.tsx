import { lazy, Suspense, useState } from 'react';
import type { HandRecord } from './core/hand/types';
import { Button } from './ui/controls';
import { nextHandNo, saveHand } from './ui/library';
import { OptionsModal } from './ui/OptionsModal';
import { AccountBadge } from './ui/sync/AccountBadge';
import { SettingsProvider } from './ui/settings';
import { HandWizard } from './ui/wizard/HandWizard';
import { toHandRecord } from './ui/wizard/draft';
import { watchDraft } from './ui/wizard/watchTable';

// pages load when first opened (the first screen, the wizard, stays in the main file)
const RangesPage = lazy(() => import('./ui/ranges/RangesPage').then((m) => ({ default: m.RangesPage })));
const EquityPage = lazy(() => import('./ui/equity/EquityPage').then((m) => ({ default: m.EquityPage })));
const PlayersPage = lazy(() => import('./ui/players/PlayersPage').then((m) => ({ default: m.PlayersPage })));
const HandScreen = lazy(() => import('./ui/replay/HandScreen').then((m) => ({ default: m.HandScreen })));
const LivePage = lazy(() => import('./ui/live/LivePage').then((m) => ({ default: m.LivePage })));
const HandsList = lazy(() => import('./ui/HandsList').then((m) => ({ default: m.HandsList })));
type Page = 'live' | 'new' | 'hands' | 'hand' | 'ranges' | 'equity' | 'players';

/** On a phone the app opens on the live table; on a computer on a new hand. */
const firstPage = (): Page => (typeof window !== 'undefined' && window.innerWidth < 640 ? 'live' : 'new');

export default function App() {
  const [page, setPage] = useState<Page>(firstPage);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [wizardKey, setWizardKey] = useState(0);
  const [open, setOpen] = useState<{ hand: HandRecord; editable: boolean } | null>(null);

  const openHand = (hand: HandRecord, editable: boolean) => {
    setOpen({ hand, editable });
    setPage('hand');
  };

  const newHand = () => {
    setWizardKey((k) => k + 1);
    setPage('new');
  };

  /** The gym's watch table: bots on every seat, dealing hand after hand. */
  const watchBots = () => {
    const hand: HandRecord = {
      ...toHandRecord(watchDraft(), { id: crypto.randomUUID(), createdAt: new Date().toISOString(), handNo: nextHandNo() }),
      watch: {},
    };
    saveHand(hand);
    openHand(hand, true);
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
    openHand(copy, true);
  };

  return (
    <SettingsProvider>
      <div className="min-h-screen">
        <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
          <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-2 px-3 py-2 sm:gap-4 sm:px-6 sm:py-3">
            <div className="flex min-w-0 items-center gap-3 sm:gap-8">
              <span className="hidden text-lg font-black tracking-tight sm:inline">
                Logi<span className="text-accent">Stack</span>
              </span>
              <nav className="-mx-1 flex min-w-0 gap-0.5 overflow-x-auto px-1 sm:gap-1">
                {(
                  [
                    ['live', 'Live'],
                    ['new', 'New hand'],
                    ['hands', 'Hands'],
                    ['players', 'Players'],
                    ['ranges', 'Ranges'],
                    ['equity', 'EQ'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => (id === 'new' ? newHand() : setPage(id))}
                    className={`shrink-0 rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap sm:px-3 ${
                      page === id || (page === 'hand' && id === 'hands') ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {id === 'new' ? (
                      <>
                        <span className="sm:hidden">New</span>
                        <span className="hidden sm:inline">New hand</span>
                      </>
                    ) : (
                      label
                    )}
                  </button>
                ))}
              </nav>
            </div>
            <div className="flex shrink-0 items-center gap-1">
              <AccountBadge />
              <Button variant="ghost" onClick={() => setOptionsOpen(true)} title="Options" className="shrink-0 !px-2.5 sm:!px-3.5">
                ⚙<span className="hidden sm:inline"> Options</span>
              </Button>
            </div>
          </div>
        </header>

        <Suspense fallback={<div className="px-6 py-10 text-sm text-muted">Loading…</div>}>
        {page === 'new' && (
          <HandWizard
            key={wizardKey}
            onCreated={(hand) => {
              saveHand(hand);
              openHand(hand, true); // straight into the Lab to enter the actions
            }}
          />
        )}
        {page === 'live' && <LivePage onOpenHand={(h) => openHand(h, true)} />}
        {page === 'hands' && <HandsList onOpen={openHand} onWatch={watchBots} />}
        {page === 'players' && (
          <PlayersPage
            onOpenHand={(hand, mode) => {
              // playing: the bots play everyone but you (the Lab's switch, remembered there)
              if (mode === 'play') {
                try {
                  localStorage.setItem('logistack.autoBots', '1');
                } catch {
                  // storage blocked: switch "Bots play the others" on in the Lab
                }
              }
              saveHand(hand);
              openHand(hand, true);
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
            onBack={() => setPage('hands')}
            onNewHand={newHand}
            onNextHand={(next) => {
              saveHand(next);
              openHand(next, true);
            }}
            onEditCopy={editCopy}
          />
        )}

        </Suspense>

        {optionsOpen && <OptionsModal onClose={() => setOptionsOpen(false)} />}
      </div>
    </SettingsProvider>
  );
}
