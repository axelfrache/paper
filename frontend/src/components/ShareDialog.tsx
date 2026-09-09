import { Check, Link2 } from "lucide-react";
import { useRef, useState } from "react";
import { DialogHeader } from "./DialogHeader";
import type { Note } from "../types/note";

type ShareDialogProps = {
  note: Note;
  onEnableShare: () => Promise<void>;
  onDisableShare: () => Promise<void>;
};

export function ShareDialog({ note, onEnableShare, onDisableShare }: ShareDialogProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  const shareUrl = note.shareToken ? `${window.location.origin}/shared/${note.shareToken}` : "";

  return (
    <>
      <button
        className={note.shareToken ? "topbar-button strong" : "topbar-button"}
        type="button"
        onClick={() => {
          setCopied(false);
          dialogRef.current?.showModal();
        }}
      >
        <Link2 size={14} strokeWidth={1.9} />
        Share
      </button>

      <dialog className="account-dialog share-dialog" ref={dialogRef}>
        <DialogHeader icon={Link2} onClose={() => dialogRef.current?.close()} />
        <section>
          <strong>Share this note</strong>
          <span>Anyone signed in with the link can edit this note.</span>
        </section>
        {note.shareToken ? (
          <div className="share-dialog-link">
            <input readOnly value={shareUrl} onFocus={(event) => event.currentTarget.select()} />
            <button
              type="button"
              onClick={() => {
                void navigator.clipboard.writeText(shareUrl).then(() => {
                  setCopied(true);
                });
              }}
            >
              {copied ? <Check size={14} strokeWidth={2} /> : "Copy"}
            </button>
          </div>
        ) : null}
        <footer>
          {note.shareToken ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void onDisableShare().finally(() => setBusy(false));
              }}
            >
              Turn off sharing
            </button>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setBusy(true);
                void onEnableShare().finally(() => setBusy(false));
              }}
            >
              Create share link
            </button>
          )}
        </footer>
      </dialog>
    </>
  );
}
