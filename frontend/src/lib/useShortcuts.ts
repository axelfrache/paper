import { useEffect, useRef } from "react";

type ShortcutHandlers = {
  onCommandPalette: () => void;
  onAskPalette: () => void;
  onCreateNote: () => void;
  onDelete: () => void;
  onToggleFavorite: () => void;
  onToggleSidebar: () => void;
  onToggleTheme: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onEscape: () => void;
};

export function useShortcuts(handlers: ShortcutHandlers) {
  const modifierHeldRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Control" || event.key === "Meta") {
        modifierHeldRef.current = true;
      }

      const mod = event.ctrlKey || event.metaKey;
      const heldMod = mod || modifierHeldRef.current;
      const target = event.target;
      const textInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;

      if (heldMod && !textInput && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.stopPropagation();
        if (event.shiftKey) {
          handlers.onRedo();
        } else {
          handlers.onUndo();
        }
      }

      if (heldMod && !textInput && event.key.toLowerCase() === "y") {
        event.preventDefault();
        event.stopPropagation();
        handlers.onRedo();
      }

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
        handlers.onDelete();
      }

      if (mod && !textInput && event.key.toLowerCase() === "f") {
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

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key === "Control" || event.key === "Meta") {
        modifierHeldRef.current = event.ctrlKey || event.metaKey;
      }
    };

    const onBlur = () => {
      modifierHeldRef.current = false;
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    window.addEventListener("keyup", onKeyUp, { capture: true });
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeyDown, { capture: true });
      window.removeEventListener("keyup", onKeyUp, { capture: true });
      window.removeEventListener("blur", onBlur);
    };
  }, [handlers]);
}
