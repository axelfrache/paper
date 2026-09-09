import { describe, expect, it } from "vitest";
import { isoGridLines } from "./diagramGrid";
import { layoutToDiagramPoint } from "./diagram";

const viewport = { x: -200, y: -150, width: 800, height: 500 };

describe("isoGridLines", () => {
  it("returns lines that lie on isometric axes at the given spacing", () => {
    const spacing = 40;
    const lines = isoGridLines(viewport, { spacing });

    expect(lines.length).toBeGreaterThan(0);

    for (const line of lines) {
      const a = layoutToDiagramPoint("iso", line.x1, line.y1);
      const b = layoutToDiagramPoint("iso", line.x2, line.y2);
      const constantX = Math.abs(a.x - b.x) < 0.5;
      const constantY = Math.abs(a.y - b.y) < 0.5;
      expect(constantX || constantY).toBe(true);
      const value = constantX ? a.x : a.y;
      expect(Math.abs(value / spacing - Math.round(value / spacing))).toBeLessThan(0.01);
    }
  });

  it("covers the whole visible viewport", () => {
    const spacing = 40;
    const lines = isoGridLines(viewport, { spacing });
    const corners = [
      layoutToDiagramPoint("iso", viewport.x, viewport.y),
      layoutToDiagramPoint("iso", viewport.x + viewport.width, viewport.y + viewport.height),
    ];
    const dxMin = Math.min(corners[0].x, corners[1].x);
    const dxMax = Math.max(corners[0].x, corners[1].x);

    const xs = lines
      .map((line) => layoutToDiagramPoint("iso", line.x1, line.y1))
      .filter((point, index) => {
        const other = layoutToDiagramPoint("iso", lines[index].x2, lines[index].y2);
        return Math.abs(point.x - other.x) < 0.5;
      })
      .map((point) => point.x);

    expect(Math.min(...xs)).toBeLessThanOrEqual(dxMin);
    expect(Math.max(...xs)).toBeGreaterThanOrEqual(dxMax);
  });

  it("coarsens the spacing so a zoomed-out viewport stays under the line cap", () => {
    const huge = { x: -20000, y: -20000, width: 80000, height: 80000 };
    const lines = isoGridLines(huge, { spacing: 40, maxLines: 100 });

    expect(lines.length).toBeGreaterThan(0);
    expect(lines.length).toBeLessThanOrEqual(100);
  });
});
