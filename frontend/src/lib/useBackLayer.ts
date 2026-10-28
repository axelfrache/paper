import { useEffect, useRef } from "react";

let pendingBack: Promise<void> = Promise.resolve();

export function useBackLayer(open: boolean, onClose: () => void | false) {
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const token = crypto.randomUUID();
    let disposed = false;
    let attached = false;
    const pop = () => {
      if (!(window.history.state?.paperLayers ?? []).includes(token))
        if (close.current() === false) {
          const layers: string[] = window.history.state?.paperLayers ?? [];
          window.history.pushState(
            { ...window.history.state, paperLayers: [...layers, token] },
            "",
          );
        }
    };
    void pendingBack.then(() => {
      if (disposed) return;
      const layers: string[] = window.history.state?.paperLayers ?? [];
      window.history.pushState(
        { ...window.history.state, paperLayers: [...layers, token] },
        "",
      );
      window.addEventListener("popstate", pop);
      attached = true;
    });
    return () => {
      disposed = true;
      window.removeEventListener("popstate", pop);
      if (attached && window.history.state?.paperLayers?.at(-1) === token) {
        pendingBack = new Promise<void>((resolve) => {
          window.addEventListener("popstate", () => resolve(), { once: true });
          window.history.back();
        });
      }
    };
  }, [open]);
}
