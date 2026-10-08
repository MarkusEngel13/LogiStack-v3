import { useState } from 'react';
import type { HandRecord } from './core/hand/types';
import { Button } from './ui/controls';
import { HandsList } from './ui/HandsList';
import { nextHandNo, saveHand } from './ui/library';
import { OptionsModal } from './ui/OptionsModal';
import { RangesPage } from './ui/ranges/RangesPage';
import { EquityPage } from './ui/equity/EquityPage';
import { PlayersPage } from './ui/players/PlayersPage';
import { HandScreen } from './ui/replay/HandScreen';
import { SettingsProvider } from './ui/settings';
import { HandWizard } from './ui/wizard/HandWizard';
import { toHandRecord } from './ui/wizard/draft';
import { watchDraft } from './ui/wizard/watchTable';

type Page = 'new' | 'hands' | 'hand' | 'ranges' | 'equity' | 'players';

export default function App() {
  const [page, setPage] = useState<Page>('new');
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
          <div className="mx-auto flex max-w-[1500px] items-center justify-between gap-4 px-6 py-3">
            <div className="flex items-center gap-8">
              <span className="text-lg font-black tracking-tight">
                Logi<span className="text-accent">Stack</span>
              </span>
              <nav className="flex gap-1">
                {(
                  [
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
                    className={`rounded-md px-3 py-1.5 text-sm ${
                      page === id || (page === 'hand' && id === 'hands') ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </nav>
            </div>
            <Button variant="ghost" onClick={() => setOptionsOpen(true)} title="Options">
              ⚙ Options
            </Button>
          </div>
        </header>

        {page === 'new' && (
          <HandWizard
            key={wizardKey}
            onCreated={(hand) => {
              saveHand(hand);
              openHand(hand, true); // straight into the Lab to enter the actions
            }}
          />
        )}
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

        {optionsOpen && <OptionsModal onClose={() => setOptionsOpen(false)} />}
      </div>
    </SettingsProvider>
  );
}
