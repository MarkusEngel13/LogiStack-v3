import { useEffect, useRef } from 'react';

/**
 * Leaving a screen with unsaved work. The screen says how to ask (its own Save · Discard ·
 * Cancel); whoever navigates calls leaveScreen(go): `go` runs at once when nothing is unsaved, or
 * after Save or Discard - never after Cancel.
 */
export type AskBeforeLeaving = (go: () => void) => void;

const guards: AskBeforeLeaving[] = [];

/** Leave the current screen: now, or once its question is answered with Save or Discard. */
export function leaveScreen(go: () => void) {
  const ask = guards.at(-1);
  if (ask) ask(go);
  else go();
}

/** True while a screen holds unsaved work. */
export const hasUnsavedWork = () => guards.length > 0;

/** Register a question (the latest one is asked); returns the way to take it back. */
export function addLeaveGuard(ask: AskBeforeLeaving): () => void {
  guards.push(ask);
  return () => {
    const i = guards.lastIndexOf(ask);
    if (i >= 0) guards.splice(i, 1);
  };
}

/**
 * For a screen with a draft: while `unsaved`, leaving through leaveScreen() calls `ask`, and
 * closing or reloading the tab gets the browser's "leave this page?" warning.
 */
export function useUnsavedGuard(unsaved: boolean, ask: AskBeforeLeaving) {
  const askRef = useRef(ask);
  askRef.current = ask;
  useEffect(() => {
    if (!unsaved) return;
    const remove = addLeaveGuard((go) => askRef.current(go));
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = ''; // older browsers warn only with this set
    };
    window.addEventListener('beforeunload', warn);
    return () => {
      remove();
      window.removeEventListener('beforeunload', warn);
    };
  }, [unsaved]);
}
