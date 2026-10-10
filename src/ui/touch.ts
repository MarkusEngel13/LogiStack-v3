import { useEffect, useState } from 'react';

/**
 * A touch screen (the phone): a finger that moves is scrolling, so nothing should change under
 * it. Grids paint only in an edit mode, sliders move only on a sideways drag.
 */
export function useTouchScreen(): boolean {
  const query = '(pointer: coarse)';
  const [touch, setTouch] = useState(() => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches);
  useEffect(() => {
    const m = window.matchMedia?.(query);
    if (!m) return;
    const on = () => setTouch(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return touch;
}
