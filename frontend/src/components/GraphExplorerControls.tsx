import type { ReactNode } from "react";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Check, SlidersHorizontal, TriangleAlert, X } from "lucide-react";
import type { Folder } from "../types/note";
import {
  colorForTag,
  type NoteGraphIssue,
  type NoteGraphNode,
} from "../lib/noteGraph";
import {
  defaultGraphFilters,
  type GraphFilters,
} from "../lib/graphExploration";
import { folderColors } from "./FolderDialog";

type Props = {
  navigation?: ReactNode;
  heading: ReactNode;
  nodes: NoteGraphNode[];
  folders: Folder[];
  filters: GraphFilters;
  onFilters: (filters: GraphFilters) => void;
  onLocate: (id: string) => void;
  onOpenNote: (id: string) => void;
  anchor: NoteGraphNode | undefined;
  visibleCount: number;
  edgeCount: number;
  colorBy: "folder" | "tag";
  issues: NoteGraphIssue[];
};
type Facet = {
  key: string | null;
  label: string;
  color: string;
  count: number;
};

export function GraphExplorerControls({
  navigation,
  heading,
  nodes,
  folders,
  filters,
  onFilters,
  onLocate,
  onOpenNote,
  anchor,
  visibleCount,
  edgeCount,
  colorBy,
  issues,
}: Props) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [panel, setPanel] = useState<"filters" | "issues" | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const searchRef = useRef<HTMLDivElement>(null);
  const dialogId = useId();
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle
      ? nodes
          .filter((node) =>
            (node.title || "Untitled").toLowerCase().includes(needle),
          )
          .sort((a, b) => a.title.localeCompare(b.title))
      : [];
  }, [nodes, query]);
  const facets = useMemo(() => {
    const folderMap = new Map<string | null, Facet>();
    const tagMap = new Map<string | null, Facet>();
    for (const node of nodes) {
      const folder = folders.find((item) => item.id === node.folderId);
      const key = node.folderId;
      const entry = folderMap.get(key);
      if (entry) entry.count++;
      else
        folderMap.set(key, {
          key,
          label: folder?.name ?? "No folder",
          color: folder
            ? (folderColors[folder.color] ?? folderColors.slate)
            : folderColors.slate,
          count: 1,
        });
      const tags = node.tags.length
        ? [...new Set(node.tags.map((tag) => tag.toLowerCase()))]
        : [null];
      for (const tag of tags) {
        const entry = tagMap.get(tag);
        if (entry) entry.count++;
        else
          tagMap.set(tag, {
            key: tag,
            label: tag ?? "No tag",
            color: tag ? colorForTag(tag) : folderColors.slate,
            count: 1,
          });
      }
    }
    const sorted = (map: Map<string | null, Facet>) =>
      [...map.values()].sort((a, b) => a.label.localeCompare(b.label));
    return { folders: sorted(folderMap), tags: sorted(tagMap) };
  }, [nodes, folders]);
  const filterCount =
    filters.folders.length + filters.tags.length + Number(filters.hideIsolated);
  function filterLabel(group: "folders" | "tags", key: string | null) {
    return (
      facets[group].find((item) => item.key === key)?.label ??
      (group === "folders"
        ? (folders.find((folder) => folder.id === key)?.name ??
          key ??
          "No folder")
        : (key ?? "No tag"))
    );
  }
  function toggle(group: "folders" | "tags", key: string | null) {
    const current = filters[group];
    onFilters({
      ...filters,
      [group]: current.includes(key)
        ? current.filter((item) => item !== key)
        : [...current, key],
    });
  }
  function openPanel(next: "filters" | "issues", trigger: HTMLButtonElement) {
    triggerRef.current = trigger;
    setSearchOpen(false);
    setPanel(next);
  }
  function closePanel() {
    setPanel(null);
  }
  useEffect(() => {
    if (!panel) return;
    const dialog = dialogRef.current!;
    const opener = triggerRef.current;
    const place = () => {
      const rect = opener?.getBoundingClientRect();
      const left = Math.max(
        8,
        Math.min(rect?.left ?? 8, window.innerWidth - 348),
      );
      const top = Math.max(
        8,
        Math.min((rect?.bottom ?? 40) + 8, window.innerHeight - 240),
      );
      dialog.style.setProperty("--graph-overlay-left", `${left}px`);
      dialog.style.setProperty("--graph-overlay-top", `${top}px`);
    };
    place();
    dialog.showModal();
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("resize", place);
      dialog.close();
      if (opener?.isConnected) opener.focus();
    };
  }, [panel]);
  useEffect(() => {
    if (!searchOpen) return;
    const outside = (event: PointerEvent) => {
      if (!searchRef.current?.contains(event.target as Node))
        setSearchOpen(false);
    };
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, [searchOpen]);
  function locate(id: string) {
    onLocate(id);
    setQuery("");
    setSearchOpen(false);
  }
  function facetButton(item: Facet, group: "folders" | "tags") {
    const selected = filters[group].includes(item.key);
    return (
      <button
        key={JSON.stringify(item.key)}
        type="button"
        className="graph-facet"
        aria-pressed={selected}
        aria-label={`Filter ${group === "folders" ? "folder" : "tag"}: ${item.label}`}
        onClick={() => toggle(group, item.key)}
      >
        <span className="graph-swatch" style={{ background: item.color }} />
        <span className="graph-facet-label">{item.label}</span>
        <span className="graph-facet-count">{item.count}</span>
        {selected && <Check size={12} aria-hidden="true" />}
      </button>
    );
  }
  return (
    <div className="graph-explorer">
      <div className={`graph-explorer-bar${navigation ? " has-brand" : ""}`}>
        {navigation}
        <div
          className="graph-search"
          ref={searchRef}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node))
              setSearchOpen(false);
          }}
        >
          <input
            type="search"
            aria-label="Search graph notes"
            placeholder="Find a note…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setSearchOpen(true);
            }}
            onFocus={() => setSearchOpen(true)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && searchOpen && query) {
                event.preventDefault();
                event.stopPropagation();
                setSearchOpen(false);
              } else if (event.key === "Enter" && matches[0]) {
                event.preventDefault();
                locate(matches[0].id);
              } else if (event.key === "ArrowDown") {
                event.preventDefault();
                searchRef.current
                  ?.querySelector<HTMLButtonElement>(
                    ".graph-search-results button",
                  )
                  ?.focus();
              }
            }}
          />
          {searchOpen && query.trim() && (
            <div className="graph-search-results" aria-label="Search results">
              <p>
                {matches.length
                  ? "Choose a note to center it. Display filters will reset."
                  : "No matching notes."}
              </p>
              {matches.slice(0, 20).map((node) => (
                <button
                  type="button"
                  key={node.id}
                  onClick={() => locate(node.id)}
                >
                  <strong>{node.title || "Untitled"}</strong>
                  <span>
                    {folders.find((folder) => folder.id === node.folderId)
                      ?.name || "No folder"}
                  </span>
                </button>
              ))}
              {matches.length > 20 && (
                <p>{matches.length} results — refine your search.</p>
              )}
            </div>
          )}
        </div>
        <button
          type="button"
          className="graph-filter-trigger"
          aria-label="Graph filters"
          title="Filters"
          aria-haspopup="dialog"
          aria-controls={dialogId}
          aria-expanded={panel === "filters"}
          onClick={(event) => openPanel("filters", event.currentTarget)}
        >
          <SlidersHorizontal size={14} />
          <span className="graph-filter-label">Filters</span>
          {filterCount > 0 && <span>{filterCount}</span>}
        </button>
      </div>
      {heading}
      <div className="graph-explorer-status">
        <select
          aria-label="Graph scope"
          title={
            filters.depth
              ? `Around: ${anchor?.title || "Choose a note"}`
              : "Graph scope"
          }
          value={filters.depth}
          onChange={(event) =>
            onFilters({
              ...filters,
              depth: Number(event.target.value) as 0 | 1 | 2,
            })
          }
        >
          <option value={0}>Global view</option>
          <option value={1} disabled={!anchor}>
            Local · 1 level
          </option>
          <option value={2} disabled={!anchor}>
            Local · 2 levels
          </option>
        </select>
        <span
          title={`${visibleCount} of ${nodes.length} notes · ${edgeCount} links`}
        >
          {visibleCount}/{nodes.length} notes · {edgeCount} links
        </span>
        {!!issues.length && (
          <button
            type="button"
            className="graph-issue-trigger"
            aria-label={`${issues.length} unresolved link${issues.length > 1 ? "s" : ""}`}
            aria-haspopup="dialog"
            aria-controls={dialogId}
            onClick={(event) => openPanel("issues", event.currentTarget)}
          >
            <TriangleAlert size={14} />
            <span>{issues.length}</span>
          </button>
        )}
      </div>
      <div
        className="graph-legend"
        role="group"
        aria-label={colorBy === "folder" ? "Filter by folder" : "Filter by tag"}
        title={
          colorBy === "folder"
            ? "Filter by folder. Counts include all notes."
            : "Colors use the first tag. Filters match any tag. Counts include all notes."
        }
      >
        {facets[colorBy === "folder" ? "folders" : "tags"].map((item) =>
          facetButton(item, colorBy === "folder" ? "folders" : "tags"),
        )}
        {!nodes.length && <span>No notes yet</span>}
      </div>
      <div className="graph-active-filters" aria-label="Active graph filters">
        {!filterCount && <span>All folders and tags</span>}
        {(["folders", "tags"] as const).flatMap((group) =>
          filters[group].map((key) => (
            <button
              key={JSON.stringify([group, key])}
              type="button"
              aria-label={`Remove ${group === "folders" ? "folder" : "tag"} filter: ${filterLabel(group, key)}`}
              onClick={() => toggle(group, key)}
            >
              {filterLabel(group, key)}
              <X size={11} />
            </button>
          )),
        )}
        {filters.hideIsolated && (
          <button
            type="button"
            onClick={() => onFilters({ ...filters, hideIsolated: false })}
          >
            Linked notes
            <X size={11} />
          </button>
        )}
        {filterCount > 0 && (
          <button
            type="button"
            onClick={() =>
              onFilters({ ...defaultGraphFilters, depth: filters.depth })
            }
          >
            Clear filters
          </button>
        )}
      </div>
      {panel && (
        <dialog
          id={dialogId}
          ref={dialogRef}
          className="graph-overlay"
          aria-label={
            panel === "filters" ? "Graph filters" : "Unresolved links"
          }
          onCancel={(event) => {
            event.preventDefault();
            closePanel();
          }}
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              const rect = event.currentTarget.getBoundingClientRect();
              if (
                event.clientX < rect.left ||
                event.clientX > rect.right ||
                event.clientY < rect.top ||
                event.clientY > rect.bottom
              )
                closePanel();
            }
          }}
        >
          <header>
            <strong>
              {panel === "filters" ? "Filters" : "Links to check"}
            </strong>
            <button
              type="button"
              className="graph-control"
              aria-label="Close graph panel"
              onClick={closePanel}
            >
              <X size={16} />
            </button>
          </header>
          <div className="graph-overlay-body">
            {panel === "filters" ? (
              <>
                <p>
                  Choose multiple folders or tags. Folder and tag filters
                  combine.
                </p>
                <fieldset>
                  <legend>Folders</legend>
                  <div className="graph-facet-list">
                    {facets.folders.map((item) => facetButton(item, "folders"))}
                  </div>
                </fieldset>
                <fieldset>
                  <legend>Tags</legend>
                  <p>Colors use the first tag; filters match any tag.</p>
                  <div className="graph-facet-list">
                    {facets.tags.map((item) => facetButton(item, "tags"))}
                  </div>
                </fieldset>
                <label className="graph-checkbox">
                  <input
                    type="checkbox"
                    checked={filters.hideIsolated}
                    onChange={(event) =>
                      onFilters({
                        ...filters,
                        hideIsolated: event.target.checked,
                      })
                    }
                  />
                  Hide notes without visible links
                </label>
                <button
                  type="button"
                  className="graph-reset"
                  disabled={!filterCount && !filters.depth}
                  onClick={() => onFilters(defaultGraphFilters)}
                >
                  Reset filters
                </button>
              </>
            ) : (
              <div className="graph-link-issues">
                <p>
                  Links need a unique matching note title. After renaming a
                  note, update links that use its old title.
                </p>
                <ul>
                  {issues.map((issue, index) => (
                    <li key={`${issue.source}-${index}`}>
                      <button
                        type="button"
                        onClick={() => {
                          closePanel();
                          onOpenNote(issue.source);
                        }}
                      >
                        {nodes.find((node) => node.id === issue.source)
                          ?.title || "Untitled"}
                      </button>
                      {` → [[${issue.title}]] — ${issue.reason === "ambiguous" ? "multiple notes share this title" : "note not found"}`}
                    </li>
                  ))}
                </ul>
                {!issues.length && <p>All links are resolved.</p>}
              </div>
            )}
          </div>
          <footer>
            <span>
              {visibleCount} notes · {edgeCount} links
            </span>
            <button type="button" onClick={closePanel}>
              Show results
            </button>
          </footer>
        </dialog>
      )}
    </div>
  );
}
