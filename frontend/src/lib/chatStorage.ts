import { contextKey, type ChatContext, type ChatTurn } from "./paperChat";
import type { Thread } from "./usePaperChat";

// Conversations live in this browser only, so a self-hosted install needs no
// extra service. They are keyed by user and cleared on logout.
const PREFIX = "paper.chat.v1.";
const MAX_THREADS = 30;
const MAX_TURNS = 40;
const MAX_TEXT = 20000;
const SCOPES = ["note", "selection", "all"];
const STATUSES = ["ready", "error", "cancelled"];

const storageKey = (userId: string) => PREFIX + userId;

function sanitizeTurn(turn: ChatTurn): ChatTurn | null {
  if (!STATUSES.includes(turn.status)) return null; // drop in-flight turns
  const { snapshot: _snapshot, selection: _selection, ...rest } = turn;
  return {
    ...rest,
    text: turn.text.slice(0, MAX_TEXT),
    question: turn.question.slice(0, MAX_TEXT),
  };
}

function sanitizeThread(thread: Thread): Thread | null {
  const turns = thread.turns
    .map(sanitizeTurn)
    .filter((turn): turn is ChatTurn => !!turn)
    .slice(-MAX_TURNS);
  if (turns.length === 0) return null;
  let context: ChatContext = { ...thread.context };
  // A selection is tied to the note text at that moment; keep only the note.
  if (context.scope === "selection") {
    context = {
      scope: "note",
      noteId: context.noteId,
      noteIds: context.noteIds,
    };
  }
  return {
    ...thread,
    context,
    ctxKey: contextKey(context),
    turns,
    action: undefined,
    draft: thread.draft.slice(0, 8000),
  };
}

export function saveThreads(userId: string, threads: Thread[]) {
  let kept = threads
    .map(sanitizeThread)
    .filter((thread): thread is Thread => !!thread)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_THREADS);
  try {
    if (kept.length === 0) {
      localStorage.removeItem(storageKey(userId));
      return;
    }
    // On quota errors, shed the oldest conversations and retry.
    for (let attempt = 0; attempt < 4 && kept.length; attempt++) {
      try {
        localStorage.setItem(
          storageKey(userId),
          JSON.stringify({ v: 1, threads: kept }),
        );
        return;
      } catch {
        kept = kept.slice(0, Math.floor(kept.length / 2));
      }
    }
  } catch {
    // Storage unavailable (private mode, blocked): history is just not kept.
  }
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export function loadThreads(userId: string): Thread[] {
  try {
    const raw = localStorage.getItem(storageKey(userId));
    const data: unknown = raw && JSON.parse(raw);
    if (!isObject(data) || data.v !== 1 || !Array.isArray(data.threads))
      return [];
    const threads: Thread[] = [];
    for (const item of data.threads) {
      if (
        !isObject(item) ||
        typeof item.id !== "string" ||
        !isObject(item.context) ||
        !SCOPES.includes(item.context.scope as string) ||
        !Array.isArray(item.turns)
      )
        continue;
      const turns = item.turns.filter(
        (turn): turn is ChatTurn =>
          isObject(turn) &&
          typeof turn.id === "string" &&
          typeof turn.question === "string" &&
          typeof turn.text === "string" &&
          STATUSES.includes(turn.status as string) &&
          Array.isArray(turn.sourceIds),
      );
      if (turns.length === 0) continue;
      const context = item.context as unknown as ChatContext;
      threads.push({
        id: item.id,
        ctxKey: contextKey(context),
        context,
        turns,
        title:
          typeof item.title === "string" ? item.title.slice(0, 80) : undefined,
        draft: typeof item.draft === "string" ? item.draft : "",
        updatedAt: typeof item.updatedAt === "number" ? item.updatedAt : 0,
      });
    }
    return threads;
  } catch {
    return [];
  }
}

export function clearThreads(userId: string) {
  try {
    localStorage.removeItem(storageKey(userId));
  } catch {
    // ignore
  }
}
