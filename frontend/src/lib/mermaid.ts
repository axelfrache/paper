let nextId = 0;
let renderQueue: Promise<void> = Promise.resolve();

export function mountMermaidPreview(
  host: HTMLElement,
  source: string,
): () => void {
  let disposed = false;
  let generation = 0;
  let timer: ReturnType<typeof setTimeout>;
  const schedule = () => {
    const current = ++generation;
    clearTimeout(timer);
    host.textContent = source.trim()
      ? "Rendering diagram…"
      : "Empty Mermaid diagram.";
    host.dataset.state = "loading";
    if (!source.trim()) return;
    const isCurrent = () =>
      !disposed && current === generation && host.isConnected;
    timer = setTimeout(() => {
      renderQueue = renderQueue.then(async () => {
        if (!isCurrent()) return;
        let container: HTMLDivElement | undefined;
        try {
          const { default: mermaid } = await import("mermaid");
          if (!isCurrent()) return;
          mermaid.initialize({
            startOnLoad: false,
            securityLevel: "strict",
            suppressErrorRendering: true,
            theme:
              document.documentElement.dataset.theme === "dark"
                ? "dark"
                : "default",
            fontFamily: "system-ui, sans-serif",
          });
          container = document.createElement("div");
          container.className = "mermaid-render-container";
          container.setAttribute("aria-hidden", "true");
          document.body.appendChild(container);
          const { svg } = await mermaid.render(
            `paper-mermaid-${++nextId}`,
            source,
            container,
          );
          if (!isCurrent()) return;
          host.innerHTML = svg;
          host.dataset.state = "ready";
        } catch (error) {
          if (!isCurrent()) return;
          host.dataset.state = "error";
          const message = document.createElement("p");
          message.textContent =
            "Unable to render Mermaid diagram. Check the source syntax.";
          const details = document.createElement("details");
          const summary = document.createElement("summary");
          summary.textContent = "Details and source";
          const diagnostic = document.createElement("pre");
          diagnostic.textContent =
            error instanceof Error ? error.message : "Rendering failed.";
          const code = document.createElement("pre");
          code.textContent = source;
          details.append(summary, diagnostic, code);
          host.replaceChildren(message, details);
        } finally {
          container?.remove();
        }
      });
    }, 200);
  };
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ["data-theme"],
  });
  schedule();
  return () => {
    disposed = true;
    clearTimeout(timer);
    observer.disconnect();
  };
}

const editorPreviews = new WeakMap<HTMLElement, Map<HTMLElement, () => void>>();

export function syncMermaidPreviews(editor: HTMLElement) {
  const previews =
    editorPreviews.get(editor) ?? new Map<HTMLElement, () => void>();
  editorPreviews.set(editor, previews);
  for (const [host, dispose] of previews) {
    if (!editor.contains(host)) {
      dispose();
      previews.delete(host);
    }
  }
  for (const host of editor.querySelectorAll<HTMLElement>("[data-mermaid]")) {
    if (!previews.has(host))
      previews.set(host, mountMermaidPreview(host, host.dataset.mermaid!));
  }
}

export function disposeMermaidPreviews(editor: HTMLElement) {
  editorPreviews.get(editor)?.forEach((dispose) => dispose());
  editorPreviews.delete(editor);
}
