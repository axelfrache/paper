import { useEffect, useRef, useState } from "react";
import { Moon, Search, Star, Sun, Trash2 } from "lucide-react";
import { DiagramEditor } from "../components/DiagramEditor";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { MarkdownView } from "../components/MarkdownView";
import { replaceDiagramMarkerAtLine, stripDiagramMarkers } from "../lib/diagram";
import type { AIAction, Note } from "../types/note";
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
  onTagDraftChange: (tag: string) => void;
  onAddTag: () => void;
  onRemoveTag: (tag: string) => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
  onSearch: () => void;
  onToggleTheme: () => void;
  onFocusNoteList: () => void;
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
  onTagDraftChange,
  onAddTag,
  onRemoveTag,
  onToggleFavorite,
  onDelete,
  onSearch,
  onToggleTheme,
  onFocusNoteList,
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

  useEffect(() => {
    latestContentRef.current = note?.content ?? "";
  }, [note?.content]);

  useEffect(() => {
    if (diagramEdit && note?.id !== diagramEdit.noteId) {
      setDiagramEdit(null);
    }
  }, [diagramEdit, note?.id]);

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

  const describeDiagram = (description: string) => {
    if (!diagramEdit) {
      return;
    }
    const lines = latestContentRef.current.split("\n");
    const insertAt = Math.min(lines.length, diagramEdit.line + 1);
    lines.splice(insertAt, 0, "", description, "");
    const nextContent = lines.join("\n");
    latestContentRef.current = nextContent;
    closeDiagram();
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
            onAssist={onAssist}
            onCaretLineChange={onCaretLineChange}
            focusRequest={contentFocusTarget}
            onFocusPrevious={focusTags}
            onFocusNoteList={onFocusNoteList}
            onOpenDiagram={openDiagram}
            placeholder="Start writing... press / to insert a block"
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

      {diagramEdit && diagramEdit.noteId === note.id ? (
        <DiagramEditor
          diagram={diagramEdit.diagram}
          onChange={changeDiagram}
          onClose={closeDiagram}
          onDescribe={describeDiagram}
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
}: {
  label: string;
  favorite: boolean;
  disabledNoteActions?: boolean;
  onToggleFavorite: () => void;
  onToggleTheme: () => void;
  onSearch: () => void;
  onDelete: () => void;
  theme: "light" | "dark";
}) {
  return (
    <header className="editor-topbar">
      <span>{label}</span>
      <div>
        <button
          className={favorite ? "topbar-button favorite" : "topbar-button"}
          onClick={onToggleFavorite}
          disabled={disabledNoteActions}
        >
          <Star size={14} fill={favorite ? "currentColor" : "none"} strokeWidth={1.9} />
          Favorite
        </button>
        <button
          className="topbar-icon-button"
          onClick={onToggleTheme}
          title={`${theme === "dark" ? "Switch to light" : "Switch to dark"}  ⌘⇧L`}
          aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          {theme === "dark" ? <Sun size={14} strokeWidth={1.9} /> : <Moon size={14} strokeWidth={1.9} />}
        </button>
        <button className="topbar-button" onClick={onSearch}>
          <Search size={14} strokeWidth={1.9} />
          Search <kbd>⌘K</kbd>
        </button>
        <button className="topbar-button danger" onClick={onDelete} disabled={disabledNoteActions}>
          <Trash2 size={14} strokeWidth={1.9} />
          Delete
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
