import { useEffect, useState } from "react";

// Drop-in useState that survives refresh/tab-close/network drops via
// localStorage -- built for the assistant chats and the New Campaign draft,
// where losing a half-researched conversation to a stray Cmd+R was a real
// reported failure. Storage errors (quota, blocked) degrade silently to
// plain in-memory state: the feature still works, it just stops persisting.
//
// NOTE: state does NOT re-initialize when `key` changes on a mounted
// component -- give the component a React `key` tied to the same value
// (e.g. the campaign id) so a context switch remounts it instead.
export function usePersistentState<T>(key: string, initial: T) {
  const [state, setState] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      // quota/blocked -- keep working unpersisted
    }
  }, [key, state]);

  return [state, setState] as const;
}

/** Hard-remove persisted keys (e.g. after a campaign is actually created). */
export function clearPersistentState(...keys: string[]) {
  for (const k of keys) {
    try {
      localStorage.removeItem(k);
    } catch {
      // ignore
    }
  }
}
