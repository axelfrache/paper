import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { FileText, Search, Sparkles } from "lucide-react";
import type { Note } from "../types/note";

export type PaletteMode = "search" | "ask";

export type PaletteAction = {
  label: string;
  meta: string;
  icon: ReactNode;
  kbd?: string;
  run: () => void;
};

type AskState = {
  status: "idle" | "loading" | "answered";
  answer: string;
  sourceIds: string[];
};

type CommandPaletteProps = {
  open: boolean;
  mode: PaletteMode;
  notes: Note[];
  actions: PaletteAction[];
  askState: AskState;
  onModeChange: (mode: PaletteMode) => void;
  onAsk: (question: string) => void;
  onSelectNote: (note: Note) => void;
  onClose: () => void;
};

const suggestions = [
  "What do I still need to do?",
  "What have I written about this week?",
  "Which notes mention project ideas?",
];

export function CommandPalette({
  open,
  mode,
  notes,
  actions,
  askState,
  onModeChange,
  onAsk,
  onSelectNote,
  onClose,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setIndex(0);
      window.setTimeout(() => inputRef.current?.focus(), 20);
    }
  }, [open, mode]);

  const queryText = query.trim().toLowerCase();
  const noteHits = useMemo(() => {
    const pool = queryText
      ? notes.filter((note) =>
          `${note.title} ${note.content} ${note.tags.join(" ")}`.toLowerCase().includes(queryText),
        )
      : notes.slice(0, 6);
    return pool.slice(0, 8);
  }, [notes, queryText]);

  const actionHits = useMemo(
    () => actions.filter((action) => !queryText || action.label.toLowerCase().includes(queryText)),
    [actions, queryText],
  );

  const flatItems = useMemo(
    () => [
      ...actionHits.map((action) => ({ kind: "action" as const, action })),
      ...noteHits.map((note) => ({ kind: "note" as const, note })),
    ],
    [actionHits, noteHits],
  );

  if (!open) {
    return null;
  }

  const selectedIndex = Math.min(index, Math.max(0, flatItems.length - 1));

  const runSelected = () => {
    const item = flatItems[selectedIndex];
    if (!item) {
      return;
    }
    if (item.kind === "action") {
      item.action.run();
    } else {
      onSelectNote(item.note);
      onClose();
    }
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Tab") {
      event.preventDefault();
      onModeChange(mode === "ask" ? "search" : "ask");
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      onClose();
      return;
    }
    if (mode === "ask") {
      if (event.key === "Enter" && query.trim()) {
        event.preventDefault();
        onAsk(query.trim());
      }
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setIndex((current) => Math.min(current + 1, flatItems.length - 1));
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      setIndex((current) => Math.max(current - 1, 0));
    }
    if (event.key === "Enter") {
      event.preventDefault();
      runSelected();
    }
  };

  let cursor = -1;

  return (
    <div className="palette-backdrop" onMouseDown={onClose}>
      <section className="palette" onMouseDown={(event) => event.stopPropagation()}>
        <div className="palette-input">
          <span className={mode === "ask" ? "palette-mode ask" : "palette-mode"}>
            {mode === "ask" ? <Sparkles size={14} strokeWidth={2} /> : <Search size={14} strokeWidth={2} />}
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setIndex(0);
            }}
            onKeyDown={onKeyDown}
            placeholder={mode === "ask" ? "Ask a question about your notes..." : "Search notes and actions..."}
          />
          <span className="keycap">esc</span>
        </div>

        <div className="palette-body">
          {mode === "ask" ? (
            <AskPanel
              query={query}
              askState={askState}
              notes={notes}
              onAsk={onAsk}
              onSelectNote={(note) => {
                onSelectNote(note);
                onClose();
              }}
            />
          ) : (
            <>
              {actionHits.length > 0 ? (
                <div className="palette-group">
                  <div className="palette-label">Actions</div>
                  {actionHits.map((action) => {
                    cursor += 1;
                    return (
                      <button
                        key={action.label}
                        className={cursor === selectedIndex ? "palette-row active" : "palette-row"}
                        onClick={action.run}
                        onMouseEnter={() => setIndex(cursor)}
                      >
                        <span>{action.icon}</span>
                        <strong>{action.label}</strong>
                        <small>{action.meta}</small>
                        {action.kbd ? <em>{action.kbd}</em> : null}
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {noteHits.length > 0 ? (
                <div className="palette-group">
                  <div className="palette-label">{queryText ? "Notes" : "Recent notes"}</div>
                  {noteHits.map((note) => {
                    cursor += 1;
                    return (
                      <button
                        key={note.id}
                        className={cursor === selectedIndex ? "palette-row active" : "palette-row"}
                        onClick={() => {
                          onSelectNote(note);
                          onClose();
                        }}
                        onMouseEnter={() => setIndex(cursor)}
                      >
                        <span>
                          <FileText size={14} strokeWidth={1.9} />
                        </span>
                        <strong>{note.title || "Untitled"}</strong>
                        <small>{snippet(note.content)}</small>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {flatItems.length === 0 ? <div className="palette-empty">No matches. Press Tab to ask your notes.</div> : null}
            </>
          )}
        </div>

        <div className="palette-footer">
          <span>↑↓ navigate</span>
          <span>↵ open</span>
          <span>⇥ {mode === "ask" ? "back to search" : "ask my notes"}</span>
        </div>
      </section>
    </div>
  );
}

function AskPanel({
  query,
  askState,
  notes,
  onAsk,
  onSelectNote,
}: {
  query: string;
  askState: AskState;
  notes: Note[];
  onAsk: (question: string) => void;
  onSelectNote: (note: Note) => void;
}) {
  if (askState.status === "loading") {
    return <div className="ask-message">Searching your notes...</div>;
  }

  if (askState.status === "answered") {
    const sources = askState.sourceIds
      .map((id) => notes.find((note) => note.id === id))
      .filter((note): note is Note => Boolean(note));
    return (
      <div className="ask-answer">
        <p>{askState.answer}</p>
        {sources.length > 0 ? <div className="palette-label">Sources</div> : null}
        {sources.map((note) => (
          <button key={note.id} onClick={() => onSelectNote(note)}>
            <strong>{note.title || "Untitled"}</strong>
            <span>{formatRelative(note.updatedAt)}</span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <div className="ask-suggestions">
      <div className="palette-label">Try asking</div>
      {suggestions.map((suggestion) => (
        <button key={suggestion} onClick={() => onAsk(suggestion)}>
          {suggestion}
        </button>
      ))}
      {query.trim() ? (
        <button onClick={() => onAsk(query.trim())}>Ask "{query.trim()}"</button>
      ) : null}
    </div>
  );
}

function snippet(content: string) {
  return content.replace(/\s+/g, " ").trim().slice(0, 90);
}

function formatRelative(value: string) {
  const diff = Date.now() - new Date(value).getTime();
  const minutes = Math.max(0, Math.round(diff / 60000));
  if (minutes < 1) {
    return "just now";
  }
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h ago`;
  }
  return `${Math.floor(hours / 24)}d ago`;
}
