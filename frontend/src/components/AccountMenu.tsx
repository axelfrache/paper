import { useBackLayer } from "../lib/useBackLayer";
import { InstallPaper } from "./InstallPaper";
import { LogOut, Pencil, ShieldCheck, Trash2, UserRound, X } from "lucide-react";
import { useRef, useState } from "react";
import {
  APIError,
  deleteAccount,
  removeAvatar,
  updateDisplayName,
  uploadAvatar,
} from "../lib/api";
import { clearThreads } from "../lib/chatStorage";
import type { AuthUser } from "../types/auth";

type AccountMenuProps = {
  user: AuthUser;
  onLogout: () => Promise<void>;
};

export function AccountMenu({ user, onLogout }: AccountMenuProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [account, setAccount] = useState<AuthUser>(user);
  const [nameDraft, setNameDraft] = useState(user.name);
  const [busy, setBusy] = useState(false);
  useBackLayer(open, () => { if (busy) return false; dialogRef.current?.close(); setOpen(false); });
  const [error, setError] = useState<string>("");
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const deletePhrase = account.email || "DELETE";
  const label = account.name || account.email || "Account";

  const run = async (action: () => Promise<AuthUser>) => {
    setBusy(true);
    setError("");
    try {
      const next = await action();
      setAccount(next);
      setNameDraft(next.name);
    } catch (caught) {
      setError(
        caught instanceof APIError ? caught.message : "Something went wrong.",
      );
    } finally {
      setBusy(false);
    }
  };

  const removeAccount = async () => {
    setBusy(true);
    setError("");
    try {
      await deleteAccount();
      clearThreads(account.id);
      window.location.assign("/");
    } catch (caught) {
      setError(
        caught instanceof APIError ? caught.message : "Could not delete the account.",
      );
      setBusy(false);
    }
  };

  const saveName = () => {
    if (nameDraft.trim() === account.name.trim()) {
      return;
    }
    void run(() => updateDisplayName(nameDraft));
  };

  return (
    <>
      <button
        className="account-trigger"
        type="button"
        onClick={() => { setOpen(true); dialogRef.current?.showModal(); }}
      >
        {account.avatarUrl ? (
          <img className="account-avatar" src={account.avatarUrl} alt="" />
        ) : (
          <span>{initials(label)}</span>
        )}
        <div>
          <strong>{label}</strong>
          <small>{account.email}</small>
        </div>
      </button>

      <dialog
        className="account-dialog"
        ref={dialogRef}
        onClose={() => {
          setError("");
          setConfirmingDelete(false);
          setDeleteConfirm("");
          setOpen(false);
        }}
      >
        <header>
          <div className="account-dialog-icon">
            <UserRound size={17} strokeWidth={1.8} />
          </div>
          <button
            type="button"
            onClick={() => dialogRef.current?.close()}
            aria-label="Close"
          >
            <X size={15} />
          </button>
        </header>
        <section className="account-profile">
          <div className="account-avatar-frame">
            {account.avatarUrl ? (
              <img
                className="account-avatar-lg"
                src={account.avatarUrl}
                alt=""
              />
            ) : (
              <span className="account-avatar-lg">{initials(label)}</span>
            )}
            <button
              type="button"
              className="account-avatar-badge"
              disabled={busy}
              aria-label={account.avatarUrl ? "Change photo" : "Add photo"}
              onClick={() => fileRef.current?.click()}
            >
              <Pencil size={13} strokeWidth={1.9} />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              hidden
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (file) {
                  void run(() => uploadAvatar(file));
                }
              }}
            />
          </div>
          {account.avatarUrl ? (
            <button
              type="button"
              className="account-remove"
              disabled={busy}
              onClick={() => void run(removeAvatar)}
            >
              Remove photo
            </button>
          ) : null}
          <label className="account-field">
            <span>Display name</span>
            <input
              value={nameDraft}
              disabled={busy}
              onChange={(event) => setNameDraft(event.target.value)}
              onBlur={saveName}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  event.currentTarget.blur();
                }
              }}
            />
          </label>
          <span className="account-email">{account.email}</span>
          {account.isAdmin ? (
            <em>
              <ShieldCheck size={13} /> Paper administrator
            </em>
          ) : null}
          {error ? <div className="account-error">{error}</div> : null}
        </section>
        <InstallPaper />
        <section className="account-danger" aria-labelledby="account-danger-title">
          <strong id="account-danger-title">Danger zone</strong>
          <span>
            Deleting your account permanently removes all your notes, folders,
            images and profile. This cannot be undone.
          </span>
          {confirmingDelete ? (
            <>
              <label className="account-field">
                <span>
                  Type <b>{deletePhrase}</b> to confirm
                </span>
                <input
                  value={deleteConfirm}
                  disabled={busy}
                  autoComplete="off"
                  onChange={(event) => setDeleteConfirm(event.target.value)}
                />
              </label>
              <div className="account-danger-actions">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => {
                    setConfirmingDelete(false);
                    setDeleteConfirm("");
                  }}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="danger"
                  disabled={busy || deleteConfirm.trim() !== deletePhrase}
                  onClick={() => void removeAccount()}
                >
                  <Trash2 size={14} /> Delete permanently
                </button>
              </div>
            </>
          ) : (
            <div className="account-danger-actions">
              <button
                type="button"
                className="danger"
                disabled={busy}
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 size={14} /> Delete account
              </button>
            </div>
          )}
        </section>
        <footer>
          <button
            type="button"
            onClick={() =>
              void onLogout().catch(() => setError("Could not sign out"))
            }
          >
            <LogOut size={14} /> Sign out
          </button>
        </footer>
      </dialog>
    </>
  );
}

function initials(value: string) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
