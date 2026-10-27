import { AutosaveQueue, type SaveState } from "../lib/autosave";
import { prepareNavigation, registerDraftGuard } from "../lib/pwa";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import { AlignLeft, ListTodo, MessageCircleQuestion, Plus, Star } from "lucide-react";
import { CommandPalette, type PaletteAction, type PaletteMode } from "../components/CommandPalette";
import { NotesColumn } from "../components/NotesColumn";
import { Sidebar, type ViewKey } from "../components/Sidebar";
import { FolderNav } from "../components/FolderNav";
import { FolderDialog, folderColors, type FolderDialogState } from "../components/FolderDialog";
import { listFolders, saveFolder, deleteFolder, moveNotes } from "../lib/api";
import type { Folder, NoteMove } from "../types/note";
import { Folder as FolderIcon, ChevronDown } from "lucide-react";
import { Toast } from "../components/Toast";
import { NoteEditor, type AIResult } from "../features/NoteEditor";
import { askNotes, assistNote, createNote, deleteNote, listNotes, searchNotes, updateNote, uploadNoteImage } from "../lib/api";
import { recordDraft, historyLimit, type NoteHistory } from "../lib/noteHistory";
import { matchesFilter } from "../lib/notesFilter";
import { useShortcuts } from "../lib/useShortcuts";
import type { AIAction, AskAnswer, Note, NoteDraft } from "../types/note";
import type { AuthUser } from "../types/auth";

type Theme = "light" | "dark";
type MobilePane = "notes" | "editor";
type ResizableColumn = "navigation" | "notes";

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

const emptyDraft: NoteDraft = {
  title: "",
  content: "",
  tags: [],
  favorite: false,
};

export function NotesPage({ user, aiEnabled, onLogout }: { user: AuthUser; aiEnabled: boolean; onLogout: () => Promise<void> }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  // undefined = all folders, null = unfiled.
  const [folderScope, setFolderScope] = useState<string | null | undefined>(undefined);
  const [folderDialog, setFolderDialog] = useState<FolderDialogState | null>(null);
  const [moveUndo, setMoveUndo] = useState<NoteMove[] | null>(null);
  const [moving, setMoving] = useState(false);
  const folderBusy = useRef(false);
  const sortedFolders = useMemo(() => [...folders].sort((a,b) => a.name.localeCompare(b.name)), [folders]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [view, setView] = useState<ViewKey>("all");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [matchIds, setMatchIds] = useState<Set<string> | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteMode, setPaletteMode] = useState<PaletteMode>("search");
  const [theme, setTheme] = useState<Theme>(() => initialTheme());
  const [sidebarHidden, setSidebarHidden] = useState(() => matchesCompactNavigation());
  const [navPinned, setNavPinned] = useState(false);
  const [mobilePane, setMobilePane] = useState<MobilePane>("notes");
  const [navigationWidth, setNavigationWidth] = useState(() => initialColumnWidth("navigation"));
  const [notesWidth, setNotesWidth] = useState(() => initialColumnWidth("notes"));
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
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [online, setOnline] = useState(navigator.onLine);
  const [saveQueue] = useState(() => new AutosaveQueue<NoteDraft>((id, draft) => updateNote(id, draft), setSaveState));
  useEffect(() => registerDraftGuard(() => saveQueue.flush(), () => saveQueue.dirty), [saveQueue]);
  useEffect(() => {
    const change = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) void saveQueue.flush().catch(() => {});
    };
    window.addEventListener("online", change); window.addEventListener("offline", change);
    return () => { window.removeEventListener("online", change); window.removeEventListener("offline", change); };
  }, [saveQueue]);
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
    const query = window.matchMedia?.("(max-width: 1100px)");
    if (!query) {
      return;
    }
    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) {
        setSidebarHidden(true);
      }
    };
    query.addEventListener("change", handleChange);
    return () => query.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    for (const history of historyRef.current.values()) history.group = undefined;
  }, [activeId]);

  useEffect(() => {
    if (activeId && !navPinned && !matchesCompactNavigation()) {
      setSidebarHidden(true);
    }
  }, [activeId, navPinned]);

  useEffect(() => {
    const load = async () => {
      const [nextNotes, nextFolders] = await Promise.all([listNotes(), listFolders()]);
      setFolders(nextFolders);
      setNotes(nextNotes);
      const savedId = readLastActiveNoteId();
      const initial = nextNotes.find((note) => note.id === savedId) ?? nextNotes[0] ?? null;
      setActiveId(initial?.id ?? null);
      setSelectedIds(initial ? [initial.id] : []);
      lastSelectedIdRef.current = initial?.id ?? null;
      if (initial && !matchesMobileLayout()) {
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
      saveQueue.dispose();
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
    if (folderScope !== undefined) pool = pool.filter((note) => (note.folderId ?? null) === folderScope);
    if (matchIds) {
      pool = pool.filter((note) => matchIds.has(note.id));
    }
    if (view === "favorites") {
      pool = pool.filter((note) => note.favorite);
    } else if (view === "tasks") {
      pool = pool.filter((note) => hasTask(note.content));
    } else if (view === "recent") {
      pool = pool.slice(0, 5);
    }
    return pool;
  }, [notes, view, matchIds, folderScope]);

  const notesRef = useRef(notes);
  notesRef.current = notes;
  const searchSeq = useRef(0);

  useEffect(() => {
    const seq = ++searchSeq.current;
    const trimmed = query.trim();
    if (!trimmed && activeTags.length === 0) {
      setMatchIds(null);
      return;
    }
    const handle = window.setTimeout(() => {
      void searchNotes(trimmed, activeTags)
        .then((results) => {
          if (seq === searchSeq.current) {
            setMatchIds(new Set(results.map((note) => note.id)));
          }
        })
        .catch(() => {
          if (seq === searchSeq.current) {
            const filtered = notesRef.current.filter((note) => matchesFilter(note, { query: trimmed, tags: activeTags }));
            setMatchIds(new Set(filtered.map((note) => note.id)));
          }
        });
    }, 200);
    return () => window.clearTimeout(handle);
  }, [query, activeTags]);

  const flash = useCallback((message: string) => {
    setToast(message);
    if (toastTimer.current) {
      window.clearTimeout(toastTimer.current);
    }
    toastTimer.current = window.setTimeout(() => setToast(""), 1900);
  }, []);

  const setColumnWidth = useCallback((column: ResizableColumn, width: number) => {
    const next = clampColumnWidth(column, width);
    if (column === "navigation") {
      setNavigationWidth(next);
    } else {
      setNotesWidth(next);
    }
    try {
      localStorage.setItem(`paper.${column}Width`, String(next));
    } catch {}
  }, []);

  const startColumnResize = useCallback(
    (column: ResizableColumn, event: ReactPointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || matchesCompactNavigation()) {
        return;
      }
      event.preventDefault();
      const startX = event.clientX;
      const startWidth = event.currentTarget.parentElement?.getBoundingClientRect().width ?? 0;
      const previousCursor = document.body.style.cursor;
      const previousSelection = document.body.style.userSelect;
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const move = (moveEvent: PointerEvent) => {
        setColumnWidth(column, startWidth + moveEvent.clientX - startX);
      };
      const stop = () => {
        document.body.style.cursor = previousCursor;
        document.body.style.userSelect = previousSelection;
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", stop);
        window.removeEventListener("pointercancel", stop);
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", stop, { once: true });
      window.addEventListener("pointercancel", stop, { once: true });
    },
    [setColumnWidth],
  );

  const closeCompactSidebar = useCallback(() => {
    if (matchesCompactNavigation()) {
      setSidebarHidden(true);
    }
  }, []);

  const persist = useCallback((note: Note) => {
    saveQueue.schedule(note.id, toDraft(note));
  }, [saveQueue]);

  const pushUndo = useCallback((note: Note, next: Note) => {
    const history = historyRef.current.get(note.id) ?? { undo: [], redo: [] };
    recordDraft(history, toDraft(note), toDraft(next));
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
      pushUndo(activeNote, nextNote);
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
      const restored = await Promise.all(action.notes.map((note) => createNote({ ...toDraft(note), folderId: folders.some((folder) => folder.id === note.folderId) ? note.folderId : null })));
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
  }, [flash, folders]);

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
        saveQueue.discard(id);
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

  const editorFocused = () =>
    document.activeElement instanceof HTMLElement && Boolean(document.activeElement.closest(".editor-shell"));

  const undoNoteContent = useCallback(() => {
    if (!activeNote) {
      return;
    }
    const history = historyRef.current.get(activeNote.id);
    if (history) history.group = undefined;
    const previous = history?.undo.pop();
    if (!history || !previous) {
      flash("Nothing to undo");
      return;
    }
    history.redo.push(toDraft(activeNote));
    historyRef.current.set(activeNote.id, history);
    restoreActiveDraft(previous);
  }, [activeNote, flash, restoreActiveDraft]);

  const redoNoteContent = useCallback(() => {
    if (!activeNote) {
      return;
    }
    const history = historyRef.current.get(activeNote.id);
    if (history) history.group = undefined;
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
  }, [activeNote, flash, restoreActiveDraft]);

  const undoActive = useCallback(async () => {
    if (!editorFocused() && (await undoDeletedNotes())) {
      return;
    }
    undoNoteContent();
  }, [undoDeletedNotes, undoNoteContent]);

  const redoActive = useCallback(async () => {
    if (!editorFocused() && (await redoDeletedNotes())) {
      return;
    }
    redoNoteContent();
  }, [redoDeletedNotes, redoNoteContent]);

  const handleNew = useCallback(async () => {
    try {
      const note = await createNote({ ...emptyDraft, folderId: folderScope ?? null });
      setNotes((current) => [note, ...current]);
      setActiveId(note.id);
      setSelectedIds([note.id]);
      lastSelectedIdRef.current = note.id;
      setView("all");
      setActiveTags([]);
      setQuery("");
      setTagDraft("");
      setAIResult(null);
      setNoteCardFocusRequest((request) => request + 1);
      setPaletteOpen(false);
      setMobilePane("editor");
      closeCompactSidebar();
      flash("New note");
    } catch {
      flash("Could not create note");
    }
  }, [closeCompactSidebar, flash, folderScope]);

  const selectNote = useCallback(
    (note: Note, extend = false) => {
      if (folderScope !== undefined && (note.folderId ?? null) !== folderScope) setFolderScope(undefined);
      setActiveId(note.id);
      setMobilePane("editor");
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
    [visibleNotes, folderScope],
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
        saveQueue.discard(id);
      }
      const deleted = new Set(ids);
      const rest = notes.filter((note) => !deleted.has(note.id));
      const nextActive = rest[0] ?? null;
      setNotes(rest);
      setActiveId(nextActive?.id ?? null);
      setSelectedIds(nextActive ? [nextActive.id] : []);
      setMobilePane(nextActive ? "editor" : "notes");
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

  const favoriteNote = useCallback(
    (note: Note) => {
      const next = { ...note, favorite: !note.favorite, updatedAt: new Date().toISOString() };
      setNotes((current) => current.map((item) => (item.id === note.id ? next : item)));
      persist(next);
      flash(next.favorite ? "Added to favorites" : "Removed from favorites");
    },
    [persist, flash],
  );

  const duplicateNote = useCallback(
    async (note: Note) => {
      try {
        const created = await createNote({ ...toDraft(note), folderId: note.folderId ?? null, title: note.title ? `${note.title} (copy)` : "" });
        setNotes((current) => [created, ...current]);
        setActiveId(created.id);
        setSelectedIds([created.id]);
        lastSelectedIdRef.current = created.id;
        flash("Note duplicated");
      } catch {
        flash("Could not duplicate note");
      }
    },
    [flash],
  );

  const deleteSingleNote = useCallback(
    async (note: Note) => {
      const index = Math.max(0, notes.findIndex((item) => item.id === note.id));
      try {
        await deleteNote(note.id);
        saveQueue.discard(note.id);
        setNotes((current) => current.filter((item) => item.id !== note.id));
        setSelectedIds((current) => current.filter((id) => id !== note.id));
        setActiveId((current) => (current === note.id ? null : current));
        if (lastSelectedIdRef.current === note.id) {
          lastSelectedIdRef.current = null;
        }
        deletedHistoryRef.current.undo.push({ notes: [note], index });
        deletedHistoryRef.current.redo = [];
        flash("Note deleted");
      } catch {
        flash("Could not delete note");
      }
    },
    [notes, flash],
  );

  const toggleFilterTag = useCallback((tag: string) => {
    const normalized = normalizeTag(tag);
    if (!normalized) {
      return;
    }
    setView("all");
    setActiveTags((current) => (current.includes(normalized) ? current.filter((item) => item !== normalized) : [...current, normalized]));
  }, []);

  const addFilterTag = useCallback((tag: string) => {
    const normalized = normalizeTag(tag);
    if (!normalized) {
      return;
    }
    setActiveTags((current) => (current.includes(normalized) ? current : [...current, normalized]));
  }, []);

  const removeFilterTag = useCallback((tag: string) => {
    setActiveTags((current) => current.filter((item) => item !== tag));
  }, []);

  const clearFilters = useCallback(() => {
    setActiveTags([]);
    setQuery("");
  }, []);

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
      ...(aiEnabled
        ? [
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
          ]
        : []),
      { label: "Toggle favorite", meta: "", icon: <Star size={14} strokeWidth={1.9} />, kbd: "⌘F", run: toggleFavorite },
    ],
    [handleNew, openPalette, activeNote, runAI, toggleFavorite, aiEnabled],
  );

  useShortcuts({
    onCommandPalette: () => openPalette("search"),
    onAskPalette: () => {
      if (aiEnabled) {
        openPalette("ask");
      }
    },
    onCreateNote: () => void handleNew(),
    onDelete: () => void handleDelete(),
    onToggleFavorite: toggleFavorite,
    onToggleSidebar: () => {
      const opening = sidebarHidden;
      setNavPinned(opening);
      setSidebarHidden(!opening);
    },
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

  const applyMoves = async (moves: NoteMove[], remember = true) => {
    if (folderBusy.current)
      throw new Error("Please wait for the current move to finish.");
    folderBusy.current = true;
    setMoving(true);
    const previous = moves.map((move) => ({
      noteId: move.noteId,
      folderId:
        notesRef.current.find((note) => note.id === move.noteId)?.folderId ??
        null,
    }));
    const patchFolders = (changes: NoteMove[]) =>
      setNotes((current) =>
        current.map((note) => {
          const change = changes.find((move) => move.noteId === note.id);
          return change ? { ...note, folderId: change.folderId } : note;
        }),
      );
    patchFolders(moves);
    try {
      await moveNotes(moves);
      setMoveUndo(remember ? previous : null);
      if (folderScope !== undefined) {
        const leaving = new Set(
          moves
            .filter((move) => move.folderId !== folderScope)
            .map((move) => move.noteId),
        );
        setSelectedIds((ids) => ids.filter((id) => !leaving.has(id)));
        setActiveId((id) => (id && leaving.has(id) ? null : id));
      }
    } catch (error) {
      patchFolders(previous);
      throw error;
    } finally {
      folderBusy.current = false;
      setMoving(false);
    }
  };
  const moveTo = (ids: string[], folderId: string | null) =>
    applyMoves(ids.map((noteId) => ({ noteId, folderId })));
  const chooseFolder = (id: string | null) => {
    setNavPinned(true);
    setFolderScope(id);
    setView("all");
    setMobilePane("notes");
    const first = notes.find(
      (note) =>
        (note.folderId ?? null) === id &&
        matchesFilter(note, { query, tags: activeTags }),
    );
    setActiveId(first?.id ?? null);
    setSelectedIds(first ? [first.id] : []);
    closeCompactSidebar();
  };
  const openMove = (ids: string[]) => {
    if (ids.length) setFolderDialog({ kind: "move", ids });
  };

  const shellStyle = {
    "--sidebar-width": `${navigationWidth}px`,
    "--notes-width": `${notesWidth}px`,
  } as CSSProperties;

  return (
    <div className={`app-shell mobile-${mobilePane}`} style={shellStyle}>
      <Sidebar
        foldersSlot={
          <FolderNav
            folders={sortedFolders}
            notes={notes}
            selected={folderScope}
            onSelect={chooseFolder}
            onCreate={() => setFolderDialog({ kind: "new" })}
            onEdit={(folder) => setFolderDialog({ kind: "edit", folder })}
            onDelete={(folder) => setFolderDialog({ kind: "edit", folder, confirmDelete: true })}
            onDrop={(ids, id) =>
              void moveTo(
                ids.filter((noteId) =>
                  notes.some((note) => note.id === noteId),
                ),
                id,
              ).catch((error: Error) => flash(error.message))
            }
          />
        }
        folderSelected={folderScope !== undefined}
        notes={notes}
        view={view}
        activeTags={activeTags}
        hidden={sidebarHidden}
        onViewChange={(nextView) => {
          setFolderScope(undefined);
          setView(nextView);
          setActiveTags([]);
          setQuery("");
          setMobilePane("notes");
          closeCompactSidebar();
        }}
        onToggleTag={(tag) => {
          toggleFilterTag(tag);
          setMobilePane("notes");
          closeCompactSidebar();
        }}
        onNew={() => void handleNew()}
        onToggleCollapse={() => {
          setNavPinned(false);
          setSidebarHidden(true);
        }}
        user={user}
        onLogout={async () => { await prepareNavigation(); await onLogout(); }}
        onResizeStart={(event) => startColumnResize("navigation", event)}
        onResizeBy={(delta) =>
          setColumnWidth("navigation", navigationWidth + delta)
        }
      />

      {!sidebarHidden ? (
        <button
          className="sidebar-scrim"
          type="button"
          onClick={() => {
            setNavPinned(false);
            setSidebarHidden(true);
          }}
          aria-label="Close navigation"
        />
      ) : null}

      <NotesColumn
        title={
          folderScope === undefined
            ? titleForView(view)
            : folderScope === null
              ? "No folder"
              : (folders.find((folder) => folder.id === folderScope)?.name ??
                "Folder")
        }
        folders={folders}
        showFolders={folderScope === undefined}
        onMoveNotes={openMove}
        onSearchAll={
          folderScope !== undefined && (query.trim() || activeTags.length)
            ? () => setFolderScope(undefined)
            : undefined
        }
        notes={visibleNotes}
        activeId={activeId}
        selectedIds={selectedIds}
        query={query}
        activeTags={activeTags}
        sidebarHidden={sidebarHidden}
        focusRequest={noteCardFocusRequest}
        onQueryChange={setQuery}
        onAddTag={addFilterTag}
        onRemoveTag={removeFilterTag}
        onClearFilters={clearFilters}
        onNew={() => void handleNew()}
        onSelect={selectNote}
        onFavoriteNote={favoriteNote}
        onDuplicateNote={(note) => void duplicateNote(note)}
        onDeleteNote={(note) => void deleteSingleNote(note)}
        onNavigate={navigateNote}
        onFocusTitle={focusActiveTitle}
        onFocusContent={focusActiveContent}
        onToggleSidebar={() => {
          setNavPinned(true);
          setSidebarHidden(false);
        }}
        onResizeStart={(event) => startColumnResize("notes", event)}
        onResizeBy={(delta) => setColumnWidth("notes", notesWidth + delta)}
      />

      <NoteEditor
        folderControl={
          activeNote ? (
            <button
              className="editor-folder-button"
              onClick={() => openMove([activeNote.id])}
              aria-label="Move note to folder"
              title="Move to folder"
            >
              <FolderIcon
                size={14}
                style={{
                  color:
                    folderColors[
                      folders.find(
                        (folder) => folder.id === activeNote.folderId,
                      )?.color ?? "slate"
                    ],
                }}
              />
              <span>
                {folders.find((folder) => folder.id === activeNote.folderId)
                  ?.name ?? "No folder"}
              </span>
              <ChevronDown size={12} />
            </button>
          ) : null
        }
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
            flash(
              error instanceof Error ? error.message : "Could not upload image",
            );
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
        onBackToNotes={() => setMobilePane("notes")}
        onAssist={(action) => void runAI(action)}
        onCaretLineChange={(line) => {
          editorLineRef.current = line;
        }}
        onApplyResult={applyAIResult}
        onDismissResult={dismissAIResult}
        onUndo={() => void undoNoteContent()}
        onRedo={() => void redoNoteContent()}
        aiEnabled={aiEnabled}
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

      {folderDialog ? (
        <FolderDialog
          state={folderDialog}
          folders={sortedFolders}
          currentFolderId={
            folderDialog.kind === "move" && folderDialog.ids.length === 1
              ? (notes.find((note) => note.id === folderDialog.ids[0])
                  ?.folderId ?? null)
              : undefined
          }
          onClose={() => setFolderDialog(null)}
          onMove={moveTo}
          onSave={async (draft, id) => {
            const folder = await saveFolder(draft, id);
            setFolders((current) => [
              ...current.filter((item) => item.id !== folder.id),
              folder,
            ]);
            if (folderDialog.kind === "new") {
              setNavPinned(true);
              setFolderScope(folder.id);
              setView("all");
              setQuery("");
              setActiveTags([]);
              setActiveId(null);
              setSelectedIds([]);
              setMobilePane("notes");
            }
            return folder;
          }}
          onDelete={async (folder) => {
            await deleteFolder(folder.id);
            setFolders((current) =>
              current.filter((item) => item.id !== folder.id),
            );
            setNotes((current) =>
              current.map((note) =>
                note.folderId === folder.id
                  ? { ...note, folderId: null }
                  : note,
              ),
            );
            setMoveUndo(null);
            if (folderScope === folder.id) setFolderScope(null);
            flash("Folder deleted. Notes kept in No folder.");
          }}
        />
      ) : null}
      {moveUndo ? (
        <div className="folder-move-toast" role="status">
          <span>
            {moveUndo.length === 1
              ? "Note moved"
              : `${moveUndo.length} notes moved`}
          </span>
          <button
            disabled={moving}
            onClick={() =>
              void applyMoves(moveUndo, false).catch((error: Error) =>
                flash(error.message),
              )
            }
          >
            Undo
          </button>
          <button
            aria-label="Dismiss move notification"
            onClick={() => setMoveUndo(null)}
          >
            ×
          </button>
        </div>
      ) : null}
      <div className={`note-save-status${saveState === "error" || !online ? " is-warning" : ""}`} role="status" aria-live="polite">
        {!online ? (saveQueue.dirty ? "Offline · Unsaved changes. Keep this window open." : "Offline · Reconnect to save changes.") : saveState === "error" ? "Could not save. Changes are kept in this window." : saveState === "saved" ? "All changes saved" : "Saving…"}
        {saveState === "error" && online ? <button onClick={() => void saveQueue.flush().catch(() => {})}>Retry</button> : null}
      </div>
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

function matchesCompactNavigation() {
  return window.matchMedia?.("(max-width: 1100px)").matches ?? window.innerWidth <= 1100;
}

function matchesMobileLayout() {
  return window.matchMedia?.("(max-width: 720px)").matches ?? window.innerWidth <= 720;
}

function initialColumnWidth(column: ResizableColumn) {
  const fallback =
    column === "navigation"
      ? Math.round(Math.min(240, Math.max(200, window.innerWidth * 0.14)))
      : Math.round(Math.min(340, Math.max(270, window.innerWidth * 0.2)));
  try {
    const stored = Number(localStorage.getItem(`paper.${column}Width`));
    return Number.isFinite(stored) && stored > 0 ? clampColumnWidth(column, stored) : fallback;
  } catch {
    return fallback;
  }
}

function clampColumnWidth(column: ResizableColumn, width: number) {
  return Math.round(Math.min(column === "navigation" ? 280 : 420, Math.max(column === "navigation" ? 180 : 240, width)));
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
