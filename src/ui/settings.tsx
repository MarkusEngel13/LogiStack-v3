import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { AmountDisplay } from './format';

/** The four card designs from v2 (Settings → Deck & Cards there). */
export type CardFace = 'standard' | 'modernist' | 'royal' | 'hud';

/** Viewer preferences from the Options modal. Stored per browser. */
export interface Settings {
  theme: 'dark';
  amounts: AmountDisplay;
  /** true: show every known hole card; false: only Hero's (others until showdown). */
  showAllCards: boolean;
  cardFace: CardFace;
  /** Diamonds blue and clubs green; off: the usual red and black. */
  fourColor: boolean;
}

const DEFAULTS: Settings = { theme: 'dark', amounts: 'currency', showAllCards: true, cardFace: 'standard', fourColor: true };
const KEY = 'logistack.settings.v1';

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<Settings>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

const SettingsContext = createContext<{ settings: Settings; update: (patch: Partial<Settings>) => void }>({
  settings: DEFAULTS,
  update: () => {},
});

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<Settings>(load);

  useEffect(() => {
    document.documentElement.dataset.theme = settings.theme;
    try {
      localStorage.setItem(KEY, JSON.stringify(settings));
    } catch {
      // private mode or storage blocked: settings just don't persist
    }
  }, [settings]);

  return (
    <SettingsContext.Provider value={{ settings, update: (patch) => setSettings((s) => ({ ...s, ...patch })) }}>
      {children}
    </SettingsContext.Provider>
  );
}

export const useSettings = () => useContext(SettingsContext);
