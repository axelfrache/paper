import type { NoteGraph } from "./noteGraph";

export function graphNeighbors(graph: Pick<NoteGraph, "nodes" | "edges">) {
  const neighbors = new Map(
    graph.nodes.map((node) => [node.id, new Set<string>()]),
  );
  for (const edge of graph.edges) {
    neighbors.get(edge.source)?.add(edge.target);
    neighbors.get(edge.target)?.add(edge.source);
  }
  return neighbors;
}

export function neighborhood(
  neighbors: Map<string, Set<string>>,
  root: string | null,
  depth: number,
) {
  const visited = new Set<string>();
  if (!root || !neighbors.has(root)) return visited;
  visited.add(root);
  let frontier = [root];
  for (let level = 0; level < depth; level += 1) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const neighbor of neighbors.get(id) ?? []) {
        if (!visited.has(neighbor)) {
          visited.add(neighbor);
          next.push(neighbor);
        }
      }
    }
    frontier = next;
  }
  return visited;
}

export type GraphFilters = {
  folders: (string | null)[];
  tags: (string | null)[];
  hideIsolated: boolean;
  depth: 0 | 1 | 2;
};
export const defaultGraphFilters: GraphFilters = {
  folders: [],
  tags: [],
  hideIsolated: false,
  depth: 0,
};

export function visibleGraphIds(
  graph: NoteGraph,
  neighbors: Map<string, Set<string>>,
  filters: GraphFilters,
  root: string | null,
) {
  const local = filters.depth
    ? neighborhood(neighbors, root, filters.depth)
    : null;
  const ids = new Set(
    graph.nodes
      .filter(
        (node) =>
          (!local || local.has(node.id)) &&
          (!filters.folders.length ||
            filters.folders.includes(node.folderId)) &&
          (!filters.tags.length ||
            filters.tags.some((tag) =>
              tag === null
                ? node.tags.length === 0
                : node.tags.some(
                    (value) => value.toLowerCase() === tag.toLowerCase(),
                  ),
            )),
      )
      .map((node) => node.id),
  );
  if (filters.hideIsolated) {
    const connected = new Set(
      graph.edges
        .filter((edge) => ids.has(edge.source) && ids.has(edge.target))
        .flatMap((edge) => [edge.source, edge.target]),
    );
    for (const id of ids) if (!connected.has(id)) ids.delete(id);
  }
  return ids;
}
