import { useEffect, useState } from 'react';
import type { SpotTags } from '../../core/advice/spot';
import type { AdviceAnswer, AdviceQuery } from '../../shared/api';

/** Answers by moment for this page's life: stepping back and forth through a hand asks once per moment. */
const cache = new Map<string, AdviceAnswer>();
const CACHE_MAX = 300;

/**
 * "Consider this" for a moment of a hand: the best fitting advice from the playbook the admin put
 * on the server (worker: POST /api/advice; as many pieces as the plan shows). Null while asking,
 * without a server (local only, offline) or when the server has nothing for this moment.
 */
export function useServerAdvice(tags: SpotTags | null): AdviceAnswer | null {
  const key = tags ? JSON.stringify(tags) : '';
  const [answer, setAnswer] = useState<AdviceAnswer | null>(() => cache.get(key) ?? null);
  useEffect(() => {
    if (!tags) return setAnswer(null);
    const hit = cache.get(key);
    if (hit) return setAnswer(hit);
    setAnswer(null);
    let live = true;
    // a short wait: stepping quickly through a hand asks only where you stop
    const timer = setTimeout(() => {
      const body: AdviceQuery = { tags };
      fetch('/api/advice', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(body) })
        .then((r) => (r.ok && (r.headers.get('content-type') ?? '').includes('application/json') ? (r.json() as Promise<AdviceAnswer>) : null))
        .then((a) => {
          if (!a || !Array.isArray(a.entries)) return;
          if (cache.size >= CACHE_MAX) cache.clear();
          cache.set(key, a);
          if (live) setAnswer(a);
        })
        .catch(() => {
          // offline or no server: no advice, the rest works as usual
        });
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  return answer;
}
