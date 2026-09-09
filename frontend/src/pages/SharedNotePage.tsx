import { Moon, Sun } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { MarkdownEditor } from "../components/MarkdownEditor";
import { Sidebar } from "../components/Sidebar";
import { Toast } from "../components/Toast";
import { getSharedNote, listNotes, updateSharedNote } from "../lib/api";
import { subscribeToNoteLiveDeferred } from "../lib/live";
import { toDraft } from "../lib/note";
import { useDebouncedSave } from "../lib/useDebouncedSave";
import { useToast } from "../lib/useToast";
import type { AuthUser } from "../types/auth";
import type { Note } from "../types/note";

type Theme = "light" | "dark";

type SharedNotePageProps = {
  token: string;
  theme: Theme;
  user: AuthUser;
  onLogout: () => Promise<void>;
  onToggleTheme: () => void;
};

export function SharedNotePage({ token, theme, user, onLogout, onToggleTheme }: SharedNotePageProps) {
  const [note, setNote] = useState<Note | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [ownNotes, setOwnNotes] = useState<Note[]>([]);
  const [sidebarHidden, setSidebarHidden] = useState(false);
  const { toast, flash } = useToast();
  const lastLocalEditAtRef = useRef(0);

  const { schedule: scheduleSave } = useDebouncedSave<Note>((_, saved) => {
    void updateSharedNote(token, toDraft(saved)).catch(() => flash("Could not save note"));
  });

  useEffect(() => {
    let cancelled = false;
    getSharedNote(token)
      .then((result) => {
        if (!cancelled) {
          setNote(result);
          setStatus("ready");
        }
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
        }
      });
    void listNotes()
      .then((result) => {
        if (!cancelled) {
          setOwnNotes(result);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [token]);

  useEffect(() => {
    return subscribeToNoteLiveDeferred(
      `/api/shared/${token}/live`,
      () => lastLocalEditAtRef.current,
      (incoming) => {
        setNote((current) => {
          if (!current || incoming.updatedAt <= current.updatedAt) {
            return current;
          }
          return incoming;
        });
      },
    );
  }, [token]);

  const patch = (fields: Partial<Note>) => {
    lastLocalEditAtRef.current = Date.now();
    setNote((current) => {
      if (!current) {
        return current;
      }
      const next = { ...current, ...fields, updatedAt: new Date().toISOString() };
      scheduleSave(token, next);
      return next;
    });
  };

  if (status === "loading") {
    return <div className="auth-loading" aria-label="Loading" />;
  }

  if (status === "error" || !note) {
    return (
      <div className="auth-unavailable">
        <strong>This share link is no longer valid</strong>
        <button type="button" onClick={() => window.location.assign("/")}>
          Go to Paper
        </button>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <Sidebar
        notes={ownNotes}
        view="all"
        activeTag={null}
        hidden={sidebarHidden}
        onViewChange={() => window.location.assign("/")}
        onTagChange={() => window.location.assign("/")}
        onNew={() => window.location.assign("/")}
        onToggleCollapse={() => setSidebarHidden((hidden) => !hidden)}
        user={user}
        onLogout={onLogout}
        onResizeStart={() => {}}
        onResizeBy={() => {}}
      />

      <main className="editor-shell">
        <header className="editor-topbar">
          <span>Shared note</span>
          <div>
            <button
              className="topbar-icon-button"
              onClick={onToggleTheme}
              title={`${theme === "dark" ? "Switch to light" : "Switch to dark"}`}
              aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            >
              {theme === "dark" ? <Sun size={14} strokeWidth={1.9} /> : <Moon size={14} strokeWidth={1.9} />}
            </button>
          </div>
        </header>

        <div className="editor-scroll">
          <div className="editor-document">
            <input
              className="editor-title"
              value={note.title}
              onChange={(event) => patch({ title: event.target.value })}
              placeholder="Untitled"
            />
            <MarkdownEditor
              value={note.content}
              onChange={(content) => patch({ content })}
              placeholder="Start writing..."
            />
          </div>
        </div>
      </main>

      <Toast message={toast} />
    </div>
  );
}
