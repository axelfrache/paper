import type { Note } from "../types/note";
import { parseInline } from "./markdown/inline";
import { parseBlocks } from "./markdown/render";
import type { MarkdownInline } from "./markdown/inline";

export function buildNoteTitleIndex(
  notes: Array<{ id: string; title: string }>,
): Map<string, string> {
  const map = new Map<string, string>();
  const ambiguous = new Set<string>();
  for (const note of notes) {
    const key = note.title.trim().toLowerCase();
    if (!key || ambiguous.has(key)) continue;
    if (map.has(key)) {
      map.delete(key);
      ambiguous.add(key);
    } else map.set(key, note.id);
  }
  return map;
}

export function extractWikilinkTitles(content: string): string[] {
  const titles: string[] = [];
  for (const block of parseBlocks(content)) {
    if (
      block.type === "heading" ||
      block.type === "paragraph" ||
      block.type === "quote"
    ) {
      collectWikilinkTitles(parseInline(block.text), titles);
    } else if (block.type === "ul" || block.type === "ol") {
      for (const item of block.items)
        collectWikilinkTitles(parseInline(item), titles);
    } else if (block.type === "tasks") {
      for (const item of block.items)
        collectWikilinkTitles(parseInline(item.text), titles);
    }
  }
  return titles;
}

function collectWikilinkTitles(nodes: MarkdownInline[], out: string[]) {
  for (const node of nodes) {
    if (node.type === "wikilink") {
      out.push(node.title);
    } else if (
      node.type === "strong" ||
      node.type === "em" ||
      node.type === "strike" ||
      node.type === "underline"
    ) {
      collectWikilinkTitles(node.children, out);
    } else if (node.type === "link") {
      collectWikilinkTitles(node.text, out);
    }
  }
}

export type NoteGraphNode = {
  id: string;
  title: string;
  folderId: string | null;
  tags: string[];
};
export type NoteGraphEdge = { source: string; target: string };
export type NoteGraphIssue = {
  source: string;
  title: string;
  reason: "missing" | "ambiguous";
};
export type NoteGraph = {
  nodes: NoteGraphNode[];
  edges: NoteGraphEdge[];
  signature: string;
  issues: NoteGraphIssue[];
};

const linkCache = new Map<string, { content: string; titles: string[] }>();

export function buildNoteGraph(notes: Note[]): NoteGraph {
  const liveIds = new Set(notes.map((note) => note.id));
  for (const id of linkCache.keys()) {
    if (!liveIds.has(id)) linkCache.delete(id);
  }

  const titleIndex = buildNoteTitleIndex(notes);
  const knownTitles = new Set(
    notes.map((note) => note.title.trim().toLowerCase()),
  );
  const issues: NoteGraphIssue[] = [];
  const nodes: NoteGraphNode[] = notes.map((note) => ({
    id: note.id,
    title: note.title,
    folderId: note.folderId ?? null,
    tags: note.tags,
  }));

  const seenPairs = new Set<string>();
  const edges: NoteGraphEdge[] = [];

  for (const note of notes) {
    let cached = linkCache.get(note.id);
    if (!cached || cached.content !== note.content) {
      cached = {
        content: note.content,
        titles: extractWikilinkTitles(note.content),
      };
      linkCache.set(note.id, cached);
    }
    for (const linkedTitle of new Set(cached.titles)) {
      const targetId = titleIndex.get(linkedTitle.trim().toLowerCase());
      if (!targetId) {
        issues.push({
          source: note.id,
          title: linkedTitle,
          reason: knownTitles.has(linkedTitle.trim().toLowerCase())
            ? "ambiguous"
            : "missing",
        });
        continue;
      }
      if (targetId === note.id) continue;
      const pairKey = [note.id, targetId].sort().join("\u0000");
      if (seenPairs.has(pairKey)) continue;
      seenPairs.add(pairKey);
      edges.push({ source: note.id, target: targetId });
    }
  }

  const signature = JSON.stringify([
    nodes.map((node) => node.id).sort(),
    [...seenPairs].sort(),
  ]);
  return { nodes, edges, signature, issues };
}

export function colorForTag(tag: string): string {
  let hash = 0;
  for (let index = 0; index < tag.length; index += 1) {
    hash = (hash * 31 + tag.charCodeAt(index)) | 0;
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 55%, 55%)`;
}
