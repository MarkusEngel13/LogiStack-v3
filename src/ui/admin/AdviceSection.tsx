import { useEffect, useMemo, useRef, useState } from 'react';
import { serverAdvice } from '../../core/advice/playbook';
import type { AdviceBook } from '../../shared/api';
import { LIMITS } from '../../shared/plans';
import { uploadAdvice } from '../advice/upload';
import { usePlaybook } from '../advice/usePlaybook';
import { Button, Section } from '../controls';
import { errorText, request } from '../sync/request';
import { useToast } from '../toast';
import { SubHeading } from './parts';
import { ago, dayOf } from './users';

const n = (x: number) => x.toLocaleString();

/**
 * "Consider this" for users: what is on the server (by book), and putting the playbook loaded in
 * this browser up there. Only our own words go up (serverAdvice); the coaches' words, names and
 * videos stay here.
 */
export function AdviceSection() {
  const { playbook, load } = usePlaybook();
  const toast = useToast();
  const [books, setBooks] = useState<AdviceBook[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; of: number } | null>(null);
  const [removing, setRemoving] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const now = Date.now();

  const loadBooks = () =>
    request<{ books?: AdviceBook[] }>('GET', 'admin/advice')
      .then((b) => {
        if (!Array.isArray(b.books)) throw new Error('The server sent no list of advice.');
        setBooks(b.books);
      })
      .catch((e: unknown) => setError(errorText(e)));
  useEffect(() => void loadBooks(), []);

  const goingUp = useMemo(() => (playbook ? serverAdvice(playbook).length : 0), [playbook]);
  const replaces = playbook ? books?.find((b) => b.book === (playbook.name || 'Playbook')) : undefined;

  const upload = async () => {
    if (!playbook) return;
    setError(null);
    setProgress({ done: 0, of: 1 });
    try {
      const count = await uploadAdvice(playbook, (done, of) => setProgress({ done, of }));
      toast({ text: `${n(count)} pieces of advice are on the server` });
      await loadBooks();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setProgress(null);
    }
  };

  const remove = async (book: string) => {
    setError(null);
    try {
      await request('DELETE', `admin/advice/${encodeURIComponent(book)}`);
      setBooks((bs) => bs?.filter((b) => b.book !== book) ?? null);
      toast({ text: `“${book}” is off the server` });
    } catch (e) {
      setError(errorText(e));
    } finally {
      setRemoving(null);
    }
  };

  const built = playbook?.built && Number.isFinite(Date.parse(playbook.built)) ? dayOf(playbook.built) : null;

  return (
    <Section title="Advice for users">
      <p className="text-sm text-muted">
        Users see it as <b className="text-ink">“Consider this”</b> at each moment of a hand: Free {LIMITS.free.advicePerSpot} piece per moment, Premium and Pro {LIMITS.premium.advicePerSpot}.
      </p>

      <div className="mt-5">
        <SubHeading>On the server</SubHeading>
        {books === null ? (
          !error && <p className="text-sm text-muted">Loading…</p>
        ) : books.length === 0 ? (
          <p className="rounded-md border border-dashed border-line px-3 py-3 text-sm text-muted">Nothing yet: users see no “Consider this” until you upload.</p>
        ) : (
          <ul className="space-y-2">
            {books.map((b) => (
              <li key={b.book} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-md border border-line bg-surface-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="truncate font-semibold">{b.book}</div>
                  <div className="text-xs text-muted">
                    {n(b.entries)} pieces · updated {ago(b.updatedAt, now)}
                  </div>
                </div>
                {removing === b.book ? (
                  <div className="flex shrink-0 gap-1.5">
                    <Button variant="ghost" className="!px-2.5 !py-1 text-xs" onClick={() => setRemoving(null)}>
                      Keep
                    </Button>
                    <Button variant="danger" className="!border-danger !px-2.5 !py-1 text-xs font-semibold" onClick={() => void remove(b.book)}>
                      Remove for good
                    </Button>
                  </div>
                ) : (
                  <Button variant="ghost" className="shrink-0 !px-2.5 !py-1 text-xs" onClick={() => setRemoving(b.book)}>
                    Remove
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-5">
        <SubHeading>Upload</SubHeading>
        <input
          ref={file}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={async (ev) => {
            const f = ev.target.files?.[0];
            ev.target.value = '';
            if (!f) return;
            try {
              setError(null);
              await load(f);
            } catch (e) {
              setError(errorText(e));
            }
          }}
        />
        {playbook === undefined ? (
          <p className="text-sm text-muted">Looking for a playbook in this browser…</p>
        ) : playbook === null ? (
          <div className="rounded-md border border-dashed border-line px-3 py-3 text-sm text-muted">
            <p>No playbook in this browser. Load it in the Lab first (open a hand: the Advice panel), or pick the file here.</p>
            <Button className="mt-2.5" onClick={() => file.current?.click()}>
              Load a playbook file…
            </Button>
          </div>
        ) : (
          <div className="rounded-md border border-line bg-surface-2 px-3 py-3">
            <div className="font-semibold">{playbook.name || 'Playbook'}</div>
            <div className="text-xs text-muted">
              Loaded in this browser{built && `, built ${built}`}: {n(playbook.entries.length)} entries, <b className="text-ink">{n(goingUp)}</b> of them go up.
            </div>
            {replaces && (
              <div className="mt-1 text-xs text-warn">
                Replaces “{replaces.book}” on the server ({n(replaces.entries)} pieces).
              </div>
            )}
            {progress ? (
              <div className="mt-3" role="status">
                <div className="h-2 overflow-hidden rounded-full bg-accent/15">
                  <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(progress.done / progress.of) * 100}%` }} />
                </div>
                <div className="mt-1 text-xs text-muted">
                  Uploading… part {Math.min(progress.done + 1, progress.of)} of {progress.of}
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <Button variant="primary" disabled={!goingUp} onClick={() => void upload()}>
                  Upload the loaded playbook
                </Button>
                <button type="button" className="px-1 text-xs text-muted hover:text-ink" onClick={() => file.current?.click()}>
                  Load another file…
                </button>
              </div>
            )}
          </div>
        )}
        <p className="mt-3 text-xs text-faint">Only the advice in our own words goes up, with the moments it fits. The coaches’ words, names and videos stay in this browser.</p>
      </div>
      {error && <p className="mt-3 text-sm text-danger">{error}</p>}
    </Section>
  );
}
