import { useEffect, useRef } from "react";
import { mountMermaidPreview } from "../lib/mermaid";

export function MermaidDiagram({ source, title }: { source: string; title?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) return mountMermaidPreview(ref.current, source);
  }, [source]);
  return (
    <figure className="markdown-diagram-card markdown-mermaid-card">
      {title ? <div className="markdown-diagram-header"><span className="markdown-diagram-title">{title}</span></div> : null}
      <div
        ref={ref}
        className="mermaid-preview"
        role="figure"
        aria-label={title || "Mermaid diagram"}
      />
    </figure>
  );
}
