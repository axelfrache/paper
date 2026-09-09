import { X } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export function DialogHeader({ icon: Icon, onClose }: { icon: LucideIcon; onClose: () => void }) {
  return (
    <header>
      <div className="account-dialog-icon">
        <Icon size={17} strokeWidth={1.8} />
      </div>
      <button type="button" onClick={onClose} aria-label="Close">
        <X size={15} />
      </button>
    </header>
  );
}
