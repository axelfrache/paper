import { parseDiagramMarker } from "../diagram";
import type { Diagram } from "../diagram";

export type MarkdownInline =
  | { type: "text"; text: string }
  | { type: "link"; text: MarkdownInline[]; href: string; safe: boolean }
  | { type: "code"; text: string }
  | { type: "strong"; children: MarkdownInline[] }
  | { type: "em"; children: MarkdownInline[] };

export type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "quote"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "tasks"; items: Array<{ text: string; done: boolean }> }
  | { type: "ol"; items: string[] }
  | { type: "diagram"; diagram: Diagram }
  | { type: "code"; text: string }
  | { type: "divider" };

export function parseBlocks(raw: string): MarkdownBlock[] {
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

    if (isDivider(line)) {
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

export function parseInline(text: string): MarkdownInline[] {
  const chunks = text.split(/(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return chunks.map((chunk): MarkdownInline => {
    const link = chunk.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      const href = safeHref(link[2]);
      return { type: "link", text: parseInline(link[1]), href: href || link[2].trim(), safe: Boolean(href) };
    }
    if (chunk.startsWith("`") && chunk.endsWith("`")) {
      return { type: "code", text: chunk.slice(1, -1) };
    }
    if (chunk.startsWith("**") && chunk.endsWith("**")) {
      return { type: "strong", children: parseInline(chunk.slice(2, -2)) };
    }
    if (chunk.startsWith("*") && chunk.endsWith("*")) {
      return { type: "em", children: parseInline(chunk.slice(1, -1)) };
    }
    return { type: "text", text: chunk };
  });
}

export function normalizeMarkdown(raw: string) {
  return raw
    .replace(/\r\n?/g, "\n")
    .replace(/([^\n])\s+-\s+(?=(\*\*|[A-Za-zÀ-ÿ]))/g, "$1\n- ");
}

export function safeHref(value: string) {
  const href = value.trim();
  if (/^(https?:\/\/|mailto:|tel:)/i.test(href)) {
    return href;
  }
  if (href.startsWith("/") && !href.startsWith("//")) {
    return href;
  }
  return "";
}

export function isDivider(line: string) {
  return /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/.test(line);
}
