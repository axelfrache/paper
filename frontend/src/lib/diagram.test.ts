import { describe, expect, it } from "vitest";
import {
  createDiagramNode,
  createDefaultDiagram,
  diagramIconForKind,
  diagramKinds,
  diagramToSvgMarkup,
  layoutDiagram,
  parseDiagramMarker,
  serializeDiagramMarker,
} from "./diagram";

describe("diagram system icons", () => {
  it("registers system icon kinds as diagram node kinds", () => {
    expect(diagramKinds["k8s-deployment"].label).toBe("Deployment");
    expect(diagramKinds.prometheus.color).toBe("amber");
    expect(diagramKinds.postgresql.color).toBe("green");
  });

  it("creates nodes from system icon kinds", () => {
    expect(createDiagramNode("load-balancer", { x: 100, y: 80 })).toMatchObject({
      kind: "load-balancer",
      label: "Load balancer",
      color: "violet",
    });
  });

  it("serializes and restores system icon nodes", () => {
    const diagram = {
      version: 1 as const,
      mode: "flat" as const,
      nodes: [{ id: "n1", kind: "gateway" as const, x: 10, y: 20, label: "Gateway", color: "violet" as const, boxed: true }],
      edges: [],
    };

    const restored = parseDiagramMarker(serializeDiagramMarker(diagram))?.nodes[0];

    expect(restored?.kind).toBe("gateway");
    expect(restored?.boxed).toBe(true);
  });

  it("serializes and restores edge style options", () => {
    const diagram = {
      version: 1 as const,
      mode: "flat" as const,
      nodes: [
        { id: "n1", kind: "box" as const, x: 0, y: 0, label: "A", color: "slate" as const },
        { id: "n2", kind: "box" as const, x: 200, y: 0, label: "B", color: "blue" as const },
      ],
      edges: [
        {
          id: "e1",
          from: "n1",
          to: "n2",
          color: "violet" as const,
          route: "straight" as const,
          corner: "rounded" as const,
          dashed: true,
          start: "arrow" as const,
          end: "none" as const,
          width: "thick" as const,
        },
      ],
    };

    const restored = parseDiagramMarker(serializeDiagramMarker(diagram))?.edges[0];

    expect(restored).toMatchObject({
      color: "violet",
      route: "straight",
      corner: "rounded",
      dashed: true,
      start: "arrow",
      end: "none",
      width: "thick",
    });
  });

  it("maps compatible base kinds to system icons", () => {
    expect(diagramIconForKind("client")).toBe("client");
    expect(diagramIconForKind("user")).toBeNull();
    expect(diagramIconForKind("service")).toBe("service");
    expect(diagramIconForKind("box")).toBeNull();
  });

  it("lays out system icons without framed faces", () => {
    const layout = layoutDiagram({
      version: 1,
      mode: "flat",
      nodes: [{ id: "n1", kind: "load-balancer", x: 10, y: 20, label: "Gateway", color: "violet" }],
      edges: [],
    });
    const node = layout.nodes[0];

    expect(node.bare).toBe(true);
    expect(node.faces).toHaveLength(0);
    expect(node.icon).toBe("load-balancer");
    expect(node.iconSize).toBe(87);
    expect(node.labelY).toBe(node.iconY + node.iconSize + 18);
  });

  it("lays out boxed system icons with framed faces", () => {
    const layout = layoutDiagram({
      version: 1,
      mode: "flat",
      nodes: [{ id: "n1", kind: "gateway", x: 10, y: 20, label: "Gateway", color: "violet", boxed: true, w: 132, h: 86 }],
      edges: [],
    });
    const node = layout.nodes[0];

    expect(node.bare).toBe(false);
    expect(node.faces).toHaveLength(1);
    expect(node.icon).toBe("gateway");
    expect(node.iconSize).toBe(28);
    expect(node.labelY).toBe(93);
  });

  it("routes icon style edges from the icon bounds", () => {
    const layout = layoutDiagram({
      version: 1,
      mode: "flat",
      nodes: [
        { id: "n1", kind: "load-balancer", x: 10, y: 20, label: "Gateway", color: "violet" },
        { id: "n2", kind: "database", x: 160, y: 20, label: "Database", color: "green" },
      ],
      edges: [{ id: "e1", from: "n1", to: "n2", color: "slate" }],
    });

    expect(layout.edges[0]?.d).toMatch(/^M\d+(\.\d+)? \d+(\.\d+)?/);
  });

  it("routes boxed icon edges from the box bounds", () => {
    const layout = layoutDiagram({
      version: 1,
      mode: "flat",
      nodes: [
        { id: "n1", kind: "gateway", x: 10, y: 20, label: "Gateway", color: "violet", boxed: true, w: 132, h: 86 },
        { id: "n2", kind: "database", x: 220, y: 20, label: "Database", color: "green" },
      ],
      edges: [{ id: "e1", from: "n1", to: "n2", color: "slate" }],
    });

    expect(layout.edges[0]?.d.startsWith("M142 63")).toBe(true);
  });

  it("routes straight edges directly to the target", () => {
    const layout = layoutDiagram({
      version: 1,
      mode: "flat",
      nodes: [
        { id: "n1", kind: "box", x: 0, y: 0, label: "A", color: "slate" },
        { id: "n2", kind: "box", x: 200, y: 120, label: "B", color: "blue" },
      ],
      edges: [{ id: "e1", from: "n1", to: "n2", color: "violet", route: "straight" }],
    });

    expect(layout.edges[0]?.d).toContain("L");
    expect(layout.edges[0]?.d).not.toContain("H");
    expect(layout.edges[0]?.d).not.toContain("V");
    expect(layout.edges[0]?.color).toBe("#8a5cd0");
  });

  it("stops the edge stroke at the arrowhead base", () => {
    const layout = layoutDiagram({
      version: 1,
      mode: "flat",
      nodes: [
        { id: "n1", kind: "box", x: 0, y: 0, label: "A", color: "slate" },
        { id: "n2", kind: "box", x: 200, y: 0, label: "B", color: "blue" },
      ],
      edges: [{ id: "e1", from: "n1", to: "n2", color: "slate", route: "straight" }],
    });

    expect(layout.edges[0]?.d).toBe("M150 33L188.7 33");
    expect(layout.edges[0]?.markerEnd).toBe("url(#diagram-arrow-slate)");
  });

  it("routes curved edges with a quadratic path", () => {
    const layout = layoutDiagram({
      version: 1,
      mode: "flat",
      nodes: [
        { id: "n1", kind: "box", x: 0, y: 0, label: "A", color: "slate" },
        { id: "n2", kind: "box", x: 200, y: 120, label: "B", color: "blue" },
      ],
      edges: [{ id: "e1", from: "n1", to: "n2", color: "blue", route: "curved", start: "arrow", end: "arrow", width: "thin" }],
    });

    expect(layout.edges[0]?.d).toContain("Q");
    expect(layout.edges[0]?.markerStart).toBe("url(#diagram-arrow-blue)");
    expect(layout.edges[0]?.markerEnd).toBe("url(#diagram-arrow-blue)");
    expect(layout.edges[0]?.width).toBe(1.2);
  });

  it("routes rounded orthogonal edges with quadratic corners", () => {
    const layout = layoutDiagram({
      version: 1,
      mode: "flat",
      nodes: [
        { id: "n1", kind: "box", x: 0, y: 0, label: "A", color: "slate" },
        { id: "n2", kind: "box", x: 200, y: 120, label: "B", color: "blue" },
      ],
      edges: [{ id: "e1", from: "n1", to: "n2", color: "slate", route: "orthogonal", corner: "rounded", dashed: true }],
    });

    expect(layout.edges[0]?.d).toContain("Q");
    expect(layout.edges[0]?.dashed).toBe(true);
  });

  it("renders edge endings and width in diagram previews", () => {
    const html = diagramToSvgMarkup({
      version: 1,
      mode: "flat",
      nodes: [
        { id: "n1", kind: "box", x: 0, y: 0, label: "A", color: "slate" },
        { id: "n2", kind: "box", x: 200, y: 0, label: "B", color: "blue" },
      ],
      edges: [{ id: "e1", from: "n1", to: "n2", color: "green", end: "none", start: "arrow", width: "thick", dashed: true }],
    });

    expect(html).toContain('stroke-width="2.8"');
    expect(html).toContain('marker-start="url(#diagram-arrow-green)"');
    expect(html).not.toContain('marker-end="url(#diagram-arrow-green)"');
    expect(html).toContain('stroke-dasharray="7 6"');
  });

  it("renders system icons in diagram previews", () => {
    const html = diagramToSvgMarkup({
      version: 1,
      mode: "flat",
      nodes: [{ id: "n1", kind: "load-balancer", x: 10, y: 20, label: "Gateway", color: "violet" }],
      edges: [],
    });

    expect(html).toContain("diagram-node-icon");
    expect(html).toContain('href="/diagram-icons/flat/load-balancer.svg"');
  });

  it("renders isometric icons in isometric diagram previews", () => {
    const html = diagramToSvgMarkup({
      version: 1,
      mode: "iso",
      nodes: [{ id: "n1", kind: "load-balancer", x: 10, y: 20, label: "Gateway", color: "violet" }],
      edges: [],
    });

    expect(html).toContain('href="/diagram-icons/cloud-native/load-balancer.svg"');
  });

  it("creates flat and isometric default diagrams independently", () => {
    expect(createDefaultDiagram("flat").mode).toBe("flat");

    const iso = createDefaultDiagram("iso");

    expect(iso.mode).toBe("iso");
    expect(iso.nodes.map((node) => node.kind)).toEqual(["client", "server", "database"]);
    expect(iso.nodes[0]).toMatchObject({ x: 0, y: 0 });
  });
});
