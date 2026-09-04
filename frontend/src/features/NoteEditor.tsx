import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Moon, Search, Sparkles, Star, Sun, Trash2, X } from "lucide-react";
import { DiagramEditor } from "../components/DiagramEditor";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { MarkdownView } from "../components/MarkdownView";
import { replaceDiagramMarkerAtLine, stripDiagramMarkers } from "../lib/diagram";
import type { AIAction, Note, NoteImage } from "../types/note";
import type { Diagram } from "../lib/diagram";

export type AIResult = {
  action: AIAction;
  status: "loading" | "ready";
  text: string;
};

type NoteEditorProps = {
  note: Note | null;
  tagDraft: string;
  aiResult: AIResult | null;
  titleFocusRequest: { noteId: string; token: number } | null;
  contentFocusRequest: { noteId: string; token: number } | null;
  onTitleChange: (title: string) => void;
  onContentChange: (content: string) => void;
  onUploadImage: (file: File) => Promise<NoteImage>;
  onTagDraftChange: (tag: string) => void;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onSearch: () => void;
  onToggleTheme: () => void;
  onFocusNoteList: () => void;
  onBackToNotes: () => void;
  onAssist: (action: AIAction) => void;
  onCaretLineChange: (line: number) => void;
  onApplyResult: () => void;
  onDismissResult: () => void;
  theme: "light" | "dark";
};

const aiActions: Array<{ action: AIAction; label: string; hint: string }> = [
  { action: "summarize", label: "Summarize", hint: "Condense this note" },
  { action: "extract_tasks", label: "Extract tasks", hint: "Pull out action items" },
  { action: "suggest_title", label: "Suggest title", hint: "Name this note" },
  { action: "suggest_tags", label: "Suggest tags", hint: "Tag automatically" },
  { action: "clean_up", label: "Clean up", hint: "Tidy raw text" },
];

const diagramAction = { label: "Diagram", hint: "Sketch this note as a diagram" };

type ContentFocusTarget = {
  key: string;
  placement: "start" | "end" | "last";
};

type DiagramEditTarget = {
  noteId: string;
  line: number;
  diagram: Diagram;
};

export function NoteEditor({
  note,
  tagDraft,
  aiResult,
  titleFocusRequest,
  contentFocusRequest,
  onTitleChange,
  onContentChange,
  onUploadImage,
  onTagDraftChange,
  onAddTag,
  onRemoveTag,
  onToggleFavorite,
  onDelete,
  onSearch,
  onToggleTheme,
  onFocusNoteList,
  onBackToNotes,
  onAssist,
  onCaretLineChange,
  onApplyResult,
  onDismissResult,
  theme,
}: NoteEditorProps) {
  const titleRef = useRef<HTMLInputElement | null>(null);
  const tagInputRef = useRef<HTMLInputElement | null>(null);
  const handledTitleFocusTokenRef = useRef(0);
  const handledContentFocusTokenRef = useRef(0);
  const localContentFocusTokenRef = useRef(0);
  const latestContentRef = useRef(note?.content ?? "");
  const [contentFocusTarget, setContentFocusTarget] = useState<ContentFocusTarget | null>(null);
  const [diagramEdit, setDiagramEdit] = useState<DiagramEditTarget | null>(null);
  const [diagramDescribeRequest, setDiagramDescribeRequest] = useState<{ key: string; prompt: string } | null>(null);

  useEffect(() => {
    latestContentRef.current = note?.content ?? "";
  }, [note?.content]);

  useEffect(() => {
    if (diagramEdit && note?.id !== diagramEdit.noteId) {
      setDiagramEdit(null);
    }
  }, [diagramEdit, note?.id]);

  useEffect(() => {
    if (!aiResult) {
      return;
    }

    const handleResultKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || document.querySelector("dialog[open]")) {
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onDismissResult();
      } else if (event.key === "Enter" && aiResult.status === "ready") {
        event.preventDefault();
        onApplyResult();
      }
    };

    window.addEventListener("keydown", handleResultKey);
    return () => window.removeEventListener("keydown", handleResultKey);
  }, [aiResult, onApplyResult, onDismissResult]);

  useEffect(() => {
    if (
      !note ||
      !titleFocusRequest ||
      titleFocusRequest.noteId !== note.id ||
      handledTitleFocusTokenRef.current === titleFocusRequest.token
    ) {
      return;
    }

    handledTitleFocusTokenRef.current = titleFocusRequest.token;
    window.requestAnimationFrame(() => {
      const title = titleRef.current;
      if (!title) {
        return;
      }
      title.focus();
      title.setSelectionRange(title.value.length, title.value.length);
    });
  }, [note?.id, titleFocusRequest]);

  useEffect(() => {
    if (
      !note ||
      !contentFocusRequest ||
      contentFocusRequest.noteId !== note.id ||
      handledContentFocusTokenRef.current === contentFocusRequest.token
    ) {
      return;
    }

    handledContentFocusTokenRef.current = contentFocusRequest.token;
    setContentFocusTarget({ key: `external-${contentFocusRequest.token}`, placement: "last" });
  }, [contentFocusRequest, note?.id]);

  const focusTitleEnd = () => {
    const title = titleRef.current;
    if (!title) {
      return;
    }
    title.focus();
    title.setSelectionRange(title.value.length, title.value.length);
  };

  const focusTags = () => {
    tagInputRef.current?.focus();
  };

  const focusContent = (placement: ContentFocusTarget["placement"]) => {
    localContentFocusTokenRef.current += 1;
    setContentFocusTarget({ key: `local-${localContentFocusTokenRef.current}`, placement });
  };

  const openDiagram = (line: number, diagram: Diagram) => {
    if (!note) {
      return;
    }
    setDiagramEdit({ noteId: note.id, line, diagram });
  };

  const closeDiagram = () => {
    setDiagramEdit(null);
    const active = document.activeElement;
    if (active instanceof HTMLElement && active.closest(".markdown-editor")) {
      active.blur();
    }
  };

  const changeDiagram = (diagram: Diagram) => {
    if (!diagramEdit) {
      return;
    }
    const nextContent = replaceDiagramMarkerAtLine(latestContentRef.current, diagramEdit.line, diagram);
    latestContentRef.current = nextContent;
    setDiagramEdit({ ...diagramEdit, diagram });
    onContentChange(nextContent);
  };

  if (!note) {
    return (
      <main className="editor-shell">
        <EditorTopbar
          label="No note selected"
          favorite={false}
          disabledNoteActions
          onToggleFavorite={onToggleFavorite}
          onToggleTheme={onToggleTheme}
          onSearch={onSearch}
          onDelete={onDelete}
          theme={theme}
          onBackToNotes={onBackToNotes}
        />
        <div className="empty-editor">Select or create a note.</div>
      </main>
    );
  }

  return (
    <main className="editor-shell">
      <EditorTopbar
        label={`Edited ${formatRelative(note.updatedAt)}`}
        favorite={note.favorite}
        onToggleFavorite={onToggleFavorite}
        onToggleTheme={onToggleTheme}
        onSearch={onSearch}
        onDelete={onDelete}
        theme={theme}
        onBackToNotes={onBackToNotes}
      />

      <div className="editor-scroll">
        <div className="editor-document">
          <input
            ref={titleRef}
            className="editor-title"
            value={note.title}
            onChange={(event) => onTitleChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
                return;
              }
              if (event.key === "ArrowLeft" && isInputAtStart(event.currentTarget)) {
                event.preventDefault();
                onFocusNoteList();
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                focusTags();
              }
            }}
            placeholder="Untitled"
          />

          <div
            className="tag-row"
            onKeyDown={(event) => {
              if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
                return;
              }
              if (event.key === "ArrowUp") {
                event.preventDefault();
                focusTitleEnd();
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                focusContent("start");
              } else if (event.key === "ArrowLeft" && isTagRowAtStart(event.target)) {
                event.preventDefault();
                onFocusNoteList();
              }
            }}
          >
            {note.tags.map((tag) => (
              <button key={tag} className="tag-chip" onClick={() => onRemoveTag(tag)}>
                <span>#{tag}</span>
                <em>×</em>
              </button>
            ))}
            <input
              ref={tagInputRef}
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
            onUploadImage={onUploadImage}
            onAssist={onAssist}
            onCaretLineChange={onCaretLineChange}
            focusRequest={contentFocusTarget}
            onFocusPrevious={focusTags}
            onFocusNoteList={onFocusNoteList}
            onOpenDiagram={openDiagram}
            diagramDescribeRequest={diagramDescribeRequest}
            placeholder="Start writing... press / to insert a block"
          />
        </div>
      </div>

      {aiResult ? (
        <div className="ai-result-dock">
          <AIResultPanel
            result={aiResult}
            onApply={onApplyResult}
            onDismiss={onDismissResult}
          />
        </div>
      ) : null}

      <footer className="ai-bar">
        <strong>AI</strong>
        <div className="ai-bar-actions">
          {aiActions.map((action) => (
            <button key={action.action} title={action.hint} onClick={() => onAssist(action.action)} disabled={aiResult?.status === "loading"}>
              {action.label}
            </button>
          ))}
          <button
            title={diagramAction.hint}
            disabled={aiResult?.status === "loading"}
            onClick={() => openDiagramDescribe(note, setDiagramDescribeRequest)}
          >
            {diagramAction.label}
          </button>
        </div>
        <details className="ai-bar-menu">
          <summary aria-label="AI actions" title="AI actions">
            <Sparkles size={15} strokeWidth={1.9} />
            <span>AI actions</span>
          </summary>
          <div>
            {aiActions.map((action) => (
              <button
                key={action.action}
                type="button"
                disabled={aiResult?.status === "loading"}
                onClick={(event) => {
                  event.currentTarget.closest("details")?.removeAttribute("open");
                  onAssist(action.action);
                }}
              >
                {action.label}
              </button>
            ))}
            <button
              type="button"
              disabled={aiResult?.status === "loading"}
              onClick={(event) => {
                event.currentTarget.closest("details")?.removeAttribute("open");
                openDiagramDescribe(note, setDiagramDescribeRequest);
              }}
            >
              {diagramAction.label}
            </button>
          </div>
        </details>
        <span>{wordCount(note.content)}</span>
      </footer>

      {diagramEdit && diagramEdit.noteId === note.id ? (
        <DiagramEditor
          diagram={diagramEdit.diagram}
          onChange={changeDiagram}
          onClose={closeDiagram}
        />
      ) : null}
    </main>
  );
}

function EditorTopbar({
  label,
  favorite,
  disabledNoteActions = false,
  onToggleFavorite,
  onToggleTheme,
  onSearch,
  onDelete,
  theme,
  onBackToNotes,
}: {
  label: string;
  favorite: boolean;
  disabledNoteActions?: boolean;
  onToggleFavorite: () => void;
  onToggleTheme: () => void;
  onSearch: () => void;
  onDelete: () => void;
  theme: "light" | "dark";
  onBackToNotes: () => void;
}) {
  return (
    <header className="editor-topbar">
      <button className="editor-back-button" type="button" onClick={onBackToNotes} aria-label="Back to notes">
        <ArrowLeft size={16} strokeWidth={1.9} />
      </button>
      <span>{label}</span>
      <div>
        <button
          className={favorite ? "topbar-button favorite" : "topbar-button"}
          onClick={onToggleFavorite}
          disabled={disabledNoteActions}
          aria-label="Favorite"
          title="Favorite"
        >
          <Star size={14} fill={favorite ? "currentColor" : "none"} strokeWidth={1.9} />
          <span>Favorite</span>
        </button>
        <button
          className="topbar-icon-button"
          onClick={onToggleTheme}
          title={`${theme === "dark" ? "Switch to light" : "Switch to dark"}  ⌘⇧L`}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun size={14} strokeWidth={1.9} /> : <Moon size={14} strokeWidth={1.9} />}
        </button>
        <button className="topbar-button" onClick={onSearch} aria-label="Search" title="Search">
          <Search size={14} strokeWidth={1.9} />
          <span>Search</span> <kbd>⌘K</kbd>
        </button>
        <button className="topbar-button danger" onClick={onDelete} disabled={disabledNoteActions} aria-label="Delete" title="Delete">
          <Trash2 size={14} strokeWidth={1.9} />
          <span>Delete</span>
        </button>
      </div>
    </header>
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
  const tags = result.action === "suggest_tags" && result.status === "ready" ? resultTags(result.text) : [];
  const count = result.status === "ready" ? resultItemCount(result, tags) : 0;

  return (
    <section className="ai-result" aria-live="polite">
      <header>
        <span className={result.status === "loading" ? "is-loading" : ""} />
        <strong>{titleForAction(result.action)}</strong>
        {count > 1 ? <small>{count} items</small> : null}
        <button onClick={onDismiss} aria-label="Dismiss" title="Dismiss">
          <X size={14} strokeWidth={2} />
        </button>
      </header>
      {result.status === "loading" ? (
        <div className="ai-result-loading" aria-label="Thinking">
          <span />
          <span />
          <span />
        </div>
      ) : (
        <>
          <div className="ai-result-body">
            {tags.length ? (
              <div className="ai-result-tags">
                {tags.map((tag) => <span key={tag}>#{tag}</span>)}
              </div>
            ) : (
              <MarkdownView text={result.text} className="ai-markdown" />
            )}
          </div>
          <footer className="ai-result-actions">
            <button onClick={onApply}>{applyLabelForAction(result.action)}</button>
            <button onClick={onDismiss}>Dismiss</button>
          </footer>
        </>
      )}
    </section>
  );
}

function resultTags(text: string) {
  return text
    .split(/[,\n]+/)
    .map((tag) => tag.trim().replace(/^[-*#\s]+/, "").toLowerCase().replace(/[^a-z0-9_-]/g, ""))
    .filter(Boolean)
    .slice(0, 8);
}

function resultItemCount(result: AIResult, tags: string[]) {
  if (tags.length) {
    return tags.length;
  }
  if (result.action !== "summarize" && result.action !== "extract_tasks") {
    return 0;
  }
  return result.text.split("\n").filter((line) => /^\s*(?:[-*•]|\d+[.)]|\[[ xX]\])\s+/.test(line)).length;
}

function openDiagramDescribe(note: Note, setRequest: (request: { key: string; prompt: string }) => void) {
  setRequest({
    key: `${note.id}-${Date.now()}`,
    prompt: diagramPromptForNote(note),
  });
}

function diagramPromptForNote(note: Note) {
  const content = stripDiagramMarkers(note.content).trim();
  return [
    note.title.trim() ? `Title: ${note.title.trim()}` : "",
    note.tags.length ? `Tags: ${note.tags.join(", ")}` : "",
    content ? `Content:\n${content}` : "",
  ].filter(Boolean).join("\n\n");
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
  const cleanContent = stripDiagramMarkers(content);
  const count = cleanContent.trim() ? cleanContent.trim().split(/\s+/).length : 0;
  return count ? `${count} words` : "";
}

function isInputAtStart(input: HTMLInputElement) {
  return input.selectionStart === 0 && input.selectionEnd === 0;
}

function isTagRowAtStart(target: EventTarget) {
  if (target instanceof HTMLInputElement) {
    return isInputAtStart(target);
  }
  return target instanceof HTMLElement && Boolean(target.closest(".tag-chip"));
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
