import { codeLines, fencedBlocks } from "./fences";
import type { Caret } from "./edit";

const titleAttribute = /(?:^|\s)title=("(?:\\.|[^"\\])*")(?=\s|$)/;

export function mermaidTitle(source: string): string {
  const match = titleAttribute.exec(source.split("\n")[0]);
  if (!match) return "";
  try {
    return (JSON.parse(match[1]) as string).replace(/\s+/g, " ").trim().slice(0, 160);
  } catch { return ""; }
}

export function withMermaidTitle(source: string, title: string): string {
  const lines = source.split("\n");
  const normalized = title.replace(/\s+/g, " ").trim().slice(0, 160);
  const attribute = normalized ? ` title=${JSON.stringify(normalized).replace(/`/g, "\\u0060")}` : "";
  if (titleAttribute.test(lines[0])) lines[0] = lines[0].replace(titleAttribute, () => attribute);
  else if (attribute) lines[0] = lines[0].trimEnd() + attribute;
  return lines.join("\n");
}

export function mermaidMarker(source: string) {
  return `![mermaid:${encodeURIComponent(source)}]`;
}

export function parseMermaidMarker(
  line: string,
): { source: string; text: string; title: string } | null {
  const match = /^!\[mermaid:([^\]]+)\]$/.exec(line.trim());
  if (!match) return null;
  try {
    const source = decodeURIComponent(match[1]);
    const lines = source.split("\n");
    const [block] = fencedBlocks(lines);
    return block?.closed &&
      block.language === "mermaid" &&
      block.start === 0 &&
      block.end === lines.length - 1
      ? { source, text: block.text, title: mermaidTitle(source) }
      : null;
  } catch {
    return null;
  }
}

export function projectMermaid(source: string) {
  const lines = source.split("\n");
  const blocks = new Map(
    fencedBlocks(lines)
      .filter((block) => block.closed && block.language === "mermaid")
      .map((block) => [block.start, block]),
  );
  const projected: string[] = [];
  const sourceLines: number[] = [];
  const ends: number[] = [];
  for (let index = 0; index < lines.length; index++) {
    sourceLines.push(index);
    const block = blocks.get(index);
    ends.push(block?.end ?? index);
    projected.push(
      block
        ? mermaidMarker(lines.slice(index, block.end + 1).join("\n"))
        : lines[index],
    );
    if (block) index = block.end;
  }
  return {
    value: projected.join("\n"),
    sourceLines,
    caret(caret: Caret): Caret {
      const index = sourceLines.findIndex(
        (start, index) => start <= caret.line && ends[index] >= caret.line,
      );
      return index < 0
        ? { line: projected.length, col: caret.col }
        : {
            line: index,
            col: ends[index] > sourceLines[index] ? 0 : caret.col,
          };
    },
  };
}

export function expandMermaid(value: string) {
  const lines = value.split("\n");
  const contexts = codeLines(lines);
  return lines
    .map((line, index) =>
      contexts[index] ? line : (parseMermaidMarker(line)?.source ?? line),
    )
    .join("\n");
}

export function replaceMermaidSource(original: string, text: string) {
  const lines = original.split("\n");
  if (text === lines.slice(1, -1).join("\n")) return original;
  const opening = /^ {0,3}(`{3,}|~{3,})/.exec(lines[0])!;
  const character = opening[1][0];
  const longest = Math.max(
    0,
    ...text.split("\n").map((line) => {
      const match = /^ {0,3}(`+|~+)\s*$/.exec(line);
      return match?.[1][0] === character ? match[1].length : 0;
    }),
  );
  const fence = character.repeat(Math.max(opening[1].length, longest + 1));
  lines[0] = lines[0].replace(opening[1], fence);
  lines[lines.length - 1] = lines[lines.length - 1].replace(
    /`{3,}|~{3,}/,
    fence,
  );
  return [lines[0], text, lines[lines.length - 1]].join("\n");
}
