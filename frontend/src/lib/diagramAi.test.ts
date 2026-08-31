import { describe, expect, it } from "vitest";
import { buildDiagramGenerationPrompt, parseGeneratedDiagram } from "./diagramAi";

describe("diagram AI generation", () => {
  it("builds a one-shot generation prompt without append mode", () => {
    const prompt = buildDiagramGenerationPrompt("database connected to kubernetes", "flat");

    expect(prompt).toContain("Generate a complete Paper diagram");
    expect(prompt).toContain("No existing diagram.");
    expect(prompt).not.toContain("Operation:");
    expect(prompt).not.toContain("append");
  });

  it("parses a complete diagram response", () => {
    const diagram = parseGeneratedDiagram(
      `Here is the JSON:
      {"nodes":[{"id":"db","kind":"postgresql","label":"Database","color":"green"},{"id":"kube","kind":"kubernetes","label":"Cluster Kube","color":"blue"}],"edges":[{"from":"db","to":"kube","color":"amber","route":"curved","end":"arrow"}]}`,
      "flat",
    );

    expect(diagram.nodes.map((node) => node.id)).toEqual(["db", "kube"]);
    expect(diagram.nodes.map((node) => node.kind)).toEqual(["postgresql", "kubernetes"]);
    expect(diagram.edges).toMatchObject([{ from: "db", to: "kube", color: "amber", route: "curved", end: "arrow" }]);
  });
});
