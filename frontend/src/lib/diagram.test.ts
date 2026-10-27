import { describe, expect, it } from "vitest";
import {
  createDiagramGroup,
  createDiagramNode,
  cloneDiagramWithFreshIds,
  createDefaultDiagram,
  defaultGroupPadding,
  diagramIconForKind,
  diagramKinds,
  diagramToSvgMarkup,
  edgeLabelHalo,
  layoutDiagram,
  minGroupPadding,
  parseDiagramMarker,
  pointInPolygon,
  serializeDiagramMarker,
} from "./diagram";
import type { Diagram, DiagramEdgeRoute } from "./diagram";
import { diagramIconHref } from "./diagramIcons";

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

  it("renders the tone variant for a tone-capable iso icon", () => {
    const html = diagramToSvgMarkup({
      version: 1,
      mode: "iso",
      nodes: [{ id: "n1", kind: "container", x: 0, y: 0, label: "C", color: "blue", tone: "carrot" }],
      edges: [],
    });
    expect(html).toContain("tones/container/carrot.svg");
  });

  it("keeps the base iso icon when no tone is set", () => {
    const html = diagramToSvgMarkup({
      version: 1,
      mode: "iso",
      nodes: [{ id: "n1", kind: "container", x: 0, y: 0, label: "C", color: "blue" }],
      edges: [],
    });
    expect(html).toContain("cloud-native/container.svg");
    expect(html).not.toContain("tones/container");
  });

  it("serializes and restores the icon tone, dropping unknown tones", () => {
    const kept = parseDiagramMarker(
      serializeDiagramMarker({
        version: 1,
        mode: "iso",
        nodes: [{ id: "n1", kind: "container", x: 0, y: 0, label: "C", color: "blue", tone: "grape" }],
        edges: [],
      }),
    )?.nodes[0];
    expect(kept?.tone).toBe("grape");

    const dropped = parseDiagramMarker(
      serializeDiagramMarker({
        version: 1,
        mode: "iso",
        nodes: [{ id: "n1", kind: "container", x: 0, y: 0, label: "C", color: "blue", tone: "bogus" } as never],
        edges: [],
      }),
    )?.nodes[0];
    expect(dropped?.tone).toBeUndefined();
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
    // Derived rather than hardcoded: the file format of an icon is free to change.
    expect(html).toContain(`href="${diagramIconHref("load-balancer", "flat")}"`);
    expect(diagramIconHref("load-balancer", "flat")).toContain("/diagram-icons/flat/");
  });

  it("renders isometric icons in isometric diagram previews", () => {
    const html = diagramToSvgMarkup({
      version: 1,
      mode: "iso",
      nodes: [{ id: "n1", kind: "load-balancer", x: 10, y: 20, label: "Gateway", color: "violet" }],
      edges: [],
    });

    expect(html).toContain(`href="${diagramIconHref("load-balancer", "iso")}"`);
    expect(diagramIconHref("load-balancer", "iso")).toContain("/diagram-icons/cloud-native/");
  });

  it("creates flat and isometric default diagrams independently", () => {
    expect(createDefaultDiagram("flat").mode).toBe("flat");

    const iso = createDefaultDiagram("iso");

    expect(iso.mode).toBe("iso");
    expect(iso.nodes.map((node) => node.kind)).toEqual(["client", "server", "database"]);
    expect(iso.nodes[0]).toMatchObject({ x: 0, y: 0 });
  });
});

describe("edge labels", () => {
  const nodes = [
    { id: "a", kind: "client" as const, label: "A", color: "slate" as const, x: 40, y: 40, w: 120, h: 80 },
    { id: "b", kind: "client" as const, label: "B", color: "slate" as const, x: 320, y: 40, w: 120, h: 80 },
  ];
  const build = (route: DiagramEdgeRoute, label?: string): Diagram => ({
    version: 1,
    mode: "flat",
    nodes,
    edges: [{ id: "e1", from: "a", to: "b", color: "slate", route, label }],
  });

  it("anchors the label between the two nodes, whatever the route", () => {
    for (const route of ["straight", "orthogonal", "curved"] as DiagramEdgeRoute[]) {
      const [edge] = layoutDiagram(build(route, "pulls")).edges;
      expect(edge.label).toBe("pulls");
      expect(edge.labelX).toBeGreaterThan(nodes[0].x + nodes[0].w);
      expect(edge.labelX).toBeLessThan(nodes[1].x);
    }
  });

  it("puts the label on the line for straight and orthogonal routes", () => {
    const centre = layoutDiagram(build("straight")).nodes[0].cy;
    for (const route of ["straight", "orthogonal"] as DiagramEdgeRoute[]) {
      expect(layoutDiagram(build(route, "pulls")).edges[0].labelY).toBeCloseTo(centre, 0);
    }
  });

  it("follows the bend of a curved route rather than its chord", () => {
    const centre = layoutDiagram(build("straight")).nodes[0].cy;
    // A label at the chord midpoint would float off a curve that arcs away from it.
    expect(Math.abs(layoutDiagram(build("curved", "pulls")).edges[0].labelY - centre)).toBeGreaterThan(8);
  });

  it("renders the label with a halo sized on the stroke so it cuts the line", () => {
    const svg = diagramToSvgMarkup(build("straight", "pulls"));
    expect(svg).toContain(">pulls</tspan>");
    // The halo colours live in CSS; only its width depends on the edge.
    expect(svg).toContain('class="diagram-edge-label"');
    expect(svg).toContain(`stroke-width="${edgeLabelHalo(layoutDiagram(build("straight", "pulls")).edges[0].width)}"`);
  });

  it("renders nothing for a blank label", () => {
    expect(layoutDiagram(build("straight", "   ")).edges[0].label).toBe("");
    expect(diagramToSvgMarkup(build("straight"))).not.toContain("diagram-edge-label");
  });

  it("escapes a label instead of letting it inject markup", () => {
    expect(diagramToSvgMarkup(build("straight", "a <b> & c"))).toContain("a &lt;b&gt; &amp; c");
  });

  it("keeps a label through a serialization round trip and drops a blank one", () => {
    const diagram = build("straight", "pulls");
    expect(parseDiagramMarker(serializeDiagramMarker(diagram))?.edges[0].label).toBe("pulls");
    expect(parseDiagramMarker(serializeDiagramMarker(build("straight", "  ")))?.edges[0].label).toBeUndefined();
  });
});


describe("node label badge", () => {
  const node = (overrides: Partial<Diagram["nodes"][number]> = {}) => ({
    id: "n1",
    kind: "server" as const,
    x: 0,
    y: 0,
    label: "API",
    color: "blue" as const,
    ...overrides,
  });

  it("boxes a label by default in iso mode, even on an icon node", () => {
    const svg = diagramToSvgMarkup({ version: 1, mode: "iso", nodes: [node()], edges: [] });
    expect(svg).toContain('class="diagram-node-label-plate"');
  });

  it("leaves a label plain by default in flat mode", () => {
    const svg = diagramToSvgMarkup({ version: 1, mode: "flat", nodes: [node()], edges: [] });
    expect(svg).not.toContain('class="diagram-node-label-plate"');
  });

  it("honours an explicit choice over the mode default", () => {
    const plain = diagramToSvgMarkup({ version: 1, mode: "iso", nodes: [node({ labelBoxed: false })], edges: [] });
    expect(plain).not.toContain('class="diagram-node-label-plate"');

    const boxed = diagramToSvgMarkup({ version: 1, mode: "flat", nodes: [node({ labelBoxed: true })], edges: [] });
    expect(boxed).toContain('class="diagram-node-label-plate"');
  });
});

describe("node groups", () => {
  const twoNodeDiagram = (groups?: Diagram["groups"]): Diagram => ({
    version: 1,
    mode: "iso",
    nodes: [
      { id: "a", kind: "server", x: 0, y: 0, label: "A", color: "blue" },
      { id: "b", kind: "server", x: 200, y: 0, label: "B", color: "blue" },
    ],
    edges: [],
    groups,
  });

  it("computes a projected region behind the group's members", () => {
    const group = createDiagramGroup(["a", "b"], "violet");
    const layout = layoutDiagram(twoNodeDiagram([group]));
    expect(layout.groups).toHaveLength(1);
    const points = layout.groups[0].points.split(" ");
    expect(points).toHaveLength(4);
    for (const point of points) {
      expect(point).toMatch(/^-?\d+(\.\d+)?,-?\d+(\.\d+)?$/);
    }
  });

  it("has no tab when unnamed, and a flat tab aligned with the zone corner when named", () => {
    const unnamed = layoutDiagram(twoNodeDiagram([createDiagramGroup(["a", "b"], "violet")])).groups[0];
    expect(unnamed.tab).toBeNull();

    const named = layoutDiagram(
      twoNodeDiagram([{ ...createDiagramGroup(["a", "b"], "violet"), name: "Core" }]),
    ).groups[0];
    expect(named.tab).not.toBeNull();
    const points = named.tab!.points.split(" ");
    expect(points).toHaveLength(4);
    const left = named.points.split(" ")[3].split(",").map(Number);
    const start = points[0].split(",").map(Number);
    expect(start[0]).toBeCloseTo(left[0], 0);
    expect(start[1]).toBeCloseTo(left[1], 0);
    const corners = points.map((pair) => pair.split(",").map(Number));
    const zone = named.points.split(" ").map((pair) => pair.split(",").map(Number));
    const side = [zone[1][0] - zone[0][0], zone[1][1] - zone[0][1]];
    const tabSide = [corners[2][0] - corners[1][0], corners[2][1] - corners[1][1]];
    expect(tabSide[1] / tabSide[0]).toBeCloseTo(side[1] / side[0], 2);
    // The region's top-left edge isn't axis-aligned in iso mode, so a tab that follows it
    // has a non-zero slant rather than sitting flat.
    expect(named.tab!.angle).not.toBe(0);

    const html = diagramToSvgMarkup(twoNodeDiagram([{ ...createDiagramGroup(["a", "b"], "violet"), name: "Core" }]));
    expect(html).toContain('class="diagram-group-tab"');
    expect(html).toContain(named.tab!.transform);
    expect(html).not.toContain("diagram-group-label-plate");
  });

  it("grows the region with an explicit padding, and clamps a too-small one", () => {
    const base = layoutDiagram(twoNodeDiagram([createDiagramGroup(["a", "b"], "violet")])).groups[0];
    const wider = layoutDiagram(
      twoNodeDiagram([{ ...createDiagramGroup(["a", "b"], "violet"), padding: defaultGroupPadding + 100 }]),
    ).groups[0];
    const clamped = layoutDiagram(
      twoNodeDiagram([{ ...createDiagramGroup(["a", "b"], "violet"), padding: 1 }]),
    ).groups[0];

    expect(wider.hw * wider.hh).toBeGreaterThan(base.hw * base.hh);
    expect(clamped.hw).toBeCloseTo(
      layoutDiagram(
        twoNodeDiagram([{ ...createDiagramGroup(["a", "b"], "violet"), padding: minGroupPadding }]),
      ).groups[0].hw,
      1,
    );
  });

  it("drops a group once membership falls below 2, including an unknown member id", () => {
    const solo = createDiagramGroup(["a"], "violet");
    expect(layoutDiagram(twoNodeDiagram([solo])).groups).toHaveLength(0);

    const withUnknown = createDiagramGroup(["a", "missing"], "violet");
    expect(layoutDiagram(twoNodeDiagram([withUnknown])).groups).toHaveLength(0);
  });

  it("parses fine when a diagram carries no groups at all", () => {
    expect(() => layoutDiagram(twoNodeDiagram(undefined))).not.toThrow();
    expect(layoutDiagram(twoNodeDiagram(undefined)).groups).toHaveLength(0);
  });

  it("round-trips a valid group through serialization, and drops one left under 2 members", () => {
    const group = { ...createDiagramGroup(["a", "b"], "amber"), name: "Core" };
    const saved = parseDiagramMarker(serializeDiagramMarker(twoNodeDiagram([group])));
    expect(saved?.groups).toHaveLength(1);
    expect(saved?.groups?.[0]).toMatchObject({ name: "Core", color: "amber", members: ["a", "b"] });

    const underMembered = { ...createDiagramGroup(["a", "ghost"], "amber") };
    const droppedResult = parseDiagramMarker(serializeDiagramMarker(twoNodeDiagram([underMembered])));
    expect(droppedResult?.groups ?? []).toHaveLength(0);
  });

  it("round-trips an explicit padding, clamping an invalid one", () => {
    const resized = { ...createDiagramGroup(["a", "b"], "amber"), padding: 120 };
    const saved = parseDiagramMarker(serializeDiagramMarker(twoNodeDiagram([resized])));
    expect(saved?.groups?.[0].padding).toBe(120);

    const tooSmall = { ...createDiagramGroup(["a", "b"], "amber"), padding: 1 };
    const clamped = parseDiagramMarker(serializeDiagramMarker(twoNodeDiagram([tooSmall])));
    expect(clamped?.groups?.[0].padding).toBe(minGroupPadding);
  });

  it("remaps a group's members through cloneDiagramWithFreshIds", () => {
    const group = createDiagramGroup(["a", "b"], "slate");
    const cloned = cloneDiagramWithFreshIds(twoNodeDiagram([group]));
    const clonedGroup = cloned.groups?.[0];
    const clonedNodeIds = cloned.nodes.map((node) => node.id);
    expect(clonedGroup?.id).not.toBe(group.id);
    expect(clonedGroup?.members).toEqual(clonedNodeIds);
    expect(clonedGroup?.members).not.toEqual(group.members);
  });
});

describe("pointInPolygon", () => {
  const square = "0,0 10,0 10,10 0,10";

  it("is true inside and false outside a simple square", () => {
    expect(pointInPolygon(5, 5, square)).toBe(true);
    expect(pointInPolygon(20, 20, square)).toBe(false);
    expect(pointInPolygon(-5, 5, square)).toBe(false);
  });

  it("works for the diamond a group's own region forms", () => {
    const diamond = "50,0 100,25 50,50 0,25";
    expect(pointInPolygon(50, 25, diamond)).toBe(true);
    expect(pointInPolygon(0, 0, diamond)).toBe(false);
  });
});

it("preserves optional diagram titles through serialization and duplication", () => {
  const original = { ...createDefaultDiagram(), title: "Architecture — été" };
  const saved = parseDiagramMarker(serializeDiagramMarker(original))!;
  expect(saved.title).toBe(original.title);
  expect(cloneDiagramWithFreshIds(saved).title).toBe(original.title);
  expect(parseDiagramMarker(serializeDiagramMarker(createDefaultDiagram()))?.title).toBeUndefined();
  expect(parseDiagramMarker(serializeDiagramMarker({ ...original, title: "  " }))?.title).toBeUndefined();
});
