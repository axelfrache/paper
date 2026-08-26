import { useEffect, useRef, useState } from "react";
import { ArrowRight, Box, ChevronDown, Copy, Hand, Maximize, Minus, MousePointer2, Plus, Square, Trash2, Type } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  createDiagramEdge,
  createDiagramNode,
  describeDiagram,
  diagramIconForKind,
  diagramKinds,
  diagramPalette,
  duplicateDiagramNode,
  layoutDiagram,
  screenToDiagramPoint,
} from "../lib/diagram";
import { diagramIconCatalog, diagramIconMarkup } from "../lib/diagramIcons";
import type {
  Diagram,
  DiagramColor,
  DiagramEdge,
  DiagramEdgeCorner,
  DiagramEdgeEnd,
  DiagramEdgeRoute,
  DiagramEdgeWidth,
  DiagramKind,
  DiagramNode,
} from "../lib/diagram";
import type { DiagramIconKind } from "../lib/diagramIcons";

type DiagramTool = "select" | "pan" | "arrow" | DiagramKind;

type DiagramEditorProps = {
  diagram: Diagram;
  onChange: (diagram: Diagram) => void;
  onClose: () => void;
  onDescribe: (description: string) => void;
};

const tools: Array<{ id: DiagramTool; label: string; icon: LucideIcon }> = [
  { id: "select", label: "Select", icon: MousePointer2 },
  { id: "pan", label: "Move canvas", icon: Hand },
  { id: "arrow", label: "Arrow", icon: ArrowRight },
];

type ElementCatalogItem = {
  id: DiagramKind;
  label: string;
  group: string;
  icon?: LucideIcon;
  iconKind?: DiagramIconKind;
};

const elementCatalog: ElementCatalogItem[] = [
  { id: "box", label: "Box", group: "Basic", icon: Square },
  { id: "text", label: "Text", group: "Basic", icon: Type },
  { id: "service", label: "Service", group: "Compute", iconKind: "fn" },
  ...diagramIconCatalog.map((icon) => ({ id: icon.id, label: icon.label, group: icon.group, iconKind: icon.id })),
];

const groupedElementCatalog = elementCatalog.reduce<Array<{ group: string; items: ElementCatalogItem[] }>>((groups, item) => {
  const group = groups.find((entry) => entry.group === item.group);
  if (group) {
    group.items.push(item);
  } else {
    groups.push({ group: item.group, items: [item] });
  }
  return groups;
}, []);

const colors = Object.keys(diagramPalette) as DiagramColor[];
const iconSizes = [
  { label: "S", value: 32 },
  { label: "M", value: 44 },
  { label: "L", value: 60 },
];
const boxedIconSize = { w: 132, h: 86 };
const edgeRoutes: Array<{ label: string; value: DiagramEdgeRoute }> = [
  { label: "Direct", value: "straight" },
  { label: "Curve", value: "curved" },
  { label: "Elbow", value: "orthogonal" },
];
const edgeCorners: Array<{ label: string; value: DiagramEdgeCorner }> = [
  { label: "Square", value: "square" },
  { label: "Round", value: "rounded" },
];
const edgeWidths: Array<{ label: string; value: DiagramEdgeWidth }> = [
  { label: "Thin", value: "thin" },
  { label: "Medium", value: "medium" },
  { label: "Thick", value: "thick" },
];
const edgeEnds: Array<{ label: string; start?: DiagramEdgeEnd; end?: DiagramEdgeEnd }> = [
  { label: "None", end: "none" },
  { label: "End", end: "arrow" },
  { label: "Start", start: "arrow", end: "none" },
  { label: "Both", start: "arrow", end: "arrow" },
];
const minZoom = 0.25;
const maxZoom = 3;
const defaultViewport: EditorViewport = { x: -120, y: -120, width: 1040, height: 680 };

export function DiagramEditor({ diagram, onChange, onClose, onDescribe }: DiagramEditorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  const diagramRef = useRef(diagram);
  const clipboardRef = useRef<DiagramNode | null>(null);
  const layoutRef = useRef(layoutDiagram(diagram));
  const fitViewportRef = useRef(defaultViewport);
  const viewportRef = useRef(defaultViewport);
  const [tool, setTool] = useState<DiagramTool>("select");
  const [viewport, setViewportState] = useState(defaultViewport);
  const [liveDiagram, setLiveDiagram] = useState(diagram);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [elementMenuOpen, setElementMenuOpen] = useState(false);
  const [pendingFromId, setPendingFromId] = useState<string | null>(null);
  const [color, setColor] = useState<DiagramColor>("blue");
  const elementMenuRef = useRef<HTMLDivElement | null>(null);
  const layout = layoutDiagram(liveDiagram);
  layoutRef.current = layout;
  const selectedNode = liveDiagram.nodes.find((node) => node.id === selectedId) ?? null;
  const selectedEdge = liveDiagram.edges.find((edge) => edge.id === selectedEdgeId) ?? null;
  const selectedNodeIcon = selectedNode ? diagramIconForKind(selectedNode.kind) : null;
  const zoom = fitViewportRef.current.width / viewport.width;

  useEffect(() => {
    diagramRef.current = diagram;
    setLiveDiagram(diagram);
  }, [diagram]);

  useEffect(() => {
    if (!elementMenuOpen) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (!elementMenuRef.current?.contains(event.target as Node)) {
        setElementMenuOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [elementMenuOpen]);

  useEffect(() => {
    if (!editingId) {
      return;
    }
    window.requestAnimationFrame(() => {
      const input = labelInputRef.current;
      input?.focus();
      input?.select();
    });
  }, [editingId]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (editingId) {
          stopInlineLabelEdit();
          return;
        }
        onClose();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && (selectedId || selectedEdgeId) && !isTypingTarget(event.target)) {
        event.preventDefault();
        deleteSelected();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c" && selectedId && !isTypingTarget(event.target)) {
        event.preventDefault();
        copySelected();
        return;
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "v" && clipboardRef.current && !isTypingTarget(event.target)) {
        event.preventDefault();
        pasteClipboard();
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [editingId, onClose, selectedId, selectedEdgeId]);

  const patchDiagram =(updater: (current: Diagram) => Diagram, options?: { commit?: boolean }) => {
    const next = updater(diagramRef.current);
    diagramRef.current = next;
    setLiveDiagram(next);
    if (options?.commit ?? true) {
      onChange(next);
    }
  };

  const commitDiagram = () => {
    onChange(diagramRef.current);
  };

  const setViewport = (next: EditorViewport) => {
    viewportRef.current = next;
    setViewportState(next);
  };

  const handleCanvasPointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.button !== 0 || event.target !== event.currentTarget) {
      return;
    }
    if (tool === "pan") {
      startCanvasPan(event.nativeEvent);
      return;
    }
    if (tool === "select" || tool === "arrow") {
      setSelectedId(null);
      setSelectedEdgeId(null);
      setPendingFromId(null);
      return;
    }

    const point = screenToDiagramPoint(event, event.currentTarget, diagramRef.current);
    const node = createDiagramNode(tool, point, color);
    patchDiagram((current) => ({ ...current, nodes: [...current.nodes, node] }));
    setSelectedId(node.id);
    setTool("select");
    setElementMenuOpen(false);
  };

  const handleNodePointerDown = (event: React.PointerEvent<SVGGElement>, nodeId: string) => {
    event.preventDefault();
    event.stopPropagation();

    if (editingId) {
      return;
    }

    if (tool === "pan") {
      startCanvasPan(event.nativeEvent);
      return;
    }

    if (tool === "arrow") {
      if (!pendingFromId) {
        setPendingFromId(nodeId);
        setSelectedId(nodeId);
        return;
      }
      if (pendingFromId !== nodeId) {
        patchDiagram((current) => ({ ...current, edges: [...current.edges, createDiagramEdge(pendingFromId, nodeId, color)] }));
      }
      setPendingFromId(null);
      setTool("select");
      return;
    }

    setSelectedId(nodeId);
    setSelectedEdgeId(null);
    const svg = svgRef.current;
    const node = diagramRef.current.nodes.find((item) => item.id === nodeId);
    if (!svg || !node) {
      return;
    }

    const start = screenToDiagramPoint(event, svg, diagramRef.current);
    const offset = { x: node.x - start.x, y: node.y - start.y };

    const move = (moveEvent: PointerEvent) => {
      const currentSvg = svgRef.current;
      if (!currentSvg) {
        return;
      }
      const point = screenToDiagramPoint(moveEvent, currentSvg, diagramRef.current);
      patchDiagram(
        (current) => ({
          ...current,
          nodes: current.nodes.map((item) =>
            item.id === nodeId ? { ...item, x: Math.round(point.x + offset.x), y: Math.round(point.y + offset.y) } : item,
          ),
        }),
        { commit: false },
      );
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      commitDiagram();
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const handleResizePointerDown = (event: React.PointerEvent<SVGRectElement>, nodeId: string) => {
    event.preventDefault();
    event.stopPropagation();

    const svg = svgRef.current;
    const node = diagramRef.current.nodes.find((item) => item.id === nodeId);
    if (!svg || !node) {
      return;
    }

    setSelectedId(nodeId);
    setSelectedEdgeId(null);
    const start = screenToDiagramPoint(event, svg, diagramRef.current);
    const size = sizeForNode(node);
    const base = { w: size.w, h: size.h };

    const move = (moveEvent: PointerEvent) => {
      const currentSvg = svgRef.current;
      if (!currentSvg) {
        return;
      }
      const point = screenToDiagramPoint(moveEvent, currentSvg, diagramRef.current);
      const width = Math.max(44, Math.round(base.w + point.x - start.x));
      const height = Math.max(28, Math.round(base.h + point.y - start.y));
      patchDiagram(
        (current) => ({
          ...current,
          nodes: current.nodes.map((item) => (item.id === nodeId ? { ...item, w: width, h: height } : item)),
        }),
        { commit: false },
      );
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      commitDiagram();
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const handleEdgePointerDown = (event: React.PointerEvent<SVGGElement>, edgeId: string) => {
    if (tool !== "select") {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    setSelectedEdgeId(edgeId);
    setSelectedId(null);
    setPendingFromId(null);
  };

  const deleteSelected = () => {
    if (selectedEdgeId) {
      const edgeId = selectedEdgeId;
      patchDiagram((current) => ({
        ...current,
        edges: current.edges.filter((edge) => edge.id !== edgeId),
      }));
      setSelectedEdgeId(null);
      return;
    }
    const id = selectedId;
    if (!id) {
      return;
    }
    patchDiagram((current) => ({
      ...current,
      nodes: current.nodes.filter((node) => node.id !== id),
      edges: current.edges.filter((edge) => edge.from !== id && edge.to !== id),
    }));
    setSelectedId(null);
    setPendingFromId(null);
  };

  const duplicateSelected = () => {
    const id = selectedId;
    if (!id) {
      return;
    }
    const source = diagramRef.current.nodes.find((node) => node.id === id);
    if (!source) {
      return;
    }
    const clone = duplicateDiagramNode(source);
    patchDiagram((current) => ({ ...current, nodes: [...current.nodes, clone] }));
    setSelectedId(clone.id);
    setSelectedEdgeId(null);
  };

  const copySelected = () => {
    const id = selectedId;
    if (!id) {
      return;
    }
    const source = diagramRef.current.nodes.find((node) => node.id === id);
    if (!source) {
      return;
    }
    clipboardRef.current = source;
  };

  const pasteClipboard = () => {
    const template = clipboardRef.current;
    if (!template) {
      return;
    }
    const clone = duplicateDiagramNode(template);
    patchDiagram((current) => ({ ...current, nodes: [...current.nodes, clone] }));
    clipboardRef.current = clone;
    setSelectedId(clone.id);
    setSelectedEdgeId(null);
  };

  const setNodeLabel = (nodeId: string, label: string) => {
    patchDiagram(
      (current) => ({
        ...current,
        nodes: current.nodes.map((node) => (node.id === nodeId ? { ...node, label } : node)),
      }),
      { commit: false },
    );
  };

  const startInlineLabelEdit = (event: React.MouseEvent<SVGGElement>, nodeId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(nodeId);
    setSelectedEdgeId(null);
    setEditingId(nodeId);
    setTool("select");
  };

  const stopInlineLabelEdit = () => {
    setEditingId(null);
    commitDiagram();
  };

  const applyColor = (nextColor: DiagramColor) => {
    setColor(nextColor);
    if (selectedEdgeId) {
      patchDiagram((current) => ({
        ...current,
        edges: current.edges.map((edge) => (edge.id === selectedEdgeId ? { ...edge, color: nextColor } : edge)),
      }));
      return;
    }
    if (!selectedId) {
      return;
    }
    patchDiagram((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === selectedId ? { ...node, color: nextColor } : node)),
    }));
  };

  const setDefaultColor = (nextColor: DiagramColor) => {
    setColor(nextColor);
  };

  const setSelectedIconSize = (size: number) => {
    if (!selectedId) {
      return;
    }
    const nextSize = { w: size, h: size + 25 };
    patchDiagram((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === selectedId ? withCenteredNodeSize(node, nextSize, { boxed: undefined }) : node,
      ),
    }));
  };

  const patchSelectedEdge = (patch: Partial<DiagramEdge>) => {
    if (!selectedEdgeId) {
      return;
    }
    patchDiagram((current) => ({
      ...current,
      edges: current.edges.map((edge) => (edge.id === selectedEdgeId ? { ...edge, ...patch } : edge)),
    }));
  };

  const setSelectedIconBoxed = (boxed: boolean) => {
    if (!selectedId) {
      return;
    }
    const nextSize = boxed ? boxedIconSize : { w: 44, h: 69 };
    patchDiagram((current) => ({
      ...current,
      nodes: current.nodes.map((node) =>
        node.id === selectedId ? withCenteredNodeSize(node, nextSize, { boxed: boxed ? true : undefined }) : node,
      ),
    }));
  };

  const startCanvasPan = (event: PointerEvent) => {
    const svg = svgRef.current;
    if (!svg) {
      return;
    }

    const start = { x: event.clientX, y: event.clientY, viewport: viewportRef.current };

    const move = (moveEvent: PointerEvent) => {
      const rect = svg.getBoundingClientRect();
      const scaleX = start.viewport.width / Math.max(1, rect.width);
      const scaleY = start.viewport.height / Math.max(1, rect.height);
      setViewport({
        ...start.viewport,
        x: start.viewport.x - (moveEvent.clientX - start.x) * scaleX,
        y: start.viewport.y - (moveEvent.clientY - start.y) * scaleY,
      });
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const zoomTo = (nextZoom: number) => {
    const clamped = Math.max(minZoom, Math.min(maxZoom, nextZoom));
    const fit = fitViewportRef.current;
    const current = viewportRef.current;
    const nextWidth = fit.width / clamped;
    const nextHeight = fit.height / clamped;
    setViewport({
      x: current.x + (current.width - nextWidth) / 2,
      y: current.y + (current.height - nextHeight) / 2,
      width: nextWidth,
      height: nextHeight,
    });
  };

  const fitCanvas = () => {
    const next = viewportFromViewBox(layoutRef.current.viewBox);
    fitViewportRef.current = next;
    setViewport(next);
  };

  return (
    <div className="diagram-editor" role="dialog" aria-modal="true" aria-label="Diagram editor">
      <header className="diagram-editor-topbar">
        <strong>Diagram</strong>
        <span className="diagram-editor-mode">
          <span>{liveDiagram.mode === "iso" ? "◨" : "◫"}</span>
          <span>{liveDiagram.mode === "iso" ? "Isometric" : "Flat"}</span>
        </span>
        <span>{hintForTool(tool, pendingFromId)}</span>
        <div>
          <button className="topbar-button" onClick={() => onDescribe(describeDiagram(liveDiagram))}>
            Describe in words
          </button>
          <button className="topbar-button strong" onClick={onClose}>
            Done
          </button>
        </div>
      </header>

      <div className="diagram-editor-body">
        <svg
          ref={svgRef}
          className={tool === "pan" ? "diagram-canvas is-panning" : "diagram-canvas"}
          viewBox={`${viewport.x} ${viewport.y} ${viewport.width} ${viewport.height}`}
          onPointerDown={handleCanvasPointerDown}
        >
          <defs>
            {colors.map((name) => (
              <marker
                key={name}
                id={`diagram-editor-arrow-${name}`}
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M0 1L9 5L0 9z" fill={diagramPalette[name].stroke} />
              </marker>
            ))}
          </defs>

          {layout.edges.map((edge) => (
            <g
              key={edge.id}
              className={tool === "select" ? "diagram-edge-hit" : undefined}
              onPointerDown={(event) => handleEdgePointerDown(event, edge.id)}
            >
              <path d={edge.d} fill="none" stroke="transparent" strokeWidth="14" />
              <path
                d={edge.d}
                fill="none"
                stroke={selectedEdgeId === edge.id ? "var(--accent)" : edge.color}
                strokeWidth={selectedEdgeId === edge.id ? edge.width + 0.8 : edge.width}
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeDasharray={edge.dashed ? "7 6" : undefined}
                markerStart={edge.markerStart ? edge.markerStart.replace("#diagram-arrow-", "#diagram-editor-arrow-") : undefined}
                markerEnd={edge.markerEnd ? edge.markerEnd.replace("#diagram-arrow-", "#diagram-editor-arrow-") : undefined}
              />
            </g>
          ))}

          {layout.nodes.map((node) => (
            <g
              key={node.id}
              className="diagram-node"
              onDoubleClick={(event) => startInlineLabelEdit(event, node.id)}
              onPointerDown={(event) => handleNodePointerDown(event, node.id)}
            >
              {node.faces.map((face, index) => (
                <path key={index} d={face.d} fill={face.fill} stroke={face.stroke} strokeWidth="1.4" />
              ))}
              {node.cap ? (
                <text x={node.cx} y={node.capY} textAnchor="middle" fontSize="8.5" letterSpacing="1" fontWeight="700" fill={node.color}>
                  {node.cap}
                </text>
              ) : null}
              {node.icon ? (
                <g
                  className="diagram-node-icon"
                  transform={`translate(${node.iconX} ${node.iconY}) scale(${node.iconSize / 24})`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.6"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  style={{ color: node.color }}
                  dangerouslySetInnerHTML={{ __html: diagramIconMarkup(node.icon) }}
                />
              ) : null}
              {editingId === node.id ? (
                <foreignObject x={node.cx - inlineLabelWidth(node.hw) / 2} y={node.labelY - 16} width={inlineLabelWidth(node.hw)} height="26">
                  <input
                    ref={labelInputRef}
                    className="diagram-inline-label-input"
                    value={node.label}
                    onChange={(event) => setNodeLabel(node.id, event.target.value)}
                    onBlur={stopInlineLabelEdit}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        stopInlineLabelEdit();
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        stopInlineLabelEdit();
                      }
                    }}
                  />
                </foreignObject>
              ) : (
                <text
                  x={node.cx}
                  y={node.labelY}
                  textAnchor="middle"
                  fontSize={node.bare ? "11.5" : "13"}
                  fontWeight={node.bare ? "500" : "530"}
                  fill={node.bare ? "var(--muted-strong)" : "var(--text)"}
                >
                  {node.label}
                </text>
              )}
              <rect
                x={node.hx}
                y={node.hy}
                width={node.hw}
                height={node.hh}
                rx="7"
                fill="transparent"
                stroke={pendingFromId === node.id ? "var(--accent)" : node.color}
                strokeWidth="1.5"
                strokeDasharray="4 3"
                opacity={selectedId === node.id || pendingFromId === node.id ? 1 : 0}
              />
              {selectedId === node.id && tool !== "pan" ? (
                <rect
                  className="diagram-resize-handle"
                  x={node.hx + node.hw - 7}
                  y={node.hy + node.hh - 7}
                  width="14"
                  height="14"
                  rx="4"
                  onPointerDown={(event) => handleResizePointerDown(event, node.id)}
                />
              ) : null}
            </g>
          ))}
        </svg>

        <div className="diagram-zoom-controls" aria-label="Zoom controls">
          <button onClick={() => zoomTo(zoom - 0.1)} aria-label="Zoom out" title="Zoom out">
            <Minus size={16} strokeWidth={1.9} />
          </button>
          <button onClick={() => zoomTo(1)} aria-label="Reset zoom" title="Reset zoom">
            {Math.round(zoom * 100)}%
          </button>
          <button onClick={() => zoomTo(zoom + 0.1)} aria-label="Zoom in" title="Zoom in">
            <Plus size={16} strokeWidth={1.9} />
          </button>
          <span />
          <button onClick={fitCanvas} aria-label="Fit canvas" title="Fit canvas">
            <Maximize size={15} strokeWidth={1.9} />
          </button>
        </div>

        <div className="diagram-toolbar" aria-label="Diagram tools">
          {tools.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={tool === item.id ? "active" : ""}
                title={item.label}
                aria-label={item.label}
                onClick={() => {
                  setTool(item.id);
                  setPendingFromId(null);
                }}
              >
                <Icon size={15} strokeWidth={1.9} />
              </button>
            );
          })}
          <div className="diagram-element-menu-wrap" ref={elementMenuRef}>
            <button
              className={isElementTool(tool) ? "active" : ""}
              title="Elements"
              aria-label="Elements"
              aria-expanded={elementMenuOpen}
              onClick={() => setElementMenuOpen((open) => !open)}
            >
              <Box size={15} strokeWidth={1.9} />
              <ChevronDown size={11} strokeWidth={2} />
            </button>
            {elementMenuOpen ? (
              <div className="diagram-element-menu">
                {groupedElementCatalog.map((group) => (
                  <div key={group.group} className="diagram-element-menu-group">
                    <strong>{group.group}</strong>
                    {group.items.map((item) => (
                      <button
                        key={item.id}
                        className={tool === item.id ? "active" : ""}
                        onClick={() => {
                          setTool(item.id);
                          setPendingFromId(null);
                          setElementMenuOpen(false);
                        }}
                      >
                        <ElementIcon item={item} />
                        <span>{item.label}</span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <span />
          {colors.map((name) => (
            <button
              key={name}
              className={color === name ? "diagram-swatch active" : "diagram-swatch"}
              title={name}
              aria-label={name}
              style={{ backgroundColor: diagramPalette[name].stroke, color: diagramPalette[name].stroke }}
              onClick={() => setDefaultColor(name)}
            />
          ))}
        </div>

        {selectedNode ? (
          <aside className="diagram-inspector">
            <strong>Selected</strong>
            <div className="diagram-inspector-meta">{diagramKinds[selectedNode.kind].label}</div>
            <input
              value={selectedNode.label}
              aria-label="Node label"
              onChange={(event) => setNodeLabel(selectedNode.id, event.target.value)}
              onBlur={commitDiagram}
            />
            <div className="diagram-inspector-style">
              <span>Color</span>
              <div className="diagram-inspector-swatches">
                {colors.map((name) => (
                  <button
                    key={name}
                    className={selectedNode.color === name ? "diagram-swatch active" : "diagram-swatch"}
                    title={name}
                    aria-label={name}
                    style={{ backgroundColor: diagramPalette[name].stroke, color: diagramPalette[name].stroke }}
                    onClick={() => applyColor(name)}
                  />
                ))}
              </div>
            </div>
            {selectedNodeIcon ? (
              <div className="diagram-inspector-style">
                <span>Style</span>
                <div>
                  <button className={!selectedNode.boxed ? "active" : ""} onClick={() => setSelectedIconBoxed(false)}>
                    Icon
                  </button>
                  <button className={selectedNode.boxed ? "active" : ""} onClick={() => setSelectedIconBoxed(true)}>
                    Box
                  </button>
                </div>
              </div>
            ) : null}
            {selectedNodeIcon && !selectedNode.boxed ? (
              <div className="diagram-inspector-size">
                <span>Size</span>
                <div>
                  {iconSizes.map((size) => (
                    <button
                      key={size.label}
                      className={currentIconSize(selectedNode) === size.value ? "active" : ""}
                      onClick={() => setSelectedIconSize(size.value)}
                    >
                      {size.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <button onClick={duplicateSelected}>
              <Copy size={14} strokeWidth={1.9} />
              Duplicate
            </button>
            <button onClick={deleteSelected}>
              <Trash2 size={14} strokeWidth={1.9} />
              Delete node
            </button>
          </aside>
        ) : selectedEdge ? (
          <aside className="diagram-inspector">
            <strong>Selected</strong>
            <div className="diagram-inspector-meta">Connection</div>
            <div className="diagram-inspector-style">
              <span>Color</span>
              <div className="diagram-inspector-swatches">
                {colors.map((name) => (
                  <button
                    key={name}
                    className={selectedEdge.color === name ? "diagram-swatch active" : "diagram-swatch"}
                    title={name}
                    aria-label={name}
                    style={{ backgroundColor: diagramPalette[name].stroke, color: diagramPalette[name].stroke }}
                    onClick={() => applyColor(name)}
                  />
                ))}
              </div>
            </div>
            <div className="diagram-inspector-style">
              <span>Width</span>
              <div className="diagram-inspector-three">
                {edgeWidths.map((width) => (
                  <button
                    key={width.value}
                    className={(selectedEdge.width ?? "medium") === width.value ? "active" : ""}
                    onClick={() => patchSelectedEdge({ width: width.value })}
                  >
                    {width.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="diagram-inspector-style">
              <span>Route</span>
              <div className="diagram-inspector-three">
                {edgeRoutes.map((route) => (
                  <button
                    key={route.value}
                    className={(selectedEdge.route ?? (liveDiagram.mode === "iso" ? "straight" : "orthogonal")) === route.value ? "active" : ""}
                    onClick={() => patchSelectedEdge({ route: route.value })}
                  >
                    {route.label}
                  </button>
                ))}
              </div>
            </div>
            {(selectedEdge.route ?? (liveDiagram.mode === "iso" ? "straight" : "orthogonal")) === "orthogonal" ? (
              <div className="diagram-inspector-style">
                <span>Corner</span>
                <div>
                  {edgeCorners.map((corner) => (
                    <button
                      key={corner.value}
                      className={(selectedEdge.corner ?? "square") === corner.value ? "active" : ""}
                      onClick={() => patchSelectedEdge({ corner: corner.value })}
                    >
                      {corner.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="diagram-inspector-style">
              <span>Ends</span>
              <div className="diagram-inspector-four">
                {edgeEnds.map((ends) => (
                  <button
                    key={ends.label}
                    className={edgeEndsMatch(selectedEdge, ends) ? "active" : ""}
                    onClick={() => patchSelectedEdge({ start: ends.start, end: ends.end })}
                  >
                    {ends.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="diagram-inspector-style">
              <span>Stroke</span>
              <div>
                <button className={!selectedEdge.dashed ? "active" : ""} onClick={() => patchSelectedEdge({ dashed: undefined })}>
                  Solid
                </button>
                <button className={selectedEdge.dashed ? "active" : ""} onClick={() => patchSelectedEdge({ dashed: true })}>
                  Dashed
                </button>
              </div>
            </div>
            <button onClick={deleteSelected}>
              <Trash2 size={14} strokeWidth={1.9} />
              Delete connection
            </button>
          </aside>
        ) : null}
      </div>
    </div>
  );
}

function ElementIcon({ item }: { item: ElementCatalogItem }) {
  if (item.iconKind) {
    return (
      <svg
        className="diagram-system-icon"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        dangerouslySetInnerHTML={{ __html: diagramIconMarkup(item.iconKind) }}
      />
    );
  }
  const Icon = item.icon ?? Box;
  return <Icon size={14} strokeWidth={1.9} />;
}

function hintForTool(tool: DiagramTool, pendingFromId: string | null) {
  if (tool === "arrow") {
    return pendingFromId ? "Now click the target node" : "Click a node to start an arrow";
  }
  if (tool === "pan") {
    return "Drag to move the canvas";
  }
  if (tool === "select") {
    return "Drag to move · Delete to remove · Esc to close";
  }
  return "Click the canvas to place it";
}

function isElementTool(tool: DiagramTool): tool is DiagramKind {
  return elementCatalog.some((item) => item.id === tool);
}

type EditorViewport = {
  x: number;
  y: number;
  width: number;
  height: number;
};

function viewportFromViewBox(viewBox: string): EditorViewport {
  const [x, y, width, height] = viewBox.split(/\s+/).map(Number);
  return { x, y, width, height };
}

function inlineLabelWidth(nodeWidth: number) {
  return Math.max(56, Math.min(140, nodeWidth - 28));
}

function currentIconSize(node: DiagramNode) {
  const size = sizeForNode(node);
  return Math.max(20, Math.min(112, Math.min(size.w, size.h - 25)));
}

function edgeEndsMatch(edge: DiagramEdge, ends: { start?: DiagramEdgeEnd; end?: DiagramEdgeEnd }) {
  return (edge.start ?? "none") === (ends.start ?? "none") && (edge.end ?? "arrow") === (ends.end ?? "arrow");
}

function withCenteredNodeSize(node: DiagramNode, nextSize: { w: number; h: number }, patch: Partial<DiagramNode>) {
  const currentSize = sizeForNode(node);
  return {
    ...node,
    ...patch,
    x: Math.round(node.x + (currentSize.w - nextSize.w) / 2),
    y: Math.round(node.y + (currentSize.h - nextSize.h) / 2),
    w: nextSize.w,
    h: nextSize.h,
  };
}

function sizeForNode(node: { kind: DiagramKind; w?: number; h?: number }) {
  const fallback = diagramKinds[node.kind] ?? diagramKinds.box;
  return { w: node.w ?? fallback.w, h: node.h ?? fallback.h };
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}
