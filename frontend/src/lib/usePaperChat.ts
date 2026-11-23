import { useCallback, useEffect, useRef, useState } from "react";
import { chatWithPaper, titleChat } from "./api";
import { loadThreads, saveThreads } from "./chatStorage";
import {
  chatHistory,
  contextKey,
  MAX_CHAT_NOTES,
  type ChatContext,
  type ChatTurn,
} from "./paperChat";
import type { AIAction, Note } from "../types/note";

export type Thread = {
  id: string;
  /** Identifies the context (scope, note, selection); several threads can share it. */
  ctxKey: string;
  context: ChatContext;
  turns: ChatTurn[];
  /** Short name written by the assistant after the first answer. */
  title?: string;
  action?: AIAction;
  draft: string;
  updatedAt: number;
};
type State = {
  open: boolean;
  key: string;
  threads: Record<string, Thread>;
  unread: boolean;
};
const MAX_THREADS = 50;
function blank(
  id: string,
  context: ChatContext,
  updatedAt = Date.now(),
): Thread {
  return {
    id,
    ctxKey: contextKey(context),
    context,
    turns: [],
    draft: "",
    updatedAt,
  };
}
function newest(threads: Thread[]) {
  return threads.reduce<Thread | undefined>(
    (best, item) => (!best || item.updatedAt >= best.updatedAt ? item : best),
    undefined,
  );
}
/** Conversations worth listing: the ones that have at least one turn, newest first. */
export function chatHistoryList(threads: Record<string, Thread>) {
  return Object.values(threads)
    .filter((item) => item.turns.length > 0)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}
export function threadTitle(thread: Thread) {
  if (thread.title) return thread.title;
  const question = thread.turns[0]?.question.trim().replace(/\s+/g, " ");
  if (!question) return "New conversation";
  return question.length > 40
    ? question.slice(0, 40).trimEnd() + "…"
    : question;
}
function initialState(userId?: string): State {
  const threads: Record<string, Thread> = {};
  for (const item of userId ? loadThreads(userId) : []) threads[item.id] = item;
  // An empty placeholder that never outranks a restored conversation.
  threads.all ??= blank("all", { scope: "all" }, 0);
  return { open: false, key: "all", threads, unread: false };
}

export function usePaperChat(notes: Note[], userId?: string) {
  const [state, setState] = useState<State>(() => initialState(userId));
  const latest = useRef(state);
  useEffect(() => {
    if (!userId) return;
    const timer = setTimeout(
      () => saveThreads(userId, Object.values(state.threads)),
      400,
    );
    return () => clearTimeout(timer);
  }, [state.threads, userId]);
  const notesRef = useRef(notes);
  notesRef.current = notes;
  const requests = useRef(new Map<string, AbortController>());
  const update = useCallback((fn: (value: State) => State) => {
    latest.current = fn(latest.current);
    setState(latest.current);
  }, []);
  useEffect(
    () => () => {
      for (const controller of requests.current.values()) controller.abort();
      requests.current.clear();
    },
    [],
  );
  const updateThread = useCallback(
    (key: string, fn: (thread: Thread) => Thread) =>
      update((current) => ({
        ...current,
        threads: { ...current.threads, [key]: fn(current.threads[key]) },
      })),
    [update],
  );
  const show = useCallback(
    (context?: ChatContext) => {
      if (!context) {
        update((s) => ({ ...s, open: true, unread: false }));
        return latest.current.key;
      }
      const ctxKey = contextKey(context);
      const existing = newest(
        Object.values(latest.current.threads).filter(
          (item) => item.ctxKey === ctxKey,
        ),
      );
      const key = existing?.id ?? ctxKey;
      update((s) => ({
        ...s,
        open: true,
        unread: false,
        key,
        threads: {
          ...s.threads,
          [key]: existing
            ? {
                ...existing,
                context: {
                  ...context,
                  noteIds: context.noteIds ?? existing.context.noteIds,
                },
              }
            : blank(key, context),
        },
      }));
      return key;
    },
    [update],
  );
  const cancel = useCallback(
    (key = latest.current.key) => {
      requests.current.get(key)?.abort();
      requests.current.delete(key);
      updateThread(key, (t) => ({
        ...t,
        draft:
          t.draft ||
          t.turns.find((turn) => turn.status === "loading")?.question ||
          "",
        turns: t.turns.map((turn) =>
          turn.status === "loading" ? { ...turn, status: "cancelled" } : turn,
        ),
      }));
    },
    [updateThread],
  );
  const send = useCallback(
    async (question: string, action?: AIAction, context?: ChatContext) => {
      question = question.trim();
      if (!question) return;
      const key = context ? show(context) : latest.current.key;
      if (requests.current.has(key)) return;
      const thread = latest.current.threads[key];
      const note = notesRef.current.find((n) => n.id === thread.context.noteId);
      const snapshot = note
        ? {
            id: note.id,
            title: note.title,
            content: note.content,
            tags: [...note.tags],
          }
        : undefined;
      const selection = thread.context.selection;
      const chosenAction = action ?? thread.action;
      const turn: ChatTurn = {
        id: crypto.randomUUID(),
        question,
        text: "",
        status: "loading",
        sourceIds: [],
        snapshot,
        selection,
        action: chosenAction,
      };
      updateThread(key, (t) => ({
        ...t,
        draft: "",
        action: chosenAction,
        turns: [...t.turns, turn],
        updatedAt: Date.now(),
      }));
      const controller = new AbortController();
      requests.current.set(key, controller);
      try {
        if (thread.context.scope !== "all" && !note)
          throw new Error("This note is no longer available.");
        if (selection && note?.content !== selection.content)
          throw new Error(
            "The selection changed. Select the passage again to continue.",
          );
        if (new TextEncoder().encode(question).length > 8000)
          throw new Error("Please keep your message shorter.");
        const response = await chatWithPaper(
          {
            scope: thread.context.scope,
            noteId: note?.id,
            noteIds: thread.context.noteIds?.length
              ? thread.context.noteIds
              : undefined,
            draft: snapshot && {
              title: snapshot.title,
              content: selection?.text ?? snapshot.content,
              tags: snapshot.tags,
            },
            selection: selection?.text,
            action: chosenAction,
            messages: [
              ...chatHistory(thread.turns),
              { role: "user", content: question },
            ],
          },
          controller.signal,
        );
        if (requests.current.get(key) !== controller) return;
        updateThread(key, (t) => ({
          ...t,
          turns: t.turns.map((item) =>
            item.id === turn.id
              ? {
                  ...item,
                  status: "ready",
                  text: response.text,
                  sourceIds: response.sourceIds ?? [],
                }
              : item,
          ),
        }));
        update((s) => ({ ...s, unread: s.unread || !s.open || s.key !== key }));
        if (thread.turns.length === 0 && !thread.title) {
          // Best effort: the question itself stays the title if this fails.
          void Promise.resolve()
            .then(() => titleChat({ question, answer: response.text }))
            .then(({ title }) => {
              if (!title || !latest.current.threads[key]) return;
              updateThread(key, (t) => ({ ...t, title }));
            })
            .catch(() => {});
        }
      } catch (error) {
        if (requests.current.get(key) !== controller) return;
        updateThread(key, (t) => ({
          ...t,
          draft: t.draft || question,
          turns: t.turns.map((item) =>
            item.id === turn.id
              ? {
                  ...item,
                  status: "error",
                  error:
                    error instanceof Error
                      ? error.message
                      : "The assistant could not respond.",
                }
              : item,
          ),
        }));
      } finally {
        if (requests.current.get(key) === controller)
          requests.current.delete(key);
      }
    },
    [show, update, updateThread],
  );
  const thread = state.threads[state.key];
  return {
    ...state,
    thread,
    history: chatHistoryList(state.threads),
    busy: thread.turns.some((t) => t.status === "loading"),
    show,
    send,
    cancel,
    close: () => update((s) => ({ ...s, open: false })),
    pinNote: (id: string) =>
      updateThread(latest.current.key, (t) => {
        const ids = t.context.noteIds ?? [];
        if (ids.includes(id) || ids.length >= MAX_CHAT_NOTES) return t;
        return { ...t, context: { ...t.context, noteIds: [...ids, id] } };
      }),
    unpinNote: (id: string) =>
      updateThread(latest.current.key, (t) => ({
        ...t,
        context: {
          ...t.context,
          noteIds: (t.context.noteIds ?? []).filter((item) => item !== id),
        },
      })),
    setDraft: (draft: string) =>
      updateThread(latest.current.key, (t) => ({ ...t, draft })),
    clearAction: () =>
      updateThread(latest.current.key, (t) => ({ ...t, action: undefined })),
    /** Starts a fresh conversation in the same context; the previous one stays in history. */
    reset: () => {
      const current = latest.current.threads[latest.current.key];
      if (current.turns.length === 0) {
        updateThread(current.id, (t) => ({
          ...t,
          draft: "",
          action: undefined,
        }));
        return;
      }
      const context = { ...current.context, noteIds: undefined };
      const id = `${current.ctxKey}#${crypto.randomUUID()}`;
      update((s) => {
        const threads = { ...s.threads, [id]: blank(id, context) };
        const stale = chatHistoryList(threads)
          .filter((item) => item.id !== id && item.id !== s.key)
          .slice(MAX_THREADS);
        for (const item of stale) delete threads[item.id];
        return { ...s, key: id, threads };
      });
    },
    select: (id: string) => {
      if (!latest.current.threads[id]) return;
      updateThread(id, (t) => ({ ...t, updatedAt: Date.now() }));
      update((s) => ({ ...s, open: true, unread: false, key: id }));
    },
    remove: (id: string) => {
      if (!latest.current.threads[id]) return;
      requests.current.get(id)?.abort();
      requests.current.delete(id);
      update((s) => {
        const threads = { ...s.threads };
        delete threads[id];
        if (s.key !== id) return { ...s, threads };
        const next =
          chatHistoryList(threads)[0] ?? blank("all", { scope: "all" });
        threads[next.id] = next;
        return { ...s, key: next.id, threads };
      });
    },
    markApplied: (id: string) =>
      updateThread(latest.current.key, (t) => ({
        ...t,
        turns: t.turns.map((turn) =>
          turn.id === id ? { ...turn, applied: true } : turn,
        ),
      })),
  };
}
export type PaperChat = ReturnType<typeof usePaperChat>;
