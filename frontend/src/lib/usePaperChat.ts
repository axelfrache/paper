import { useCallback, useEffect, useRef, useState } from "react";
import { chatWithPaper } from "./api";
import { chatHistory, type ChatContext, type ChatTurn } from "./paperChat";
import type { AIAction, Note } from "../types/note";

type Thread = {
  context: ChatContext;
  turns: ChatTurn[];
  action?: AIAction;
  draft: string;
};
type State = {
  open: boolean;
  key: string;
  threads: Record<string, Thread>;
  unread: boolean;
};
const initial: State = {
  open: false,
  key: "all",
  threads: { all: { context: { scope: "all" }, turns: [], draft: "" } },
  unread: false,
};

export function usePaperChat(notes: Note[]) {
  const [state, setState] = useState<State>(initial);
  const latest = useRef(state);
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
      const key =
        context.scope === "all"
          ? "all"
          : `${context.scope}:${context.noteId}${context.selection ? `:${JSON.stringify(context.selection.range)}:${context.selection.text}` : ""}`;
      update((s) => ({
        ...s,
        open: true,
        unread: false,
        key,
        threads: {
          ...s.threads,
          [key]: s.threads[key]
            ? { ...s.threads[key], context }
            : { context, turns: [], draft: "" },
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
    busy: thread.turns.some((t) => t.status === "loading"),
    show,
    send,
    cancel,
    close: () => update((s) => ({ ...s, open: false })),
    setDraft: (draft: string) =>
      updateThread(latest.current.key, (t) => ({ ...t, draft })),
    clearAction: () =>
      updateThread(latest.current.key, (t) => ({ ...t, action: undefined })),
    reset: () => {
      const key = latest.current.key;
      cancel(key);
      updateThread(key, (t) => ({
        ...t,
        turns: [],
        draft: "",
        action: undefined,
      }));
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
