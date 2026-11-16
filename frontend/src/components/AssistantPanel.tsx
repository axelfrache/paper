import { useEffect, useRef, useState } from "react";
import { ArrowUp, Check, ChevronDown, Copy, Plus, Square, X } from "lucide-react";
import { BotAvatar } from "./BotAvatar";
import { MarkdownView } from "./MarkdownView";
import { useBackLayer } from "../lib/useBackLayer";
import {
  applicationLabel,
  applicationProblem,
  chatActions,
  chatTags,
  type ChatTurn,
} from "../lib/paperChat";
import type { PaperChat } from "../lib/usePaperChat";
import type { Note } from "../types/note";

type Props = {
  chat: PaperChat;
  note: Note | null;
  notes: Note[];
  theme: "light" | "dark";
  onApply: (turn: ChatTurn) => void;
  onOpenNote: (id: string) => void;
};

export function AssistantPanel({
  chat,
  note,
  notes,
  theme,
  onApply,
  onOpenNote,
}: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(chat.close);
  closeRef.current = chat.close;
  const [copyStatus, setCopyStatus] = useState("");
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const contextMenuRef = useRef<HTMLDivElement>(null);
  const thread = chat.thread;
  const contextNote = notes.find((item) => item.id === thread.context.noteId);
  const missing = thread.context.scope !== "all" && !contextNote;
  const contextOptions = [
    { value: "note", label: "This note", disabled: !note },
    ...(thread.context.scope === "selection"
      ? [{ value: "selection", label: "Selected passage", disabled: false }]
      : []),
    { value: "all", label: "My notes", disabled: false },
  ];
  function selectContext(scope: string) {
    setContextMenuOpen(false);
    if (scope === thread.context.scope) return;
    if (scope === "all") chat.show({ scope: "all" });
    else if (scope === "note" && note) chat.show({ scope: "note", noteId: note.id });
  }
  useBackLayer(chat.open && window.innerWidth <= 900, () => closeRef.current());
  useEffect(() => {
    if (!chat.open) setContextMenuOpen(false);
  }, [chat.open]);
  useEffect(() => {
    if (!contextMenuOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!contextMenuRef.current?.contains(event.target as Node)) {
        setContextMenuOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [contextMenuOpen]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!chat.open || !dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    const media = window.matchMedia?.("(max-width: 900px)");
    const place = () => {
      if (dialog.open) dialog.close();
      if (media?.matches) dialog.showModal();
      else dialog.show();
    };
    place();
    composerRef.current?.focus();
    media?.addEventListener("change", place);
    return () => {
      media?.removeEventListener("change", place);
      dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [chat.open]);
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "nearest" });
  }, [thread.turns, chat.key]);
  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopyStatus("Copied");
    } catch {
      setCopyStatus("Could not copy. Select the response to copy it manually.");
    }
  }
  function submit() {
    if (!chat.busy && !missing && thread.draft.trim())
      void chat.send(thread.draft);
  }
  if (!chat.open) return null;
  return (
    <dialog
      ref={dialogRef}
      className="assistant-panel"
      aria-labelledby="assistant-title"
      onCancel={(event) => {
        event.preventDefault();
        chat.close();
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === "Escape") {
          event.preventDefault();
          chat.close();
        }
      }}
    >
      <header className="assistant-header">
        <div>
          <strong id="assistant-title">Ask Paper</strong>
          <span>Your notes, a conversation away</span>
        </div>
        <button
          type="button"
          className="assistant-icon"
          aria-label="New conversation"
          title="New conversation"
          onClick={chat.reset}
        >
          <Plus size={17} />
        </button>
        <button
          type="button"
          className="assistant-icon"
          aria-label="Close assistant"
          onClick={chat.close}
        >
          <X size={17} />
        </button>
      </header>
      <div className="assistant-context">
        <span className="assistant-context-label">Context</span>
        <div className="assistant-context-select" ref={contextMenuRef}>
          <button
            type="button"
            className="assistant-context-trigger"
            aria-haspopup="listbox"
            aria-expanded={contextMenuOpen}
            onClick={() => setContextMenuOpen((open) => !open)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && contextMenuOpen) {
                event.stopPropagation();
                event.preventDefault();
                setContextMenuOpen(false);
              }
            }}
          >
            {contextOptions.find((item) => item.value === thread.context.scope)
              ?.label ?? "This note"}
            <ChevronDown size={13} />
          </button>
          {contextMenuOpen && (
            <ul
              className="assistant-context-menu"
              role="listbox"
              aria-label="Assistant context"
            >
              {contextOptions.map((item) => (
                <li key={item.value}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={item.value === thread.context.scope}
                    disabled={item.disabled}
                    onClick={() => selectContext(item.value)}
                  >
                    {item.label}
                    {item.value === thread.context.scope && <Check size={13} />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <span title={contextNote?.title}>
          {thread.context.scope === "all"
            ? "Relevant notes from your library"
            : contextNote?.title || (missing ? "Note unavailable" : "Untitled")}
        </span>
        {contextNote && note?.id !== contextNote.id && (
          <button type="button" onClick={() => onOpenNote(contextNote.id)}>
            Open context note
          </button>
        )}
        {note &&
          thread.context.scope !== "all" &&
          note.id !== thread.context.noteId && (
            <button
              type="button"
              onClick={() => chat.show({ scope: "note", noteId: note.id })}
            >
              Use current note
            </button>
          )}
      </div>
      <div
        className="assistant-messages"
        role="log"
        aria-label="Conversation"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {thread.turns.length === 0 && (
          <div className="assistant-empty">
            <BotAvatar size={72} theme={theme} />
            <h2>
              {thread.context.scope === "all"
                ? "What would you like to find?"
                : "Think it through with Paper"}
            </h2>
            <p>
              {thread.context.scope === "selection"
                ? "Ask about the selected passage or request a rewrite."
                : thread.context.scope === "all"
                  ? "Ask a question across your notes. Consulted notes appear with the answer."
                  : "Ask a question, refine an idea, or turn this note into something clearer."}
            </p>
            {thread.context.scope !== "all" && (
              <div className="assistant-prompts">
                {chatActions.slice(0, 3).map((item) => (
                  <button
                    type="button"
                    key={item.action}
                    disabled={missing}
                    onClick={() => void chat.send(item.prompt, item.action)}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {thread.context.selection && (
          <details className="assistant-selection">
            <summary>Selected passage</summary>
            <blockquote>{thread.context.selection.text}</blockquote>
          </details>
        )}
        {thread.turns.map((turn) => (
          <div className="assistant-turn" key={turn.id}>
            <div className="assistant-question">
              <span className="sr-only">You: </span>
              {turn.question}
            </div>
            {turn.status === "loading" ? (
              <div className="assistant-status" role="status">
                <BotAvatar size={30} theme={theme} state="thinking" />
                <span>Paper is thinking…</span>
              </div>
            ) : turn.status === "error" ? (
              <div className="assistant-error" role="alert">
                <p>{turn.error}</p>
                <button
                  type="button"
                  disabled={chat.busy || missing}
                  onClick={() => void chat.send(turn.question, turn.action)}
                >
                  Try again
                </button>
              </div>
            ) : turn.status === "cancelled" ? (
              <p className="assistant-status">Response stopped.</p>
            ) : (
              <div className="assistant-answer">
                <span className="sr-only">Paper: </span>
                {turn.action === "suggest_tags" ? (
                  <div className="assistant-tags">
                    {chatTags(turn.text).map((tag) => (
                      <span key={tag}>#{tag}</span>
                    ))}
                  </div>
                ) : (
                  <MarkdownView text={turn.text} />
                )}
                {thread.context.scope === "all" &&
                  turn.sourceIds.length > 0 && (
                    <div className="assistant-sources">
                      <small>Notes consulted</small>
                      {turn.sourceIds.map((id) => (
                        <button
                          type="button"
                          key={id}
                          disabled={!notes.some((item) => item.id === id)}
                          onClick={() => onOpenNote(id)}
                        >
                          {notes.find((item) => item.id === id)?.title ||
                            "Unavailable note"}
                        </button>
                      ))}
                    </div>
                  )}
                <div className="assistant-answer-actions">
                  <button
                    type="button"
                    title="Copy response"
                    aria-label="Copy response"
                    onClick={() => void copy(turn.text)}
                  >
                    <Copy size={13} /> Copy
                  </button>
                  {turn.snapshot && (
                    <button
                      type="button"
                      disabled={!!applicationProblem(turn, note)}
                      title={
                        applicationProblem(turn, note) || applicationLabel(turn)
                      }
                      onClick={() => onApply(turn)}
                    >
                      {turn.applied ? "Applied" : applicationLabel(turn)}
                    </button>
                  )}
                </div>
                {turn.snapshot &&
                  applicationProblem(turn, note) &&
                  !turn.applied && (
                    <p className="assistant-stale">
                      {applicationProblem(turn, note)}
                    </p>
                  )}
              </div>
            )}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>
      <form
        className="assistant-composer"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        {thread.action && (
          <div className="assistant-intent">
            Refining:{" "}
            {chatActions.find((item) => item.action === thread.action)?.label ??
              "Rewrite"}
            <button
              type="button"
              aria-label="Return to questions"
              onClick={chat.clearAction}
            >
              <X size={12} />
            </button>
          </div>
        )}
        <textarea
          ref={composerRef}
          aria-label="Message Paper"
          placeholder={
            missing ? "Choose an available note" : "Ask, explore, or refine…"
          }
          rows={3}
          maxLength={8000}
          disabled={missing}
          value={thread.draft}
          onChange={(event) => chat.setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault();
              submit();
            }
          }}
        />
        <div className="assistant-composer-actions">
          <span>Changes are applied only when you choose.</span>
          {chat.busy ? (
            <button
              type="button"
              className="assistant-send"
              aria-label="Stop response"
              onClick={() => chat.cancel()}
            >
              <Square size={15} />
            </button>
          ) : (
            <button
              type="submit"
              className="assistant-send"
              aria-label="Send message"
              disabled={missing || !thread.draft.trim()}
            >
              <ArrowUp size={17} />
            </button>
          )}
        </div>
        <span className="sr-only" role="status">
          {copyStatus}
        </span>
      </form>
    </dialog>
  );
}
