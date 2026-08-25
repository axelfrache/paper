import { Clock3, Files, Hash, ListTodo, PanelLeftClose, Plus, Star } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { Note } from "../types/note";

export type ViewKey = "all" | "recent" | "favorites" | "tasks";

type SidebarProps = {
  notes: Note[];
  view: ViewKey;
  activeTag: string | null;
  hidden: boolean;
  onViewChange: (view: ViewKey) => void;
  onTagChange: (tag: string | null) => void;
  onNew: () => void;
  onToggleCollapse: () => void;
};

const viewDefs: Array<{ key: ViewKey; label: string; icon: LucideIcon }> = [
  { key: "all", label: "All notes", icon: Files },
  { key: "recent", label: "Recent", icon: Clock3 },
  { key: "favorites", label: "Favorites", icon: Star },
  { key: "tasks", label: "Tasks", icon: ListTodo },
];

export function Sidebar({ notes, view, activeTag, hidden, onViewChange, onTagChange, onNew, onToggleCollapse }: SidebarProps) {
  const tagCounts = tagCountsFor(notes);

  return (
    <aside className={hidden ? "sidebar is-hidden" : "sidebar"}>
      <div className="brand">
        <img className="brand-lockup brand-lockup-light" src="/paper-lockup.svg" alt="Paper" />
        <img className="brand-lockup brand-lockup-dark" src="/paper-lockup-dark.svg" alt="Paper" />
        <button className="collapse-button" onClick={onToggleCollapse} aria-label="Collapse navigation">
          <PanelLeftClose size={15} strokeWidth={1.9} />
        </button>
      </div>

      <div className="new-note-wrap">
        <button className="new-note-button" onClick={onNew}>
          <Plus size={15} strokeWidth={2.1} />
          <strong>New note</strong>
          <kbd>⌘N</kbd>
        </button>
      </div>

      <nav className="sidebar-nav">
        {viewDefs.map((item) => {
          const active = view === item.key && !activeTag;
          const Icon = item.icon;
          return (
            <button
              key={item.key}
              className={active ? "nav-item active" : "nav-item"}
              onClick={() => onViewChange(item.key)}
            >
              <span className="nav-icon">
                <Icon size={14} strokeWidth={1.9} />
              </span>
              <strong>{item.label}</strong>
              <em>{countForView(item.key, notes)}</em>
            </button>
          );
        })}
      </nav>

      <div className="sidebar-label">Tags</div>
      <div className="tag-nav">
        {tagCounts.map((tag) => (
          <button
            key={tag.name}
            className={activeTag === tag.name ? "nav-item active" : "nav-item"}
            onClick={() => onTagChange(activeTag === tag.name ? null : tag.name)}
          >
            <span className="nav-icon">
              <Hash size={13} strokeWidth={2} />
            </span>
            <strong>{tag.name}</strong>
            <em>{tag.count}</em>
          </button>
        ))}
      </div>

      <div className="shortcut-hints">
        <div>
          <span>Search</span>
          <em>⌘K</em>
        </div>
        <div>
          <span>Ask my notes</span>
          <em>⌘⇧K</em>
        </div>
        <div>
          <span>Insert block</span>
          <em>/</em>
        </div>
        <div>
          <span>Light / dark</span>
          <em>⌘⇧L</em>
        </div>
        <div>
          <span>Hide sidebar</span>
          <em>⌘\</em>
        </div>
      </div>
    </aside>
  );
}

function countForView(view: ViewKey, notes: Note[]) {
  if (view === "recent") {
    return Math.min(5, notes.length);
  }
  if (view === "favorites") {
    return notes.filter((note) => note.favorite).length;
  }
  if (view === "tasks") {
    return notes.filter((note) => hasTask(note.content)).length;
  }
  return notes.length;
}

function tagCountsFor(notes: Note[]) {
  const counts = new Map<string, number>();
  for (const note of notes) {
    for (const tag of note.tags) {
      counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, count]) => ({ name, count }));
}

function hasTask(content: string) {
  return /☐|\b(todo|buy|call|book|fix|send|write|ask|get|need)\b/i.test(content);
}
