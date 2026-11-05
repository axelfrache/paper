import type { Note } from "../types/note";
import type { NoteGraphEdge } from "./noteGraph";
import { parseBlocks, parseInline } from "./markdown/render";
import type { MarkdownInline } from "./markdown/inline";

export type RelatedNoteEdge = NoteGraphEdge & {
  score: number;
  tags: string[];
  terms: string[];
};

const stopWords = new Set(
  `all and any are aux avec bon car ces cet des dit donc duquel elle eux for has her him his how ici its les lui mes mon nos not ont or our par pas peu plus qui ses son sur tes the ton too vos was were why yes you about after again also avec avant avoir been being cette comme dans depuis does each elle elles entre est etre faire fait from have into leur leurs mais meme more most notre nous other pour quand quel quelle sans sont sous such that their them then there these they this those through tous tout toute toutes tres une vous votre what when where which while will with would your notes note untitled`.split(
    " ",
  ),
);
const textCache = new Map<
  string,
  { title: string; content: string; terms: Map<string, number> }
>();
const pairKey = (a: string, b: string) => JSON.stringify([a, b].sort());

function words(text: string) {
  return (
    text
      .normalize("NFKD")
      .replace(/\p{M}/gu, "")
      .toLowerCase()
      .match(/\p{L}[\p{L}\p{N}]{2,}/gu) ?? []
  ).filter((word) => !stopWords.has(word));
}

function inlineText(nodes: MarkdownInline[]): string {
  return nodes
    .map((node) => {
      if (node.type === "text" || node.type === "escape")
        return node.text.replace(/https?:\/\/\S+/g, " ");
      if ("children" in node) return inlineText(node.children);
      if (node.type === "link") return inlineText(node.text);
      return "";
    })
    .join(" ");
}

function noteTerms(note: Note) {
  const cached = textCache.get(note.id);
  if (cached?.title === note.title && cached.content === note.content)
    return cached.terms;
  const terms = new Map(
    words(note.title)
      .slice(0, 128)
      .map((word) => [word, 2]),
  );
  for (const block of parseBlocks(note.content)) {
    let lines: string[] = [];
    if (
      block.type === "paragraph" ||
      block.type === "heading" ||
      block.type === "quote"
    )
      lines = [block.text];
    else if (block.type === "ul" || block.type === "ol") lines = block.items;
    else if (block.type === "tasks")
      lines = block.items.map((item) => item.text);
    for (const line of lines) {
      for (const word of words(inlineText(parseInline(line)))) {
        if (terms.size >= 128) break;
        if (!terms.has(word)) terms.set(word, 1);
      }
    }
    if (terms.size >= 128) break;
  }
  textCache.set(note.id, { title: note.title, content: note.content, terms });
  return terms;
}

export function relatedReason(edge: RelatedNoteEdge) {
  const reasons: string[] = [];
  if (edge.tags.length)
    reasons.push(
      `Shared tags: ${edge.tags.map((tag) => `#${tag}`).join(", ")}`,
    );
  if (edge.terms.length)
    reasons.push(`Similar wording: ${edge.terms.slice(0, 3).join(", ")}`);
  return reasons.join(" · ");
}

export function buildRelatedNotes(
  notes: Note[],
  explicitEdges: NoteGraphEdge[],
): RelatedNoteEdge[] {
  const liveIds = new Set(notes.map((note) => note.id));
  for (const id of textCache.keys()) if (!liveIds.has(id)) textCache.delete(id);
  const explicit = new Set(
    explicitEdges.map((edge) => pairKey(edge.source, edge.target)),
  );
  const postings = new Map<string, Array<{ id: string; weight: number }>>();
  for (const note of notes) {
    const tags = new Set(
      note.tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean),
    );
    const features = [
      ...[...tags].map((tag) => [`tag:${tag}`, 1] as const),
      ...[...noteTerms(note)].map(
        ([term, weight]) => [`term:${term}`, weight] as const,
      ),
    ];
    for (const [key, weight] of features) {
      const entries = postings.get(key) ?? [];
      entries.push({ id: note.id, weight });
      postings.set(key, entries);
    }
  }
  const norms = new Map<string, { tag: number; term: number }>();
  const candidates = new Map<
    string,
    RelatedNoteEdge & { tagDot: number; termDot: number; titleTerms: number }
  >();
  for (const [feature, entries] of postings) {
    const tag = feature.startsWith("tag:");
    const maxFrequency = Math.min(
      tag ? 128 : 64,
      Math.max(2, notes.length * (tag ? 0.6 : 0.5)),
    );
    if (entries.length > maxFrequency) continue;
    const weight = 1 + Math.log((notes.length + 1) / (entries.length + 1));
    for (const entry of entries) {
      const norm = norms.get(entry.id) ?? { tag: 0, term: 0 };
      norm[tag ? "tag" : "term"] += (weight * entry.weight) ** 2;
      norms.set(entry.id, norm);
    }
    for (let a = 0; a < entries.length; a++) {
      for (let b = a + 1; b < entries.length; b++) {
        const key = pairKey(entries[a].id, entries[b].id);
        if (explicit.has(key)) continue;
        let edge = candidates.get(key);
        if (!edge) {
          const [source, target] = [entries[a].id, entries[b].id].sort();
          edge = {
            source,
            target,
            score: 0,
            tags: [],
            terms: [],
            tagDot: 0,
            termDot: 0,
            titleTerms: 0,
          };
          candidates.set(key, edge);
        }
        const dot = weight ** 2 * entries[a].weight * entries[b].weight;
        if (tag) {
          edge.tags.push(feature.slice(4));
          edge.tagDot += dot;
        } else {
          edge.terms.push(feature.slice(5));
          edge.termDot += dot;
          if (entries[a].weight === 2 && entries[b].weight === 2)
            edge.titleTerms++;
        }
      }
    }
  }
  const ranked: RelatedNoteEdge[] = [];
  for (const edge of candidates.values()) {
    const a = norms.get(edge.source)!;
    const b = norms.get(edge.target)!;
    const tagScore = edge.tagDot / (Math.sqrt(a.tag * b.tag) || 1);
    const textScore = edge.termDot / (Math.sqrt(a.term * b.term) || 1);
    const tags = tagScore >= 0.22 ? edge.tags.sort() : [];
    const terms =
      textScore >= 0.3 && (edge.terms.length >= 3 || edge.titleTerms >= 2)
        ? edge.terms.sort()
        : [];
    if (!tags.length && !terms.length) continue;
    ranked.push({
      source: edge.source,
      target: edge.target,
      tags,
      terms,
      score: Number(
        (
          (tags.length ? 1 + tagScore : 0) + (terms.length ? textScore : 0)
        ).toFixed(6),
      ),
    });
  }
  ranked.sort(
    (a, b) =>
      b.score - a.score ||
      a.source.localeCompare(b.source) ||
      a.target.localeCompare(b.target),
  );
  const degree = new Map<string, number>();
  return ranked.filter((edge) => {
    const a = degree.get(edge.source) ?? 0;
    const b = degree.get(edge.target) ?? 0;
    if (a >= 3 || b >= 3) return false;
    degree.set(edge.source, a + 1);
    degree.set(edge.target, b + 1);
    return true;
  });
}
