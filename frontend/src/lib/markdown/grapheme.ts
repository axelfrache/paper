const segmenter = new Intl.Segmenter(undefined, { granularity: "grapheme" });

/** Caret offsets remain UTF-16 offsets; moves and deletions follow visible characters. */
export function graphemeBoundary(text: string, offset: number, direction: -1 | 1) {
  const index = direction === 1 ? offset : offset - 1;
  if (index < 0) return 0;
  if (index >= text.length) return text.length;
  const part = segmenter.segment(text).containing(index);
  return part ? part.index + (direction === 1 ? part.segment.length : 0) : text.length;
}
