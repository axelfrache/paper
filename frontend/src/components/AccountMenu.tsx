import { LogOut, ShieldCheck, UserRound, X } from "lucide-react";
import { useRef, useState } from "react";
import type { AuthUser } from "../types/auth";

type AccountMenuProps = {
  user: AuthUser;
  onLogout: () => Promise<void>;
  onClaimLegacyNotes: () => Promise<number>;
};

export function AccountMenu({ user, onLogout, onClaimLegacyNotes }: AccountMenuProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [claimResult, setClaimResult] = useState<string>("");
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

      <dialog className="account-dialog" ref={dialogRef} onClose={() => setClaimResult("")}>
        <header>
          <div className="account-dialog-icon">
            <UserRound size={17} strokeWidth={1.8} />
          </div>
          <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close">
            <X size={15} />
          </button>
        </header>
        <section>
          <strong>{label}</strong>
          <span>{user.email}</span>
          {user.isAdmin ? (
            <em>
              <ShieldCheck size={13} /> Paper administrator
            </em>
          ) : null}
        </section>
        {user.isAdmin ? (
          <div className="account-admin-actions">
            <button
              type="button"
              onClick={() => {
                void onClaimLegacyNotes()
                  .then((count) => setClaimResult(`${count} notes claimed`))
                  .catch(() => setClaimResult("Could not claim notes"));
              }}
            >
              Claim legacy notes
            </button>
            {claimResult ? <span>{claimResult}</span> : null}
          </div>
        ) : null}
        <footer>
          <button
            type="button"
            onClick={() => void onLogout().catch(() => setClaimResult("Could not sign out"))}
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
