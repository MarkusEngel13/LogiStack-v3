import { useState } from 'react';
import type { HandRecord } from './core/hand/types';
import { Button } from './ui/controls';
import { HandsList } from './ui/HandsList';
import { downloadJson, saveHand } from './ui/library';
import { OptionsModal } from './ui/OptionsModal';
import { SettingsProvider } from './ui/settings';
import { HandWizard } from './ui/wizard/HandWizard';

type Page = 'new' | 'hands';

export default function App() {
  const [page, setPage] = useState<Page>('new');
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [created, setCreated] = useState<{ hand: HandRecord; saved: boolean } | null>(null);
  const [wizardKey, setWizardKey] = useState(0);

  return (
    <SettingsProvider>
      <div className="min-h-screen">
        <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-4 px-6 py-3">
            <div className="flex items-center gap-8">
              <span className="text-lg font-black tracking-tight">
                Logi<span className="text-accent">Stack</span>
              </span>
              <nav className="flex gap-1">
                {(
                  [
                    ['new', 'New hand'],
                    ['hands', 'Hands'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => {
                      setPage(id);
                      setCreated(null);
                    }}
                    className={`rounded-md px-3 py-1.5 text-sm ${page === id ? 'bg-surface-2 text-ink' : 'text-muted hover:text-ink'}`}
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

        {page === 'new' && !created && (
          <HandWizard key={wizardKey} onCreated={(hand) => setCreated({ hand, saved: saveHand(hand) })} />
        )}
        {page === 'new' && created && (
          <div className="mx-auto max-w-xl px-6 py-16 text-center">
            <h1 className="mb-2 text-2xl font-bold">Hand #{created.hand.handNo} created</h1>
            <p className="mb-8 text-muted">
              {created.saved ? 'Saved in this browser.' : 'Could not save in this browser (storage blocked) - export it to keep it.'} Entering
              the actions comes with the Lab, the next step.
            </p>
            <div className="flex justify-center gap-3">
              <Button variant="secondary" onClick={() => downloadJson(`hand-${created.hand.handNo}.json`, created.hand)}>
                Export JSON
              </Button>
              <Button
                variant="primary"
                onClick={() => {
                  setCreated(null);
                  setWizardKey((k) => k + 1);
                }}
              >
                New hand, same table
              </Button>
            </div>
          </div>
        )}
        {page === 'hands' && <HandsList />}

        {optionsOpen && <OptionsModal onClose={() => setOptionsOpen(false)} />}
      </div>
    </SettingsProvider>
  );
}
