import type { ReactNode } from "react";
import { diagramSummary, diagramToSvgMarkup, parseDiagramMarker } from "../lib/diagram";
import type { Diagram } from "../lib/diagram";

type MarkdownViewProps = {
  text: string;
  className?: string;
};

type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "tasks"; items: Array<{ text: string; done: boolean }> }
  | { type: "ol"; items: string[] }
  | { type: "diagram"; diagram: Diagram }
  | { type: "code"; text: string }
  | { type: "divider" };

export function MarkdownView({ text, className }: MarkdownViewProps) {
  const blocks = parseBlocks(text);
  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className={className ? `markdown-view ${className}` : "markdown-view"}>
      {blocks.map((block, index) => renderBlock(block, index))}
    </div>
  );
}

function parseBlocks(raw: string): MarkdownBlock[] {
  const lines = normalizeMarkdown(raw).split("\n");
  const blocks: MarkdownBlock[] = [];
  let paragraph: string[] = [];
  let code: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length > 0) {
      blocks.push({ type: "paragraph", text: paragraph.join(" ") });
      paragraph = [];
    }
  };

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const trimmed = line.trim();

    if (trimmed.startsWith("```")) {
      if (code) {
        blocks.push({ type: "code", text: code.join("\n") });
        code = null;
      } else {
        flushParagraph();
        code = [];
      }
      continue;
    }

    if (code) {
      code.push(line);
      continue;
    }

    if (!trimmed) {
      flushParagraph();
      continue;
    }

    const diagram = parseDiagramMarker(trimmed);
    if (diagram) {
      flushParagraph();
      blocks.push({ type: "diagram", diagram });
      continue;
    }

    if (/^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line)) {
      flushParagraph();
      blocks.push({ type: "divider" });
      continue;
    }

    const heading = trimmed.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2] });
      continue;
    }

    const task = trimmed.match(/^-\s\[([ xX])\]\s+(.+)$/);
    if (task) {
      flushParagraph();
      const items = [{ done: task[1].toLowerCase() === "x", text: task[2] }];
      while (index + 1 < lines.length) {
        const next = lines[index + 1].trim().match(/^-\s\[([ xX])\]\s+(.+)$/);
        if (!next) {
          break;
        }
        items.push({ done: next[1].toLowerCase() === "x", text: next[2] });
        index += 1;
      }
      blocks.push({ type: "tasks", items });
      continue;
    }

    const unordered = trimmed.match(/^[-*•]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      const items = [unordered[1]];
      while (index + 1 < lines.length) {
        const next = lines[index + 1].trim().match(/^[-*•]\s+(.+)$/);
        if (!next) {
          break;
        }
        items.push(next[1]);
        index += 1;
      }
      blocks.push({ type: "ul", items });
      continue;
    }

    const ordered = trimmed.match(/^\d+[.)]\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      const items = [ordered[1]];
      while (index + 1 < lines.length) {
        const next = lines[index + 1].trim().match(/^\d+[.)]\s+(.+)$/);
        if (!next) {
          break;
        }
        items.push(next[1]);
        index += 1;
      }
      blocks.push({ type: "ol", items });
      continue;
    }

    const quote = trimmed.match(/^>\s?(.+)$/);
    if (quote) {
      flushParagraph();
      blocks.push({ type: "quote", text: quote[1] });
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  if (code) {
    blocks.push({ type: "code", text: code.join("\n") });
  }
  return blocks;
}

function normalizeMarkdown(raw: string) {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/([^\n])\s+-\s+(?=(\*\*|[A-Za-zÀ-ÿ]))/g, "$1\n- ");
}

function renderBlock(block: MarkdownBlock, index: number) {
  if (block.type === "heading") {
    const Heading = `h${Math.min(block.level + 2, 5)}` as "h3" | "h4" | "h5";
    return <Heading key={index}>{renderInline(block.text)}</Heading>;
  }
  if (block.type === "paragraph") {
    return <p key={index}>{renderInline(block.text)}</p>;
  }
  if (block.type === "quote") {
    return <blockquote key={index}>{renderInline(block.text)}</blockquote>;
  }
  if (block.type === "code") {
    return (
      <pre key={index}>
        <code>{block.text}</code>
      </pre>
    );
  }
  if (block.type === "divider") {
    return <hr key={index} />;
  }
  if (block.type === "diagram") {
    return (
      <figure key={index} className="markdown-diagram-card">
        <div dangerouslySetInnerHTML={{ __html: diagramToSvgMarkup(block.diagram, 320) }} />
        <figcaption>{diagramSummary(block.diagram)}</figcaption>
      </figure>
    );
  }
  if (block.type === "ol") {
    return (
      <ol key={index}>
        {block.items.map((item, itemIndex) => (
          <li key={`${item}-${itemIndex}`}>{renderInline(item)}</li>
        ))}
      </ol>
    );
  }
  if (block.type === "tasks") {
    return (
      <ul key={index} className="markdown-tasks">
        {block.items.map((item, itemIndex) => (
          <li key={`${item.text}-${itemIndex}`} className={item.done ? "done" : ""}>
            <span>{item.done ? "☑" : "☐"}</span>
            <p>{renderInline(item.text)}</p>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <ul key={index}>
      {block.items.map((item, itemIndex) => (
        <li key={`${item}-${itemIndex}`}>{renderInline(item)}</li>
      ))}
    </ul>
  );
}

function renderInline(text: string) {
  const chunks = text.split(/(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return chunks.map((chunk, index): ReactNode => {
    if (chunk.startsWith("`") && chunk.endsWith("`")) {
      return <code key={index}>{chunk.slice(1, -1)}</code>;
    }
    if (chunk.startsWith("**") && chunk.endsWith("**")) {
      return <strong key={index}>{renderInline(chunk.slice(2, -2))}</strong>;
    }
    if (chunk.startsWith("*") && chunk.endsWith("*")) {
      return <em key={index}>{renderInline(chunk.slice(1, -1))}</em>;
    }
    return chunk;
  });
}
