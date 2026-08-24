import { Search, Star, Trash2 } from "lucide-react";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { MarkdownView } from "../components/MarkdownView";
import type { AIAction, Note } from "../types/note";

export type AIResult = {
  action: AIAction;
  status: "loading" | "ready";
  text: string;
};

type NoteEditorProps = {
  note: Note | null;
  tagDraft: string;
  aiResult: AIResult | null;
  onTitleChange: (title: string) => void;
  onContentChange: (content: string) => void;
  onTagDraftChange: (tag: string) => void;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onSearch: () => void;
  onAssist: (action: AIAction) => void;
  onApplyResult: () => void;
  onDismissResult: () => void;
};

const aiActions: Array<{ action: AIAction; label: string; hint: string }> = [
  { action: "summarize", label: "Summarize", hint: "Condense this note" },
  { action: "extract_tasks", label: "Extract tasks", hint: "Pull out action items" },
  { action: "suggest_title", label: "Suggest title", hint: "Name this note" },
  { action: "suggest_tags", label: "Suggest tags", hint: "Tag automatically" },
  { action: "clean_up", label: "Clean up", hint: "Tidy raw text" },
];

export function NoteEditor({
  note,
  tagDraft,
  aiResult,
  onTitleChange,
  onContentChange,
  onTagDraftChange,
  onAddTag,
  onRemoveTag,
  onToggleFavorite,
  onDelete,
  onSearch,
  onAssist,
  onApplyResult,
  onDismissResult,
}: NoteEditorProps) {
  if (!note) {
    return (
      <main className="editor-shell">
        <div className="empty-editor">Select or create a note.</div>
      </main>
    );
  }

  return (
    <main className="editor-shell">
      <header className="editor-topbar">
        <span>Edited {formatRelative(note.updatedAt)}</span>
        <div>
          <button className={note.favorite ? "topbar-button favorite" : "topbar-button"} onClick={onToggleFavorite}>
            <Star size={14} fill={note.favorite ? "currentColor" : "none"} strokeWidth={1.9} />
            Favorite
          </button>
          <button className="topbar-button" onClick={onSearch}>
            <Search size={14} strokeWidth={1.9} />
            Search <kbd>⌘K</kbd>
          </button>
          <button className="topbar-button danger" onClick={onDelete}>
            <Trash2 size={14} strokeWidth={1.9} />
            Delete
          </button>
        </div>
      </header>

      <div className="editor-scroll">
        <div className="editor-document">
          <input
            className="editor-title"
            value={note.title}
            onChange={(event) => onTitleChange(event.target.value)}
            placeholder="Untitled"
          />

          <div className="tag-row">
            {note.tags.map((tag) => (
              <button key={tag} className="tag-chip" onClick={() => onRemoveTag(tag)}>
                <span>#{tag}</span>
                <em>×</em>
              </button>
            ))}
            <input
              value={tagDraft}
              onChange={(event) => onTagDraftChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  onAddTag();
                }
              }}
              placeholder="add tag"
            />
          </div>

          <MarkdownEditor
            value={note.content}
            onChange={onContentChange}
            placeholder="Start writing..."
          />

          {aiResult ? (
            <AIResultPanel
              result={aiResult}
              onApply={onApplyResult}
              onDismiss={onDismissResult}
            />
          ) : null}
        </div>
      </div>

      <footer className="ai-bar">
        <strong>AI</strong>
        {aiActions.map((action) => (
          <button key={action.action} title={action.hint} onClick={() => onAssist(action.action)}>
            {action.label}
          </button>
        ))}
        <span>{wordCount(note.content)}</span>
      </footer>
    </main>
  );
}

function AIResultPanel({
  result,
  onApply,
  onDismiss,
}: {
  result: AIResult;
  onApply: () => void;
  onDismiss: () => void;
}) {
  return (
    <section className="ai-result">
      <header>
        <span />
        <strong>{titleForAction(result.action)}</strong>
        <button onClick={onDismiss}>×</button>
      </header>
      <div className="ai-result-body">
        {result.status === "loading" ? (
          <p>Thinking...</p>
        ) : (
          <>
            <MarkdownView text={result.text} className="ai-markdown" />
            <div className="ai-result-actions">
              <button onClick={onApply}>{applyLabelForAction(result.action)}</button>
              <button onClick={onDismiss}>Dismiss</button>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

function titleForAction(action: AIAction) {
  return {
    summarize: "Summary",
    extract_tasks: "Extracted tasks",
    suggest_title: "Suggested title",
    suggest_tags: "Suggested tags",
    clean_up: "Cleaned up",
    improve_clarity: "Improved note",
  }[action];
}

function applyLabelForAction(action: AIAction) {
  return {
    summarize: "Insert summary",
    extract_tasks: "Add to note",
    suggest_title: "Use title",
    suggest_tags: "Add tags",
    clean_up: "Replace text",
    improve_clarity: "Replace text",
  }[action];
}

function wordCount(content: string) {
  const count = content.trim() ? content.trim().split(/\s+/).length : 0;
  return count ? `${count} words` : "";
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
