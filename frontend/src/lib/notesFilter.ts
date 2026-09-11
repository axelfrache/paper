import type { Note } from "../types/note";

export type NoteFilter = { query: string; tags: string[] };

const completedTagToken = /#([\p{L}0-9_-]+)(\s)/u;

export function extractTagTokens(raw: string): { query: string; tags: string[] } {
  const tags: string[] = [];
  let rest = raw;
  let match = rest.match(completedTagToken);
  while (match) {
    tags.push(match[1].toLowerCase());
    rest = rest.slice(0, match.index) + rest.slice((match.index ?? 0) + match[0].length);
    match = rest.match(completedTagToken);
  }
  return { query: rest, tags };
}

export function normalizeTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/^#+/, "");
}

const trailingTagToken = /(?:^|\s)#([\p{L}0-9_-]+)\s*$/u;

export function takeTrailingTag(text: string): { tag: string | null; rest: string } {
  const match = text.match(trailingTagToken);
  if (!match) {
    return { tag: null, rest: text };
  }
  return { tag: match[1].toLowerCase(), rest: text.slice(0, match.index ?? 0).trimEnd() };
}

export function matchesFilter(note: Note, filter: NoteFilter): boolean {
  const query = filter.query.trim().toLowerCase();
  if (query) {
    const tagged = note.tags.length ? ` #${note.tags.join(" #")}` : "";
    const haystack = `${note.title}\n${note.content}\n${note.tags.join(" ")}${tagged}`.toLowerCase();
    if (!haystack.includes(query)) {
      return false;
    }
  }
  for (const tag of filter.tags) {
    const normalized = normalizeTag(tag);
    if (normalized && !note.tags.some((existing) => existing.toLowerCase() === normalized)) {
      return false;
    }
  }
  return true;
}

export type HighlightSegment = { text: string; match: boolean };

export function highlightSegments(text: string, query: string): HighlightSegment[] {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return [{ text, match: false }];
  }
  const haystack = text.toLowerCase();
  const segments: HighlightSegment[] = [];
  let cursor = 0;
  while (cursor < text.length) {
    const index = haystack.indexOf(needle, cursor);
    if (index < 0) {
      segments.push({ text: text.slice(cursor), match: false });
      break;
    }
    if (index > cursor) {
      segments.push({ text: text.slice(cursor, index), match: false });
    }
    segments.push({ text: text.slice(index, index + needle.length), match: true });
    cursor = index + needle.length;
  }
  return segments;
}
