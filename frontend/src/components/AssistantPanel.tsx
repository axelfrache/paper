import { useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Check,
  ChevronDown,
  Copy,
  FileText,
  Minus,
  Plus,
  Sparkles,
  Square,
  TextSelect,
  X,
} from "lucide-react";
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
    else if (scope === "note" && note)
      chat.show({ scope: "note", noteId: note.id });
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
  const slashQuery = /^\/(\S*)$/.exec(thread.draft.trim())?.[1]?.toLowerCase();
  const slashMatches =
    slashQuery === undefined || missing || thread.context.scope === "all"
      ? []
      : chatActions.filter(
          (item) =>
            item.slug.startsWith(slashQuery) ||
            item.label.toLowerCase().startsWith(slashQuery),
        );
  const firstQuestion = thread.turns[0]?.question.trim();
  const threadTitle = firstQuestion
    ? firstQuestion.length > 28
      ? firstQuestion.slice(0, 28).trimEnd() + "…"
      : firstQuestion
    : "New conversation";
  useEffect(() => {
    const field = composerRef.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${Math.min(field.scrollHeight, 140)}px`;
  }, [thread.draft, chat.open]);
  function runSlash(item: (typeof chatActions)[number]) {
    chat.setDraft("");
    void chat.send(item.prompt, item.action);
  }
  function submit() {
    if (chat.busy || missing) return;
    if (slashMatches.length) return runSlash(slashMatches[0]);
    if (thread.draft.trim()) void chat.send(thread.draft);
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
        <div className="assistant-context-select" ref={contextMenuRef}>
          <button
            type="button"
            className="assistant-title-trigger"
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
            <Sparkles size={14} className="assistant-spark" />
            <strong id="assistant-title">{threadTitle}</strong>
            <ChevronDown size={12} />
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
          aria-label="Minimize assistant"
          title="Minimize"
          onClick={chat.close}
        >
          <Minus size={17} />
        </button>
      </header>
      {((contextNote && note?.id !== contextNote.id) ||
        (note &&
          thread.context.scope !== "all" &&
          note.id !== thread.context.noteId)) && (
        <div className="assistant-context">
          <span title={contextNote?.title}>
            {contextNote?.title || (missing ? "Note unavailable" : "Untitled")}
          </span>
          {contextNote && note?.id !== contextNote.id && (
            <button type="button" onClick={() => onOpenNote(contextNote.id)}>
              Open
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
      )}
      <div
        className="assistant-messages"
        role="log"
        aria-label="Conversation"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {thread.turns.length === 0 && (
          <div className="assistant-empty">
            <BotAvatar size={44} theme={theme} />
            <h2>
              {thread.context.scope === "all"
                ? "Across your notes"
                : contextNote?.title || "This note"}
            </h2>
            <p>
              {thread.context.scope === "selection"
                ? "Ask about the selected passage or request a rewrite."
                : thread.context.scope === "all"
                  ? "Ask a question. Consulted notes appear with the answer."
                  : "Ask a question, or start from an action."}
            </p>
            {thread.context.scope !== "all" && (
              <ul className="assistant-commands">
                {chatActions.map((item) => (
                  <li key={item.action}>
                    <button
                      type="button"
                      disabled={missing}
                      onClick={() => void chat.send(item.prompt, item.action)}
                    >
                      <span>{item.label}</span>
                      <code>/{item.slug}</code>
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <small>Nothing changes without your approval.</small>
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
                {turn.snapshot && (
                  <div className="assistant-suggestion">
                    <div className="assistant-suggestion-head">
                      <span>{applicationLabel(turn)}</span>
                    </div>
                    {turn.action === "suggest_title" && (
                      <div className="assistant-diff">
                        <del>{turn.snapshot.title || "Untitled"}</del>
                        <ins>{turn.text.trim().split("\n")[0]}</ins>
                      </div>
                    )}
                    {applicationProblem(turn, note) && !turn.applied ? (
                      <p className="assistant-stale">
                        {applicationProblem(turn, note)}
                      </p>
                    ) : null}
                    {turn.applied ? (
                      <div className="assistant-applied">
                        <Check size={13} /> Applied to the note
                      </div>
                    ) : (
                      <div className="assistant-suggestion-actions">
                        <button
                          type="button"
                          className="primary"
                          disabled={!!applicationProblem(turn, note)}
                          onClick={() => onApply(turn)}
                        >
                          Apply
                        </button>
                      </div>
                    )}
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
                </div>
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
        {slashMatches.length > 0 && (
          <ul className="assistant-slash" role="listbox" aria-label="Actions">
            {slashMatches.map((item) => (
              <li key={item.action}>
                <button
                  type="button"
                  role="option"
                  aria-selected="false"
                  onClick={() => runSlash(item)}
                >
                  <span>{item.label}</span>
                  <code>/{item.slug}</code>
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="assistant-field">
          <div className="assistant-chips">
            <span className="assistant-chip">
              <FileText size={12} />
              {thread.context.scope === "all"
                ? "My notes"
                : contextNote?.title ||
                  (missing ? "Note unavailable" : "Untitled")}
            </span>
            {thread.context.selection && (
              <span className="assistant-chip accent">
                <TextSelect size={12} /> Selected passage
              </span>
            )}
            {thread.action && (
              <span className="assistant-chip accent">
                {chatActions.find((item) => item.action === thread.action)
                  ?.label ?? "Rewrite"}
                <button
                  type="button"
                  aria-label="Return to questions"
                  onClick={chat.clearAction}
                >
                  <X size={11} />
                </button>
              </span>
            )}
          </div>
          <textarea
            ref={composerRef}
            aria-label="Message Paper"
            placeholder={
              missing ? "Choose an available note" : "Ask, explore, or refine…"
            }
            rows={1}
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
            <span>
              <b>/</b> actions · <b>Shift+Enter</b> new line
            </span>
            {chat.busy ? (
              <button
                key="stop"
                type="button"
                className="assistant-send"
                aria-label="Stop response"
                onClick={() => chat.cancel()}
              >
                <Square size={14} />
              </button>
            ) : (
              <button
                key="send"
                type="submit"
                className="assistant-send"
                aria-label="Send message"
                disabled={missing || !thread.draft.trim()}
              >
                <ArrowUp size={16} />
              </button>
            )}
          </div>
        </div>
        <span className="sr-only" role="status">
          {copyStatus}
        </span>
      </form>
    </dialog>
  );
}
