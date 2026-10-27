import { useEffect, useRef, useState } from "react";
import { Check, Folder as FolderIcon, Plus, Search, X } from "lucide-react";
import type { Folder, FolderDraft } from "../types/note";

export const folderColors: Record<string, string> = {
  slate: "#8b929c",
  blue: "#4965e8",
  green: "#359958",
  amber: "#bc921f",
  orange: "#e56926",
  violet: "#9464cc",
  pink: "#cc578a",
};
export type FolderDialogState =
  | { kind: "new" }
  | { kind: "edit"; folder: Folder; confirmDelete?: boolean }
  | { kind: "move"; ids: string[] };
type Props = {
  state: FolderDialogState;
  folders: Folder[];
  currentFolderId?: string | null;
  onSave: (draft: FolderDraft, id?: string) => Promise<Folder>;
  onDelete: (folder: Folder) => Promise<void>;
  onMove: (ids: string[], folderId: string | null) => Promise<void>;
  onClose: () => void;
};
export function FolderDialog({
  state,
  folders,
  currentFolderId,
  onSave,
  onDelete,
  onMove,
  onClose,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [creating, setCreating] = useState(state.kind !== "move");
  const [name, setName] = useState(
    state.kind === "edit" ? state.folder.name : "",
  );
  const [color, setColor] = useState(
    state.kind === "edit" ? state.folder.color : "blue",
  );
  const [createdFolder, setCreatedFolder] = useState<Folder | null>(null);
  const [query, setQuery] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(
    state.kind === "edit" && state.confirmDelete === true,
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialog.current?.showModal();
    return () => {
      previous?.focus();
    };
  }, []);
  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError("");
    try {
      await action();
      onClose();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Could not save changes.",
      );
    } finally {
      setBusy(false);
    }
  };
  const move = (id: string | null) => {
    if (state.kind === "move") void run(() => onMove(state.ids, id));
  };
  const title = confirmDelete
    ? "Delete folder?"
    : creating
      ? state.kind === "edit"
        ? "Edit folder"
        : "New folder"
      : `Move ${state.kind === "move" && state.ids.length > 1 ? `${state.ids.length} notes` : "note"}`;
  return (
    <dialog
      ref={dialog}
      className="folder-dialog"
      aria-labelledby="folder-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <div className="folder-dialog-body">
        <header>
          <h2 id="folder-dialog-title">{title}</h2>
          <button
            type="button"
            aria-label="Close"
            disabled={busy}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        {confirmDelete && state.kind === "edit" ? (
          <>
            <p>
              Delete “{state.folder.name}”? Its notes will be kept in No folder.
            </p>
            <div className="folder-dialog-actions">
              <button disabled={busy} onClick={() => setConfirmDelete(false)}>
                Cancel
              </button>
              <button
                className="folder-danger"
                disabled={busy}
                onClick={() => void run(() => onDelete(state.folder))}
              >
                Delete folder
              </button>
            </div>
          </>
        ) : creating ? (
          <form
            onSubmit={(event) => {
              event.preventDefault();
              void run(async () => {
                const folder = await onSave(
                  { name: name.trim(), color },
                  state.kind === "edit" ? state.folder.id : createdFolder?.id,
                );
                if (state.kind === "move") setCreatedFolder(folder);
                if (state.kind === "move") await onMove(state.ids, folder.id);
              });
            }}
          >
            <label className="folder-field">
              Name
              <input
                autoFocus
                required
                maxLength={80}
                value={name}
                placeholder="e.g. Homelab"
                onChange={(event) => setName(event.target.value)}
                disabled={busy}
              />
            </label>
            <fieldset className="folder-colors" disabled={busy}>
              <legend>Color</legend>
              {Object.entries(folderColors).map(([key, value]) => (
                <button
                  key={key}
                  type="button"
                  style={{ background: value }}
                  aria-label={key}
                  aria-pressed={color === key}
                  onClick={() => setColor(key)}
                >
                  {color === key ? <Check size={15} /> : null}
                </button>
              ))}
            </fieldset>
            <div className="folder-dialog-actions">
              {state.kind === "edit" ? (
                <button
                  type="button"
                  className="folder-delete-link"
                  disabled={busy}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete folder…
                </button>
              ) : (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    state.kind === "move" ? setCreating(false) : onClose()
                  }
                >
                  Cancel
                </button>
              )}
              <button
                className="folder-primary"
                type="submit"
                disabled={busy || !name.trim()}
              >
                {busy
                  ? "Saving…"
                  : state.kind === "edit"
                    ? "Save changes"
                    : state.kind === "move"
                      ? "Create & move"
                      : "Create folder"}
              </button>
            </div>
          </form>
        ) : (
          <>
            <label className="folder-search">
              <Search size={16} />
              <input
                autoFocus
                aria-label="Find a folder"
                placeholder="Find a folder…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="folder-picker-list">
              <button disabled={busy} onClick={() => move(null)}>
                <FolderIcon size={16} />
                <span>No folder</span>
                {currentFolderId === null ? <Check size={15} /> : null}
              </button>
              {folders
                .filter((folder) =>
                  folder.name
                    .toLocaleLowerCase()
                    .includes(query.toLocaleLowerCase()),
                )
                .map((folder) => (
                  <button
                    key={folder.id}
                    disabled={busy}
                    onClick={() => move(folder.id)}
                  >
                    <span
                      className="folder-dot"
                      style={{ background: folderColors[folder.color] }}
                    />
                    <span>{folder.name}</span>
                    {currentFolderId === folder.id ? <Check size={15} /> : null}
                  </button>
                ))}
            </div>
            <button
              className="folder-create-option"
              disabled={busy}
              onClick={() => {
                setName(query);
                setCreating(true);
              }}
            >
              <Plus size={16} />
              New folder{query.trim() ? ` “${query.trim()}”` : ""}…
            </button>
          </>
        )}
        {error ? (
          <p className="folder-error" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </dialog>
  );
}
