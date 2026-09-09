import type { Note } from "../types/note";

function subscribeToNoteLive(url: string, onNote: (note: Note) => void) {
  const source = new EventSource(url);
  source.onmessage = (event) => {
    try {
      onNote(JSON.parse(event.data) as Note);
    } catch {
      // Ignore malformed payloads; the next update will still arrive.
    }
  };
  return () => source.close();
}

const LIVE_QUIET_MS = 1200;

export function subscribeToNoteLiveDeferred(url: string, getLastLocalEditAt: () => number, apply: (note: Note) => void) {
  let pending: Note | null = null;
  let flushTimer: number | null = null;

  const clearFlushTimer = () => {
    if (flushTimer !== null) {
      window.clearTimeout(flushTimer);
      flushTimer = null;
    }
  };

  const flush = () => {
    const remaining = LIVE_QUIET_MS - (Date.now() - getLastLocalEditAt());
    if (remaining > 0) {
      flushTimer = window.setTimeout(flush, remaining);
      return;
    }
    const note = pending;
    pending = null;
    if (note) {
      apply(note);
    }
  };

  const unsubscribe = subscribeToNoteLive(url, (note) => {
    const remaining = LIVE_QUIET_MS - (Date.now() - getLastLocalEditAt());
    if (remaining > 0) {
      pending = note;
      clearFlushTimer();
      flushTimer = window.setTimeout(flush, remaining);
      return;
    }
    apply(note);
  });

  return () => {
    unsubscribe();
    clearFlushTimer();
  };
}
