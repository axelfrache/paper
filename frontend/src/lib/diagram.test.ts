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
    expect(diagramKinds.gateway.label).toBe("API gateway");
    expect(diagramKinds.metrics.color).toBe("amber");
    expect(diagramKinds.browser.color).toBe("slate");
  });

  it("creates nodes from system icon kinds", () => {
    expect(createDiagramNode("gateway", { x: 100, y: 80 })).toMatchObject({
      kind: "gateway",
      label: "API gateway",
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
        },
      ],
    };

    const restored = parseDiagramMarker(serializeDiagramMarker(diagram))?.edges[0];

    expect(restored).toMatchObject({ color: "violet", route: "straight", corner: "rounded", dashed: true });
  });

  it("maps compatible base kinds to system icons", () => {
    expect(diagramIconForKind("client")).toBe("browser");
    expect(diagramIconForKind("user")).toBe("person");
    expect(diagramIconForKind("service")).toBe("fn");
    expect(diagramIconForKind("box")).toBeNull();
  });

  it("lays out system icons without framed faces", () => {
    const layout = layoutDiagram({
      version: 1,
      mode: "flat",
      nodes: [{ id: "n1", kind: "gateway", x: 10, y: 20, label: "Gateway", color: "violet" }],
      edges: [],
    });
    const node = layout.nodes[0];

    expect(node.bare).toBe(true);
    expect(node.faces).toHaveLength(0);
    expect(node.icon).toBe("gateway");
    expect(node.iconSize).toBe(44);
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
        { id: "n1", kind: "gateway", x: 10, y: 20, label: "Gateway", color: "violet" },
        { id: "n2", kind: "database", x: 160, y: 20, label: "Database", color: "green" },
      ],
      edges: [{ id: "e1", from: "n1", to: "n2", color: "slate" }],
    });

    expect(layout.edges[0]?.d.startsWith("M54 42")).toBe(true);
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

  it("renders system icons in diagram previews", () => {
    const html = diagramToSvgMarkup({
      version: 1,
      mode: "flat",
      nodes: [{ id: "n1", kind: "gateway", x: 10, y: 20, label: "Gateway", color: "violet" }],
      edges: [],
    });

    expect(html).toContain("diagram-node-icon");
    expect(html).toContain("M5 20V9.5a7 7 0 0 1 14 0V20");
  });

  it("creates flat and isometric default diagrams independently", () => {
    expect(createDefaultDiagram("flat").mode).toBe("flat");

    const iso = createDefaultDiagram("iso");

    expect(iso.mode).toBe("iso");
    expect(iso.nodes.map((node) => node.kind)).toEqual(["client", "server", "database"]);
    expect(iso.nodes[0]).toMatchObject({ x: 0, y: 0 });
  });
});
