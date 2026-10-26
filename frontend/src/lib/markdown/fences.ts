/** Shared fence context for rendering and editing; content inside fences is literal. */
export function codeLines(lines: string[]): Array<"fence" | "code" | null> {
  let fence: { character: string; length: number } | null = null;
  return lines.map((line) => {
    const match = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    if (fence) {
      if (match && match[1][0] === fence.character && match[1].length >= fence.length && !match[2].trim()) {
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
