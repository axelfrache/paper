import {
  createDiagramNode,
  describeDiagram,
  diagramKinds,
  diagramPalette,
} from "./diagram";
import type {
  Diagram,
  DiagramColor,
  DiagramEdge,
  DiagramEdgeCorner,
  DiagramEdgeEnd,
  DiagramEdgeRoute,
  DiagramEdgeWidth,
  DiagramKind,
  DiagramMode,
  DiagramNode,
} from "./diagram";

const colors = Object.keys(diagramPalette) as DiagramColor[];
const allowedDiagramKinds = Object.keys(diagramKinds).join(", ");

export function buildDiagramGenerationPrompt(prompt: string, mode: DiagramMode, current?: Diagram) {
  return [
    "Generate a complete Paper diagram from the user request.",
    "Return only valid JSON. Do not include markdown fences, explanations, or prose.",
    "Do not include default placeholder nodes unless the user explicitly asks for them.",
    "",
    "Schema:",
    `{"nodes":[{"id":"n1","kind":"client","label":"Client","color":"slate"}],"edges":[{"from":"n1","to":"n2","color":"slate","dashed":false}]}`,
    "",
    `Diagram mode: ${mode}`,
    `Allowed node kinds: ${allowedDiagramKinds}`,
    `Allowed colors: ${colors.join(", ")}`,
    "Allowed edge routes: straight, curved, orthogonal",
    "Allowed edge ends: none, arrow",
    "",
    current ? "Existing diagram, for context only. Replace it with the generated result:" : "No existing diagram.",
    current ? describeDiagram(current) : "",
    "",
    "User request:",
    prompt,
  ].join("\n");
}

export function parseGeneratedDiagram(answer: string, mode: DiagramMode): Diagram {
  const payload = JSON.parse(extractJson(answer)) as { nodes?: unknown; edges?: unknown };
  const sourceNodes = Array.isArray(payload.nodes) ? payload.nodes : [];
  if (!sourceNodes.length) {
    throw new Error("The AI response did not include any nodes.");
  }

  const usedNodeIds = new Set<string>();
  const nodeIdMap = new Map<string, string>();
  const origin = { x: 100, y: 120 };
  const nodes = sourceNodes.map((source, index) => {
    const item = source && typeof source === "object" ? (source as Record<string, unknown>) : {};
    const originalId = typeof item.id === "string" && item.id.trim() ? item.id.trim() : `n${index + 1}`;
    const id = uniqueGeneratedId(originalId, usedNodeIds);
    const kind = toDiagramKind(item.kind);
    const point = generatedNodePoint(index, mode, origin);
    const node = createDiagramNode(kind, point, toDiagramColor(item.color));
    nodeIdMap.set(originalId, id);
    return generatedNodeFromPayload(node, id, kind, item);
  });

  const usedEdgeIds = new Set<string>();
  const edges = (Array.isArray(payload.edges) ? payload.edges : []).flatMap((source, index): DiagramEdge[] => {
    const item = source && typeof source === "object" ? (source as Record<string, unknown>) : {};
    const from = typeof item.from === "string" ? nodeIdMap.get(item.from) : undefined;
    const to = typeof item.to === "string" ? nodeIdMap.get(item.to) : undefined;
    if (!from || !to || from === to) {
      return [];
    }
    return [
      {
        id: uniqueGeneratedId(typeof item.id === "string" ? item.id : `e${index + 1}`, usedEdgeIds),
        from,
        to,
        color: toDiagramColor(item.color),
        route: toDiagramEdgeRoute(item.route),
        corner: toDiagramEdgeCorner(item.corner),
        dashed: item.dashed === true ? true : undefined,
        start: toDiagramEdgeEnd(item.start),
        end: toDiagramEdgeEnd(item.end),
        width: toDiagramEdgeWidth(item.width),
      },
    ];
  });

  return { version: 1, mode, nodes, edges };
}

function generatedNodeFromPayload(
  node: DiagramNode,
  id: string,
  kind: DiagramKind,
  item: Record<string, unknown>,
): DiagramNode {
  return {
    ...node,
    id,
    label: typeof item.label === "string" && item.label.trim() ? item.label.trim() : diagramKinds[kind].label,
    boxed: item.boxed === true ? true : undefined,
    labelBoxed: typeof item.labelBoxed === "boolean" ? item.labelBoxed : undefined,
    shape: item.shape === "ellipse" ? "ellipse" : undefined,
    w: typeof item.w === "number" ? item.w : node.w,
    h: typeof item.h === "number" ? item.h : node.h,
  };
}

function extractJson(value: string) {
  const withoutFence = value.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const start = withoutFence.indexOf("{");
  const end = withoutFence.lastIndexOf("}");
  if (start < 0 || end <= start) {
    throw new Error("The AI response was not valid JSON.");
  }
  return withoutFence.slice(start, end + 1);
}

function generatedNodePoint(index: number, mode: DiagramMode, origin: { x: number; y: number }) {
  const columns = 3;
  const spacingX = mode === "iso" ? 230 : 210;
  const spacingY = mode === "iso" ? 170 : 145;
  return {
    x: origin.x + (index % columns) * spacingX,
    y: origin.y + Math.floor(index / columns) * spacingY,
  };
}

function uniqueGeneratedId(value: string, used: Set<string>) {
  const base = (value.trim().replace(/[^A-Za-z0-9_-]/g, "-") || "generated").slice(0, 32);
  let candidate = base;
  let index = 1;
  while (used.has(candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  used.add(candidate);
  return candidate;
}

function toDiagramKind(value: unknown): DiagramKind {
  return typeof value === "string" && value in diagramKinds ? (value as DiagramKind) : "box";
}

function toDiagramColor(value: unknown): DiagramColor {
  return typeof value === "string" && colors.includes(value as DiagramColor) ? (value as DiagramColor) : "slate";
}

function toDiagramEdgeRoute(value: unknown): DiagramEdgeRoute | undefined {
  return value === "straight" || value === "curved" || value === "orthogonal" ? value : undefined;
}

function toDiagramEdgeCorner(value: unknown): DiagramEdgeCorner | undefined {
  return value === "rounded" || value === "square" ? value : undefined;
}

function toDiagramEdgeEnd(value: unknown): DiagramEdgeEnd | undefined {
  return value === "none" || value === "arrow" ? value : undefined;
}

function toDiagramEdgeWidth(value: unknown): DiagramEdgeWidth | undefined {
  return value === "thin" || value === "medium" || value === "thick" ? value : undefined;
}
