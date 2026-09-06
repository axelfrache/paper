import { describe, expect, it } from "vitest";
import { createDefaultDiagram, serializeDiagramMarker } from "./diagram";
import type { Diagram, DiagramMode } from "./diagram";
import { buildStandaloneSvg, clampScale, exportFileName, svgPixelSize } from "./diagramExport";

const fakeIcon = async () => "data:image/png;base64,AAAA";

function withIcons(mode: DiagramMode): Diagram {
  const base = createDefaultDiagram(mode);
  return {
    ...base,
    nodes: [
      { id: "a", kind: "kubernetes", label: "Cluster", color: "blue", x: 40, y: 40 },
      { id: "b", kind: "postgresql", label: "DB", color: "green", x: 320, y: 40 },
    ],
    edges: [{ id: "e1", from: "a", to: "b", color: "slate", route: "straight", end: "arrow", label: "reads" }],
  };
}

describe("standalone diagram SVG", () => {
  it("is self-contained: xmlns, no CSS variables, no external hrefs", async () => {
    const svg = await buildStandaloneSvg(withIcons("iso"), undefined, fakeIcon);

    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).not.toContain("var(--");
    expect(svg).not.toContain('href="/');
    expect(svg).toContain("data:image/png;base64,AAAA");
  });

  it("paints a white background by default and none when transparent", async () => {
    const white = await buildStandaloneSvg(withIcons("flat"), { background: "white", padding: 24, scale: 2 }, fakeIcon);
    const clear = await buildStandaloneSvg(withIcons("flat"), { background: "transparent", padding: 24, scale: 2 }, fakeIcon);

    expect(white).toContain('fill="#ffffff"');
    // A transparent export draws no background rect at the canvas bounds.
    expect(clear).not.toMatch(/<rect[^>]*fill="#ffffff"[^>]*\/>\s*<path/);
  });

  it("resolves label colours to concrete dark values for a light surface", async () => {
    const svg = await buildStandaloneSvg(withIcons("iso"), undefined, fakeIcon);

    // Icon nodes render as bare labels (muted-strong); either way, concrete not var().
    expect(svg).toMatch(/#16181b|#4c5259/);
    expect(svg).not.toContain("var(--");
    expect(svg).toContain(">reads</tspan>");
  });

  it("carries real pixel dimensions", async () => {
    const svg = await buildStandaloneSvg(withIcons("iso"), undefined, fakeIcon);
    const size = svgPixelSize(svg);

    expect(size.width).toBeGreaterThan(0);
    expect(size.height).toBeGreaterThan(0);
  });

  it("survives an icon that fails to resolve", async () => {
    const svg = await buildStandaloneSvg(withIcons("iso"), undefined, async () => {
      throw new Error("offline");
    });

    // The diagram still exports; the missing icon is simply omitted.
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).not.toContain("<image");
  });

  it("uses the flat mask path so icons take the node colour", async () => {
    const svg = await buildStandaloneSvg(withIcons("flat"), undefined, fakeIcon);

    expect(svg).toContain("mask=");
    expect(svg).toContain('mask-type:alpha');
  });

  it("clamps the PNG scale so a big diagram stays under the canvas limit", () => {
    expect(clampScale(2, { width: 500, height: 300 })).toBe(2);
    expect(clampScale(2, { width: 3000, height: 1000 })).toBeCloseTo(4096 / 3000, 5);
  });

  it("builds a descriptive, safe file name", () => {
    expect(exportFileName("Questify architecture!", "iso", "png")).toBe("questify-architecture-iso.png");
    expect(exportFileName("   ", "flat", "svg")).toBe("diagram-flat.svg");
  });

  it("round-trips a serialized diagram", async () => {
    const marker = serializeDiagramMarker(withIcons("iso"));
    const svg = await buildStandaloneSvg(withIcons("iso"), undefined, fakeIcon);
    expect(marker).toContain("diagram:");
    expect(svg).toContain("<svg");
  });
});
