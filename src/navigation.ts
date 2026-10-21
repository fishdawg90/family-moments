import { useEffect, useRef, useState } from 'react';
import type { ExploreMode } from './explore-data';

type View = 'capture' | 'recent' | 'settings' | 'explore';
export type AttachmentSource = 'audio' | null;
type Screen = {
  view: View;
  moment: string;
  delete: string;
  source: AttachmentSource;
  typing: boolean;
  date: boolean;
  exploreMode: ExploreMode | null;
  samples: boolean;
  profiles: boolean;
};
const initial: Screen = {
  view: 'capture',
  moment: '',
  delete: '',
  source: null,
  typing: false,
  date: false,
  exploreMode: null,
  samples: false,
  profiles: false,
};
const editable = (element: Element | null): element is HTMLElement =>
  element instanceof HTMLElement &&
  element.matches(
    'textarea, input:not([type=file]):not([type=checkbox]):not([type=radio]):not([type=button]):not([type=submit]), [contenteditable=true]',
  );

// Each open interaction gets a same-URL history entry. Native Back reaches that
// interaction's parent before it can leave the document. Draft data is independent.
export function useAppNavigation() {
  const [screen, setScreen] = useState<Screen>(initial);
  const current = useRef(initial);
  const depth = useRef(0);
  const owner = useRef(`family-moments:${location.pathname}`);
  const applying = useRef(false);
  const traversing = useRef(false);
  const apply = (next: Screen) => {
    current.current = next;
    setScreen(next);
    if (!next.typing && editable(document.activeElement)) {
      applying.current = true;
      document.activeElement.blur();
      applying.current = false;
    }
  };
  const write = (next: Screen, replace = false) => {
    const entry = {
      familyMoments: owner.current,
      depth: replace ? depth.current : ++depth.current,
      screen: next,
    };
    if (replace) history.replaceState(entry, '');
    else history.pushState(entry, '');
    apply(next);
  };
  const open = (patch: Partial<Screen>) => {
    const previous = current.current;
    const next = { ...previous, typing: false, ...patch };
    if (JSON.stringify(previous) === JSON.stringify(next)) return;
    // Moving from typing to another control reuses the keyboard's entry, so Back
    // closes the new control without unexpectedly reopening the keyboard.
    write(next, previous.typing);
  };
  const replace = (patch: Partial<Screen>) =>
    write({ ...current.current, typing: false, ...patch }, true);
  const back = () => {
    if (depth.current > 0 && !traversing.current) {
      traversing.current = true;
      history.back();
      return true;
    }
    return false;
  };
  const capture = () => {
    if (depth.current > 0) history.go(-depth.current);
    else replace(initial);
  };
  const dismiss = () => {
    if (current.current.typing && depth.current > 1 && !traversing.current) {
      traversing.current = true;
      history.go(-2);
    } else back();
  };
  useEffect(() => {
    const restoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';
    history.replaceState({ familyMoments: owner.current, depth: 0, screen: initial }, '');
    const pop = (event: PopStateEvent) => {
      traversing.current = false;
      if (event.state?.familyMoments !== owner.current) return;
      depth.current = event.state.depth;
      // Forward navigation restores the view but never summons the keyboard.
      apply({ ...event.state.screen, typing: false });
    };
    const focus = (event: FocusEvent) => {
      if (!applying.current && editable(event.target as Element) && !current.current.typing) {
        write({ ...current.current, typing: true });
      }
    };
    let blurTimer: ReturnType<typeof setTimeout>;
    const blur = (event: FocusEvent) => {
      if (applying.current || !editable(event.target as Element)) return;
      clearTimeout(blurTimer);
      blurTimer = setTimeout(() => {
        // Click handlers may have replaced typing with a menu or view by now.
        if (current.current.typing && !editable(document.activeElement)) back();
      }, 0);
    };
    const escape = (event: KeyboardEvent) => {
      const s = current.current;
      if (
        event.key === 'Escape' &&
        (s.typing ||
          s.source ||
          s.date ||
          s.profiles ||
          s.delete ||
          s.moment ||
          s.view !== 'capture')
      ) {
        event.preventDefault();
        back();
      }
    };
    window.addEventListener('popstate', pop);
    document.addEventListener('focusin', focus);
    document.addEventListener('focusout', blur);
    document.addEventListener('keydown', escape);
    return () => {
      history.scrollRestoration = restoration;
      clearTimeout(blurTimer);
      window.removeEventListener('popstate', pop);
      document.removeEventListener('focusin', focus);
      document.removeEventListener('focusout', blur);
      document.removeEventListener('keydown', escape);
    };
  }, []);
  return { screen, open, replace, back, capture, dismiss };
}
