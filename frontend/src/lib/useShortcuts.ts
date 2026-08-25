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
  onNavigateNote: (direction: "previous" | "next") => void;
  onFocusActiveContent: () => void;
  onEscape: () => void;
};

export function useShortcuts(handlers: ShortcutHandlers) {
  const modifierHeldRef = useRef(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Control" || event.key === "Meta") {
        modifierHeldRef.current = true;
      }

      if (document.querySelector(".diagram-editor")) {
        return;
      }

      const mod = event.ctrlKey || event.metaKey;
      const heldMod = mod || modifierHeldRef.current;
      const target = event.target;
      const textInput =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement;
      const contentEditable = target instanceof HTMLElement && Boolean(target.closest("[contenteditable='true']"));
      const noteCard = target instanceof HTMLElement && Boolean(target.closest(".note-card"));
      const editorTarget = target instanceof HTMLElement && Boolean(target.closest(".editor-shell"));
      const editableTarget = textInput || contentEditable;
      const interactiveTarget =
        target instanceof HTMLElement &&
        Boolean(target.closest("button, a, input, textarea, select, [contenteditable='true']"));
      const idleTarget =
        target === document.body ||
        (target instanceof HTMLElement && Boolean(target.closest(".app-shell")) && !interactiveTarget);

      if (!mod && idleTarget && !editableTarget && !noteCard && !editorTarget && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
        event.preventDefault();
        handlers.onNavigateNote(event.key === "ArrowDown" ? "next" : "previous");
      }

      if (!mod && idleTarget && !editableTarget && !noteCard && !editorTarget && (event.key === "Enter" || event.key === "ArrowRight")) {
        event.preventDefault();
        handlers.onFocusActiveContent();
      }

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

      if (mod && event.altKey && !event.shiftKey && !editableTarget && event.key.toLowerCase() === "b") {
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
