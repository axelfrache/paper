export type DiagramMode = "flat" | "iso";

export type DiagramKind = "box" | "server" | "service" | "database" | "user" | "queue" | "client" | "text";

export type DiagramColor = "slate" | "blue" | "green" | "amber" | "violet";

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
};

export type DiagramEdge = {
  id: string;
  from: string;
  to: string;
  color: DiagramColor;
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
  marker: string;
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

export const diagramKinds: Record<DiagramKind, { cap: string; w: number; h: number; color: DiagramColor; label: string }> = {
  box: { cap: "", w: 150, h: 66, color: "slate", label: "Box" },
  server: { cap: "SERVER", w: 158, h: 72, color: "blue", label: "Server" },
  service: { cap: "SERVICE", w: 158, h: 70, color: "blue", label: "Service" },
  database: { cap: "DATABASE", w: 150, h: 70, color: "green", label: "Database" },
  user: { cap: "USER", w: 132, h: 62, color: "amber", label: "User" },
  queue: { cap: "QUEUE", w: 150, h: 62, color: "violet", label: "Queue" },
  client: { cap: "CLIENT", w: 148, h: 66, color: "slate", label: "Client" },
  text: { cap: "", w: 130, h: 30, color: "slate", label: "Label" },
};

const isoCos = 0.866;
const isoSin = 0.5;
const isoDepth = 16;
const diagramMarkerPattern = /^!\[diagram:([A-Za-z0-9_-]+)\]$/;

export function createDefaultDiagram(): Diagram {
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
  const label = (id: string) => diagram.nodes.find((node) => node.id === id)?.label || "?";
  if (diagram.edges.length) {
    return diagram.edges.map((edge) => `${label(edge.from)} -> ${label(edge.to)}`).join("\n");
  }
  return diagram.nodes.map((node) => `- ${node.label}`).join("\n");
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
    let d = "";
    if (iso) {
      d = `M${from.cx} ${from.cy}L${to.cx} ${to.cy}`;
    } else {
      const fromSize = sizeForNode(fromSource);
      const toSize = sizeForNode(toSource);
      const dx = to.cx - from.cx;
      const dy = to.cy - from.cy;
      if (Math.abs(dx) >= Math.abs(dy)) {
        const sx = from.cx + (dx > 0 ? fromSize.w / 2 : -fromSize.w / 2);
        const tx = to.cx + (dx > 0 ? -toSize.w / 2 : toSize.w / 2);
        const mx = (sx + tx) / 2;
        d = `M${sx} ${from.cy}H${mx}V${to.cy}H${tx}`;
      } else {
        const sy = from.cy + (dy > 0 ? fromSize.h / 2 : -fromSize.h / 2);
        const ty = to.cy + (dy > 0 ? -toSize.h / 2 : toSize.h / 2);
        const my = (sy + ty) / 2;
        d = `M${from.cx} ${sy}V${my}H${to.cx}V${ty}`;
      }
    }
    return [{ id: edge.id, d, color: color.stroke, marker: `url(#diagram-arrow-${edge.color})` }];
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
  const preview = previewForDiagram(diagram, maxHeight);
  const body = [
    ...layout.edges.map(
      (edge) => `<path d="${edge.d}" fill="none" stroke="${edge.color}" stroke-width="1.6" marker-end="${edge.marker}"/>`,
    ),
    ...layout.nodes.map((node) => {
      const faces = node.faces
        .map((face) => `<path d="${face.d}" fill="${face.fill}" stroke="${face.stroke}" stroke-width="1.4"/>`)
        .join("");
      const cap = node.cap
        ? `<text x="${node.cx}" y="${node.capY}" text-anchor="middle" font-size="8.5" letter-spacing="1" font-weight="700" fill="${node.color}">${escapeHtml(node.cap)}</text>`
        : "";
      return `${faces}${cap}<text x="${node.cx}" y="${node.labelY}" text-anchor="middle" font-size="13" font-weight="530" fill="var(--text)">${escapeHtml(node.label)}</text>`;
    }),
  ].join("");

  return `<svg class="diagram-preview-svg" viewBox="${preview.x} ${preview.y} ${preview.width} ${preview.height}" width="100%" style="display:block;height:${preview.height}px;font-family:inherit;overflow:hidden;"><defs>${arrowDefs()}</defs>${body}</svg>`;
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

export function screenToDiagramPoint(
  event: { clientX: number; clientY: number },
  svg: SVGSVGElement,
  diagram: Diagram,
) {
  const rect = svg.getBoundingClientRect();
  const viewBox = svg.getAttribute("viewBox")?.split(/\s+/).map(Number) ?? [0, 0, rect.width, rect.height];
  const sx = viewBox[0] + ((event.clientX - rect.left) / rect.width) * viewBox[2];
  const sy = viewBox[1] + ((event.clientY - rect.top) / rect.height) * viewBox[3];
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

  if (!iso) {
    const faces =
      node.kind === "text"
        ? []
        : [{ d: node.shape === "ellipse" ? ellipsePath(node.x, node.y, w, h) : roundedRectPath(node.x, node.y, w, h, 8), fill: color.fill, stroke: color.stroke }];
    return {
      id: node.id,
      source: node,
      faces,
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

function sizeForNode(node: DiagramNode) {
  const def = diagramKinds[node.kind] ?? diagramKinds.box;
  return { w: node.w ?? def.w, h: node.h ?? def.h };
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
      return `<marker id="diagram-arrow-${name}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1L9 5L0 9z" fill="${color.stroke}"/></marker>`;
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
  };
}

function normalizeEdge(value: unknown): DiagramEdge {
  const edge = typeof value === "object" && value ? (value as Partial<DiagramEdge>) : {};
  return {
    id: typeof edge.id === "string" && edge.id ? edge.id : uniqueId("e"),
    from: typeof edge.from === "string" ? edge.from : "",
    to: typeof edge.to === "string" ? edge.to : "",
    color: isDiagramColor(edge.color) ? edge.color : "slate",
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
