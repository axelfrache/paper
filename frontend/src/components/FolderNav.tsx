import { useRef, useState } from "react";
import { ActionMenu } from "./ActionMenu";
import {
  Folder as FolderIcon,
  Pencil,
  Plus,
  Trash2,
  MoreHorizontal,
} from "lucide-react";
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
  const triggerRef = useRef<HTMLButtonElement | null>(null);
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
          {folder.id ? (
            <button
              className="row-actions"
              aria-haspopup="menu"
              aria-expanded={menu?.folder.id === folder.id}
              aria-label={`Actions for ${folder.name}`}
              onClick={(event) => {
                const bounds = event.currentTarget.getBoundingClientRect();
                triggerRef.current = event.currentTarget;
                setMenu({
                  folder: folder as Folder,
                  x: bounds.right,
                  y: bounds.bottom,
                });
              }}
            >
              <MoreHorizontal size={18} />
            </button>
          ) : null}
        </div>
      ))}
      {menu ? (
        <ActionMenu
          returnFocus={triggerRef.current}
          x={menu.x}
          y={menu.y}
          label={`Actions for ${menu.folder.name}`}
          onClose={() => setMenu(null)}
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
        </ActionMenu>
      ) : null}
    </section>
  );
}
