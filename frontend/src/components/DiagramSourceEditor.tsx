import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { diagramToSvgMarkup, parseDiagramSource } from "../lib/diagram";
import type { Diagram } from "../lib/diagram";
import { useBackLayer } from "../lib/useBackLayer";
import { MermaidDiagram } from "./MermaidDiagram";

export function DiagramSourceEditor({
  source,
  language,
  onSave,
  onClose,
}: {
  source: string;
  language: "mermaid" | "json";
  onSave: (source: string, diagram?: Diagram) => void;
  onClose: () => void;
}) {
  const [draft, setDraft] = useState(source);
  const dialog = useRef<HTMLDialogElement>(null);
  useBackLayer(true, onClose);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  const parsed = useMemo(() => {
    if (language === "mermaid") return {};
    try {
      const diagram = parseDiagramSource(draft);
      return { diagram, svg: diagramToSvgMarkup(diagram, 420) };
    } catch (error) {
      return {
        error:
          error instanceof Error ? error.message : "Invalid diagram source.",
      };
    }
  }, [draft, language]);
  return createPortal(
    <dialog
      ref={dialog}
      className="diagram-source-editor"
      aria-labelledby="diagram-source-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <div>
          <h2 id="diagram-source-title">Edit diagram source</h2>
          <span>{language === "mermaid" ? "Mermaid" : "Diagram JSON"}</span>
        </div>
        <button
          type="button"
          className="topbar-icon-button"
          aria-label="Close source editor"
          onClick={onClose}
        >
          ×
        </button>
      </header>
      <div className="diagram-source-body">
        <label className="diagram-source-input">
          Source
          <textarea
            autoFocus
            aria-label="Diagram source"
            spellCheck={false}
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
          />
        </label>
        <section
          className="diagram-source-preview"
          aria-label="Diagram preview"
        >
          <span>Preview</span>
          {language === "mermaid" ? (
            <MermaidDiagram source={draft} />
          ) : parsed.error ? (
            <p role="alert">{parsed.error}</p>
          ) : (
            <figure
              className="markdown-diagram-card"
              dangerouslySetInnerHTML={{ __html: parsed.svg! }}
            />
          )}
        </section>
      </div>
      <footer>
        <button type="button" onClick={onClose}>
          Cancel
        </button>
        <button
          type="button"
          disabled={Boolean(parsed.error)}
          onClick={() => onSave(draft, parsed.diagram)}
        >
          Save
        </button>
      </footer>
    </dialog>,
    document.body,
  );
}
