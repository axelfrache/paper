import { describe, expect, it } from "vitest";
import { createDefaultDiagram, serializeDiagramMarker } from "../diagram";
import {
  insertLineBeforeResource,
  isDiagramLine,
  isResourceLine,
  removeResourceAt,
  replaceResourceAt,
  standaloneImage,
} from "./resource";

const image =
  "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
const diagram = serializeDiagramMarker(createDefaultDiagram("flat"));

describe("resource lines", () => {
  it("recognizes standalone images and diagram markers", () => {
    expect(isResourceLine(image)).toBe(true);
    expect(isResourceLine(diagram)).toBe(true);
    expect(isDiagramLine(diagram)).toBe(true);
    expect(isDiagramLine(image)).toBe(false);
    expect(standaloneImage(image)?.alt).toBe("Architecture");
  });

  it("does not treat an image surrounded by text as a resource line", () => {
    expect(isResourceLine(`See ${image}`)).toBe(false);
    expect(isResourceLine(`${image} here`)).toBe(false);
  });

  it("rejects unsafe image sources", () => {
    expect(isResourceLine("![x](javascript:alert(1))")).toBe(false);
  });

  it("removes a resource and keeps at least one line", () => {
    expect(removeResourceAt(`${image}\nAfter`, 0)).toEqual({
      value: "After",
      caret: { line: 0, col: 0 },
    });
    expect(removeResourceAt(image, 0)).toEqual({
      value: "",
      caret: { line: 0, col: 0 },
    });
  });

  it("removes a resource while keeping an explicit caret", () => {
    expect(
      removeResourceAt(`Before\n${image}`, 1, { line: 0, col: 6 }),
    ).toEqual({
      value: "Before",
      caret: { line: 0, col: 6 },
    });
  });

  it("replaces a resource with typed text", () => {
    expect(replaceResourceAt(`${image}\nAfter`, 0, "x")).toEqual({
      value: "x\nAfter",
      caret: { line: 0, col: 1 },
    });
    expect(replaceResourceAt(`${image}\nAfter`, 0, "")).toEqual({
      value: "\nAfter",
      caret: { line: 0, col: 0 },
    });
  });

  it("pushes a resource down and keeps the caret in front of it", () => {
    expect(insertLineBeforeResource(`${image}\nAfter`, 0)).toEqual({
      value: `\n${image}\nAfter`,
      caret: { line: 1, col: 0 },
    });
  });

  it("returns null when the target line is not a resource", () => {
    expect(removeResourceAt("plain text", 0)).toBeNull();
    expect(replaceResourceAt("plain text", 0, "x")).toBeNull();
    expect(insertLineBeforeResource("plain text", 0)).toBeNull();
  });
});
