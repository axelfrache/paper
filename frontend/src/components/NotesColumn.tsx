import { PanelLeftOpen, Search, Star } from "lucide-react";
import type { Note } from "../types/note";

type NotesColumnProps = {
  title: string;
  notes: Note[];
  activeId: string | null;
  selectedIds: string[];
  query: string;
  sidebarHidden: boolean;
  onQueryChange: (query: string) => void;
  onSelect: (note: Note, extend: boolean) => void;
  onToggleSidebar: () => void;
};

export function NotesColumn({
  title,
  notes,
  activeId,
  selectedIds,
  query,
  sidebarHidden,
  onQueryChange,
  onSelect,
  onToggleSidebar,
}: NotesColumnProps) {
  const selected = new Set(selectedIds);

  return (
    <section className="notes-column">
      <div className="notes-filter">
        {sidebarHidden ? (
          <button className="sidebar-restore-button" onClick={onToggleSidebar} aria-label="Expand navigation">
            <PanelLeftOpen size={15} strokeWidth={1.9} />
          </button>
        ) : null}
        <div>
          <Search size={13} strokeWidth={2} />
          <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Filter notes" />
        </div>
      </div>

      <div className="list-title">
        <strong>{title}</strong>
        <span>{notes.length}</span>
      </div>

      <div className="note-cards">
        {notes.map((note) => (
          <button
            key={note.id}
            className={noteCardClass(note.id, activeId, selected)}
            aria-selected={selected.has(note.id)}
            onClick={(event) => onSelect(note, event.shiftKey)}
          >
            <div className="note-card-title">
              <strong>{note.title || "Untitled"}</strong>
              {note.favorite ? <Star size={12} fill="currentColor" strokeWidth={1.8} /> : null}
            </div>
            <p>{note.content.replace(/\s+/g, " ").trim() || "No content"}</p>
            <div className="note-card-meta">
              <span>{formatRelative(note.updatedAt)}</span>
              <div>
                {note.tags.slice(0, 2).map((tag) => (
                  <em key={tag}>#{tag}</em>
                ))}
              </div>
            </div>
          </button>
        ))}
        {notes.length === 0 ? (
          <div className="empty-state">
            Nothing here yet.
            <span>Press ⌘N to start a note.</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function noteCardClass(id: string, activeId: string | null, selected: Set<string>) {
  const classes = ["note-card"];
  if (selected.has(id)) {
    classes.push("selected");
  }
  if (id === activeId) {
    classes.push("active");
  }
  return classes.join(" ");
}

function formatRelative(value: string) {
  const date = new Date(value);
  const diff = Date.now() - date.getTime();
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
  const days = Math.floor(hours / 24);
  if (days === 1) {
    return "Yesterday";
  }
  if (days < 7) {
    return `${days}d ago`;
  }
  return `${Math.floor(days / 7)}w ago`;
}
