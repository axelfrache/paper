import { useEffect } from "react";

type ShortcutHandlers = {
  onCommandPalette: () => void;
  onAskPalette: () => void;
  onCreateNote: () => void;
  onToggleFavorite: () => void;
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
  onEscape: () => void;
};

export function useShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const mod = event.ctrlKey || event.metaKey;

      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (event.shiftKey) {
          handlers.onAskPalette();
        } else {
          handlers.onCommandPalette();
        }
      }

      if (mod && event.key.toLowerCase() === "n") {
        event.preventDefault();
        handlers.onCreateNote();
      }

      if (mod && event.key.toLowerCase() === "d") {
        event.preventDefault();
        handlers.onToggleFavorite();
      }

      if (mod && event.shiftKey && event.key.toLowerCase() === "l") {
        event.preventDefault();
        handlers.onToggleTheme();
      }

      if (mod && event.key === "\\") {
        event.preventDefault();
        handlers.onToggleSidebar();
      }

      if (event.key === "Escape") {
        handlers.onEscape();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [handlers]);
}
