import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlignLeft, ListTodo, MessageCircleQuestion, PanelLeftOpen, PanelRightOpen, Plus, Star } from "lucide-react";
import { CommandPalette, type PaletteAction, type PaletteMode } from "../components/CommandPalette";
import { NotesColumn } from "../components/NotesColumn";
import { Sidebar, type ViewKey } from "../components/Sidebar";
import { Toast } from "../components/Toast";
import { NoteEditor, type AIResult } from "../features/NoteEditor";
import { askNotes, assistNote, createNote, deleteNote, listNotes, updateNote } from "../lib/api";
import { useShortcuts } from "../lib/useShortcuts";
import type { AIAction, AskAnswer, Note, NoteDraft } from "../types/note";

const emptyDraft: NoteDraft = {
  title: "",
  content: "",
  tags: [],
  favorite: false,
};

export function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [view, setView] = useState<ViewKey>("all");
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [tagDraft, setTagDraft] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("search");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [notesCollapsed, setNotesCollapsed] = useState(false);
  const [aiResult, setAIResult] = useState<AIResult | null>(null);
  const [askState, setAskState] = useState<{
    status: "idle" | "loading" | "answered";
    answer: string;
    sourceIds: string[];
  }>({ status: "idle", answer: "", sourceIds: [] });
  const [toast, setToast] = useState("");
  const saveTimers = useRef(new Map<string, number>());
  const toastTimer = useRef<number | null>(null);

  useEffect(() => {
    const load = async () => {
      const nextNotes = await listNotes();
      setNotes(nextNotes);
      setActiveId(nextNotes[0]?.id ?? null);
    };
    void load().catch(() => flash("Could not load notes"));
  }, []);

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

  const patchActive = useCallback(
    (fields: Partial<Note>) => {
      if (!activeNote) {
        return;
      }
      const nextNote = { ...activeNote, ...fields, updatedAt: new Date().toISOString() };
      setNotes((current) => current.map((note) => (note.id === nextNote.id ? nextNote : note)));
      persist(nextNote);
    },
    [activeNote, persist],
  );

  const handleNew = useCallback(async () => {
    try {
      const note = await createNote(emptyDraft);
      setNotes((current) => [note, ...current]);
      setActiveId(note.id);
      setView("all");
      setActiveTag(null);
      setQuery("");
      setTagDraft("");
      setAIResult(null);
      setPaletteOpen(false);
      flash("New note");
    } catch {
      flash("Could not create note");
    }
  }, [flash]);

  const selectNote = useCallback((note: Note) => {
    setActiveId(note.id);
    setTagDraft("");
    setAIResult(null);
  }, []);

  const handleDelete = useCallback(async () => {
    if (!activeNote) {
      return;
    }
    try {
      await deleteNote(activeNote.id);
      const rest = notes.filter((note) => note.id !== activeNote.id);
      setNotes(rest);
      setActiveId(rest[0]?.id ?? null);
      setAIResult(null);
      flash("Note deleted");
    } catch {
      flash("Could not delete note");
    }
  }, [activeNote, notes, flash]);

  const toggleFavorite = useCallback(() => {
    if (!activeNote) {
      return;
    }
    patchActive({ favorite: !activeNote.favorite });
    flash(activeNote.favorite ? "Removed from favorites" : "Added to favorites");
  }, [activeNote, patchActive, flash]);

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
      setAIResult({ action, status: "loading", text: "" });
      try {
        const result = await assistNote(activeNote.id, action);
        setAIResult({ action, status: "ready", text: result.text });
      } catch {
        setAIResult(null);
        flash("AI request failed");
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
      patchActive({ content: `${activeNote.content.trimEnd()}\n\nTasks\n${tasks}`.trim() });
    } else if (aiResult.action === "summarize") {
      patchActive({ content: `Summary\n${text}\n\n${activeNote.content}`.trim() });
    } else {
      patchActive({ content: text });
    }
    setAIResult(null);
    flash("Applied");
  }, [activeNote, aiResult, patchActive, flash]);

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
      { label: "Toggle favorite", meta: "", icon: <Star size={14} strokeWidth={1.9} />, kbd: "⌘D", run: toggleFavorite },
    ],
    [handleNew, openPalette, activeNote, runAI, toggleFavorite],
  );

  useShortcuts({
    onCommandPalette: () => openPalette("search"),
    onAskPalette: () => openPalette("ask"),
    onCreateNote: () => void handleNew(),
    onToggleFavorite: toggleFavorite,
    onEscape: () => setPaletteOpen(false),
  });

  return (
    <div className="app-shell">
      {sidebarCollapsed ? (
        <div className="collapsed-rail">
          <button onClick={() => setSidebarCollapsed(false)} aria-label="Expand navigation">
            <PanelLeftOpen size={16} strokeWidth={1.9} />
          </button>
        </div>
      ) : (
        <Sidebar
          notes={notes}
          view={view}
          activeTag={activeTag}
          onViewChange={(nextView) => {
            setView(nextView);
            setActiveTag(null);
          }}
          onTagChange={(tag) => {
            setActiveTag(tag);
            setView("all");
          }}
          onNew={() => void handleNew()}
          onToggleCollapse={() => setSidebarCollapsed(true)}
        />
      )}

      {notesCollapsed ? (
        <div className="collapsed-rail notes-rail">
          <button onClick={() => setNotesCollapsed(false)} aria-label="Expand note list">
            <PanelRightOpen size={16} strokeWidth={1.9} />
          </button>
        </div>
      ) : (
        <NotesColumn
          title={activeTag ? `#${activeTag}` : titleForView(view)}
          notes={visibleNotes}
          activeId={activeId}
          query={query}
          onQueryChange={setQuery}
          onSelect={selectNote}
          onToggleCollapse={() => setNotesCollapsed(true)}
        />
      )}

      <NoteEditor
        note={activeNote}
        tagDraft={tagDraft}
        aiResult={aiResult}
        onTitleChange={(title) => patchActive({ title })}
        onContentChange={(content) => patchActive({ content })}
        onTagDraftChange={setTagDraft}
        onAddTag={addTag}
        onRemoveTag={removeTag}
        onToggleFavorite={toggleFavorite}
        onDelete={() => void handleDelete()}
        onSearch={() => openPalette("search")}
        onAssist={(action) => void runAI(action)}
        onApplyResult={applyAIResult}
        onDismissResult={() => setAIResult(null)}
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
