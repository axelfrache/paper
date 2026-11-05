/** Shared fence context for rendering and editing; content inside fences is literal. */
export function codeLines(lines: string[]): Array<"fence" | "code" | null> {
  let fence: { character: string; length: number } | null = null;
  return lines.map((line) => {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (
        match &&
        match[1][0] === fence.character &&
        match[1].length >= fence.length &&
        !match[2].trim()
      ) {
        fence = null;
        return "fence";
      }
      return "code";
    }
    if (match && !(match[1][0] === "`" && match[2].includes("`"))) {
      fence = { character: match[1][0], length: match[1].length };
      return "fence";
    }
    return null;
  });
}

export type FencedBlock = {
  start: number;
  end: number;
  language: string;
  text: string;
  closed: boolean;
};

export function fencedBlocks(
  lines: string[],
  contexts = codeLines(lines),
): FencedBlock[] {
  const blocks: FencedBlock[] = [];
  let start: number | null = null;
  const append = (end: number, closed: boolean) => {
    const opening = start!;
    const info = lines[opening].replace(/^ {0,3}(?:`{3,}|~{3,})/, "").trim();
    blocks.push({
      start: opening,
      end,
      language: info.split(/\s+/)[0].toLowerCase(),
      text: lines.slice(opening + 1, closed ? end : end + 1).join("\n"),
      closed,
    });
  };
  contexts.forEach((context, index) => {
    if (context !== "fence") return;
    if (start === null) start = index;
    else {
      append(index, true);
      start = null;
    }
  });
  if (start !== null) append(lines.length - 1, false);
  return blocks;
}
