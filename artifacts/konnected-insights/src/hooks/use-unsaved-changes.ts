import { useCallback, useLayoutEffect, useRef } from "react";

const DISCARD_MESSAGE =
  "You have unsaved changes. OK discards them; Cancel keeps them.";
const STATE_KEY = "__konnectedUnsavedChangesHistory";
const MANAGER_KEY = "__konnectedUnsavedChangesManager";

type GuardRecord = {
  dirty: boolean;
  cleanUntilReset: boolean;
};

type IndexedState = {
  [STATE_KEY]?: {
    version: 1;
    index: number;
  };
};

type GuardManager = {
  records: Map<symbol, GuardRecord>;
  confirm: () => boolean;
};

function stateIndex(state: unknown): number | null {
  if (!state || typeof state !== "object") return null;
  const marker = (state as IndexedState)[STATE_KEY];
  return marker?.version === 1 && Number.isInteger(marker.index)
    ? marker.index
    : null;
}

function indexedState(state: unknown, index: number): unknown {
  const marker = { version: 1 as const, index };

  // History state in this app is a plain object (including ScrollToTop's
  // scrollPosition). Keep its shape intact so existing readers continue to work.
  if (
    state === null ||
    (typeof state === "object" &&
      (Object.getPrototypeOf(state) === Object.prototype ||
        Object.getPrototypeOf(state) === null))
  ) {
    return { ...(state as object | null), [STATE_KEY]: marker };
  }

  // pushState technically also accepts primitives and structured-clone objects.
  // Retain those values rather than silently throwing them away.
  return {
    __konnectedUnsavedChangesOriginalState: state,
    [STATE_KEY]: marker,
  };
}

function installGuard(): GuardManager {
  const existing = (
    window as typeof window & { [MANAGER_KEY]?: GuardManager }
  )[MANAGER_KEY];
  if (existing) return existing;

  const records = new Map<symbol, GuardRecord>();
  const confirm = () => {
    if (![...records.values()].some((record) => record.dirty)) return true;
    return window.confirm(DISCARD_MESSAGE);
  };
  const manager: GuardManager = { records, confirm };
  (
    window as typeof window & { [MANAGER_KEY]?: GuardManager }
  )[MANAGER_KEY] = manager;

  const nativePushState = window.history.pushState.bind(window.history);
  const nativeReplaceState = window.history.replaceState.bind(window.history);
  let currentIndex = stateIndex(window.history.state) ?? 0;
  let restoring = false;
  let approvedDestination: string | null = null;
  let approvedDocumentUnload = false;

  const absoluteUrl = (url?: string | URL | null) =>
    url == null ? window.location.href : new URL(url, window.location.href).href;

  // Index the entry before Wouter subscribes to popstate. Existing state fields
  // are copied, notably the scroll restoration data maintained by ScrollToTop.
  if (stateIndex(window.history.state) === null) {
    nativeReplaceState(
      indexedState(window.history.state, currentIndex),
      "",
      window.location.href,
    );
  }

  window.history.pushState = function pushState(
    state: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    const destination = absoluteUrl(url);
    const preapproved = approvedDestination === destination;
    approvedDestination = null;
    if (!preapproved && !confirm()) return;

    currentIndex += 1;
    nativePushState(indexedState(state, currentIndex), unused, url);
  };

  window.history.replaceState = function replaceState(
    state: unknown,
    unused: string,
    url?: string | URL | null,
  ) {
    const destination = absoluteUrl(url);
    // State-only replacements are used for scroll restoration and are not
    // navigation. They must never interrupt the user with a discard prompt.
    if (destination !== window.location.href) {
      const preapproved = approvedDestination === destination;
      approvedDestination = null;
      if (!preapproved && !confirm()) return;
    }
    nativeReplaceState(indexedState(state, currentIndex), unused, url);
  };

  window.addEventListener(
    "popstate",
    (event) => {
      if (restoring) {
        restoring = false;
        event.stopImmediatePropagation();
        return;
      }

      const targetIndex = stateIndex(event.state);
      const preapproved = approvedDestination === window.location.href;
      approvedDestination = null;
      if (preapproved || confirm()) {
        if (targetIndex !== null) currentIndex = targetIndex;
        return;
      }

      // Stop Wouter's earlier route from unmounting before putting the browser
      // back on the entry the user chose to keep.
      event.stopImmediatePropagation();
      restoring = true;
      if (targetIndex === null) {
        // An unindexed entry is normally the document entry immediately before
        // the app's first indexed entry.
        window.history.forward();
      } else {
        window.history.go(currentIndex - targetIndex);
      }
    },
    true,
  );

  document.addEventListener(
    "click",
    (event) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      ) {
        return;
      }

      const target = event.target;
      const anchor =
        target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
      if (
        !anchor ||
        anchor.hasAttribute("download") ||
        (anchor.target && anchor.target.toLowerCase() !== "_self")
      ) {
        return;
      }

      const destination = new URL(anchor.href, window.location.href);
      if (
        !["http:", "https:"].includes(destination.protocol) ||
        destination.href === window.location.href
      ) {
        return;
      }

      if (!confirm()) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      // A Wouter Link will call pushState later in this same dispatch. Native
      // same-document anchors can instead produce a popstate. Approve either
      // path once so a single user action never produces two dialogs.
      approvedDestination = destination.href;
      approvedDocumentUnload = true;
      window.setTimeout(() => {
        if (approvedDestination === destination.href) approvedDestination = null;
        approvedDocumentUnload = false;
      }, 0);
    },
    true,
  );

  window.addEventListener("beforeunload", (event) => {
    if (approvedDocumentUnload) {
      approvedDocumentUnload = false;
      return;
    }
    if (![...records.values()].some((record) => record.dirty)) return;
    event.preventDefault();
    event.returnValue = "";
  });

  return manager;
}

const manager =
  typeof window === "undefined"
    ? ({
        records: new Map<symbol, GuardRecord>(),
        confirm: () => true,
      } satisfies GuardManager)
    : installGuard();

export function confirmUnsavedChanges(): boolean {
  return manager.confirm();
}

export function useUnsavedChanges(dirty: boolean): {
  confirmDiscard: () => boolean;
  markClean: () => void;
} {
  const id = useRef(Symbol("unsaved-changes"));
  const record = useRef<GuardRecord>({ dirty: false, cleanUntilReset: false });

  useLayoutEffect(() => {
    if (!dirty) {
      record.current.cleanUntilReset = false;
      record.current.dirty = false;
    } else if (!record.current.cleanUntilReset) {
      record.current.dirty = true;
    }

    manager.records.set(id.current, record.current);
    return () => {
      manager.records.delete(id.current);
    };
  }, [dirty]);

  const confirmDiscard = useCallback(() => confirmUnsavedChanges(), []);
  const markClean = useCallback(() => {
    // This mutation is deliberately synchronous: a save handler can mark the
    // form clean and navigate in the same event without seeing a stale prompt.
    record.current.dirty = false;
    record.current.cleanUntilReset = true;
  }, []);

  return { confirmDiscard, markClean };
}