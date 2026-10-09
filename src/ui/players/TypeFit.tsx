import { useMemo, type ReactNode } from 'react';
import { classify, type TypeMatch } from '../../core/players/classify';
import type { StyleSettings } from '../../core/players/style';
import { playerTypeColor } from '../playerTypes';
import type { SavedProfile } from './store';

/** The classification of a style against the profiles (built-in types and yours). */
export const useTypeFit = (settings: StyleSettings, profiles: SavedProfile[]) => useMemo(() => classify(settings, profiles), [settings, profiles]);

const Name = ({ p }: { p: SavedProfile }) => (
  <span className="inline-flex items-center gap-1 font-semibold text-ink">
    <span className="inline-block h-2 w-2 rounded-full" style={{ background: playerTypeColor(p.settings.base) ?? 'transparent' }} />
    {p.name}
  </span>
);

/**
 * Which type a style fits, in a few words: "TAG · close: Reg", or a tie as a tie ("between TAG and
 * LAG"). `action` goes after it (a button to switch to it).
 */
export function TypeFit({ match, action }: { match: TypeMatch<SavedProfile>; action?: ReactNode }) {
  if (match.best.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
      {match.best.length > 1 ? (
        <>
          between{' '}
          {match.best.map((p, i) => (
            <span key={p.id}>
              {i > 0 && (i === match.best.length - 1 ? ' and ' : ', ')}
              <Name p={p} />
            </span>
          ))}
        </>
      ) : (
        <Name p={match.best[0]!} />
      )}
      {match.close && (
        <span className="text-faint">
          · close: <span className="text-muted">{match.close.name}</span>
        </span>
      )}
      {action}
    </span>
  );
}
