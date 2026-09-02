import { describe, expect, it } from "vitest";
import { createDefaultDiagram, serializeDiagramMarker } from "../diagram";
import {
  alignOfRange,
  alignRange,
  alignable,
  defaultTextAlign,
  deleteBackwardAligned,
  deleteForwardAligned,
  insertLineBreakAligned,
  readAlign,
  writeAlign,
} from "./align";

const range = (startLine: number, endLine: number, col = 0) => ({
  start: { line: startLine, col },
  end: { line: endLine, col },
});

describe("text alignment", () => {
  it("treats a line without a marker as the default", () => {
    expect(defaultTextAlign).toBe("justify");
    expect(readAlign("Hello")).toEqual({ text: "Hello", align: "justify" });
  });

  it("reads a marker off the end of the line", () => {
    expect(readAlign("Hello{align=center}")).toEqual({ text: "Hello", align: "center" });
  });

  it("writes no marker for the default, so the source stays clean", () => {
    expect(writeAlign("Hello{align=center}", "justify")).toBe("Hello");
    expect(writeAlign("Hello", "justify")).toBe("Hello");
  });

  it("replaces an existing marker rather than stacking one", () => {
    expect(writeAlign("Hello{align=center}", "right")).toBe("Hello{align=right}");
  });

  it("refuses to align what is not a line of text", () => {
    const image = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
    const diagram = serializeDiagramMarker(createDefaultDiagram("flat"));
    for (const raw of ["", "   ", "---", image, diagram]) {
      expect(alignable(raw)).toBe(false);
      expect(writeAlign(raw, "center")).toBe(raw);
    }
  });

  it("aligns every line a selection touches", () => {
    const { value } = alignRange("one\ntwo\nthree", range(0, 1), "center");

    expect(value).toBe("one{align=center}\ntwo{align=center}\nthree");
  });

  it("leaves the caret column untouched, since the marker trails the text", () => {
    const { caret } = alignRange("hello world", { start: { line: 0, col: 5 }, end: { line: 0, col: 5 } }, "right");

    expect(caret).toEqual({ line: 0, col: 5 });
  });

  it("clamps a caret that sat inside a marker being removed", () => {
    const source = "hi{align=center}";
    const { value, caret } = alignRange(source, { start: { line: 0, col: 0 }, end: { line: 0, col: 16 } }, "justify");

    expect(value).toBe("hi");
    expect(caret).toEqual({ line: 0, col: 2 });
  });

  it("reports the shared alignment of a selection, or none when they differ", () => {
    expect(alignOfRange("one{align=center}\ntwo{align=right}", range(0, 1))).toBeNull();
    expect(alignOfRange("one{align=center}\ntwo{align=center}", range(0, 1))).toBe("center");
    expect(alignOfRange("one\ntwo", range(0, 1))).toBe("justify");
  });

  it("ignores unalignable lines when reading a selection's alignment", () => {
    expect(alignOfRange("one{align=right}\n---\ntwo{align=right}", range(0, 2))).toBe("right");
  });
});

describe("editing a line that carries an alignment", () => {
  // A caret column addresses the text, the marker trails it in the stored line.
  const caret = (line: number, col: number) => ({ line, col });

  it("keeps the alignment on the line when Enter splits it", () => {
    const { value } = insertLineBreakAligned("hello world{align=right}", caret(0, 5));

    expect(value).toBe("hello{align=right}\n world{align=right}");
  });

  it("leaves the freed line unmarked when Enter lands at the end", () => {
    // A marker alone would stop the new line from reading as blank.
    const { value } = insertLineBreakAligned("hello{align=right}", caret(0, 5));

    expect(value).toBe("hello{align=right}\n");
  });

  it("joins onto the previous line without dragging a marker into the text", () => {
    const { value } = deleteBackwardAligned("one{align=right}\ntwo{align=center}", caret(1, 0));

    expect(value).toBe("onetwo{align=right}");
  });

  it("pulls the next line up on Delete, keeping the first line's alignment", () => {
    const { value } = deleteForwardAligned("one{align=right}\ntwo{align=center}", caret(0, 3));

    expect(value).toBe("onetwo{align=right}");
  });

  it("does not eat into the marker at the end of the note", () => {
    const source = "one{align=right}";
    expect(deleteForwardAligned(source, caret(0, 3))).toEqual({ value: source, caret: caret(0, 3) });
  });

  it("behaves exactly like the plain operations on an unaligned line", () => {
    expect(insertLineBreakAligned("hello world", caret(0, 5)).value).toBe("hello\n world");
    expect(deleteBackwardAligned("one\ntwo", caret(1, 0)).value).toBe("onetwo");
    expect(deleteForwardAligned("one\ntwo", caret(0, 3)).value).toBe("onetwo");
  });
});
