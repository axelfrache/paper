import { LogOut, ShieldCheck, UserRound } from "lucide-react";
import { useRef, useState } from "react";
import { DialogHeader } from "./DialogHeader";
import type { AuthUser } from "../types/auth";

type AccountMenuProps = {
  user: AuthUser;
  onLogout: () => Promise<void>;
};

export function AccountMenu({ user, onLogout }: AccountMenuProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [error, setError] = useState<string>("");
  const label = user.name || user.email || "Account";

  return (
    <>
      <button className="account-trigger" type="button" onClick={() => dialogRef.current?.showModal()}>
        <span>{initials(label)}</span>
        <div>
          <strong>{label}</strong>
          <small>{user.email}</small>
        </div>
      </button>

      <dialog className="account-dialog" ref={dialogRef} onClose={() => setError("")}>
        <DialogHeader icon={UserRound} onClose={() => dialogRef.current?.close()} />
        <section>
          <strong>{label}</strong>
          <span>{user.email}</span>
          {user.isAdmin ? (
            <em>
              <ShieldCheck size={13} /> Paper administrator
            </em>
          ) : null}
        </section>
        <footer>
          <button type="button" onClick={() => void onLogout().catch(() => setError("Could not sign out"))}>
            <LogOut size={14} /> Sign out
          </button>
          {error ? <span>{error}</span> : null}
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
