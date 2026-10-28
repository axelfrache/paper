import { ActionMenu } from "./ActionMenu";
import { Fragment, useEffect, useRef, useState } from "react";
import type { PointerEvent } from "react";
import { MoreHorizontal, Copy, PanelLeftOpen, Plus, PanelRightOpen, Search, Star, StarOff, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { parseInline } from "../lib/markdown/inline";
import type { MarkdownInline } from "../lib/markdown/inline";
import { isDivider, isResourceLine } from "../lib/markdown/resource";
import { extractTagTokens, highlightSegments, takeTrailingTag } from "../lib/notesFilter";
import { folderColors } from "./FolderDialog";
import { noteDragType } from "./FolderNav";
import type { Folder } from "../types/note";
import type { Note } from "../types/note";

type NoteDirection = "previous" | "next";

type NotesColumnProps = {
  folders?: Folder[];
  showFolders?: boolean;
  onMoveNotes?: (ids: string[]) => void;
  onSearchAll?: () => void;
  onSelectionChange?: (ids: string[]) => void;
  onDeleteSelected?: () => void;
  title: string;
  notes: Note[];
  activeId: string | null;
  selectedIds: string[];
  query: string;
  activeTags: string[];
  sidebarHidden: boolean;
  focusRequest: number;
  onQueryChange: (query: string) => void;
  onAddTag: (tag: string) => void;
  onRemoveTag: (tag: string) => void;
  onClearFilters: () => void;
  onNew: () => void;
  onSelect: (note: Note, extend: boolean) => void;
  onFavoriteNote: (note: Note) => void;
  onDuplicateNote: (note: Note) => void;
  onDeleteNote: (note: Note) => void;
  onNavigate: (direction: NoteDirection, extend: boolean) => void;
  onFocusTitle: () => void;
  onFocusContent: () => void;
  onToggleSidebar: () => void;
  onResizeStart: (event: PointerEvent<HTMLDivElement>) => void;
  onResizeBy: (delta: number) => void;
};

export function NotesColumn({
  folders = [], showFolders = false, onMoveNotes, onSearchAll, onSelectionChange, onDeleteSelected,
  title,
  notes,
  activeId,
  selectedIds,
  query,
  activeTags,
  sidebarHidden,
  focusRequest,
  onQueryChange,
  onAddTag,
  onRemoveTag,
  onClearFilters,
  onNew,
  onSelect,
  onFavoriteNote,
  onDuplicateNote,
  onDeleteNote,
  onNavigate,
  onFocusTitle,
  onFocusContent,
  onToggleSidebar,
  onResizeStart,
  onResizeBy,
}: NotesColumnProps) {
  const selected = new Set(selectedIds);
  const cardRefs = useRef(new Map<string, HTMLButtonElement>());
  const focusAfterNavigationRef = useRef(false);
  const handledFocusRequestRef = useRef(0);
  const [menu, setMenu] = useState<{ note: Note; x: number; y: number } | null>(null);
  const [selecting, setSelecting] = useState(false);
  useEffect(() => setSelecting(false), [title]);
  const runMenuAction = (action: (note: Note) => void) => {
    if (menu) {
      action(menu.note);
    }
    setMenu(null);
  };

  useEffect(() => {
    const shouldFocusRequest = focusRequest > 0 && handledFocusRequestRef.current !== focusRequest;
    if ((!focusAfterNavigationRef.current && !shouldFocusRequest) || !activeId) {
      return;
    }
    focusAfterNavigationRef.current = false;
    if (shouldFocusRequest) {
      handledFocusRequestRef.current = focusRequest;
    }
    window.requestAnimationFrame(() => {
      const card = cardRefs.current.get(activeId);
      card?.focus();
      card?.scrollIntoView({ block: "nearest" });
    });
  }, [activeId, focusRequest]);

  return (
    <section className="notes-column">
      <div className="notes-filter">
        {sidebarHidden ? (
          <button className="notes-brand" onClick={onToggleSidebar} aria-label="Expand navigation" title="Expand navigation">
            <img className="brand-lockup brand-lockup-light" src="/paper-lockup.svg" alt="Paper" />
            <img className="brand-lockup brand-lockup-dark" src="/paper-lockup-dark.svg" alt="Paper" />
            <PanelLeftOpen size={15} strokeWidth={1.9} />
          </button>
        ) : null}
        <div>
          <Search size={13} strokeWidth={2} />
          <input
            value={query}
            onChange={(event) => {
              const { query: rest, tags } = extractTagTokens(event.target.value);
              tags.forEach(onAddTag);
              onQueryChange(rest);
            }}
            onKeyDown={(event) => {
              if (event.key !== "Enter") {
                return;
              }
              const { tag, rest } = takeTrailingTag(query);
              if (tag) {
                event.preventDefault();
                onAddTag(tag);
                onQueryChange(rest);
              }
            }}
            placeholder="Filter notes (try #tag)"
          />
        </div>
        <button className="notes-new-button" onClick={onNew} aria-label="New note" title="New note (⌘N)">
          <Plus size={15} strokeWidth={2} />
        </button>
      </div>

      {activeTags.length ? (
        <div className="notes-active-tags">
          {activeTags.map((tag) => (
            <button key={tag} type="button" className="notes-tag-chip" onClick={() => onRemoveTag(tag)} aria-label={`Remove #${tag} filter`}>
              <span>#{tag}</span>
              <X size={11} strokeWidth={2.2} />
            </button>
          ))}
          <button type="button" className="notes-clear-filters" onClick={onClearFilters}>
            Clear
          </button>
        </div>
      ) : null}

      {onSearchAll ? <button className="folder-search-all" onClick={onSearchAll}>Search in all notes →</button> : null}
      {(selecting || selectedIds.length > 1) && onMoveNotes ? <div className="folder-selection-actions">
        <span>{selectedIds.length} selected</span>
        {selecting ? <button onClick={() => onSelectionChange?.(notes.map(note => note.id))}>All</button> : null}
        <button disabled={!selectedIds.length} onClick={() => onMoveNotes(selectedIds)}>Move to…</button>
        {onDeleteSelected ? <button disabled={!selectedIds.length} onClick={() => {
          if (window.confirm(`Delete ${selectedIds.length} selected notes?`)) onDeleteSelected();
        }}>Delete</button> : null}
      </div> : null}
      <div className="list-title">
        <strong>{title}</strong>
        <span>{notes.length}</span>
        {onSelectionChange ? <button className="selection-toggle" onClick={() => {
          setSelecting(!selecting); onSelectionChange([]);
        }}>{selecting ? "Done" : "Select"}</button> : null}
      </div>

      <div className="note-cards">
        {notes.map((note) => (
          <div className="note-card-row" key={note.id}>
          {selecting ? <input type="checkbox" aria-label={`Select ${note.title || "Untitled"}`} checked={selected.has(note.id)} onChange={() => onSelectionChange?.(selected.has(note.id) ? selectedIds.filter(id => id !== note.id) : [...selectedIds, note.id])} /> : null}
          <button
            ref={(element) => {
              if (element) {
                cardRefs.current.set(note.id, element);
              } else {
                cardRefs.current.delete(note.id);
              }
            }}
            className={noteCardClass(note.id, activeId, selected)}
            aria-selected={selected.has(note.id)}
            draggable={!selecting && Boolean(onMoveNotes)}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData(noteDragType, JSON.stringify(selected.has(note.id) ? selectedIds : [note.id]));
            }}
            onClick={(event) => selecting ? onSelectionChange?.(selected.has(note.id) ? selectedIds.filter(id => id !== note.id) : [...selectedIds, note.id]) : onSelect(note, event.shiftKey)}
            onContextMenu={(event) => {
              event.preventDefault();
              setMenu({ note, x: event.clientX, y: event.clientY });
            }}
            onKeyDown={(event) => {
              if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
                event.preventDefault();
                event.currentTarget.focus();
                const bounds = event.currentTarget.getBoundingClientRect();
                setMenu({note, x: bounds.left, y: bounds.bottom});
                return;
              }
              if ((event.key === "Enter" || event.key === "ArrowRight") && !event.ctrlKey && !event.metaKey && !event.altKey) {
                event.preventDefault();
                onFocusContent();
                return;
              }
              if (event.key === "Tab" && !event.shiftKey) {
                event.preventDefault();
                onFocusTitle();
                return;
              }
              if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
                return;
              }
              event.preventDefault();
              focusAfterNavigationRef.current = true;
              onNavigate(event.key === "ArrowDown" ? "next" : "previous", event.shiftKey);
            }}
          >
            <div className="note-card-title">
              <strong>{renderHighlighted(note.title || "Untitled", query)}</strong>
              {note.favorite ? <Star size={12} fill="currentColor" strokeWidth={1.8} /> : null}
            </div>
            <p><NoteSummaryPreview content={note.content} query={query} /></p>
            {showFolders && note.folderId ? <div className="note-card-folder"><span className="folder-dot" style={{ background: folderColors[folders.find((folder) => folder.id === note.folderId)?.color ?? "slate"] }} />{folders.find((folder) => folder.id === note.folderId)?.name}</div> : null}
            <div className="note-card-meta">
              <span>{formatRelative(note.updatedAt)}</span>
              <div>
                {note.tags.slice(0, 2).map((tag) => (
                  <em key={tag}>#{tag}</em>
                ))}
              </div>
            </div>
          </button>
          {!selecting ? <button className="row-actions" aria-haspopup="menu" aria-expanded={menu?.note.id === note.id} aria-label={`Actions for ${note.title || "Untitled"}`} onClick={(event) => {
            const bounds = event.currentTarget.getBoundingClientRect();
            setMenu({ note, x: bounds.right, y: bounds.bottom });
          }}><MoreHorizontal size={18} /></button> : null}
          </div>
        ))}
        {notes.length === 0 ? (
          <div className="empty-state">
            {query.trim() || activeTags.length ? "No matching notes." : "Nothing here yet."}
            {query.trim() || activeTags.length ? <button onClick={onClearFilters}>Clear filters</button> : <button onClick={onNew}>Create a note</button>}
          </div>
        ) : null}
      </div>
      <div
        className="column-resize-handle"
        role="separator"
        aria-label="Resize note list"
        aria-orientation="vertical"
        tabIndex={0}
        onPointerDown={onResizeStart}
        onKeyDown={(event) => {
          if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
            event.preventDefault();
            onResizeBy(event.key === "ArrowLeft" ? -10 : 10);
          }
        }}
      />

      {menu ? (
        <ActionMenu x={menu.x} y={menu.y} label={`Actions for ${menu.note.title || "Untitled"}`} onClose={() => setMenu(null)}>
          <button type="button" role="menuitem" onClick={() => runMenuAction((note) => onSelect(note, false))}>
            <PanelRightOpen size={14} strokeWidth={1.8} />
            <span>Open</span>
          </button>
          <button type="button" role="menuitem" onClick={() => runMenuAction(onFavoriteNote)}>
            {menu.note.favorite ? <StarOff size={14} strokeWidth={1.8} /> : <Star size={14} strokeWidth={1.8} />}
            <span>{menu.note.favorite ? "Remove favorite" : "Add to favorites"}</span>
          </button>
          <button type="button" role="menuitem" onClick={() => runMenuAction(onDuplicateNote)}>
            <Copy size={14} strokeWidth={1.8} />
            <span>Duplicate</span>
          </button>
          {onMoveNotes ? <button type="button" role="menuitem" onClick={() => runMenuAction((note) => onMoveNotes(selected.has(note.id) ? selectedIds : [note.id]))}>Move to folder…</button> : null}
          <span className="note-context-menu-sep" aria-hidden="true"></span>
          <button type="button" role="menuitem" className="danger" onClick={() => runMenuAction(onDeleteNote)}>
            <Trash2 size={14} strokeWidth={1.8} />
            <span>Delete</span>
          </button>
        </ActionMenu>
      ) : null}
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

const blockPrefix = /^\s*(#{1,6}\s+|>\s+|[-*+]\s+(\[[ xX]\]\s+)?)/;

function notePreviewNodes(content: string): MarkdownInline[] {
  const nodes: MarkdownInline[] = [];
  for (const raw of content.split("\n")) {
    const line = raw.trim();
    if (!line || isDivider(line) || isResourceLine(line)) {
      continue;
    }
    const clean = line.replace(blockPrefix, "").trim();
    if (!clean) {
      continue;
    }
    if (nodes.length) {
      nodes.push({ type: "text", text: " " });
    }
    nodes.push(...parseInline(clean));
  }
  return nodes;
}

function renderHighlighted(text: string, query: string): ReactNode {
  if (!query.trim()) {
    return text;
  }
  return highlightSegments(text, query).map((segment, index) =>
    segment.match ? <mark key={index}>{segment.text}</mark> : <Fragment key={index}>{segment.text}</Fragment>,
  );
}

function renderInlineNodes(nodes: MarkdownInline[], query: string): ReactNode {
  return nodes.map((node, index) => {
    if (node.type === "text" || node.type === "escape") {
      return <span key={index}>{renderHighlighted(node.text, query)}</span>;
    }
    if (node.type === "code") {
      return <code key={index}>{renderHighlighted(node.text, query)}</code>;
    }
    if (node.type === "link") {
      return <span key={index}>{renderInlineNodes(node.text, query)}</span>;
    }
    if (node.type === "image") {
      return null;
    }
    if (node.type === "strong") {
      return <strong key={index}>{renderInlineNodes(node.children, query)}</strong>;
    }
    if (node.type === "em") {
      return <em key={index}>{renderInlineNodes(node.children, query)}</em>;
    }
    if (node.type === "strike") {
      return <s key={index}>{renderInlineNodes(node.children, query)}</s>;
    }
    return <u key={index}>{renderInlineNodes(node.children, query)}</u>;
  });
}

function NoteSummaryPreview({ content, query }: { content: string; query: string }) {
  const nodes = notePreviewNodes(content);
  if (!nodes.length) {
    return <>No content</>;
  }
  return <>{renderInlineNodes(nodes, query)}</>;
}
