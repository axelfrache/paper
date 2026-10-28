import { useBackLayer } from "../lib/useBackLayer";
import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

export function ActionMenu({
  x,
  y,
  label,
  onClose,
  children,
  returnFocus,
}: {
  x: number;
  y: number;
  label: string;
  onClose: () => void;
  children: ReactNode;
  returnFocus?: HTMLElement | null;
}) {
  useBackLayer(true, onClose);
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useLayoutEffect(() => {
    const menu = ref.current!;
    const trigger =
      returnFocus ?? (document.activeElement as HTMLElement | null);
    const position = () => {
      const bounds = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8))}px`;
      menu.style.top = `${Math.max(8, Math.min(y, window.innerHeight - bounds.height - 8))}px`;
    };
    position();
    menu.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus();
    const outside = (event: PointerEvent) => {
      if (!menu.contains(event.target as Node)) closeRef.current();
    };
    const resize = () => closeRef.current();
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", resize);
    return () => {
      document.removeEventListener("pointerdown", outside, true);
      window.removeEventListener("resize", resize);
      if (trigger?.isConnected) trigger.focus({ preventScroll: true });
    };
  }, [x, y, returnFocus]);
  return createPortal(
    <>
      <div className="action-menu-scrim" onClick={onClose} />
      <div
        ref={ref}
        className="note-context-menu action-menu"
        role="menu"
        aria-label={label}
        onKeyDown={(event) => {
          event.stopPropagation();
          const buttons = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>(
              "button:not(:disabled)",
            ),
          ).filter((button) => getComputedStyle(button).display !== "none");
          const index = buttons.indexOf(
            document.activeElement as HTMLButtonElement,
          );
          if (event.key === "Escape" || event.key === "Tab") {
            event.preventDefault();
            event.stopPropagation();
            onClose();
          } else if (
            ["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)
          ) {
            event.preventDefault();
            buttons[
              event.key === "Home"
                ? 0
                : event.key === "End"
                  ? buttons.length - 1
                  : (index +
                      (event.key === "ArrowDown" ? 1 : -1) +
                      buttons.length) %
                    buttons.length
            ]?.focus();
          }
        }}
      >
        <div className="action-menu-heading">{label}</div>
        {children}
        <button
          className="action-menu-cancel"
          role="menuitem"
          onClick={onClose}
        >
          Cancel
        </button>
      </div>
    </>,
    document.body,
  );
}
