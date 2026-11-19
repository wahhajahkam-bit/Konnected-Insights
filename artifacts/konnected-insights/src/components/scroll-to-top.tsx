import { useEffect } from 'react';

const HISTORY_SCROLL_KEY = '__konnectedScrollY';
const HISTORY_INDEX_KEY = '__konnectedHistoryIndex';
const SCROLL_STORAGE_PREFIX = 'konnected-scroll:';

function getScrollStorageKey(state: Record<string, unknown> | null) {
  const historyIndex = state?.[HISTORY_INDEX_KEY];
  if (typeof historyIndex === 'number') {
    return `${SCROLL_STORAGE_PREFIX}${historyIndex}`;
  }
  return `${SCROLL_STORAGE_PREFIX}${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function ScrollToTop() {
  useEffect(() => {
    let frame = 0;
    let timer = 0;
    let restoring = false;
    let route = window.location.pathname + window.location.search;
    const previousRestoration = window.history.scrollRestoration;
    const saveScrollPosition = () => {
      if (!restoring) {
        const state = (window.history.state ?? {}) as Record<string, unknown>;
        window.history.replaceState(
          { ...state, [HISTORY_SCROLL_KEY]: window.scrollY },
          '',
          window.location.href,
        );
        window.sessionStorage.setItem(getScrollStorageKey(state), String(window.scrollY));
      }
    };
    const navigate = (savedY?: number) => {
      route = window.location.pathname + window.location.search;
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      restoring = true;
      const hash = window.location.hash;
      const restore = () => {
        // History traversal keeps the reader's position, even on fragment entries.
        // New fragment navigation and reload instead honor the shared target.
        let target: HTMLElement | null = null;
        try {
          target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
        } catch {
          // Malformed fragments have no target.
        }
        if (savedY !== undefined) {
          window.scrollTo({ top: savedY, behavior: 'instant' });
        } else if (target) {
          // Instant restoration also respects reduced motion and CSS scroll margins.
          target.scrollIntoView({ block: 'start', behavior: 'instant' });
        } else {
          window.scrollTo({ top: 0, behavior: 'instant' });
        }
      };
      frame = window.requestAnimationFrame(() => {
        frame = window.requestAnimationFrame(restore);
      });
      timer = window.setTimeout(() => {
        restore();
        restoring = false;
        saveScrollPosition();
      }, 180);
    };
    const handlePopState = (event: PopStateEvent) => {
      const state = (event.state ?? null) as Record<string, unknown> | null;
      const stored = window.sessionStorage.getItem(getScrollStorageKey(state));
      const value = state?.[HISTORY_SCROLL_KEY] ?? (stored === null ? undefined : Number(stored));
      navigate(typeof value === 'number' && Number.isFinite(value) ? value : undefined);
    };
    const handlePushState = () => navigate();
    const handleReplaceState = () => {
      // Ignore position saves and the hero's locally handled fragment activation.
      if (route !== window.location.pathname + window.location.search) navigate();
    };

    window.history.scrollRestoration = 'manual';
    navigate();
    window.addEventListener('scroll', saveScrollPosition, { passive: true });
    window.addEventListener('popstate', handlePopState);
    window.addEventListener('pushState', handlePushState);
    window.addEventListener('replaceState', handleReplaceState);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timer);
      window.history.scrollRestoration = previousRestoration;
      window.removeEventListener('scroll', saveScrollPosition);
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('pushState', handlePushState);
      window.removeEventListener('replaceState', handleReplaceState);
    };
  }, []);

  return null;
}
