import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlignLeft, ListTodo, MessageCircleQuestion, Plus, Star } from "lucide-react";
import { CommandPalette, type PaletteAction, type PaletteMode } from "../components/CommandPalette";
import { NotesColumn } from "../components/NotesColumn";
import { Sidebar, type ViewKey } from "../components/Sidebar";
import { Toast } from "../components/Toast";
import { NoteEditor, type AIResult } from "../features/NoteEditor";
import { askNotes, assistNote, claimLegacyNotes, createNote, deleteNote, listNotes, updateNote, uploadNoteImage } from "../lib/api";
import { useShortcuts } from "../lib/useShortcuts";
import type { AIAction, AskAnswer, Note, NoteDraft } from "../types/note";
import type { AuthUser } from "../types/auth";

type Theme = "light" | "dark";

type NoteHistory = {
  undo: NoteDraft[];
  redo: NoteDraft[];
};

type DeletedNotesAction = {
  notes: Note[];
  index: number;
};

type TitleFocusRequest = {
  noteId: string;
  token: number;
};

type ContentFocusRequest = {
  noteId: string;
  token: number;
};

const historyLimit = 120;

const emptyDraft: NoteDraft = {
  title: "",
  content: "",
  tags: [],
  favorite: false,
};

export function NotesPage({ user, onLogout }: { user: AuthUser; onLogout: () => Promise<void> }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [view, setView] = useState<ViewKey>("all");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("search");
  const [theme, setTheme] = useState<Theme>(() => initialTheme());
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const [aiResult, setAIResult] = useState<AIResult | null>(null);
  const [titleFocusRequest, setTitleFocusRequest] = useState<TitleFocusRequest | null>(null);
  const [contentFocusRequest, setContentFocusRequest] = useState<ContentFocusRequest | null>(null);
  const [noteCardFocusRequest, setNoteCardFocusRequest] = useState(0);
  const [askState, setAskState] = useState<{
    status: "idle" | "loading" | "answered";
    answer: string;
    sourceIds: string[];
  }>({ status: "idle", answer: "", sourceIds: [] });
  const [toast, setToast] = useState("");
  const saveTimers = useRef(new Map<string, number>());
  const toastTimer = useRef<number | null>(null);
  const aiRequestRef = useRef(0);
  const editorLineRef = useRef<number | null>(null);
  const lastSelectedIdRef = useRef<string | null>(null);
  const historyRef = useRef(new Map<string, NoteHistory>());
  const deletedHistoryRef = useRef<{ undo: DeletedNotesAction[]; redo: DeletedNotesAction[] }>({ undo: [], redo: [] });

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    try {
      localStorage.setItem("paper.theme", theme);
    } catch {
      // Ignore storage failures, the active document theme still updates.
    }
  }, [theme]);

  useEffect(() => {
    const load = async () => {
      const nextNotes = await listNotes();
      setNotes(nextNotes);
      const savedId = readLastActiveNoteId();
      const initial = nextNotes.find((note) => note.id === savedId) ?? nextNotes[0] ?? null;
      setActiveId(initial?.id ?? null);
      setSelectedIds(initial ? [initial.id] : []);
      lastSelectedIdRef.current = initial?.id ?? null;
      if (initial) {
        setContentFocusRequest({ noteId: initial.id, token: 1 });
      }
    };
    void load().catch(() => flash("Could not load notes"));
  }, []);

  useEffect(() => {
    if (!activeId) {
      return;
    }
    try {
      localStorage.setItem("paper.lastActiveNoteId", activeId);
    } catch {
      // Ignore storage failures, the active note still loads for this session.
    }
  }, [activeId]);

  useEffect(() => {
    return () => {
      for (const timer of saveTimers.current.values()) {
        window.clearTimeout(timer);
      }
      if (toastTimer.current) {
        window.clearTimeout(toastTimer.current);
      }
    };
  }, []);

  const activeNote = useMemo(
    () => notes.find((note) => note.id === activeId) ?? null,
    [notes, activeId],
  );

  useEffect(() => {
    aiRequestRef.current += 1;
    setAIResult(null);
  }, [activeId]);

  const visibleNotes = useMemo(() => {
    let pool = [...notes].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    if (activeTag) {
      pool = pool.filter((note) => note.tags.includes(activeTag));
    } else if (view === "recent") {
      pool = pool.slice(0, 5);
    } else if (view === "favorites") {
      pool = pool.filter((note) => note.favorite);
    } else if (view === "tasks") {
      pool = pool.filter((note) => hasTask(note.content));
    }

    const search = query.trim().toLowerCase();
    if (search) {
      pool = pool.filter((note) =>
        `${note.title} ${note.content} ${note.tags.join(" ")}`.toLowerCase().includes(search),
      );
    }
    return pool;
  }, [notes, activeTag, view, query]);

  const flash = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) {
      window.clearTimeout(toastTimer.current);
    }
    toastTimer.current = window.setTimeout(() => setToast(""), 1900);
  }, []);

  const persist = useCallback((note: Note) => {
    const existing = saveTimers.current.get(note.id);
    if (existing) {
      window.clearTimeout(existing);
    }
    const timer = window.setTimeout(() => {
      void updateNote(note.id, toDraft(note)).catch(() => flash("Could not save note"));
      saveTimers.current.delete(note.id);
    }, 420);
    saveTimers.current.set(note.id, timer);
  }, [flash]);

  const pushUndo = useCallback((note: Note) => {
    const history = historyRef.current.get(note.id) ?? { undo: [], redo: [] };
    const draft = toDraft(note);
    if (sameDraft(history.undo[history.undo.length - 1], draft)) {
      return;
    }
    history.undo.push(draft);
    if (history.undo.length > historyLimit) {
      history.undo.shift();
    }
    history.redo = [];
    historyRef.current.set(note.id, history);
    deletedHistoryRef.current.redo = [];
  }, []);

  const patchActive = useCallback(
    (fields: Partial<Note>) => {
      if (!activeNote) {
        return;
      }
      const nextNote = { ...activeNote, ...fields, updatedAt: new Date().toISOString() };
      if (sameDraft(toDraft(activeNote), toDraft(nextNote))) {
        return;
      }
      pushUndo(activeNote);
      setNotes((current) => current.map((note) => (note.id === nextNote.id ? nextNote : note)));
      persist(nextNote);
    },
    [activeNote, persist, pushUndo],
  );

  const restoreActiveDraft = useCallback(
    (draft: NoteDraft) => {
      if (!activeNote) {
        return;
      }
      const nextNote = { ...activeNote, ...draft, updatedAt: new Date().toISOString() };
      setNotes((current) => current.map((note) => (note.id === nextNote.id ? nextNote : note)));
      persist(nextNote);
      setAIResult(null);
    },
    [activeNote, persist],
  );

  const undoDeletedNotes = useCallback(async () => {
    const action = deletedHistoryRef.current.undo.pop();
    if (!action) {
      return false;
    }
    try {
      const restored = await Promise.all(action.notes.map((note) => createNote(toDraft(note))));
      setNotes((current) => {
        const next = [...current];
        next.splice(Math.min(action.index, next.length), 0, ...restored);
        return next;
      });
      setActiveId(restored[0]?.id ?? null);
      setSelectedIds(restored.map((note) => note.id));
      lastSelectedIdRef.current = restored[0]?.id ?? null;
      deletedHistoryRef.current.redo.push({ notes: restored, index: action.index });
      flash(restored.length === 1 ? "Note restored" : `${restored.length} notes restored`);
      return true;
    } catch {
      deletedHistoryRef.current.undo.push(action);
      flash(action.notes.length === 1 ? "Could not restore note" : "Could not restore notes");
      return true;
    }
  }, [flash]);

  const redoDeletedNotes = useCallback(async () => {
    const action = deletedHistoryRef.current.redo.pop();
    if (!action) {
      return false;
    }
    try {
      const ids = action.notes.map((note) => note.id);
      await Promise.all(ids.map((id) => deleteNote(id)));
      const deleted = new Set(ids);
      for (const id of ids) {
        historyRef.current.delete(id);
      }
      setNotes((current) => current.filter((note) => !deleted.has(note.id)));
      setSelectedIds([]);
      setActiveId((current) => (current && !deleted.has(current) ? current : null));
      lastSelectedIdRef.current = null;
      deletedHistoryRef.current.undo.push(action);
      flash(ids.length === 1 ? "Note deleted" : `${ids.length} notes deleted`);
      return true;
    } catch {
      deletedHistoryRef.current.redo.push(action);
      flash(action.notes.length === 1 ? "Could not delete note" : "Could not delete notes");
      return true;
    }
  }, [flash]);

  const undoActive = useCallback(async () => {
    if (await undoDeletedNotes()) {
      return;
    }
    if (!activeNote) {
      return;
    }
    const history = historyRef.current.get(activeNote.id);
    const previous = history?.undo.pop();
    if (!history || !previous) {
      flash("Nothing to undo");
      return;
    }
    history.redo.push(toDraft(activeNote));
    historyRef.current.set(activeNote.id, history);
    restoreActiveDraft(previous);
  }, [activeNote, flash, restoreActiveDraft, undoDeletedNotes]);

  const redoActive = useCallback(async () => {
    if (await redoDeletedNotes()) {
      return;
    }
    if (!activeNote) {
      return;
    }
    const history = historyRef.current.get(activeNote.id);
    const next = history?.redo.pop();
    if (!history || !next) {
      flash("Nothing to redo");
      return;
    }
    history.undo.push(toDraft(activeNote));
    if (history.undo.length > historyLimit) {
      history.undo.shift();
    }
    historyRef.current.set(activeNote.id, history);
    restoreActiveDraft(next);
  }, [activeNote, flash, restoreActiveDraft, redoDeletedNotes]);

  const handleNew = useCallback(async () => {
    try {
      const note = await createNote(emptyDraft);
      setNotes((current) => [note, ...current]);
      setActiveId(note.id);
      setSelectedIds([note.id]);
      lastSelectedIdRef.current = note.id;
      setView("all");
      setActiveTag(null);
      setQuery("");
      setTagDraft("");
      setAIResult(null);
      setNoteCardFocusRequest((request) => request + 1);
      setPaletteOpen(false);
      flash("New note");
    } catch {
      flash("Could not create note");
    }
  }, [flash]);

  const selectNote = useCallback(
    (note: Note, extend = false) => {
      setActiveId(note.id);
      setTagDraft("");
      setAIResult(null);
      editorLineRef.current = null;

      if (extend && lastSelectedIdRef.current) {
        const from = visibleNotes.findIndex((item) => item.id === lastSelectedIdRef.current);
        const to = visibleNotes.findIndex((item) => item.id === note.id);
        if (from >= 0 && to >= 0) {
          const [start, end] = from < to ? [from, to] : [to, from];
          setSelectedIds(visibleNotes.slice(start, end + 1).map((item) => item.id));
          return;
        }
      }

      setSelectedIds([note.id]);
      lastSelectedIdRef.current = note.id;
    },
    [visibleNotes],
  );

  const navigateNote = useCallback(
    (direction: "previous" | "next", extend = false) => {
      if (!visibleNotes.length) {
        return;
      }

      const activeIndex = activeId ? visibleNotes.findIndex((note) => note.id === activeId) : -1;
      const fallbackIndex = direction === "next" ? 0 : visibleNotes.length - 1;
      const nextIndex =
        activeIndex < 0
          ? fallbackIndex
          : Math.max(0, Math.min(visibleNotes.length - 1, activeIndex + (direction === "next" ? 1 : -1)));

      selectNote(visibleNotes[nextIndex], extend);
    },
    [activeId, selectNote, visibleNotes],
  );

  const focusActiveTitle = useCallback(() => {
    if (!activeId) {
      return;
    }
    setTitleFocusRequest((request) => ({ noteId: activeId, token: (request?.token ?? 0) + 1 }));
  }, [activeId]);

  const focusActiveContent = useCallback(() => {
    if (!activeId) {
      return;
    }
    setContentFocusRequest((request) => ({ noteId: activeId, token: (request?.token ?? 0) + 1 }));
  }, [activeId]);

  const focusActiveNoteCard = useCallback(() => {
    if (!activeId) {
      return;
    }
    setNoteCardFocusRequest((request) => request + 1);
  }, [activeId]);

  const handleDelete = useCallback(async () => {
    const ids = selectedIds.length ? selectedIds : activeNote ? [activeNote.id] : [];
    if (!ids.length) {
      return;
    }
    const selected = new Set(ids);
    const deletedNotes = notes.filter((note) => selected.has(note.id));
    const deleteIndex = Math.max(0, notes.findIndex((note) => selected.has(note.id)));
    try {
      await Promise.all(ids.map((id) => deleteNote(id)));
      for (const id of ids) {
        historyRef.current.delete(id);
        const timer = saveTimers.current.get(id);
        if (timer) {
          window.clearTimeout(timer);
          saveTimers.current.delete(id);
        }
      }
      const deleted = new Set(ids);
      const rest = notes.filter((note) => !deleted.has(note.id));
      const nextActive = rest[0] ?? null;
      setNotes(rest);
      setActiveId(nextActive?.id ?? null);
      setSelectedIds(nextActive ? [nextActive.id] : []);
      lastSelectedIdRef.current = nextActive?.id ?? null;
      deletedHistoryRef.current.undo.push({ notes: deletedNotes, index: deleteIndex });
      deletedHistoryRef.current.redo = [];
      setAIResult(null);
      flash(ids.length === 1 ? "Note deleted" : `${ids.length} notes deleted`);
    } catch {
      flash(ids.length === 1 ? "Could not delete note" : "Could not delete notes");
    }
  }, [activeNote, selectedIds, notes, flash]);

  const toggleFavorite = useCallback(() => {
    if (!activeNote) {
      return;
    }
    patchActive({ favorite: !activeNote.favorite });
    flash(activeNote.favorite ? "Removed from favorites" : "Added to favorites");
  }, [activeNote, patchActive, flash]);

  const toggleTheme = useCallback(() => {
    setTheme((current) => (current === "dark" ? "light" : "dark"));
  }, []);

  const addTag = useCallback(() => {
    if (!activeNote) {
      return;
    }
    const tag = normalizeTag(tagDraft);
    if (!tag || activeNote.tags.includes(tag)) {
      setTagDraft("");
      return;
    }
    patchActive({ tags: [...activeNote.tags, tag] });
    setTagDraft("");
  }, [activeNote, tagDraft, patchActive]);

  const removeTag = useCallback(
    (tag: string) => {
      if (!activeNote) {
        return;
      }
      patchActive({ tags: activeNote.tags.filter((item) => item !== tag) });
    },
    [activeNote, patchActive],
  );

  const runAI = useCallback(
    async (action: AIAction) => {
      if (!activeNote) {
        return;
      }
      if (!activeNote.content.trim() && action !== "suggest_tags" && action !== "suggest_title") {
        flash("Nothing to work with yet");
        return;
      }
      const request = aiRequestRef.current + 1;
      aiRequestRef.current = request;
      setAIResult({ action, status: "loading", text: "" });
      try {
        const result = await assistNote(activeNote.id, action);
        if (aiRequestRef.current === request) {
          setAIResult({ action, status: "ready", text: result.text });
        }
      } catch {
        if (aiRequestRef.current === request) {
          setAIResult(null);
          flash("AI request failed");
        }
      }
    },
    [activeNote, flash],
  );

  const applyAIResult = useCallback(() => {
    if (!activeNote || !aiResult || aiResult.status !== "ready") {
      return;
    }
    const text = aiResult.text.trim();
    if (!text) {
      return;
    }
    if (aiResult.action === "suggest_title") {
      patchActive({ title: text.split(/\n+/)[0].replace(/^[-*]\s*/, "") });
    } else if (aiResult.action === "suggest_tags") {
      const tags = parseTags(text).filter((tag) => !activeNote.tags.includes(tag));
      patchActive({ tags: [...activeNote.tags, ...tags] });
    } else if (aiResult.action === "extract_tasks") {
      const tasks = text
        .split(/\n+/)
        .map((line) => line.trim().replace(/^[-*•☐]\s*/, ""))
        .filter(Boolean)
        .map((line) => `☐ ${line}`)
        .join("\n");
      patchActive({ content: insertBlockAfterLine(activeNote.content, editorLineRef.current, `Tasks\n${tasks}`) });
    } else if (aiResult.action === "summarize") {
      patchActive({ content: insertBlockAfterLine(activeNote.content, editorLineRef.current, `Summary\n${text}`) });
    } else {
      patchActive({ content: text });
    }
    aiRequestRef.current += 1;
    setAIResult(null);
    flash("Applied");
  }, [activeNote, aiResult, patchActive, flash]);

  const dismissAIResult = useCallback(() => {
    aiRequestRef.current += 1;
    setAIResult(null);
  }, []);

  const ask = useCallback(
    async (question: string) => {
      setAskState({ status: "loading", answer: "", sourceIds: [] });
      try {
        const answer: AskAnswer = await askNotes(question);
        setAskState({ status: "answered", answer: answer.answer, sourceIds: answer.sourceIds });
      } catch {
        setAskState({ status: "answered", answer: "The AI service could not answer right now.", sourceIds: [] });
      }
    },
    [],
  );

  const openPalette = useCallback((mode: PaletteMode) => {
    setPaletteMode(mode);
    setPaletteOpen(true);
    setAskState({ status: "idle", answer: "", sourceIds: [] });
  }, []);

  const actions = useMemo<PaletteAction[]>(
    () => [
      { label: "New note", meta: "", icon: <Plus size={14} strokeWidth={2} />, kbd: "⌘N", run: handleNew },
      {
        label: "Ask my notes",
        meta: "semantic question",
        icon: <MessageCircleQuestion size={14} strokeWidth={1.9} />,
        kbd: "⌘⇧K",
        run: () => openPalette("ask"),
      },
      {
        label: "Summarize note",
        meta: activeNote?.title || "Untitled",
        icon: <AlignLeft size={14} strokeWidth={1.9} />,
        run: () => {
          setPaletteOpen(false);
          void runAI("summarize");
        },
      },
      {
        label: "Extract tasks",
        meta: activeNote?.title || "Untitled",
        icon: <ListTodo size={14} strokeWidth={1.9} />,
        run: () => {
          setPaletteOpen(false);
          void runAI("extract_tasks");
        },
      },
      { label: "Toggle favorite", meta: "", icon: <Star size={14} strokeWidth={1.9} />, kbd: "⌘F", run: toggleFavorite },
    ],
    [handleNew, openPalette, activeNote, runAI, toggleFavorite],
  );

  useShortcuts({
    onCommandPalette: () => openPalette("search"),
    onAskPalette: () => openPalette("ask"),
    onCreateNote: () => void handleNew(),
    onDelete: () => void handleDelete(),
    onToggleFavorite: toggleFavorite,
    onToggleSidebar: () => setSidebarHidden((hidden) => !hidden),
    onToggleTheme: toggleTheme,
    onUndo: undoActive,
    onRedo: redoActive,
    onNavigateNote: (direction) => {
      if (!paletteOpen) {
        navigateNote(direction, false);
        setNoteCardFocusRequest((request) => request + 1);
      }
    },
    onFocusActiveContent: focusActiveContent,
    onEscape: () => setPaletteOpen(false),
  });

  return (
    <div className="app-shell">
      <Sidebar
        notes={notes}
        view={view}
        activeTag={activeTag}
        hidden={sidebarHidden}
        onViewChange={(nextView) => {
          setView(nextView);
          setActiveTag(null);
        }}
        onTagChange={(tag) => {
          setActiveTag(tag);
          setView("all");
        }}
        onNew={() => void handleNew()}
        onToggleCollapse={() => setSidebarHidden((hidden) => !hidden)}
        user={user}
        onLogout={onLogout}
        onClaimLegacyNotes={async () => {
          const result = await claimLegacyNotes();
          const nextNotes = await listNotes();
          setNotes(nextNotes);
          return result.claimed;
        }}
      />

      <NotesColumn
        title={activeTag ? `#${activeTag}` : titleForView(view)}
        notes={visibleNotes}
        activeId={activeId}
        selectedIds={selectedIds}
        query={query}
        sidebarHidden={sidebarHidden}
        focusRequest={noteCardFocusRequest}
        onQueryChange={setQuery}
        onNew={() => void handleNew()}
        onSelect={selectNote}
        onNavigate={navigateNote}
        onFocusTitle={focusActiveTitle}
        onFocusContent={focusActiveContent}
        onToggleSidebar={() => setSidebarHidden(false)}
      />

      <NoteEditor
        note={activeNote}
        tagDraft={tagDraft}
        aiResult={aiResult}
        titleFocusRequest={titleFocusRequest}
        contentFocusRequest={contentFocusRequest}
        onTitleChange={(title) => patchActive({ title })}
        onContentChange={(content) => patchActive({ content })}
        onUploadImage={async (file) => {
          if (!activeNote) {
            throw new Error("No note selected");
          }
          try {
            return await uploadNoteImage(activeNote.id, file);
          } catch (error) {
            flash(error instanceof Error ? error.message : "Could not upload image");
            throw error;
          }
        }}
        onTagDraftChange={setTagDraft}
        onAddTag={addTag}
        onRemoveTag={removeTag}
        onToggleFavorite={toggleFavorite}
        onDelete={() => void handleDelete()}
        onSearch={() => openPalette("search")}
        onToggleTheme={toggleTheme}
        onFocusNoteList={focusActiveNoteCard}
        onAssist={(action) => void runAI(action)}
        onCaretLineChange={(line) => {
          editorLineRef.current = line;
        }}
        onApplyResult={applyAIResult}
        onDismissResult={dismissAIResult}
        theme={theme}
      />

      <CommandPalette
        open={paletteOpen}
        mode={paletteMode}
        notes={notes}
        actions={actions}
        askState={askState}
        onModeChange={setPaletteMode}
        onAsk={(question) => void ask(question)}
        onSelectNote={selectNote}
        onClose={() => setPaletteOpen(false)}
      />

      <Toast message={toast} />
    </div>
  );
}

function toDraft(note: Note): NoteDraft {
  return {
    title: note.title,
    content: note.content,
    tags: note.tags,
    favorite: note.favorite,
  };
}

function sameDraft(a: NoteDraft | undefined, b: NoteDraft | undefined) {
  if (!a || !b) {
    return false;
  }
  return (
    a.title === b.title &&
    a.content === b.content &&
    a.favorite === b.favorite &&
    a.tags.length === b.tags.length &&
    a.tags.every((tag, index) => tag === b.tags[index])
  );
}

function insertBlockAfterLine(content: string, line: number | null, block: string) {
  const cleanBlock = block.trim();
  if (!content.trim()) {
    return cleanBlock;
  }

  const lines = content.split("\n");
  const targetLine = line == null ? lines.length - 1 : Math.max(0, Math.min(line, lines.length - 1));
  const nextLine = lines[targetLine + 1];
  const insertLines = [
    ...(lines[targetLine]?.trim() ? [""] : []),
    ...cleanBlock.split("\n"),
    ...(nextLine == null || !nextLine.trim() ? [] : [""]),
  ];

  lines.splice(targetLine + 1, 0, ...insertLines);
  return lines.join("\n");
}

function titleForView(view: ViewKey) {
  return {
    all: "All notes",
    recent: "Recent",
    favorites: "Favorites",
    tasks: "Tasks",
  }[view];
}

function hasTask(content: string) {
  return /☐|\b(todo|buy|call|book|fix|send|write|ask|get|need)\b/i.test(content);
}

function readLastActiveNoteId(): string | null {
  try {
    return localStorage.getItem("paper.lastActiveNoteId");
  } catch {
    return null;
  }
}

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("paper.theme");
    if (saved === "light" || saved === "dark") {
      return saved;
    }
  } catch {
    // Fall back to system preference when storage is unavailable.
  }
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function normalizeTag(tag: string) {
  return tag.trim().toLowerCase().replace(/^#/, "");
}

function parseTags(text: string) {
  return text
    .split(/[\n,]/)
    .map((tag) => normalizeTag(tag.replace(/^[-*#]\s*/, "")))
    .filter(Boolean)
    .slice(0, 5);
}
