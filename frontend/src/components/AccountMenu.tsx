import { InstallPaper } from "./InstallPaper";
import { LogOut, Pencil, ShieldCheck, UserRound, X } from "lucide-react";
import { useRef, useState } from "react";
import {
  APIError,
  removeAvatar,
  updateDisplayName,
  uploadAvatar,
} from "../lib/api";
import type { AuthUser } from "../types/auth";

type AccountMenuProps = {
  user: AuthUser;
  onLogout: () => Promise<void>;
};

export function AccountMenu({ user, onLogout }: AccountMenuProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [account, setAccount] = useState<AuthUser>(user);
  const [nameDraft, setNameDraft] = useState(user.name);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>("");
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
        onClick={() => dialogRef.current?.showModal()}
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
        onClose={() => setError("")}
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
