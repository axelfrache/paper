import { expect, it } from "vitest";
import { graphemeBoundary } from "./grapheme";

it.each(["a", "é", "e\u0301", "😀", "👨‍👩‍👧‍👦", "🇫🇷"])("moves over %s atomically, including from inside its UTF-16 sequence", (glyph) => {
  const text = `x${glyph}y`;
  for (let offset = 1; offset < 1 + glyph.length; offset++) {
    expect(graphemeBoundary(text, offset, 1)).toBe(1 + glyph.length);
    expect(graphemeBoundary(text, offset + 1, -1)).toBe(1);
  }
  expect(graphemeBoundary(text, 0, -1)).toBe(0);
  expect(graphemeBoundary(text, text.length, 1)).toBe(text.length);
});
