import { Keyboard, X } from "lucide-react";
import { useRef } from "react";

type ShortcutGroup = {
  title: string;
  items: Array<{ label: string; keys: string }>;
};

const groups: ShortcutGroup[] = [
  {
    title: "General",
    items: [
      { label: "Search / command palette", keys: "⌘K" },
      { label: "Ask my notes", keys: "⌘⇧K" },
      { label: "New note", keys: "⌘N" },
      { label: "Delete note", keys: "⌘D" },
      { label: "Toggle favorite", keys: "⌘F" },
      { label: "Light / dark theme", keys: "⌘⇧L" },
      { label: "Hide sidebar", keys: "⌘⌥B" },
    ],
  },
  {
    title: "Editing",
    items: [
      { label: "Undo", keys: "⌘Z" },
      { label: "Redo", keys: "⌘⇧Z" },
      { label: "Insert block", keys: "/" },
    ],
  },
  {
    title: "Navigation",
    items: [
      { label: "Move between notes", keys: "↑ ↓" },
      { label: "Open note", keys: "Enter" },
      { label: "Close / back", keys: "Esc" },
    ],
  },
];

export function ShortcutsHelp() {
  const dialogRef = useRef<HTMLDialogElement | null>(null);

  return (
    <>
      <button className="shortcut-help-button" type="button" onClick={() => dialogRef.current?.showModal()}>
        <Keyboard size={14} strokeWidth={1.8} />
        <span>Keyboard shortcuts</span>
      </button>

      <dialog
        className="shortcuts-dialog"
        ref={dialogRef}
        onClick={(event) => {
          if (event.target === dialogRef.current) {
            dialogRef.current?.close();
          }
        }}
      >
        <header>
          <strong>Keyboard shortcuts</strong>
          <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Close">
            <X size={15} />
          </button>
        </header>
        <div className="shortcuts-groups">
          {groups.map((group) => (
            <section key={group.title}>
              <h3>{group.title}</h3>
              {group.items.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <kbd>{item.keys}</kbd>
                </div>
              ))}
            </section>
          ))}
        </div>
      </dialog>
    </>
  );
}
