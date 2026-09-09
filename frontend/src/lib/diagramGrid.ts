import { diagramToLayoutPoint, layoutToDiagramPoint } from "./diagram";

export type GridViewport = { x: number; y: number; width: number; height: number };

export type GridLine = { x1: number; y1: number; x2: number; y2: number };

const defaultSpacing = 40;
const defaultMaxLines = 240;

const round = (value: number) => Math.round(value * 10) / 10;

export function isoGridLines(viewport: GridViewport, options?: { spacing?: number; maxLines?: number }): GridLine[] {
  const baseSpacing = Math.max(1, options?.spacing ?? defaultSpacing);
  const maxLines = Math.max(2, options?.maxLines ?? defaultMaxLines);

  const corners = [
    { x: viewport.x, y: viewport.y },
    { x: viewport.x + viewport.width, y: viewport.y },
    { x: viewport.x + viewport.width, y: viewport.y + viewport.height },
    { x: viewport.x, y: viewport.y + viewport.height },
  ].map((point) => layoutToDiagramPoint("iso", point.x, point.y));

  const dxMin = Math.min(...corners.map((point) => point.x));
  const dxMax = Math.max(...corners.map((point) => point.x));
  const dyMin = Math.min(...corners.map((point) => point.y));
  const dyMax = Math.max(...corners.map((point) => point.y));

  let spacing = baseSpacing;
  let countX = Math.floor((dxMax - dxMin) / spacing) + 2;
  let countY = Math.floor((dyMax - dyMin) / spacing) + 2;
  while (countX + countY > maxLines) {
    spacing *= 2;
    countX = Math.floor((dxMax - dxMin) / spacing) + 2;
    countY = Math.floor((dyMax - dyMin) / spacing) + 2;
  }

  const startX = Math.floor(dxMin / spacing) * spacing;
  const endX = Math.ceil(dxMax / spacing) * spacing;
  const startY = Math.floor(dyMin / spacing) * spacing;
  const endY = Math.ceil(dyMax / spacing) * spacing;

  const lines: GridLine[] = [];

  const stepsX = Math.round((endX - startX) / spacing);
  for (let i = 0; i <= stepsX; i += 1) {
    const c = startX + i * spacing;
    const a = diagramToLayoutPoint("iso", c, dyMin);
    const b = diagramToLayoutPoint("iso", c, dyMax);
    lines.push({ x1: round(a.x), y1: round(a.y), x2: round(b.x), y2: round(b.y) });
  }

  const stepsY = Math.round((endY - startY) / spacing);
  for (let i = 0; i <= stepsY; i += 1) {
    const c = startY + i * spacing;
    const a = diagramToLayoutPoint("iso", dxMin, c);
    const b = diagramToLayoutPoint("iso", dxMax, c);
    lines.push({ x1: round(a.x), y1: round(a.y), x2: round(b.x), y2: round(b.y) });
  }

  return lines;
}
