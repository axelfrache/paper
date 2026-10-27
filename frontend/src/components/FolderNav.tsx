import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Folder as FolderIcon, Pencil, Plus, Trash2 } from "lucide-react";
import type { Folder, Note } from "../types/note";
import { folderColors } from "./FolderDialog";
export const noteDragType = "application/x-paper-notes";
type Props = {
  folders: Folder[];
  notes: Note[];
  selected: string | null | undefined;
  onSelect: (id: string | null) => void;
  onCreate: () => void;
  onEdit: (folder: Folder) => void;
  onDelete: (folder: Folder) => void;
  onDrop: (ids: string[], id: string | null) => void;
};
export function FolderNav({
  folders,
  notes,
  selected,
  onSelect,
  onCreate,
  onEdit,
  onDelete,
  onDrop,
}: Props) {
  const [target, setTarget] = useState<string | null>(null);
  const [menu, setMenu] = useState<{
    folder: Folder;
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const element = menuRef.current;
    const bounds = element.getBoundingClientRect();
    element.style.left = `${Math.max(8, Math.min(menu.x, window.innerWidth - bounds.width - 8))}px`;
    element.style.top = `${Math.max(8, Math.min(menu.y, window.innerHeight - bounds.height - 8))}px`;
    element.querySelector<HTMLButtonElement>("button")?.focus();
  }, [menu]);
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    const outside = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) close();
    };
    window.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", close);
    window.addEventListener("scroll", close, true);
    return () => {
      window.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("scroll", close, true);
    };
  }, [menu]);
  const runAction = (action: (folder: Folder) => void) => {
    if (!menu) return;
    triggerRef.current?.focus();
    setMenu(null);
    action(menu.folder);
  };
  const items = [...folders, { id: "", name: "No folder", color: "slate" }];
  return (
    <section className="folder-nav" aria-label="Folders">
      <div className="sidebar-label folder-section-title">
        <span>Folders</span>
        <button aria-label="New folder" title="New folder" onClick={onCreate}>
          <Plus size={14} />
        </button>
      </div>
      {items.map((folder) => (
        <div
          key={folder.id}
          className={`folder-nav-row${target === folder.id ? " is-drop-target" : ""}`}
          onDragOver={(event) => {
            if (event.dataTransfer.types.includes(noteDragType)) {
              event.preventDefault();
              event.dataTransfer.dropEffect = "move";
              setTarget(folder.id);
            }
          }}
          onDragLeave={(event) => {
            if (
              !event.currentTarget.contains(event.relatedTarget as Node | null)
            )
              setTarget(null);
          }}
          onDrop={(event) => {
            event.preventDefault();
            setTarget(null);
            try {
              const ids: unknown = JSON.parse(
                event.dataTransfer.getData(noteDragType),
              );
              if (
                Array.isArray(ids) &&
                ids.every((id) => typeof id === "string")
              )
                onDrop(ids, folder.id || null);
            } catch {
              /* Ignore unrelated drag data. */
            }
          }}
        >
          <button
            className={`nav-item${selected !== undefined && (selected ?? "") === folder.id ? " active" : ""}`}
            aria-current={
              selected !== undefined && (selected ?? "") === folder.id
                ? "page"
                : undefined
            }
            onClick={() => onSelect(folder.id || null)}
            onContextMenu={(event) => {
              if (!folder.id) return;
              event.preventDefault();
              triggerRef.current = event.currentTarget;
              setMenu({
                folder: folder as Folder,
                x: event.clientX,
                y: event.clientY,
              });
            }}
            onKeyDown={(event) => {
              if (
                !folder.id ||
                !(
                  event.key === "ContextMenu" ||
                  (event.shiftKey && event.key === "F10")
                )
              )
                return;
              event.preventDefault();
              const bounds = event.currentTarget.getBoundingClientRect();
              triggerRef.current = event.currentTarget;
              setMenu({
                folder: folder as Folder,
                x: bounds.left,
                y: bounds.bottom,
              });
            }}
          >
            <span className="nav-icon">
              {folder.id ? (
                <span
                  className="folder-dot"
                  style={{ background: folderColors[folder.color] }}
                />
              ) : (
                <FolderIcon size={14} />
              )}
            </span>
            <strong>{folder.name}</strong>
            <em>
              {
                notes.filter((note) => (note.folderId ?? "") === folder.id)
                  .length
              }
            </em>
          </button>
        </div>
      ))}
      {menu
        ? createPortal(
            <div
              ref={menuRef}
              className="note-context-menu"
              role="menu"
              aria-label={`Actions for ${menu.folder.name}`}
              style={{ left: menu.x, top: menu.y }}
              onKeyDown={(event) => {
                if (event.key === "Escape" || event.key === "Tab") {
                  event.preventDefault();
                  event.stopPropagation();
                  setMenu(null);
                  triggerRef.current?.focus();
                } else if (
                  ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
                ) {
                  event.preventDefault();
                  event.stopPropagation();
                  const buttons = Array.from(
                    event.currentTarget.querySelectorAll<HTMLButtonElement>(
                      "button",
                    ),
                  );
                  const index = buttons.indexOf(
                    document.activeElement as HTMLButtonElement,
                  );
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? buttons.length - 1
                        : (index +
                            (event.key === "ArrowDown" ? 1 : -1) +
                            buttons.length) %
                          buttons.length;
                  buttons[next]?.focus();
                }
              }}
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => runAction(onEdit)}
              >
                <Pencil size={14} strokeWidth={1.8} />
                <span>Edit folder…</span>
              </button>
              <span className="note-context-menu-sep" aria-hidden="true" />
              <button
                type="button"
                role="menuitem"
                className="danger"
                onClick={() => runAction(onDelete)}
              >
                <Trash2 size={14} strokeWidth={1.8} />
                <span>Delete folder…</span>
              </button>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
