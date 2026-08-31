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
    "Prefer a left-to-right flow: clients and external entrypoints on the left, gateways near the center, services in the middle, data stores and queues on the right or below their owning service.",
    mode === "iso"
      ? "Keep related nodes adjacent. Avoid layouts that make arrows cross. Use direct straight arrows only."
      : "Keep related nodes adjacent. Avoid layouts that make arrows cross. Use straight arrows for simple left-to-right relationships and orthogonal arrows for branching relationships.",
    "Order the nodes array by visual flow from left to right, then top to bottom.",
    "",
    "Schema:",
    `{"nodes":[{"id":"n1","kind":"client","label":"Client","color":"slate"}],"edges":[{"from":"n1","to":"n2","color":"slate","dashed":false}]}`,
    "",
    `Diagram mode: ${mode}`,
    `Allowed node kinds: ${allowedDiagramKinds}`,
    `Allowed node colors: ${colors.join(", ")}`,
    "Generated edges must use color slate. Keep visual emphasis on nodes, not relationships.",
    edgeRouteInstruction(mode),
    "Allowed edge ends: none, arrow",
    "",
    current ? "Existing diagram, for context only. Replace it with the generated result:" : "No existing diagram.",
    current ? describeDiagram(current) : "",
    "",
    "User request:",
    prompt,
  ].join("\n");
}

export function buildDiagramAdditionPrompt(prompt: string, current: Diagram) {
  return [
    "Add to the existing Paper diagram from the user request.",
    "Return only valid JSON. Do not include markdown fences, explanations, or prose.",
    "Return only the new nodes to add. Do not recreate existing nodes.",
    "Edges may connect new nodes to existing nodes by using existing node ids.",
    "If the user asks to connect something to an existing element, reuse that existing element id in edges instead of creating a duplicate node.",
    current.mode === "iso"
      ? "Keep added nodes close to the existing nodes they connect to. Use direct straight arrows only."
      : "Keep added nodes close to the existing nodes they connect to. Avoid layouts that make arrows cross.",
    "",
    "Schema:",
    `{"nodes":[{"id":"new_database","kind":"postgresql","label":"Database","color":"green"}],"edges":[{"from":"new_database","to":"existing_cluster_id","color":"green","dashed":false}]}`,
    "",
    `Diagram mode: ${current.mode}`,
    `Allowed node kinds: ${allowedDiagramKinds}`,
    `Allowed node colors: ${colors.join(", ")}`,
    "Generated edges must use color slate. Keep visual emphasis on nodes, not relationships.",
    edgeRouteInstruction(current.mode),
    "Allowed edge ends: none, arrow",
    "",
    "Existing diagram:",
    describeDiagram(current),
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
        color: generatedEdgeColor(),
        route: toDiagramEdgeRoute(item.route, mode),
        corner: toDiagramEdgeCorner(item.corner),
        dashed: item.dashed === true ? true : undefined,
        start: toDiagramEdgeEnd(item.start),
        end: toDiagramEdgeEnd(item.end),
        width: toDiagramEdgeWidth(item.width),
      },
    ];
  });

  return { version: 1, mode, nodes: arrangeGeneratedNodes(nodes, edges, mode), edges };
}

export function addGeneratedDiagram(answer: string, current: Diagram) {
  const payload = JSON.parse(extractJson(answer)) as { nodes?: unknown; edges?: unknown };
  const sourceNodes = Array.isArray(payload.nodes) ? payload.nodes : [];
  const sourceEdges = Array.isArray(payload.edges) ? payload.edges : [];
  const currentNodeIds = new Set(current.nodes.map((node) => node.id));
  const usedNodeIds = new Set(currentNodeIds);
  const nodeIdMap = new Map(current.nodes.map((node) => [node.id, node.id]));
  let addedNodeIndex = 0;

  const nodes = sourceNodes.flatMap((source, index): DiagramNode[] => {
    const item = source && typeof source === "object" ? (source as Record<string, unknown>) : {};
    const originalId = typeof item.id === "string" && item.id.trim() ? item.id.trim() : `n${index + 1}`;
    if (currentNodeIds.has(originalId)) {
      nodeIdMap.set(originalId, originalId);
      return [];
    }
    const id = uniqueGeneratedId(originalId, usedNodeIds);
    const kind = toDiagramKind(item.kind);
    const node = createDiagramNode(kind, appendPoint(current, addedNodeIndex), toDiagramColor(item.color));
    addedNodeIndex += 1;
    nodeIdMap.set(originalId, id);
    return [generatedNodeFromPayload(node, id, kind, item)];
  });

  const usedEdgeIds = new Set(current.edges.map((edge) => edge.id));
  const existingPairs = new Set(current.edges.map(edgeKey));
  const edges = sourceEdges.flatMap((source, index): DiagramEdge[] => {
    const item = source && typeof source === "object" ? (source as Record<string, unknown>) : {};
    const from = typeof item.from === "string" ? nodeIdMap.get(item.from) : undefined;
    const to = typeof item.to === "string" ? nodeIdMap.get(item.to) : undefined;
    if (!from || !to || from === to) {
      return [];
    }
    const edge: DiagramEdge = {
      id: uniqueGeneratedId(typeof item.id === "string" ? item.id : `e${index + 1}`, usedEdgeIds),
      from,
      to,
      color: generatedEdgeColor(),
      route: toDiagramEdgeRoute(item.route, current.mode),
      corner: toDiagramEdgeCorner(item.corner),
      dashed: item.dashed === true ? true : undefined,
      start: toDiagramEdgeEnd(item.start),
      end: toDiagramEdgeEnd(item.end),
      width: toDiagramEdgeWidth(item.width),
    };
    const key = edgeKey(edge);
    if (existingPairs.has(key)) {
      return [];
    }
    existingPairs.add(key);
    return [edge];
  });

  if (!nodes.length && !edges.length) {
    throw new Error("The AI response did not include anything to add.");
  }

  const arranged = arrangeAddedNodes(current, nodes, edges);
  return {
    diagram: {
      ...current,
      nodes: [...current.nodes, ...arranged],
      edges: [...current.edges, ...edges],
    },
    addedNodeIds: arranged.map((node) => node.id),
    addedEdgeIds: edges.map((edge) => edge.id),
  };
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

function appendPoint(current: Diagram, index: number) {
  if (!current.nodes.length) {
    return { x: 100 + index * 210, y: 120 };
  }
  const right = Math.max(...current.nodes.map((node) => node.x + (diagramKinds[node.kind] ?? diagramKinds.box).w));
  const top = Math.min(...current.nodes.map((node) => node.y));
  return { x: right + 190 + index * 110, y: top + 70 + index * 34 };
}

function arrangeAddedNodes(current: Diagram, nodes: DiagramNode[], edges: DiagramEdge[]) {
  if (!nodes.length) {
    return nodes;
  }

  const currentById = new Map(current.nodes.map((node) => [node.id, node]));
  const addedById = new Map(nodes.map((node) => [node.id, node]));
  const usedSlots = new Set<string>();
  const spacingX = current.mode === "iso" ? 245 : 235;
  const spacingY = current.mode === "iso" ? 160 : 140;
  const orphanOrigin = appendPoint(current, 0);

  return nodes.map((node, index) => {
    const anchors = edges.flatMap((edge) => {
      if (edge.to === node.id) {
        const anchor = currentById.get(edge.from);
        return anchor ? [{ node: anchor, direction: 1 }] : [];
      }
      if (edge.from === node.id) {
        const anchor = currentById.get(edge.to);
        return anchor ? [{ node: anchor, direction: -1 }] : [];
      }
      return [];
    });
    const def = diagramKinds[node.kind] ?? diagramKinds.box;
    const relatedAdded = edges.flatMap((edge) => {
      if (edge.to === node.id) {
        return addedById.get(edge.from) ? [addedById.get(edge.from)!] : [];
      }
      if (edge.from === node.id) {
        return addedById.get(edge.to) ? [addedById.get(edge.to)!] : [];
      }
      return [];
    });
    const base =
      anchors.length > 0
        ? averageAnchor(anchors, spacingX)
        : relatedAdded.length > 0
          ? { x: relatedAdded[0].x + spacingX, y: relatedAdded[0].y }
          : { x: orphanOrigin.x + index * 120, y: orphanOrigin.y + index * 34 };
    const slot = freeSlot(base, spacingY, usedSlots);
    return {
      ...node,
      x: Math.round(slot.x - def.w / 2),
      y: Math.round(slot.y - def.h / 2),
    };
  });
}

function averageAnchor(anchors: Array<{ node: DiagramNode; direction: number }>, spacingX: number) {
  const points = anchors.map((anchor) => {
    const def = diagramKinds[anchor.node.kind] ?? diagramKinds.box;
    return {
      x: anchor.node.x + def.w / 2 + anchor.direction * spacingX,
      y: anchor.node.y + def.h / 2,
    };
  });
  return {
    x: points.reduce((sum, point) => sum + point.x, 0) / points.length,
    y: points.reduce((sum, point) => sum + point.y, 0) / points.length,
  };
}

function freeSlot(point: { x: number; y: number }, spacingY: number, usedSlots: Set<string>) {
  let candidate = { ...point };
  let index = 0;
  while (usedSlots.has(slotKey(candidate))) {
    index += 1;
    const direction = index % 2 === 0 ? -1 : 1;
    candidate = { x: point.x, y: point.y + direction * Math.ceil(index / 2) * spacingY };
  }
  usedSlots.add(slotKey(candidate));
  return candidate;
}

function slotKey(point: { x: number; y: number }) {
  return `${Math.round(point.x / 20)}:${Math.round(point.y / 20)}`;
}

function arrangeGeneratedNodes(nodes: DiagramNode[], edges: DiagramEdge[], mode: DiagramMode) {
  if (nodes.length < 2) {
    return nodes;
  }

  const originalIndex = new Map(nodes.map((node, index) => [node.id, index]));
  const ids = new Set(nodes.map((node) => node.id));
  const layers = new Map(nodes.map((node) => [node.id, 0]));
  for (let pass = 0; pass < nodes.length; pass += 1) {
    let changed = false;
    for (const edge of edges) {
      if (!ids.has(edge.from) || !ids.has(edge.to)) {
        continue;
      }
      const next = Math.min(nodes.length - 1, (layers.get(edge.from) ?? 0) + 1);
      if (next > (layers.get(edge.to) ?? 0)) {
        layers.set(edge.to, next);
        changed = true;
      }
    }
    if (!changed) {
      break;
    }
  }

  const incoming = relationMap(edges, "to", "from");
  const outgoing = relationMap(edges, "from", "to");
  const groups = groupedByLayer(nodes, layers);
  const ordered = new Map<string, number>();
  const columns = [...groups.keys()].sort((a, b) => a - b);

  for (const column of columns) {
    const previous = groups.get(column - 1) ?? [];
    const previousOrder = new Map(previous.map((node, index) => [node.id, ordered.get(node.id) ?? index]));
    groups.set(column, sortLayer(groups.get(column) ?? [], incoming, previousOrder, originalIndex));
    groups.get(column)?.forEach((node, index) => ordered.set(node.id, index));
  }

  for (const column of columns.slice().reverse()) {
    const next = groups.get(column + 1) ?? [];
    const nextOrder = new Map(next.map((node, index) => [node.id, ordered.get(node.id) ?? index]));
    groups.set(column, sortLayer(groups.get(column) ?? [], outgoing, nextOrder, originalIndex));
    groups.get(column)?.forEach((node, index) => ordered.set(node.id, index));
  }

  const spacingX = mode === "iso" ? 245 : 235;
  const spacingY = mode === "iso" ? 170 : 150;
  const origin = { x: 100, y: 120 };
  const maxRows = Math.max(...Array.from(groups.values(), (group) => group.length));

  return nodes.map((node) => {
    const layer = layers.get(node.id) ?? 0;
    const row = ordered.get(node.id) ?? 0;
    const groupRows = groups.get(layer)?.length ?? 1;
    const yOffset = ((maxRows - groupRows) * spacingY) / 2;
    const def = diagramKinds[node.kind] ?? diagramKinds.box;
    return {
      ...node,
      x: Math.round(origin.x + layer * spacingX - def.w / 2),
      y: Math.round(origin.y + yOffset + row * spacingY - def.h / 2),
    };
  });
}

function edgeKey(edge: Pick<DiagramEdge, "from" | "to" | "color" | "dashed" | "start" | "end">) {
  return [edge.from, edge.to, edge.color, edge.dashed === true, edge.start ?? "none", edge.end ?? "arrow"].join(":");
}

function relationMap(edges: DiagramEdge[], key: "from" | "to", value: "from" | "to") {
  const map = new Map<string, string[]>();
  for (const edge of edges) {
    const entries = map.get(edge[key]) ?? [];
    entries.push(edge[value]);
    map.set(edge[key], entries);
  }
  return map;
}

function groupedByLayer(nodes: DiagramNode[], layers: Map<string, number>) {
  const groups = new Map<number, DiagramNode[]>();
  for (const node of nodes) {
    const layer = layers.get(node.id) ?? 0;
    const group = groups.get(layer) ?? [];
    group.push(node);
    groups.set(layer, group);
  }
  return groups;
}

function sortLayer(
  nodes: DiagramNode[],
  relations: Map<string, string[]>,
  adjacentOrder: Map<string, number>,
  originalIndex: Map<string, number>,
) {
  return nodes.slice().sort((a, b) => {
    const aScore = barycenter(relations.get(a.id) ?? [], adjacentOrder);
    const bScore = barycenter(relations.get(b.id) ?? [], adjacentOrder);
    if (aScore === bScore) {
      return (originalIndex.get(a.id) ?? 0) - (originalIndex.get(b.id) ?? 0);
    }
    return aScore - bScore;
  });
}

function barycenter(ids: string[], order: Map<string, number>) {
  const values = ids.map((id) => order.get(id)).filter((value): value is number => typeof value === "number");
  if (!values.length) {
    return Number.POSITIVE_INFINITY;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
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

function generatedEdgeColor(): DiagramColor {
  return "slate";
}

function edgeRouteInstruction(mode: DiagramMode) {
  return mode === "iso" ? "Allowed edge routes: straight. Every edge must use route straight." : "Allowed edge routes: straight, curved, orthogonal";
}

function toDiagramEdgeRoute(value: unknown, mode: DiagramMode): DiagramEdgeRoute | undefined {
  if (mode === "iso") {
    return "straight";
  }
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
