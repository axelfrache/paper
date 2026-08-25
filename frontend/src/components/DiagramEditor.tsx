import { useEffect, useRef, useState } from "react";
import { ArrowRight, Box, ChevronDown, Database, Hand, List, Maximize, Minus, MousePointer2, Plus, Server, Square, Trash2, Type, User } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  createDiagramEdge,
  createDiagramNode,
  describeDiagram,
  diagramKinds,
  diagramPalette,
  layoutDiagram,
  screenToDiagramPoint,
} from "../lib/diagram";
import type { Diagram, DiagramColor, DiagramKind } from "../lib/diagram";

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

const elementCatalog: Array<{ id: DiagramKind; label: string; icon: LucideIcon }> = [
  { id: "box", label: "Box", icon: Square },
  { id: "server", label: "Server", icon: Server },
  { id: "database", label: "Database", icon: Database },
  { id: "queue", label: "Queue", icon: List },
  { id: "client", label: "Client", icon: Box },
  { id: "user", label: "User", icon: User },
  { id: "text", label: "Text", icon: Type },
];

const colors = Object.keys(diagramPalette) as DiagramColor[];
const minZoom = 0.25;
const maxZoom = 3;
const defaultViewport: EditorViewport = { x: -120, y: -120, width: 1040, height: 680 };

export function DiagramEditor({ diagram, onChange, onClose, onDescribe }: DiagramEditorProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  const diagramRef = useRef(diagram);
  const layoutRef = useRef(layoutDiagram(diagram));
  const fitViewportRef = useRef(defaultViewport);
  const viewportRef = useRef(defaultViewport);
  const [tool, setTool] = useState<DiagramTool>("select");
  const [viewport, setViewportState] = useState(defaultViewport);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [elementMenuOpen, setElementMenuOpen] = useState(false);
  const [pendingFromId, setPendingFromId] = useState<string | null>(null);
  const [color, setColor] = useState<DiagramColor>("blue");
  const layout = layoutDiagram(diagram);
  layoutRef.current = layout;
  const selectedNode = diagram.nodes.find((node) => node.id === selectedId) ?? null;
  const zoom = fitViewportRef.current.width / viewport.width;

  useEffect(() => {
    diagramRef.current = diagram;
  }, [diagram]);

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
          setEditingId(null);
          return;
        }
        onClose();
        return;
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedId && !isTypingTarget(event.target)) {
        event.preventDefault();
        deleteSelected();
      }
    };

    window.addEventListener("keydown", onKeyDown, { capture: true });
    return () => window.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [editingId, onClose, selectedId]);

  const patchDiagram = (updater: (current: Diagram) => Diagram) => {
    const next = updater(diagramRef.current);
    diagramRef.current = next;
    onChange(next);
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
      setPendingFromId(null);
      return;
    }

    const point = screenToDiagramPoint(event, event.currentTarget, diagram);
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
      patchDiagram((current) => ({
        ...current,
        nodes: current.nodes.map((item) =>
          item.id === nodeId ? { ...item, x: Math.round(point.x + offset.x), y: Math.round(point.y + offset.y) } : item,
        ),
      }));
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
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
      patchDiagram((current) => ({
        ...current,
        nodes: current.nodes.map((item) => (item.id === nodeId ? { ...item, w: width, h: height } : item)),
      }));
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const deleteSelected = () => {
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

  const setNodeLabel = (nodeId: string, label: string) => {
    patchDiagram((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === nodeId ? { ...node, label } : node)),
    }));
  };

  const startInlineLabelEdit = (event: React.MouseEvent<SVGGElement>, nodeId: string) => {
    event.preventDefault();
    event.stopPropagation();
    setSelectedId(nodeId);
    setEditingId(nodeId);
    setTool("select");
  };

  const applyColor = (nextColor: DiagramColor) => {
    setColor(nextColor);
    if (!selectedId) {
      return;
    }
    patchDiagram((current) => ({
      ...current,
      nodes: current.nodes.map((node) => (node.id === selectedId ? { ...node, color: nextColor } : node)),
    }));
  };

  const toggleMode = () => {
    patchDiagram((current) => ({ ...current, mode: current.mode === "iso" ? "flat" : "iso" }));
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
        <button className="diagram-editor-mode" onClick={toggleMode}>
          {diagram.mode === "iso" ? "Isometric" : "Flat"}
        </button>
        <span>{hintForTool(tool, pendingFromId)}</span>
        <div>
          <button className="topbar-button" onClick={() => onDescribe(describeDiagram(diagram))}>
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
            <path
              key={edge.id}
              d={edge.d}
              fill="none"
              stroke={edge.color}
              strokeWidth="1.6"
              markerEnd={edge.marker.replace("#diagram-arrow-", "#diagram-editor-arrow-")}
            />
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
              {editingId === node.id ? (
                <foreignObject x={node.cx - inlineLabelWidth(node.hw) / 2} y={node.labelY - 16} width={inlineLabelWidth(node.hw)} height="26">
                  <input
                    ref={labelInputRef}
                    className="diagram-inline-label-input"
                    value={node.label}
                    onChange={(event) => setNodeLabel(node.id, event.target.value)}
                    onBlur={() => setEditingId(null)}
                    onPointerDown={(event) => {
                      event.stopPropagation();
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        setEditingId(null);
                      }
                      if (event.key === "Escape") {
                        event.preventDefault();
                        setEditingId(null);
                      }
                    }}
                  />
                </foreignObject>
              ) : (
                <text x={node.cx} y={node.labelY} textAnchor="middle" fontSize="13" fontWeight="530" fill="var(--text)">
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
          <div className="diagram-element-menu-wrap">
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
                {elementCatalog.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      className={tool === item.id ? "active" : ""}
                      onClick={() => {
                        setTool(item.id);
                        setPendingFromId(null);
                        setElementMenuOpen(false);
                      }}
                    >
                      <Icon size={14} strokeWidth={1.9} />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
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
              style={{ backgroundColor: diagramPalette[name].stroke }}
              onClick={() => applyColor(name)}
            />
          ))}
        </div>

        {selectedNode ? (
          <aside className="diagram-inspector">
            <strong>Selected</strong>
            <div className="diagram-inspector-meta">{diagramKinds[selectedNode.kind].cap || "Text"}</div>
            <button onClick={deleteSelected}>
              <Trash2 size={14} strokeWidth={1.9} />
              Delete node
            </button>
          </aside>
        ) : null}
      </div>
    </div>
  );
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

function sizeForNode(node: { kind: DiagramKind; w?: number; h?: number }) {
  const fallback = diagramKinds[node.kind] ?? diagramKinds.box;
  return { w: node.w ?? fallback.w, h: node.h ?? fallback.h };
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement;
}
