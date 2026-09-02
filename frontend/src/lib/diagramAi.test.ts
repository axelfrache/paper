import { describe, expect, it } from "vitest";
import { addGeneratedDiagram, buildDiagramAdditionPrompt, buildDiagramGenerationPrompt, parseGeneratedDiagram } from "./diagramAi";
import type { Diagram } from "./diagram";

describe("diagram AI generation", () => {
  it("builds a one-shot generation prompt without append mode", () => {
    const prompt = buildDiagramGenerationPrompt("database connected to kubernetes", "flat");

    expect(prompt).toContain("Generate a complete Paper diagram");
    expect(prompt).toContain("No existing diagram.");
    expect(prompt).toContain("Generated edges must use color slate");
    expect(prompt).toContain("Use size M for every generated element");
    expect(prompt).not.toContain("Operation:");
    expect(prompt).not.toContain("append");
  });

  it("builds an addition prompt that asks for a patch", () => {
    const current: Diagram = {
      version: 1,
      mode: "iso",
      nodes: [{ id: "kube", kind: "kubernetes", x: 120, y: 80, label: "Cluster Kube", color: "blue" }],
      edges: [],
    };
    const prompt = buildDiagramAdditionPrompt("add postgres connected to kube", current);

    expect(prompt).toContain("Add to the existing Paper diagram");
    expect(prompt).toContain("Return only the new nodes to add");
    expect(prompt).toContain("reuse that existing element id");
    expect(prompt).toContain("kube");
  });

  it("asks for straight edge routes in isometric generation prompts", () => {
    const prompt = buildDiagramGenerationPrompt("client to api", "iso");

    expect(prompt).toContain("Allowed edge routes: straight");
    expect(prompt).toContain("direct straight arrows only");
    expect(prompt).not.toContain("curved, orthogonal");
  });

  it("parses a complete diagram response", () => {
    const diagram = parseGeneratedDiagram(
      `Here is the JSON:
      {"nodes":[{"id":"db","kind":"postgresql","label":"Database","color":"green"},{"id":"kube","kind":"kubernetes","label":"Cluster Kube","color":"blue"}],"edges":[{"from":"db","to":"kube","color":"amber","route":"curved","end":"arrow"}]}`,
      "flat",
    );

    expect(diagram.nodes.map((node) => node.id)).toEqual(["db", "kube"]);
    expect(diagram.nodes.map((node) => node.kind)).toEqual(["postgresql", "kubernetes"]);
    expect(diagram.nodes.map(({ w, h }) => ({ w, h }))).toEqual([
      { w: 76, h: 101 },
      { w: 76, h: 101 },
    ]);
    expect(diagram.edges).toMatchObject([{ from: "db", to: "kube", color: "slate", route: "curved", end: "arrow" }]);
  });

  it("arranges generated nodes by edge flow instead of response order", () => {
    const diagram = parseGeneratedDiagram(
      `{"nodes":[{"id":"store","kind":"postgresql","label":"Database","color":"green"},{"id":"client","kind":"client","label":"Client","color":"slate"},{"id":"api","kind":"server","label":"API","color":"blue"}],"edges":[{"from":"client","to":"api","color":"slate"},{"from":"api","to":"store","color":"green"}]}`,
      "flat",
    );
    const byId = new Map(diagram.nodes.map((node) => [node.id, node]));

    expect(byId.get("client")?.x).toBeLessThan(byId.get("api")?.x ?? 0);
    expect(byId.get("api")?.x).toBeLessThan(byId.get("store")?.x ?? 0);
  });

  it("forces straight routes for generated isometric diagrams", () => {
    const diagram = parseGeneratedDiagram(
      `{"nodes":[{"id":"client","kind":"client","label":"Client","color":"slate"},{"id":"api","kind":"server","label":"API","color":"blue"}],"edges":[{"from":"client","to":"api","color":"slate","route":"orthogonal"}]}`,
      "iso",
    );

    expect(diagram.edges[0]?.route).toBe("straight");
  });

  it("adds generated nodes without replacing existing diagram content", () => {
    const current: Diagram = {
      version: 1,
      mode: "flat",
      nodes: [{ id: "kube", kind: "kubernetes", x: 220, y: 90, label: "Cluster Kube", color: "blue" }],
      edges: [],
    };
    const { diagram, addedNodeIds } = addGeneratedDiagram(
      `{"nodes":[{"id":"db","kind":"postgresql","label":"Database","color":"green"}],"edges":[{"from":"db","to":"kube","color":"green"}]}`,
      current,
    );
    const kube = diagram.nodes.find((node) => node.id === "kube");
    const db = diagram.nodes.find((node) => node.id === "db");

    expect(diagram.nodes).toHaveLength(2);
    expect(kube).toMatchObject({ x: 220, y: 90 });
    expect(db?.kind).toBe("postgresql");
    expect(db).toMatchObject({ w: 76, h: 101 });
    expect(diagram.edges).toMatchObject([{ from: "db", to: "kube", color: "slate" }]);
    expect(addedNodeIds).toEqual(["db"]);
  });

  it("forces straight routes when adding to isometric diagrams", () => {
    const current: Diagram = {
      version: 1,
      mode: "iso",
      nodes: [{ id: "kube", kind: "kubernetes", x: 220, y: 90, label: "Cluster Kube", color: "blue" }],
      edges: [],
    };
    const { diagram } = addGeneratedDiagram(
      `{"nodes":[{"id":"db","kind":"postgresql","label":"Database","color":"green"}],"edges":[{"from":"db","to":"kube","color":"green","route":"curved"}]}`,
      current,
    );

    expect(diagram.edges[0]?.route).toBe("straight");
    expect(diagram.edges[0]?.color).toBe("slate");
  });
});

describe("generated edge labels", () => {
  const answer = (label: unknown) =>
    JSON.stringify({
      nodes: [
        { id: "n1", kind: "client", label: "Client", color: "slate" },
        { id: "n2", kind: "server", label: "API", color: "slate" },
      ],
      edges: [{ from: "n1", to: "n2", color: "slate", label }],
    });

  it("keeps a short label and normalizes its spacing", () => {
    expect(parseGeneratedDiagram(answer("  pulls   from "), "flat")?.edges[0].label).toBe("pulls from");
  });

  it("drops a label that would crowd the line or is not text", () => {
    expect(parseGeneratedDiagram(answer("x".repeat(33)), "flat")?.edges[0].label).toBeUndefined();
    expect(parseGeneratedDiagram(answer(""), "flat")?.edges[0].label).toBeUndefined();
    expect(parseGeneratedDiagram(answer(42), "flat")?.edges[0].label).toBeUndefined();
  });

  it("asks the model for a label only when the relationship needs naming", () => {
    expect(buildDiagramGenerationPrompt("draw it", "flat")).toContain("Edge label is optional");
  });
});
