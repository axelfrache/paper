import { diagramIconDefinitions, diagramIconHref, isDiagramIconKind } from "./diagramIcons";
import type { DiagramIconKind } from "./diagramIcons";

export type DiagramMode = "flat" | "iso";

type BaseDiagramKind = "box" | "server" | "service" | "database" | "user" | "queue" | "client" | "text";

export type DiagramKind = BaseDiagramKind | DiagramIconKind;

export type DiagramColor = "slate" | "blue" | "green" | "amber" | "violet";
export type DiagramEdgeRoute = "orthogonal" | "straight" | "curved";
export type DiagramEdgeCorner = "rounded" | "square";
export type DiagramEdgeEnd = "none" | "arrow";
export type DiagramEdgeWidth = "thin" | "medium" | "thick";

export type DiagramNode = {
  id: string;
  kind: DiagramKind;
  x: number;
  y: number;
  label: string;
  color: DiagramColor;
  w?: number;
  h?: number;
  shape?: "rect" | "ellipse";
  boxed?: boolean;
  labelBoxed?: boolean;
};

export type DiagramEdge = {
  id: string;
  from: string;
  to: string;
  color: DiagramColor;
  route?: DiagramEdgeRoute;
  corner?: DiagramEdgeCorner;
  dashed?: boolean;
  start?: DiagramEdgeEnd;
  end?: DiagramEdgeEnd;
  width?: DiagramEdgeWidth;
  label?: string;
  labelPosition?: number;
};

export type DiagramPreview = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Diagram = {
  version: 1;
  mode: DiagramMode;
  nodes: DiagramNode[];
  edges: DiagramEdge[];
  preview?: DiagramPreview;
};

export type DiagramLayoutNode = {
  id: string;
  source: DiagramNode;
  faces: Array<{ d: string; fill: string; stroke: string }>;
  bare: boolean;
  icon: DiagramIconKind | null;
  iconX: number;
  iconY: number;
  iconSize: number;
  cap: string;
  label: string;
  color: string;
  cx: number;
  cy: number;
  capY: number;
  labelY: number;
  hx: number;
  hy: number;
  hw: number;
  hh: number;
};

export type DiagramLayoutEdge = {
  id: string;
  d: string;
  color: string;
  markerStart: string;
  markerEnd: string;
  dashed: boolean;
  width: number;
  label: string;
  // Anchor on the path itself, so the label reads as part of the edge rather than
  // floating beside it.
  labelX: number;
  labelY: number;
};

export type DiagramLayout = {
  nodes: DiagramLayoutNode[];
  edges: DiagramLayoutEdge[];
  viewBox: string;
};

export const diagramPalette: Record<DiagramColor, { fill: string; stroke: string }> = {
  slate: { fill: "rgba(120,130,145,.16)", stroke: "#7d848c" },
  blue: { fill: "rgba(47,111,208,.15)", stroke: "#2f6fd0" },
  green: { fill: "rgba(63,125,88,.16)", stroke: "#3f7d58" },
  amber: { fill: "rgba(198,154,46,.18)", stroke: "#c69a2e" },
  violet: { fill: "rgba(138,92,208,.16)", stroke: "#8a5cd0" },
};

type DiagramKindDefinition = { cap: string; w: number; h: number; color: DiagramColor; label: string };

const systemDiagramKinds = Object.fromEntries(
  diagramIconDefinitions.map((icon) => [
    icon.id,
    {
      cap: "",
      w: icon.w,
      h: icon.h,
      color: colorForIconGroup(icon.group),
      label: icon.label,
    },
  ]),
) as Record<DiagramIconKind, DiagramKindDefinition>;

const baseDiagramKinds: Record<BaseDiagramKind, DiagramKindDefinition> = {
  box: { cap: "", w: 150, h: 66, color: "slate", label: "Box" },
  server: { cap: "SERVER", w: 158, h: 72, color: "blue", label: "Server" },
  service: { cap: "SERVICE", w: 158, h: 70, color: "blue", label: "Service" },
  database: { cap: "DATABASE", w: 150, h: 70, color: "green", label: "Database" },
  user: { cap: "USER", w: 132, h: 62, color: "amber", label: "User" },
  queue: { cap: "QUEUE", w: 150, h: 62, color: "violet", label: "Queue" },
  client: { cap: "CLIENT", w: 148, h: 66, color: "slate", label: "Client" },
  text: { cap: "", w: 130, h: 30, color: "slate", label: "Label" },
};

export const diagramKinds = { ...baseDiagramKinds, ...systemDiagramKinds } as Record<DiagramKind, DiagramKindDefinition>;

const isoCos = 0.866;
const isoSin = 0.5;
const isoDepth = 16;
const diagramMarkerPattern = /^!\[diagram:([A-Za-z0-9_-]+)\]$/;

export function createDefaultDiagram(mode: DiagramMode = "flat"): Diagram {
  if (mode === "iso") {
    return {
      version: 1,
      mode: "iso",
      nodes: [
        { id: "n1", kind: "client", x: 0, y: 0, label: "Client", color: "slate" },
        { id: "n2", kind: "server", x: 200, y: 0, label: "API", color: "blue" },
        { id: "n3", kind: "database", x: 200, y: 170, label: "Store", color: "green" },
      ],
      edges: [
        { id: "e1", from: "n1", to: "n2", color: "slate" },
        { id: "e2", from: "n2", to: "n3", color: "slate" },
      ],
    };
  }
  return {
    version: 1,
    mode: "flat",
    nodes: [
      { id: "n1", kind: "client", x: 40, y: 40, label: "Client", color: "slate" },
      { id: "n2", kind: "server", x: 280, y: 40, label: "API", color: "blue" },
      { id: "n3", kind: "database", x: 530, y: 40, label: "Store", color: "green" },
    ],
    edges: [
      { id: "e1", from: "n1", to: "n2", color: "slate" },
      { id: "e2", from: "n2", to: "n3", color: "slate" },
    ],
  };
}

export function createDiagramNode(kind: DiagramKind, point: { x: number; y: number }, color?: DiagramColor): DiagramNode {
  const def = diagramKinds[kind];
  return {
    id: uniqueId("n"),
    kind,
    x: Math.round(point.x - def.w / 2),
    y: Math.round(point.y - def.h / 2),
    label: def.label,
    color: color ?? def.color,
  };
}

export function createDiagramEdge(from: string, to: string, color: DiagramColor): DiagramEdge {
  return { id: uniqueId("e"), from, to, color };
}

export function duplicateDiagramNode(node: DiagramNode, offset = 24): DiagramNode {
  return { ...node, id: uniqueId("n"), x: node.x + offset, y: node.y + offset };
}

export function serializeDiagramMarker(diagram: Diagram) {
  return `![diagram:${encodeDiagram(diagram)}]`;
}

export function parseDiagramMarker(line: string): Diagram | null {
  const match = diagramMarkerPattern.exec(line.trim());
  if (!match) {
    return null;
  }
  return decodeDiagram(match[1]);
}

export function isDiagramMarker(line: string) {
  return diagramMarkerPattern.test(line.trim());
}

export function stripDiagramMarkers(content: string) {
  return content
    .split("\n")
    .map((line) => (isDiagramMarker(line) ? "(diagram)" : line))
    .join("\n");
}

export function replaceDiagramMarkerAtLine(content: string, line: number, diagram: Diagram) {
  const lines = content.split("\n");
  if (line < 0 || line >= lines.length || !isDiagramMarker(lines[line] ?? "")) {
    return content;
  }
  lines[line] = serializeDiagramMarker(diagram);
  return lines.join("\n");
}

export function diagramSummary(diagram: Diagram) {
  const mode = diagram.mode === "iso" ? "isometric" : "flat";
  return `${diagram.nodes.length} node${diagram.nodes.length === 1 ? "" : "s"} · ${mode}`;
}

export function previewForDiagram(diagram: Diagram, maxHeight = 340): DiagramPreview {
  const layout = layoutDiagram(diagram);
  const bounds = contentBounds(layout);
  const width = Math.max(160, bounds.width);
  const height = Math.max(90, bounds.height);
  return {
    x: bounds.x,
    y: bounds.y,
    width,
    height: Math.max(120, Math.min(640, diagram.preview?.height ?? Math.min(maxHeight, height))),
  };
}

export function updateDiagramPreview(diagram: Diagram, preview: DiagramPreview): Diagram {
  return {
    ...diagram,
    preview: {
      x: Math.round(preview.x * 10) / 10,
      y: Math.round(preview.y * 10) / 10,
      width: Math.round(Math.max(160, preview.width) * 10) / 10,
      height: Math.round(Math.max(140, Math.min(640, preview.height)) * 10) / 10,
    },
  };
}

export function describeDiagram(diagram: Diagram) {
  const lines: string[] = ["```mermaid", "flowchart TD"];

  for (const node of diagram.nodes) {
    const safeLabel = node.label.replace(/"/g, "'");
    if (node.kind === "database") {
      lines.push(`  ${node.id}[("${safeLabel}")]`);
    } else if (node.kind === "user" || node.shape === "ellipse") {
      lines.push(`  ${node.id}(("${safeLabel}"))`);
    } else {
      lines.push(`  ${node.id}["${safeLabel}"]`);
    }
  }

  for (const edge of diagram.edges) {
    let arrow = "-->";
    if (edge.dashed) arrow = "-.->";
    else if (edge.end === "none" && edge.start !== "arrow") arrow = "---";
    else if (edge.start === "arrow" && edge.end === "arrow") arrow = "<-->";
    else if (edge.start === "arrow" && (edge.end === "none" || !edge.end)) arrow = "<--";

    lines.push(`  ${edge.from} ${arrow} ${edge.to}`);
  }

  lines.push("```");
  return lines.join("\n");
}

export function layoutDiagram(diagram: Diagram): DiagramLayout {
  const iso = diagram.mode === "iso";
  const nodes = diagram.nodes.map((node) => layoutNode(node, iso));
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const sourceById = new Map(diagram.nodes.map((node) => [node.id, node]));

  const edges = diagram.edges.flatMap((edge): DiagramLayoutEdge[] => {
    const from = nodeById.get(edge.from);
    const to = nodeById.get(edge.to);
    const fromSource = sourceById.get(edge.from);
    const toSource = sourceById.get(edge.to);
    if (!from || !to || !fromSource || !toSource) {
      return [];
    }

    const color = diagramPalette[edge.color] ?? diagramPalette.slate;
    const route = edge.route ?? (iso ? "straight" : "orthogonal");
    const strokeWidth = edgeStrokeWidth(edge.width);
    const trimStart = edge.start === "arrow" ? arrowMarkerLength(strokeWidth) : 0;
    const trimEnd = edge.end === "none" ? 0 : arrowMarkerLength(strokeWidth);
    const path =
      route === "curved"
        ? curvedEdgePath(from, to, fromSource, toSource, trimStart, trimEnd, edge.labelPosition ?? 0.5)
        : route === "straight"
        ? straightEdgePath(from, to, fromSource, toSource, trimStart, trimEnd, edge.labelPosition ?? 0.5)
        : orthogonalEdgePath(from, to, fromSource, toSource, edge.corner ?? "square", trimStart, trimEnd, edge.labelPosition ?? 0.5);
    const marker = `url(#diagram-arrow-${edge.color})`;
    return [
      {
        id: edge.id,
        d: path.d,
        color: color.stroke,
        markerStart: edge.start === "arrow" ? marker : "",
        markerEnd: edge.end === "none" ? "" : marker,
        dashed: edge.dashed === true,
        width: strokeWidth,
        label: (edge.label ?? "").trim(),
        labelX: Math.round(path.mid.x * 10) / 10,
        labelY: Math.round(path.mid.y * 10) / 10,
      },
    ];
  });

  const pad = 44;
  const xs = nodes.flatMap((node) => [node.hx, node.hx + node.hw]).concat([0]);
  const ys = nodes.flatMap((node) => [node.hy, node.hy + node.hh]).concat([0]);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const width = Math.max(Math.max(...xs) - minX + pad, 320);
  const height = Math.max(Math.max(...ys) - minY + pad, 200);

  return { nodes, edges, viewBox: `${minX} ${minY} ${width} ${height}` };
}

export function diagramToSvgMarkup(diagram: Diagram, maxHeight = 340) {
  const layout = layoutDiagram(diagram);
  const bounds = contentBounds(layout);
  const viewBoxWidth = Math.max(160, bounds.width);
  const viewBoxHeight = Math.max(90, bounds.height);
  const displayHeight = Math.max(120, Math.min(640, diagram.preview?.height ?? Math.min(maxHeight, viewBoxHeight)));
  const body = [
    ...layout.edges.map((edge) => {
      const lineCap = edge.markerStart || edge.markerEnd ? "butt" : "round";
      return `<path d="${edge.d}" fill="none" stroke="${edge.color}" stroke-width="${edge.width}" stroke-linecap="${lineCap}" stroke-linejoin="round"${edge.markerStart ? ` marker-start="${edge.markerStart}"` : ""}${edge.markerEnd ? ` marker-end="${edge.markerEnd}"` : ""}${edge.dashed ? ' stroke-dasharray="7 6"' : ""}/>`;
    }),
    ...layout.edges.map((edge) => edgeLabelSvg(edge)),
    ...layout.nodes.map((node) => {
      const faces = node.faces
        .map((face) => `<path d="${face.d}" fill="${face.fill}" stroke="${face.stroke}" stroke-width="1.4"/>`)
        .join("");
      const cap = node.cap
        ? `<text x="${node.cx}" y="${node.capY}" text-anchor="middle" font-size="8.5" letter-spacing="1" font-weight="700" fill="${node.color}">${escapeHtml(node.cap)}</text>`
        : "";
      const icon = nodeIconSvg(node, diagram.mode);
      const labelSize = node.bare ? "11.5" : "13";
      const labelWeight = node.bare ? "500" : "530";
      const labelFill = node.bare ? "var(--muted-strong)" : "var(--text)";
      const labelBody = labelTspans(node.label, node.cx, node.labelY, Number(labelSize) * 1.25);
      return `${faces}${cap}${icon}<text text-anchor="middle" font-size="${labelSize}" font-weight="${labelWeight}" fill="${labelFill}">${labelBody}</text>`;
    }),
  ].join("");

  return `<svg class="diagram-preview-svg" viewBox="${bounds.x} ${bounds.y} ${viewBoxWidth} ${viewBoxHeight}" preserveAspectRatio="xMidYMid meet" width="100%" style="display:block;height:${displayHeight}px;font-family:inherit;overflow:hidden;"><defs>${arrowDefs()}</defs>${body}</svg>`;
}

/**
 * Width of the halo painted under an edge label. It follows the stroke so a thick edge
 * is still cut cleanly; the colours live in CSS, since the backdrop differs between the
 * editor canvas and a rendered diagram card.
 */
/**
 * Splits a label into the lines an SVG <text> must draw as separate <tspan>s, since SVG
 * ignores newlines. Each line repeats `x` so it stays centred under `text-anchor`.
 * `centred` balances the block around `y` instead of growing downward from it.
 */
export function labelLines(text: string, x: number, y: number, lineHeight: number, centred = false) {
  const lines = text.split("\n");
  const offset = centred ? -((lines.length - 1) * lineHeight) / 2 : 0;
  return lines.map((line, index) => ({
    text: line,
    x,
    y: Math.round((y + offset + index * lineHeight) * 10) / 10,
  }));
}

function labelTspans(text: string, x: number, y: number, lineHeight: number, centred = false) {
  return labelLines(text, x, y, lineHeight, centred)
    .map((line) => `<tspan x="${line.x}" y="${line.y}">${escapeHtml(line.text)}</tspan>`)
    .join("");
}

/**
 * The plate to paint behind an edge label.
 *
 * The halo alone is stroked around each glyph, so it follows the letter outlines: on a
 * thick edge it leaves ragged stubs poking into the text, and on several lines it misses
 * the gap between them entirely. A plain rectangle cuts the line once, cleanly.
 * Width is estimated from the character count, as node labels already do.
 */
export function edgeLabelPlate(label: string, x: number, y: number, fontSize = 11, lineHeight = 13) {
  const lines = label.split("\n");
  if (!label.trim()) {
    return null;
  }
  const width = Math.max(...lines.map((line) => line.length)) * fontSize * 0.52 + 10;
  const height = (lines.length - 1) * lineHeight + fontSize + 6;
  return {
    x: Math.round((x - width / 2) * 10) / 10,
    y: Math.round((y - height / 2) * 10) / 10,
    width: Math.round(width * 10) / 10,
    height: Math.round(height * 10) / 10,
  };
}

export function edgeLabelHalo(strokeWidth: number) {
  return Math.round((strokeWidth + 4.5) * 10) / 10;
}

/**
 * Edge labels stay upright in both modes — an isometric diagram skews its shapes, not
 * its text. The halo is painted under the glyphs in the card colour so the label reads
 * as a break in the line rather than as text lying on top of it, and it scales with the
 * stroke so a thick edge is still cut cleanly.
 */
function edgeLabelSvg(edge: DiagramLayoutEdge) {
  if (!edge.label) {
    return "";
  }
  const body = labelTspans(edge.label, edge.labelX, edge.labelY, 13, true);
  const plate = edgeLabelPlate(edge.label, edge.labelX, edge.labelY);
  const backing = plate
    ? `<rect class="diagram-edge-label-plate" x="${plate.x}" y="${plate.y}" width="${plate.width}" height="${plate.height}"/>`
    : "";
  return `${backing}<text class="diagram-edge-label" text-anchor="middle" dominant-baseline="central" stroke-width="${edgeLabelHalo(edge.width)}">${body}</text>`;
}

function contentBounds(layout: DiagramLayout) {
  if (!layout.nodes.length) {
    const [x, y, width, height] = layout.viewBox.split(/\s+/).map(Number);
    return { x, y, width, height };
  }

  const pad = 20;
  const minX = Math.min(...layout.nodes.map((node) => node.hx)) - pad;
  const minY = Math.min(...layout.nodes.map((node) => node.hy)) - pad;
  const maxX = Math.max(...layout.nodes.map((node) => node.hx + node.hw)) + pad;
  const maxY = Math.max(...layout.nodes.map((node) => node.hy + node.hh)) + pad;
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function nodeIconSvg(node: DiagramLayoutNode, mode: DiagramMode) {
  if (!node.icon) {
    return "";
  }
  const href = escapeAttribute(diagramIconHref(node.icon, mode));
  if (mode === "flat") {
    const maskId = escapeAttribute(`diagram-icon-mask-${safeSvgId(node.id)}`);
    return `<defs><mask id="${maskId}" maskUnits="userSpaceOnUse" x="${node.iconX}" y="${node.iconY}" width="${node.iconSize}" height="${node.iconSize}" style="mask-type:alpha;"><image href="${href}" x="${node.iconX}" y="${node.iconY}" width="${node.iconSize}" height="${node.iconSize}" preserveAspectRatio="xMidYMid meet"/></mask></defs><rect class="diagram-node-icon diagram-node-icon-mask" x="${node.iconX}" y="${node.iconY}" width="${node.iconSize}" height="${node.iconSize}" fill="${node.color}" mask="url(#${maskId})"/>`;
  }
  return `<image class="diagram-node-icon" href="${href}" x="${node.iconX}" y="${node.iconY}" width="${node.iconSize}" height="${node.iconSize}" preserveAspectRatio="xMidYMid meet"/>`;
}

/**
 * Diagram coordinates to the coordinates the SVG is drawn in, and back. The isometric
 * projection is linear, so both also convert deltas, which is what lets a drag be snapped
 * in the space the user sees and then applied to the model.
 */
export function diagramToLayoutPoint(mode: DiagramMode, x: number, y: number) {
  if (mode !== "iso") {
    return { x, y };
  }
  const [sx, sy] = projectIso(x, y);
  return { x: sx, y: sy };
}

export function layoutToDiagramPoint(mode: DiagramMode, x: number, y: number) {
  if (mode !== "iso") {
    return { x, y };
  }
  const [dx, dy] = unprojectIso(x, y);
  return { x: dx, y: dy };
}

export function screenToDiagramPoint(
  event: { clientX: number; clientY: number },
  svg: SVGSVGElement,
  diagram: Diagram,
) {
  const rect = svg.getBoundingClientRect();
  const matrix = typeof svg.getScreenCTM === "function" && typeof svg.createSVGPoint === "function" ? svg.getScreenCTM() : null;
  let sx: number;
  let sy: number;
  if (matrix) {
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(matrix.inverse());
    sx = transformed.x;
    sy = transformed.y;
  } else {
    const viewBox = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) ?? [0, 0, rect.width, rect.height];
    sx = viewBox[0] + ((event.clientX - rect.left) / Math.max(1, rect.width)) * viewBox[2];
    sy = viewBox[1] + ((event.clientY - rect.top) / Math.max(1, rect.height)) * viewBox[3];
  }
  if (diagram.mode === "iso") {
    const [x, y] = unprojectIso(sx, sy);
    return { x, y };
  }
  return { x: sx, y: sy };
}

function layoutNode(node: DiagramNode, iso: boolean): DiagramLayoutNode {
  const def = diagramKinds[node.kind] ?? diagramKinds.box;
  const color = diagramPalette[node.color] ?? diagramPalette.slate;
  const { w, h } = sizeForNode(node);
  const icon = diagramIconForKind(node.kind);

  if (icon && !node.boxed) {
    return layoutIconNode(node, icon, color.stroke, w, h, iso);
  }

  if (icon) {
    return layoutFramedIconNode(node, def, icon, color, w, h, iso);
  }

  if (!iso) {
    const faces =
      node.kind === "text"
        ? []
        : [{ d: node.shape === "ellipse" ? ellipsePath(node.x, node.y, w, h) : roundedRectPath(node.x, node.y, w, h, 8), fill: color.fill, stroke: color.stroke }];
    return {
      id: node.id,
      source: node,
      faces,
      bare: false,
      icon: null,
      iconX: node.x,
      iconY: node.y,
      iconSize: 0,
      cap: def.cap,
      label: node.label,
      color: color.stroke,
      cx: node.x + w / 2,
      cy: node.y + h / 2,
      capY: node.y + 19,
      labelY: def.cap ? node.y + h / 2 + 11 : node.y + h / 2 + 5,
      hx: node.x,
      hy: node.y,
      hw: w,
      hh: h,
    };
  }

  const a = projectIso(node.x, node.y);
  const b = projectIso(node.x + w, node.y);
  const c = projectIso(node.x + w, node.y + h);
  const d = projectIso(node.x, node.y + h);
  if (node.kind === "database") {
    return layoutIsoDatabaseNode(node, def, color, a, c, w, h);
  }
  if (node.kind === "server" || node.kind === "service") {
    return layoutIsoServerNode(node, def, color, a, c);
  }
  const top = `M${a[0]} ${a[1]}L${b[0]} ${b[1]}L${c[0]} ${c[1]}L${d[0]} ${d[1]}z`;
  const left = `M${d[0]} ${d[1]}L${c[0]} ${c[1]}L${c[0]} ${c[1] + isoDepth}L${d[0]} ${d[1] + isoDepth}z`;
  const right = `M${c[0]} ${c[1]}L${b[0]} ${b[1]}L${b[0]} ${b[1] + isoDepth}L${c[0]} ${c[1] + isoDepth}z`;
  const faces =
    node.kind === "text"
      ? []
      : [
          { d: left, fill: "rgba(0,0,0,.16)", stroke: color.stroke },
          { d: right, fill: "rgba(0,0,0,.08)", stroke: color.stroke },
          { d: top, fill: color.fill, stroke: color.stroke },
        ];
  const cx = (a[0] + c[0]) / 2;
  const cy = (a[1] + c[1]) / 2;
  const xs = [a[0], b[0], c[0], d[0]];
  const ys = [a[1], b[1], c[1], d[1] + isoDepth];

  return {
    id: node.id,
    source: node,
    faces,
    bare: false,
    icon: null,
    iconX: cx,
    iconY: cy,
    iconSize: 0,
    cap: def.cap,
    label: node.label,
    color: color.stroke,
    cx,
    cy,
    capY: cy - 8,
    labelY: def.cap ? cy + 11 : cy + 5,
    hx: Math.min(...xs),
    hy: Math.min(...ys),
    hw: Math.max(...xs) - Math.min(...xs),
    hh: Math.max(...ys) - Math.min(...ys),
  };
}

function layoutIsoServerNode(
  node: DiagramNode,
  def: { cap: string },
  color: { fill: string; stroke: string },
  a: [number, number],
  c: [number, number],
): DiagramLayoutNode {
  const cx = (a[0] + c[0]) / 2;
  const cy = (a[1] + c[1]) / 2 + 5;
  const faceW = Math.max(74, Math.min(126, (node.w ?? diagramKinds.server.w) * 0.72));
  const faceH = Math.max(82, Math.min(138, (node.h ?? diagramKinds.server.h) * 1.3));
  const depthX = Math.max(18, faceW * 0.22);
  const depthY = -Math.max(12, faceH * 0.16);
  const left = cx - faceW / 2;
  const top = cy - faceH / 2;
  const right = left + faceW;
  const bottom = top + faceH;
  const front = `M${left} ${top}L${right} ${top}L${right} ${bottom}L${left} ${bottom}z`;
  const topFace = `M${left} ${top}L${left + depthX} ${top + depthY}L${right + depthX} ${top + depthY}L${right} ${top}z`;
  const sideFace = `M${right} ${top}L${right + depthX} ${top + depthY}L${right + depthX} ${bottom + depthY}L${right} ${bottom}z`;
  const slot1 = `M${left + 10} ${top + faceH * 0.25}H${right - 10}`;
  const slot2 = `M${left + 10} ${top + faceH * 0.42}H${right - 10}`;
  const slot3 = `M${left + 10} ${top + faceH * 0.59}H${right - 10}`;
  const slot4 = `M${left + 10} ${top + faceH * 0.76}H${right - 10}`;
  const led1 = roundedRectPath(left + 13, top + faceH * 0.27, 7, 4, 2);
  const led2 = roundedRectPath(left + 13, top + faceH * 0.44, 7, 4, 2);
  const led3 = roundedRectPath(left + 13, top + faceH * 0.61, 7, 4, 2);
  const xs = [left, right + depthX];
  const ys = [top + depthY, bottom];

  return {
    id: node.id,
    source: node,
    faces: [
      { d: sideFace, fill: "rgba(0,0,0,.14)", stroke: color.stroke },
      { d: topFace, fill: "rgba(255,255,255,.18)", stroke: color.stroke },
      { d: front, fill: color.fill, stroke: color.stroke },
      { d: slot1, fill: "none", stroke: color.stroke },
      { d: slot2, fill: "none", stroke: color.stroke },
      { d: slot3, fill: "none", stroke: color.stroke },
      { d: slot4, fill: "none", stroke: color.stroke },
      { d: led1, fill: color.stroke, stroke: color.stroke },
      { d: led2, fill: color.stroke, stroke: color.stroke },
      { d: led3, fill: color.stroke, stroke: color.stroke },
    ],
    bare: false,
    icon: null,
    iconX: cx,
    iconY: cy,
    iconSize: 0,
    cap: def.cap,
    label: node.label,
    color: color.stroke,
    cx,
    cy,
    capY: top + 15,
    labelY: def.cap ? cy + 8 : cy + 5,
    hx: Math.min(...xs),
    hy: Math.min(...ys),
    hw: Math.max(...xs) - Math.min(...xs),
    hh: Math.max(...ys) - Math.min(...ys),
  };
}

function layoutIsoDatabaseNode(
  node: DiagramNode,
  def: { cap: string },
  color: { fill: string; stroke: string },
  a: [number, number],
  c: [number, number],
  w: number,
  h: number,
): DiagramLayoutNode {
  const cx = (a[0] + c[0]) / 2;
  const cy = (a[1] + c[1]) / 2 + 2;
  const rx = Math.max(42, Math.min(86, (w + h) * 0.3));
  const ry = Math.max(11, Math.min(20, h * 0.2));
  const bodyH = Math.max(58, h * 0.95);
  const topY = cy - bodyH / 2;
  const bottomY = cy + bodyH / 2;
  const sideShade = `M${cx + rx * 0.35} ${topY + ry * 0.35}C${cx + rx} ${topY + ry * 0.5} ${cx + rx} ${topY + ry * 0.6} ${cx + rx} ${topY}V${bottomY}C${cx + rx} ${bottomY + ry * 0.7} ${cx + rx * 0.38} ${bottomY + ry} ${cx + rx * 0.35} ${bottomY + ry}z`;
  const body = `M${cx - rx} ${topY}C${cx - rx} ${topY + ry} ${cx + rx} ${topY + ry} ${cx + rx} ${topY}V${bottomY}C${cx + rx} ${bottomY + ry} ${cx - rx} ${bottomY + ry} ${cx - rx} ${bottomY}z`;
  const top = `M${cx - rx} ${topY}C${cx - rx} ${topY - ry} ${cx + rx} ${topY - ry} ${cx + rx} ${topY}C${cx + rx} ${topY + ry} ${cx - rx} ${topY + ry} ${cx - rx} ${topY}z`;
  const mid = `M${cx - rx} ${topY + bodyH * 0.45}C${cx - rx} ${topY + bodyH * 0.45 + ry} ${cx + rx} ${topY + bodyH * 0.45 + ry} ${cx + rx} ${topY + bodyH * 0.45}`;
  const low = `M${cx - rx} ${topY + bodyH * 0.72}C${cx - rx} ${topY + bodyH * 0.72 + ry} ${cx + rx} ${topY + bodyH * 0.72 + ry} ${cx + rx} ${topY + bodyH * 0.72}`;

  return {
    id: node.id,
    source: node,
    faces: [
      { d: body, fill: color.fill, stroke: color.stroke },
      { d: sideShade, fill: "rgba(0,0,0,.08)", stroke: "transparent" },
      { d: top, fill: "rgba(255,255,255,.2)", stroke: color.stroke },
      { d: mid, fill: "none", stroke: color.stroke },
      { d: low, fill: "none", stroke: color.stroke },
    ],
    bare: false,
    icon: null,
    iconX: cx,
    iconY: cy,
    iconSize: 0,
    cap: def.cap,
    label: node.label,
    color: color.stroke,
    cx,
    cy,
    capY: cy - 8,
    labelY: def.cap ? cy + 12 : cy + 5,
    hx: cx - rx,
    hy: topY - ry,
    hw: rx * 2,
    hh: bodyH + ry * 2,
  };
}

function layoutIconNode(
  node: DiagramNode,
  icon: DiagramIconKind,
  color: string,
  w: number,
  h: number,
  iso: boolean,
): DiagramLayoutNode {
  const iconSize = iconSizeForNode(w, h);
  const boundsWidth = Math.max(iconSize, iconLabelWidth(node.label));
  if (!iso) {
    const cx = node.x + w / 2;
    const iconX = cx - iconSize / 2;
    const iconY = node.y;
    return {
      id: node.id,
      source: node,
      faces: [],
      bare: true,
      icon,
      iconX,
      iconY,
      iconSize,
      cap: "",
      label: node.label,
      color,
      cx,
      cy: iconY + iconSize / 2,
      capY: iconY,
      labelY: iconY + iconSize + 18,
      hx: cx - boundsWidth / 2,
      hy: iconY,
      hw: boundsWidth,
      hh: iconSize + 25,
    };
  }

  const a = projectIso(node.x, node.y);
  const c = projectIso(node.x + w, node.y + h);
  const cx = (a[0] + c[0]) / 2;
  const cy = (a[1] + c[1]) / 2;
  const iconX = cx - iconSize / 2;
  const iconY = cy - iconSize / 2;
  return {
    id: node.id,
    source: node,
    faces: [],
    bare: true,
    icon,
    iconX,
    iconY,
    iconSize,
    cap: "",
    label: node.label,
    color,
    cx,
    cy,
    capY: iconY,
    labelY: iconY + iconSize + 18,
    hx: cx - boundsWidth / 2,
    hy: iconY,
    hw: boundsWidth,
    hh: iconSize + 25,
  };
}

function iconLabelWidth(label: string) {
  return Math.min(180, Math.max(44, label.length * 6.2));
}

function iconSizeForNode(w: number, h: number) {
  return Math.max(20, Math.min(112, Math.min(w, h - 25)));
}

function layoutFramedIconNode(
  node: DiagramNode,
  def: DiagramKindDefinition,
  icon: DiagramIconKind,
  color: { fill: string; stroke: string },
  w: number,
  h: number,
  iso: boolean,
): DiagramLayoutNode {
  const iconSize = Math.max(18, Math.min(28, w - 32, h - 42));
  if (!iso) {
    const cx = node.x + w / 2;
    const iconY = node.y + Math.max(12, (h - iconSize) / 2 - 8);
    return {
      id: node.id,
      source: node,
      faces: [{ d: roundedRectPath(node.x, node.y, w, h, 8), fill: color.fill, stroke: color.stroke }],
      bare: false,
      icon,
      iconX: cx - iconSize / 2,
      iconY,
      iconSize,
      cap: def.cap,
      label: node.label,
      color: color.stroke,
      cx,
      cy: node.y + h / 2,
      capY: node.y + 19,
      labelY: node.y + h - 13,
      hx: node.x,
      hy: node.y,
      hw: w,
      hh: h,
    };
  }

  const a = projectIso(node.x, node.y);
  const b = projectIso(node.x + w, node.y);
  const c = projectIso(node.x + w, node.y + h);
  const d = projectIso(node.x, node.y + h);
  const top = `M${a[0]} ${a[1]}L${b[0]} ${b[1]}L${c[0]} ${c[1]}L${d[0]} ${d[1]}z`;
  const left = `M${d[0]} ${d[1]}L${c[0]} ${c[1]}L${c[0]} ${c[1] + isoDepth}L${d[0]} ${d[1] + isoDepth}z`;
  const right = `M${c[0]} ${c[1]}L${b[0]} ${b[1]}L${b[0]} ${b[1] + isoDepth}L${c[0]} ${c[1] + isoDepth}z`;
  const cx = (a[0] + c[0]) / 2;
  const cy = (a[1] + c[1]) / 2;
  const xs = [a[0], b[0], c[0], d[0]];
  const ys = [a[1], b[1], c[1], d[1] + isoDepth];
  return {
    id: node.id,
    source: node,
    faces: [
      { d: left, fill: "rgba(0,0,0,.16)", stroke: color.stroke },
      { d: right, fill: "rgba(0,0,0,.08)", stroke: color.stroke },
      { d: top, fill: color.fill, stroke: color.stroke },
    ],
    bare: false,
    icon,
    iconX: cx - iconSize / 2,
    iconY: cy - iconSize / 2 - 7,
    iconSize,
    cap: def.cap,
    label: node.label,
    color: color.stroke,
    cx,
    cy,
    capY: cy - 8,
    labelY: cy + 18,
    hx: Math.min(...xs),
    hy: Math.min(...ys),
    hw: Math.max(...xs) - Math.min(...xs),
    hh: Math.max(...ys) - Math.min(...ys),
  };
}

function sizeForNode(node: DiagramNode) {
  const def = diagramKinds[node.kind] ?? diagramKinds.box;
  return { w: node.w ?? def.w, h: node.h ?? def.h };
}

function connectionSize(layout: DiagramLayoutNode, source: DiagramNode) {
  return layout.bare ? { w: layout.iconSize, h: layout.iconSize } : sizeForNode(source);
}

function straightEdgePath(
  from: DiagramLayoutNode,
  to: DiagramLayoutNode,
  fromSource: DiagramNode,
  toSource: DiagramNode,
  trimStart: number,
  trimEnd: number,
  labelPosition: number,
) {
  const fromSize = connectionSize(from, fromSource);
  const toSize = connectionSize(to, toSource);
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const start = offsetPoint(edgePoint(from.cx, from.cy, fromSize, ux, uy), ux, uy, trimStart);
  const end = offsetPoint(edgePoint(to.cx, to.cy, toSize, -ux, -uy), -ux, -uy, trimEnd);
  return {
    d: `M${start.x} ${start.y}L${end.x} ${end.y}`,
    mid: {
      x: start.x + (end.x - start.x) * labelPosition,
      y: start.y + (end.y - start.y) * labelPosition,
    },
  };
}

function curvedEdgePath(
  from: DiagramLayoutNode,
  to: DiagramLayoutNode,
  fromSource: DiagramNode,
  toSource: DiagramNode,
  trimStart: number,
  trimEnd: number,
  labelPosition: number,
) {
  const fromSize = connectionSize(from, fromSource);
  const toSize = connectionSize(to, toSource);
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  const len = Math.hypot(dx, dy) || 1;
  const ux = dx / len;
  const uy = dy / len;
  const start = offsetPoint(edgePoint(from.cx, from.cy, fromSize, ux, uy), ux, uy, trimStart);
  const end = offsetPoint(edgePoint(to.cx, to.cy, toSize, -ux, -uy), -ux, -uy, trimEnd);
  const bend = Math.min(72, Math.max(28, len * 0.22));
  const mx = Math.round(((start.x + end.x) / 2 - uy * bend) * 10) / 10;
  const my = Math.round(((start.y + end.y) / 2 + ux * bend) * 10) / 10;
  
  const u = 1 - labelPosition;
  return {
    d: `M${start.x} ${start.y}Q${mx} ${my} ${end.x} ${end.y}`,
    mid: {
      x: u * u * start.x + 2 * u * labelPosition * mx + labelPosition * labelPosition * end.x,
      y: u * u * start.y + 2 * u * labelPosition * my + labelPosition * labelPosition * end.y,
    },
  };
}

function pointOnPolyline(points: {x:number, y:number}[], t: number) {
  if (points.length === 0) return {x: 0, y: 0};
  if (points.length === 1) return points[0];
  let totalLen = 0;
  const lengths = [];
  for (let i = 0; i < points.length - 1; i++) {
    const l = Math.hypot(points[i+1].x - points[i].x, points[i+1].y - points[i].y);
    lengths.push(l);
    totalLen += l;
  }
  const target = totalLen * Math.max(0, Math.min(1, t));
  let current = 0;
  for (let i = 0; i < points.length - 1; i++) {
    if (current + lengths[i] >= target || i === points.length - 2) {
      const remaining = target - current;
      const segmentT = lengths[i] > 0 ? remaining / lengths[i] : 0;
      return {
        x: points[i].x + (points[i+1].x - points[i].x) * segmentT,
        y: points[i].y + (points[i+1].y - points[i].y) * segmentT,
      };
    }
    current += lengths[i];
  }
  return points[points.length - 1];
}

function orthogonalEdgePath(
  from: DiagramLayoutNode,
  to: DiagramLayoutNode,
  fromSource: DiagramNode,
  toSource: DiagramNode,
  corner: DiagramEdgeCorner,
  trimStart: number,
  trimEnd: number,
  labelPosition: number,
) {
  const fromSize = connectionSize(from, fromSource);
  const toSize = connectionSize(to, toSource);
  const dx = to.cx - from.cx;
  const dy = to.cy - from.cy;
  if (Math.abs(dx) >= Math.abs(dy)) {
    const sx = from.cx + (dx > 0 ? fromSize.w / 2 : -fromSize.w / 2);
    const tx = to.cx + (dx > 0 ? -toSize.w / 2 : toSize.w / 2);
    const mx = (sx + tx) / 2;
    const points = [
      { x: sx, y: from.cy },
      { x: mx, y: from.cy },
      { x: mx, y: to.cy },
      { x: tx, y: to.cy },
    ];
    const trimmed = trimPolylineEndpoints(points, trimStart, trimEnd);
    return {
      d: corner === "rounded" ? roundedPolylinePath(trimmed, 10) : polylinePath(trimmed),
      mid: pointOnPolyline(trimmed, labelPosition),
    };
  }
  const sy = from.cy + (dy > 0 ? fromSize.h / 2 : -fromSize.h / 2);
  const ty = to.cy + (dy > 0 ? -toSize.h / 2 : toSize.h / 2);
  const my = (sy + ty) / 2;
  const points = [
    { x: from.cx, y: sy },
    { x: from.cx, y: my },
    { x: to.cx, y: my },
    { x: to.cx, y: ty },
  ];
  const trimmed = trimPolylineEndpoints(points, trimStart, trimEnd);
  return {
    d: corner === "rounded" ? roundedPolylinePath(trimmed, 10) : polylinePath(trimmed),
    mid: pointOnPolyline(trimmed, labelPosition),
  };
}

function edgePoint(cx: number, cy: number, size: { w: number; h: number }, ux: number, uy: number) {
  const tx = Math.abs(ux) > 0.0001 ? size.w / 2 / Math.abs(ux) : Number.POSITIVE_INFINITY;
  const ty = Math.abs(uy) > 0.0001 ? size.h / 2 / Math.abs(uy) : Number.POSITIVE_INFINITY;
  const t = Math.min(tx, ty);
  return {
    x: Math.round((cx + ux * t) * 10) / 10,
    y: Math.round((cy + uy * t) * 10) / 10,
  };
}

function offsetPoint(point: { x: number; y: number }, ux: number, uy: number, distance: number) {
  return {
    x: Math.round((point.x + ux * distance) * 10) / 10,
    y: Math.round((point.y + uy * distance) * 10) / 10,
  };
}

function moveToward(from: { x: number; y: number }, to: { x: number; y: number }, distance: number) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy);
  if (!len) {
    return from;
  }
  const nextDistance = Math.min(distance, Math.max(0, len - 0.1));
  return offsetPoint(from, dx / len, dy / len, nextDistance);
}

function trimPolylineEndpoints(points: Array<{ x: number; y: number }>, trimStart: number, trimEnd: number) {
  const next = points.map((point) => ({ ...point }));
  if (trimStart && next[1]) {
    next[0] = moveToward(next[0], next[1], trimStart);
  }
  if (trimEnd && next[next.length - 2] && next[next.length - 1]) {
    next[next.length - 1] = moveToward(next[next.length - 1], next[next.length - 2], trimEnd);
  }
  return next;
}

function polylinePath(points: Array<{ x: number; y: number }>) {
  const [first, ...rest] = points;
  if (!first) {
    return "";
  }
  return `M${first.x} ${first.y}${rest.map((point) => `L${point.x} ${point.y}`).join("")}`;
}

function roundedPolylinePath(points: Array<{ x: number; y: number }>, radius: number) {
  const [first, ...rest] = points;
  if (!first || rest.length === 0) {
    return "";
  }
  let d = `M${first.x} ${first.y}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const point = points[i];
    const next = points[i + 1];
    const inLen = Math.hypot(point.x - prev.x, point.y - prev.y);
    const outLen = Math.hypot(next.x - point.x, next.y - point.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    if (r <= 0) {
      d += `L${point.x} ${point.y}`;
      continue;
    }
    const inX = (point.x - prev.x) / inLen;
    const inY = (point.y - prev.y) / inLen;
    const outX = (next.x - point.x) / outLen;
    const outY = (next.y - point.y) / outLen;
    const before = { x: Math.round((point.x - inX * r) * 10) / 10, y: Math.round((point.y - inY * r) * 10) / 10 };
    const after = { x: Math.round((point.x + outX * r) * 10) / 10, y: Math.round((point.y + outY * r) * 10) / 10 };
    d += `L${before.x} ${before.y}Q${point.x} ${point.y} ${after.x} ${after.y}`;
  }
  const last = points[points.length - 1];
  return `${d}L${last.x} ${last.y}`;
}

function edgeStrokeWidth(width: DiagramEdgeWidth | undefined) {
  if (width === "thin") {
    return 1.2;
  }
  if (width === "thick") {
    return 2.8;
  }
  return 1.8;
}

function arrowMarkerLength(width: number) {
  return Math.round(width * 6.3 * 10) / 10;
}

export function diagramIconForKind(kind: DiagramKind): DiagramIconKind | null {
  if (isDiagramIconKind(kind)) {
    return kind;
  }
  if (kind === "user") {
    return null;
  }
  return null;
}

function colorForIconGroup(group: string): DiagramColor {
  if (group === "Data") {
    return "green";
  }
  if (group === "Network") {
    return "violet";
  }
  if (group === "Observability" || group === "Delivery") {
    return "amber";
  }
  return group === "Core" || group === "Kubernetes" || group === "Cloud" ? "blue" : "slate";
}

function projectIso(x: number, y: number): [number, number] {
  return [(x - y) * isoCos, (x + y) * isoSin];
}

function unprojectIso(sx: number, sy: number): [number, number] {
  return [(sx / isoCos + sy / isoSin) / 2, (sy / isoSin - sx / isoCos) / 2];
}

function roundedRectPath(x: number, y: number, w: number, h: number, r: number) {
  return `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${-(w - 2 * r)}a${r} ${r} 0 0 1 ${-r} ${-r}v${-(h - 2 * r)}a${r} ${r} 0 0 1 ${r} ${-r}z`;
}

function ellipsePath(x: number, y: number, w: number, h: number) {
  const rx = w / 2;
  const ry = h / 2;
  const cx = x + rx;
  const cy = y + ry;
  return `M${cx - rx} ${cy}a${rx} ${ry} 0 1 0 ${w} 0a${rx} ${ry} 0 1 0 ${-w} 0z`;
}

function arrowDefs() {
  return Object.entries(diagramPalette)
    .map(([name, color]) => {
      return `<marker id="diagram-arrow-${name}" viewBox="0 0 10 10" refX="0" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1L9 5L0 9z" fill="${color.stroke}"/></marker>`;
    })
    .join("");
}

function encodeDiagram(diagram: Diagram) {
  const json = JSON.stringify(normalizeDiagram(diagram));
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeDiagram(encoded: string): Diagram | null {
  try {
    const padded = encoded.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(encoded.length / 4) * 4, "=");
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return normalizeDiagram(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}

function normalizeDiagram(value: unknown): Diagram {
  const source = typeof value === "object" && value ? (value as Partial<Diagram>) : {};
  const nodes = Array.isArray(source.nodes) ? source.nodes : [];
  const edges = Array.isArray(source.edges) ? source.edges : [];
  return {
    version: 1,
    mode: source.mode === "iso" ? "iso" : "flat",
    nodes: nodes.map(normalizeNode),
    edges: edges.map(normalizeEdge),
    preview: normalizePreview(source.preview),
  };
}

function normalizeNode(value: unknown): DiagramNode {
  const node = typeof value === "object" && value ? (value as Partial<DiagramNode>) : {};
  const kind = isDiagramKind(node.kind) ? node.kind : "box";
  const def = diagramKinds[kind];
  const color = isDiagramColor(node.color) ? node.color : def.color;
  return {
    id: typeof node.id === "string" && node.id ? node.id : uniqueId("n"),
    kind,
    x: typeof node.x === "number" ? node.x : 0,
    y: typeof node.y === "number" ? node.y : 0,
    label: typeof node.label === "string" ? node.label : def.label,
    color,
    w: typeof node.w === "number" ? node.w : undefined,
    h: typeof node.h === "number" ? node.h : undefined,
    shape: node.shape === "ellipse" ? "ellipse" : undefined,
    boxed: node.boxed === true ? true : undefined,
    labelBoxed: typeof node.labelBoxed === "boolean" ? node.labelBoxed : undefined,
  };
}

function normalizeEdge(value: unknown): DiagramEdge {
  const edge = typeof value === "object" && value ? (value as Partial<DiagramEdge>) : {};
  return {
    id: typeof edge.id === "string" && edge.id ? edge.id : uniqueId("e"),
    from: typeof edge.from === "string" ? edge.from : "",
    to: typeof edge.to === "string" ? edge.to : "",
    color: isDiagramColor(edge.color) ? edge.color : "slate",
    route: isDiagramEdgeRoute(edge.route) ? edge.route : undefined,
    corner: isDiagramEdgeCorner(edge.corner) ? edge.corner : undefined,
    dashed: edge.dashed === true ? true : undefined,
    start: isDiagramEdgeEnd(edge.start) ? edge.start : undefined,
    end: isDiagramEdgeEnd(edge.end) ? edge.end : undefined,
    width: isDiagramEdgeWidth(edge.width) ? edge.width : undefined,
    label: typeof edge.label === "string" && edge.label.trim() ? edge.label.trim() : undefined,
  };
}

function normalizePreview(value: unknown): DiagramPreview | undefined {
  const preview = typeof value === "object" && value ? (value as Partial<DiagramPreview>) : null;
  if (!preview) {
    return undefined;
  }
  if (
    typeof preview.x !== "number" ||
    typeof preview.y !== "number" ||
    typeof preview.width !== "number" ||
    typeof preview.height !== "number"
  ) {
    return undefined;
  }
  return {
    x: preview.x,
    y: preview.y,
    width: Math.max(160, preview.width),
    height: Math.max(140, Math.min(640, preview.height)),
  };
}

function isDiagramKind(value: unknown): value is DiagramKind {
  return typeof value === "string" && value in diagramKinds;
}

function isDiagramColor(value: unknown): value is DiagramColor {
  return typeof value === "string" && value in diagramPalette;
}

function isDiagramEdgeRoute(value: unknown): value is DiagramEdgeRoute {
  return value === "orthogonal" || value === "straight" || value === "curved";
}

function isDiagramEdgeCorner(value: unknown): value is DiagramEdgeCorner {
  return value === "rounded" || value === "square";
}

function isDiagramEdgeEnd(value: unknown): value is DiagramEdgeEnd {
  return value === "none" || value === "arrow";
}

function isDiagramEdgeWidth(value: unknown): value is DiagramEdgeWidth {
  return value === "thin" || value === "medium" || value === "thick";
}

function uniqueId(prefix: string) {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value);
}

function safeSvgId(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "-");
}
