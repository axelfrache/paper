import { useEffect, useMemo, useRef, useState } from "react";
import type {
  KeyboardEvent as ReactKeyboardEvent,
  PointerEvent as ReactPointerEvent,
} from "react";
import {
  forceCenter,
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
} from "d3-force";
import type { Simulation, SimulationNodeDatum } from "d3-force";
import {
  Crosshair,
  Maximize,
  Minimize,
  Minus,
  PanelLeftOpen,
  Plus,
  Scan,
} from "lucide-react";
import { GraphExplorerControls } from "./GraphExplorerControls";
import {
  defaultGraphFilters,
  graphNeighbors,
  neighborhood,
  visibleGraphIds,
} from "../lib/graphExploration";
import { folderColors } from "./FolderDialog";
import { buildNoteGraph, colorForTag } from "../lib/noteGraph";
import type { NoteGraphNode } from "../lib/noteGraph";
import type { Folder, Note } from "../types/note";

type SimNode = NoteGraphNode & SimulationNodeDatum;
type SimLink = {
  id: string;
  source: string | SimNode;
  target: string | SimNode;
};

type GraphViewProps = {
  sidebarHidden: boolean;
  onToggleSidebar: () => void;
  notes: Note[];
  folders: Folder[];
  activeId: string | null;
  onSelect: (note: Note, extend: boolean) => void;
  onResizeStart: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onResizeBy: (delta: number) => void;
};

const minZoom = 0.02;
const maxZoom = 3;

function edgeId(source: string, target: string) {
  return [source, target].sort().join("\u0000");
}

export function GraphView({
  sidebarHidden,
  onToggleSidebar,
  notes,
  folders,
  activeId,
  onSelect,
  onResizeStart,
  onResizeBy,
}: GraphViewProps) {
  const [filters, setFilters] = useState(defaultGraphFilters);
  const [exploredId, setExploredId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [keyboardId, setKeyboardId] = useState<string | null>(null);
  const [locateRequest, setLocateRequest] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const sectionRef = useRef<HTMLElement | null>(null);
  const expandButtonRef = useRef<HTMLButtonElement | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  const savedViewRef = useRef<{
    view: { x: number; y: number; k: number };
    size: { width: number; height: number };
  } | null>(null);
  const [colorBy, setColorBy] = useState<"folder" | "tag">("folder");
  const [view, setView] = useState({ x: 0, y: 0, k: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;

  const svgRef = useRef<SVGSVGElement | null>(null);
  const simulationRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const nodesRef = useRef<SimNode[]>([]);
  const edgesRef = useRef<SimLink[]>([]);
  const nodeElsRef = useRef(new Map<string, SVGGElement>());
  const edgeElsRef = useRef(new Map<string, SVGLineElement>());
  const signatureRef = useRef("");
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const pointersRef = useRef(new Map<number, { x: number; y: number }>());
  const dragRef = useRef<{
    id: number;
    node?: SimNode;
    start: { x: number; y: number };
    moved: boolean;
  } | null>(null);
  const pinchRef = useRef<{
    distance: number;
    x: number;
    y: number;
    view: typeof view;
  } | null>(null);

  const graph = useMemo(() => buildNoteGraph(notes), [notes]);
  const lookupById = useMemo(
    () => new Map(notes.map((note) => [note.id, note])),
    [notes],
  );

  const neighbors = useMemo(() => graphNeighbors(graph), [graph]);
  const anchorId =
    exploredId && lookupById.has(exploredId) ? exploredId : activeId;
  const anchor = graph.nodes.find((node) => node.id === anchorId);
  const visibleIds = useMemo(
    () => visibleGraphIds(graph, neighbors, filters, anchorId),
    [graph, neighbors, filters, anchorId],
  );
  const visibleNodes = graph.nodes.filter((node) => visibleIds.has(node.id));
  const visibleEdges = graph.edges.filter(
    (edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target),
  );
  const candidateHighlight = hoveredId ?? keyboardId ?? anchorId;
  const highlightedId =
    candidateHighlight && visibleIds.has(candidateHighlight)
      ? candidateHighlight
      : null;
  const highlightedIds = useMemo(
    () => neighborhood(neighbors, highlightedId, 1),
    [neighbors, highlightedId],
  );

  useEffect(() => {
    setExploredId(null);
  }, [activeId]);
  useEffect(() => {
    cancelGesture();
  }, [visibleIds]);
  useEffect(() => {
    if (!locateRequest || !visibleIds.has(locateRequest)) return;
    centerNode(locateRequest);
    focusNode(locateRequest);
    setLocateRequest(null);
  }, [locateRequest, visibleIds]);

  function selectGraphNote(note: Note) {
    setExploredId(note.id);
    onSelect(note, false);
  }

  useEffect(() => {
    const sim = forceSimulation<SimNode>([])
      .force("charge", forceManyBody<SimNode>().strength(-220))
      .force("collide", forceCollide<SimNode>(28))
      .force("center", forceCenter<SimNode>(0, 0))
      .on("tick", () => {
        for (const node of nodesRef.current) {
          const el = nodeElsRef.current.get(node.id);
          if (el && node.x != null && node.y != null) {
            el.setAttribute("transform", `translate(${node.x},${node.y})`);
          }
        }
        for (const edge of edgesRef.current) {
          const el = edgeElsRef.current.get(edge.id);
          const source = edge.source as SimNode;
          const target = edge.target as SimNode;
          if (
            el &&
            source.x != null &&
            source.y != null &&
            target.x != null &&
            target.y != null
          ) {
            el.setAttribute("x1", String(source.x));
            el.setAttribute("y1", String(source.y));
            el.setAttribute("x2", String(target.x));
            el.setAttribute("y2", String(target.y));
          }
        }
      });
    simulationRef.current = sim;
    return () => {
      sim.stop();
      simulationRef.current = null;
      signatureRef.current = "";
    };
  }, []);

  useEffect(() => {
    const metadata = new Map(graph.nodes.map((node) => [node.id, node]));
    for (const node of nodesRef.current) {
      const current = metadata.get(node.id);
      if (current) Object.assign(node, current);
    }
    if (signatureRef.current === graph.signature) return;
    cancelGesture();
    signatureRef.current = graph.signature;

    const existingById = new Map(
      nodesRef.current.map((node) => [node.id, node]),
    );
    const width = svgRef.current?.clientWidth || 600;
    const height = svgRef.current?.clientHeight || 400;
    const mergedNodes: SimNode[] = graph.nodes.map((node) => {
      const existing = existingById.get(node.id);
      if (existing) {
        existing.title = node.title;
        existing.folderId = node.folderId;
        existing.tags = node.tags;
        return existing;
      }
      return {
        ...node,
        x: width / 2 + (Math.random() - 0.5) * 40,
        y: height / 2 + (Math.random() - 0.5) * 40,
      };
    });
    nodesRef.current = mergedNodes;
    edgesRef.current = graph.edges.map((edge) => ({
      id: edgeId(edge.source, edge.target),
      source: edge.source,
      target: edge.target,
    }));

    const sim = simulationRef.current;
    if (!sim) return;
    sim.force("link", null);
    sim.nodes(mergedNodes);
    sim.force(
      "link",
      forceLink<SimNode, SimLink>(edgesRef.current)
        .id((node) => node.id)
        .distance(80),
    );
    sim.alpha(0.3).restart();
  }, [graph]);

  useEffect(() => {
    const container = svgRef.current;
    if (!container) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const { width, height } = entry.contentRect;
      if (width <= 0 || height <= 0) return;
      const previous = sizeRef.current;
      if (previous.width !== width || previous.height !== height)
        cancelGesture();
      if (previous.width && previous.height) {
        setView((current) => ({
          ...current,
          x: current.x + (width - previous.width) / 2,
          y: current.y + (height - previous.height) / 2,
        }));
      } else {
        simulationRef.current?.force(
          "center",
          forceCenter<SimNode>(width / 2, height / 2),
        );
      }
      sizeRef.current = { width, height };
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  function closeExpanded() {
    cancelGesture();
    const saved = savedViewRef.current;
    if (saved) {
      setView(saved.view);
      viewRef.current = saved.view;
      sizeRef.current = saved.size;
    }
    setExpanded(false);
    expandButtonRef.current?.focus();
  }

  useEffect(() => {
    if (!expanded) return;
    const section = sectionRef.current;
    if (!section) return;
    const siblings = Array.from(section.parentElement?.children ?? []).filter(
      (el): el is HTMLElement => el instanceof HTMLElement && el !== section,
    );
    const previousInert = siblings.map((el) => el.inert);
    siblings.forEach((el) => {
      el.inert = true;
    });
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    expandButtonRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (section.querySelector(".graph-overlay[open]")) return;
      if (event.key === "Escape") {
        if (
          event.target instanceof HTMLInputElement &&
          event.target.type === "search" &&
          section.querySelector(".graph-search-results")
        )
          return;
        event.preventDefault();
        event.stopImmediatePropagation();
        closeExpanded();
      } else if (event.key === "Tab") {
        const buttons = Array.from(
          section.querySelectorAll<HTMLElement | SVGElement>(
            'button:not(:disabled), input:not(:disabled), select:not(:disabled), summary, [tabindex="0"]',
          ),
        );
        const first = buttons[0];
        const last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last?.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first?.focus();
        }
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      siblings.forEach((el, index) => {
        el.inert = previousInert[index];
      });
      document.body.style.overflow = previousOverflow;
    };
  }, [expanded]);

  function zoomTo(scale: number, anchor?: { x: number; y: number }) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height) return;
    const point = anchor ?? { x: rect.width / 2, y: rect.height / 2 };
    const current = viewRef.current;
    const k = Math.min(maxZoom, Math.max(minZoom, scale));
    const next = {
      x: point.x - ((point.x - current.x) * k) / current.k,
      y: point.y - ((point.y - current.y) * k) / current.k,
      k,
    };
    viewRef.current = next;
    setView(next);
  }

  function fitGraph() {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect?.width || !rect.height || !nodesRef.current.length) return;
    const sim = simulationRef.current;
    sim?.stop();
    sim?.on("tick")?.call(sim);
    let left = Infinity,
      top = Infinity,
      right = -Infinity,
      bottom = -Infinity;
    for (const node of nodesRef.current) {
      if (!visibleIds.has(node.id)) continue;
      if (node.x == null || node.y == null) continue;
      const el = nodeElsRef.current.get(node.id);
      const box = el?.getBBox();
      left = Math.min(left, node.x + (box?.x ?? -12));
      right = Math.max(right, node.x + (box ? box.x + box.width : 12));
      top = Math.min(top, node.y + (box?.y ?? -12));
      bottom = Math.max(bottom, node.y + (box ? box.y + box.height : 26));
    }
    if (!Number.isFinite(left)) return;
    const k = Math.min(
      maxZoom,
      Math.max(
        0.001,
        Math.min(
          Math.max(1, rect.width - 64) / Math.max(1, right - left),
          Math.max(1, rect.height - 64) / Math.max(1, bottom - top),
        ),
      ),
    );
    const next = {
      x: rect.width / 2 - ((left + right) / 2) * k,
      y: rect.height / 2 - ((top + bottom) / 2) * k,
      k,
    };
    viewRef.current = next;
    setView(next);
  }

  function centerActive() {
    if (activeId) centerNode(activeId);
  }

  function centerNode(id: string) {
    if (!visibleIds.has(id)) return;
    const node = nodesRef.current.find((candidate) => candidate.id === id);
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect || node?.x == null || node.y == null) return;
    const k = viewRef.current.k;
    const next = {
      x: rect.width / 2 - node.x * k,
      y: rect.height / 2 - node.y * k,
      k,
    };
    viewRef.current = next;
    setView(next);
  }

  function registerNodeEl(id: string, el: SVGGElement | null) {
    if (el) nodeElsRef.current.set(id, el);
    else nodeElsRef.current.delete(id);
  }

  function registerEdgeEl(id: string, el: SVGLineElement | null) {
    if (el) edgeElsRef.current.set(id, el);
    else edgeElsRef.current.delete(id);
  }

  function colorFor(node: NoteGraphNode) {
    if (colorBy === "folder") {
      const folder = folders.find(
        (candidate) => candidate.id === node.folderId,
      );
      return folder
        ? (folderColors[folder.color] ?? folderColors.slate)
        : folderColors.slate;
    }
    const tag = node.tags[0];
    return tag ? colorForTag(tag) : folderColors.slate;
  }

  function clientToGraphPoint(clientX: number, clientY: number) {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    const { x, y, k } = viewRef.current;
    return {
      x: (clientX - rect.left - x) / k,
      y: (clientY - rect.top - y) / k,
    };
  }

  function handleWheel(event: WheelEvent) {
    event.preventDefault();
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = event.clientX - rect.left;
    const mouseY = event.clientY - rect.top;
    const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1;
    zoomTo(viewRef.current.k * factor, { x: mouseX, y: mouseY });
  }

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    svg.addEventListener("wheel", handleWheel, { passive: false });
    return () => svg.removeEventListener("wheel", handleWheel);
  }, []);

  function releaseDrag() {
    const node = dragRef.current?.node;
    if (node) {
      node.fx = null;
      node.fy = null;
    }
    dragRef.current = null;
    simulationRef.current?.alphaTarget(0);
  }

  function cancelGesture() {
    releaseDrag();
    const ids = [...pointersRef.current.keys()];
    pointersRef.current.clear();
    pinchRef.current = null;
    for (const id of ids) {
      if (svgRef.current?.hasPointerCapture?.(id))
        svgRef.current.releasePointerCapture(id);
    }
  }

  useEffect(() => {
    window.addEventListener("blur", cancelGesture);
    return () => {
      window.removeEventListener("blur", cancelGesture);
      cancelGesture();
    };
  }, []);

  function beginPinch() {
    const [a, b] = [...pointersRef.current.values()];
    if (!a || !b) return;
    releaseDrag();
    pinchRef.current = {
      distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
      x: (a.x + b.x) / 2,
      y: (a.y + b.y) / 2,
      view: { ...viewRef.current },
    };
  }

  function handlePointerDown(event: ReactPointerEvent<SVGSVGElement>) {
    if (event.button !== 0 || pointersRef.current.size >= 2) return;
    event.preventDefault();
    const svg = event.currentTarget;
    svg.setPointerCapture?.(event.pointerId);
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    if (pointersRef.current.size === 2) {
      beginPinch();
      return;
    }
    const el =
      event.target instanceof Element
        ? event.target.closest<SVGGElement>(".graph-node")
        : null;
    const node = nodesRef.current.find(
      (candidate) => candidate.id === el?.dataset.noteId,
    );
    if (el) el.focus();
    else svg.focus();
    dragRef.current = {
      id: event.pointerId,
      node,
      start: { x: event.clientX, y: event.clientY },
      moved: false,
    };
    if (node) {
      node.fx = node.x;
      node.fy = node.y;
      simulationRef.current?.alphaTarget(0.3).restart();
    }
  }

  function handlePointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const previous = pointersRef.current.get(event.pointerId);
    if (!previous) return;
    pointersRef.current.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });
    const pinch = pinchRef.current;
    if (pinch) {
      const [a, b] = [...pointersRef.current.values()];
      const rect = svgRef.current?.getBoundingClientRect();
      if (!a || !b || !rect) return;
      const k = Math.min(
        maxZoom,
        Math.max(
          minZoom,
          (pinch.view.k * Math.hypot(b.x - a.x, b.y - a.y)) / pinch.distance,
        ),
      );
      const next = {
        x:
          (a.x + b.x) / 2 -
          rect.left -
          ((pinch.x - rect.left - pinch.view.x) * k) / pinch.view.k,
        y:
          (a.y + b.y) / 2 -
          rect.top -
          ((pinch.y - rect.top - pinch.view.y) * k) / pinch.view.k,
        k,
      };
      viewRef.current = next;
      setView(next);
      return;
    }
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    if (
      Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y) > 4
    )
      drag.moved = true;
    if (drag.node && drag.moved) {
      const point = clientToGraphPoint(event.clientX, event.clientY);
      drag.node.fx = point.x;
      drag.node.fy = point.y;
    } else if (!drag.node) {
      const current = viewRef.current;
      const next = {
        ...current,
        x: current.x + event.clientX - previous.x,
        y: current.y + event.clientY - previous.y,
      };
      viewRef.current = next;
      setView(next);
    }
  }

  function handlePointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    if (!pointersRef.current.has(event.pointerId)) return;
    const drag = dragRef.current;
    const selected =
      !pinchRef.current &&
      drag?.id === event.pointerId &&
      !drag.moved &&
      Math.hypot(event.clientX - drag.start.x, event.clientY - drag.start.y) <=
        4
        ? drag.node?.id
        : undefined;
    pointersRef.current.delete(event.pointerId);
    releaseDrag();
    pinchRef.current = null;
    if (event.currentTarget.hasPointerCapture?.(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
    for (const [id, point] of pointersRef.current)
      dragRef.current = { id, start: point, moved: true };
    const note = selected ? lookupById.get(selected) : undefined;
    if (note) selectGraphNote(note);
  }

  function focusNode(id: string) {
    setFocusedId(id);
    nodeElsRef.current.get(id)?.focus();
    const node = nodesRef.current.find((item) => item.id === id);
    const rect = svgRef.current?.getBoundingClientRect();
    if (!node || node.x == null || node.y == null || !rect) return;
    const current = viewRef.current;
    const x = node.x * current.k + current.x,
      y = node.y * current.k + current.y;
    if (x < 24 || y < 24 || x > rect.width - 24 || y > rect.height - 24) {
      const next = {
        ...current,
        x: rect.width / 2 - node.x * current.k,
        y: rect.height / 2 - node.y * current.k,
      };
      viewRef.current = next;
      setView(next);
    }
  }

  function handleCanvasKey(event: ReactKeyboardEvent<SVGSVGElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === "+" || event.key === "=") zoomTo(viewRef.current.k * 1.2);
    else if (event.key === "-") zoomTo(viewRef.current.k / 1.2);
    else if (event.key === "0") zoomTo(1);
    else if (event.key === "Home") fitGraph();
    else if (event.key.toLowerCase() === "c") centerActive();
    else if (event.key.startsWith("Arrow")) {
      const current = viewRef.current;
      const next = {
        ...current,
        x:
          current.x +
          (event.key === "ArrowLeft"
            ? 40
            : event.key === "ArrowRight"
              ? -40
              : 0),
        y:
          current.y +
          (event.key === "ArrowUp" ? 40 : event.key === "ArrowDown" ? -40 : 0),
      };
      viewRef.current = next;
      setView(next);
    } else return;
    event.preventDefault();
    event.stopPropagation();
  }

  return (
    <section
      ref={sectionRef}
      className={`notes-column graph-view${expanded ? " is-expanded" : ""}`}
      role={expanded ? "dialog" : undefined}
      aria-modal={expanded || undefined}
      aria-label="Note graph"
    >
      <GraphExplorerControls
        navigation={
          sidebarHidden && !expanded ? (
            <button
              className="notes-brand"
              type="button"
              aria-label="Expand navigation"
              title="Expand navigation"
              onClick={onToggleSidebar}
            >
              <img
                className="brand-lockup brand-lockup-light"
                src="/paper-lockup.svg"
                alt="Paper"
              />
              <img
                className="brand-lockup brand-lockup-dark"
                src="/paper-lockup-dark.svg"
                alt="Paper"
              />
              <PanelLeftOpen size={15} strokeWidth={1.9} />
            </button>
          ) : null
        }
        heading={
          <div className="graph-toolbar">
            <span className="graph-heading">Graph</span>
            <div
              className="graph-color-toggle"
              role="group"
              aria-label="Color by"
            >
              <button
                type="button"
                aria-pressed={colorBy === "folder"}
                onClick={() => setColorBy("folder")}
              >
                Folder
              </button>
              <button
                type="button"
                aria-pressed={colorBy === "tag"}
                onClick={() => setColorBy("tag")}
              >
                Tag
              </button>
            </div>
            <button
              ref={expandButtonRef}
              className="graph-control"
              type="button"
              aria-label={expanded ? "Restore graph" : "Expand graph"}
              title={expanded ? "Restore graph (Esc)" : "Expand graph"}
              aria-expanded={expanded}
              onClick={() => {
                if (expanded) closeExpanded();
                else {
                  cancelGesture();
                  savedViewRef.current = {
                    view: { ...viewRef.current },
                    size: { ...sizeRef.current },
                  };
                  setExpanded(true);
                }
              }}
            >
              {expanded ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
          </div>
        }
        nodes={graph.nodes}
        folders={folders}
        filters={filters}
        onFilters={setFilters}
        onLocate={(id) => {
          setExploredId(id);
          setFilters((current) => ({
            ...defaultGraphFilters,
            depth: current.depth,
          }));
          setLocateRequest(id);
        }}
        anchor={anchor}
        visibleCount={visibleNodes.length}
        edgeCount={visibleEdges.length}
        colorBy={colorBy}
        issues={graph.issues}
        onOpenNote={(id) => {
          const note = lookupById.get(id);
          if (note) selectGraphNote(note);
        }}
      />
      {!visibleNodes.length && (
        <div className="graph-empty" role="status">
          <strong>
            {graph.nodes.length
              ? "No notes match this view"
              : "Your graph starts with a note"}
          </strong>
          <p>
            {graph.nodes.length
              ? "Try another folder, tag or local view, or show notes without links."
              : "Create a note, then use [[Note title]] to connect it to another note."}
          </p>
          {!!graph.nodes.length && (
            <button
              type="button"
              onClick={() => setFilters(defaultGraphFilters)}
            >
              Show all notes
            </button>
          )}
        </div>
      )}
      <svg
        ref={svgRef}
        className="graph-canvas"
        tabIndex={0}
        role="group"
        aria-label="Note graph. Arrow keys pan, plus and minus zoom, Home fits all notes, 0 resets zoom, C centers the active note."
        onKeyDown={handleCanvasKey}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={cancelGesture}
        onLostPointerCapture={(event) => {
          if (pointersRef.current.has(event.pointerId)) cancelGesture();
        }}
      >
        <g transform={`translate(${view.x},${view.y}) scale(${view.k})`}>
          <g className="graph-edges">
            {graph.edges.map((edge) => {
              const id = edgeId(edge.source, edge.target);
              return (
                <line
                  key={id}
                  ref={(el) => registerEdgeEl(id, el)}
                  style={{
                    display:
                      visibleIds.has(edge.source) && visibleIds.has(edge.target)
                        ? undefined
                        : "none",
                  }}
                  className={`graph-edge${highlightedId ? (edge.source === highlightedId || edge.target === highlightedId ? " is-highlighted" : " is-dimmed") : ""}`}
                />
              );
            })}
          </g>
          <g className="graph-nodes">
            {graph.nodes.map((node) => (
              <g
                key={node.id}
                ref={(el) => registerNodeEl(node.id, el)}
                style={{
                  display: visibleIds.has(node.id) ? undefined : "none",
                }}
                className={`graph-node${node.id === activeId ? " is-active" : ""}${node.id === anchorId ? " is-explored" : ""}${highlightedId && !highlightedIds.has(node.id) ? " is-dimmed" : ""}`}
                onPointerEnter={(event) => {
                  if (event.pointerType !== "touch") setHoveredId(node.id);
                }}
                onPointerLeave={() => setHoveredId(null)}
                data-note-id={node.id}
                role="button"
                aria-label={`Open note: ${node.title || "Untitled"}`}
                aria-current={node.id === activeId ? "true" : undefined}
                tabIndex={
                  visibleIds.has(node.id) &&
                  node.id ===
                    (visibleIds.has(focusedId ?? "")
                      ? focusedId
                      : visibleIds.has(anchorId ?? "")
                        ? anchorId
                        : visibleNodes[0]?.id)
                    ? 0
                    : -1
                }
                onFocus={() => {
                  setFocusedId(node.id);
                  setKeyboardId(node.id);
                }}
                onBlur={() => setKeyboardId(null)}
                onClick={(event) => {
                  if (event.detail === 0) {
                    const note = lookupById.get(node.id);
                    if (note) selectGraphNote(note);
                  }
                }}
                onKeyDown={(event) => {
                  if (event.altKey || event.ctrlKey || event.metaKey) return;
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    event.stopPropagation();
                    const note = lookupById.get(node.id);
                    if (note) selectGraphNote(note);
                  } else if (
                    [
                      "ArrowLeft",
                      "ArrowRight",
                      "ArrowUp",
                      "ArrowDown",
                      "Home",
                      "End",
                    ].includes(event.key)
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                    const index = visibleNodes.findIndex(
                      (item) => item.id === node.id,
                    );
                    const next =
                      event.key === "Home"
                        ? 0
                        : event.key === "End"
                          ? visibleNodes.length - 1
                          : (index +
                              (event.key === "ArrowLeft" ||
                              event.key === "ArrowUp"
                                ? -1
                                : 1) +
                              visibleNodes.length) %
                            visibleNodes.length;
                    focusNode(visibleNodes[next].id);
                  }
                }}
              >
                <circle r={10} fill={colorFor(node)} />
                <title>{node.title || "Untitled"}</title>
                <text
                  className={
                    node.id === highlightedId ||
                    node.id === activeId ||
                    node.id === anchorId
                      ? "graph-label is-priority"
                      : "graph-label"
                  }
                  style={{
                    display:
                      view.k >= 0.7 ||
                      node.id === highlightedId ||
                      node.id === activeId ||
                      node.id === anchorId
                        ? undefined
                        : "none",
                    fontSize:
                      node.id === highlightedId ||
                      node.id === activeId ||
                      node.id === anchorId
                        ? 11 / view.k
                        : undefined,
                  }}
                  dy={
                    node.id === highlightedId ||
                    node.id === activeId ||
                    node.id === anchorId
                      ? 12 + 12 / view.k
                      : 22
                  }
                  textAnchor="middle"
                >
                  {(node.title || "Untitled").length > (view.k >= 1.3 ? 50 : 28)
                    ? (node.title || "Untitled").slice(
                        0,
                        view.k >= 1.3 ? 49 : 27,
                      ) + "…"
                    : node.title || "Untitled"}
                </text>
              </g>
            ))}
          </g>
        </g>
      </svg>
      <div
        className="graph-navigation"
        role="group"
        aria-label="Graph navigation"
      >
        <button
          className="graph-control"
          type="button"
          aria-label="Zoom out"
          title="Zoom out"
          disabled={view.k <= minZoom}
          onClick={() => zoomTo(viewRef.current.k / 1.2)}
        >
          <Minus size={16} />
        </button>
        <button
          className="graph-control graph-zoom-value"
          type="button"
          aria-label="Reset zoom to 100%"
          title="Reset zoom to 100%"
          onClick={() => zoomTo(1)}
        >
          {Math.round(view.k * 100)}%
        </button>
        <button
          className="graph-control"
          type="button"
          aria-label="Zoom in"
          title="Zoom in"
          disabled={view.k >= maxZoom}
          onClick={() => zoomTo(viewRef.current.k * 1.2)}
        >
          <Plus size={16} />
        </button>
        <span className="graph-control-divider" />
        <button
          className="graph-control"
          type="button"
          aria-label="Fit all notes"
          title="Fit all notes"
          disabled={!visibleNodes.length}
          onClick={fitGraph}
        >
          <Scan size={16} />
        </button>
        <button
          className="graph-control"
          type="button"
          aria-label="Center active note"
          title="Center active note"
          disabled={!activeId || !visibleIds.has(activeId)}
          onClick={centerActive}
        >
          <Crosshair size={16} />
        </button>
      </div>
      {!expanded && (
        <div
          className="column-resize-handle"
          role="separator"
          aria-label="Resize graph view"
          aria-orientation="vertical"
          tabIndex={0}
          onPointerDown={onResizeStart}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
              event.preventDefault();
              onResizeBy(event.key === "ArrowLeft" ? -10 : 10);
            }
          }}
        />
      )}
    </section>
  );
}
