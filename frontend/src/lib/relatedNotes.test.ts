import { describe, expect, it } from "vitest";
import { buildRelatedNotes, relatedReason } from "./relatedNotes";
import type { Note } from "../types/note";

function note(id: string, fields: Partial<Note> = {}): Note {
  return {
    id,
    title: "",
    content: "",
    tags: [],
    favorite: false,
    createdAt: "",
    updatedAt: "",
    ...fields,
  };
}
const fillers = [note("x"), note("y"), note("z")];

describe("Related notes", () => {
  it("suggests normalized shared tags without modifying notes or duplicating references", () => {
    const notes = [
      note("a", { tags: [" Kubernetes ", "kubernetes"] }),
      note("b", { tags: ["KUBERNETES"] }),
      ...fillers,
    ];
    const before = JSON.stringify(notes);
    const edges = buildRelatedNotes(notes, []);
    expect(edges).toHaveLength(1);
    expect(edges[0]).toMatchObject({
      source: "a",
      target: "b",
      tags: ["kubernetes"],
      terms: [],
    });
    expect(relatedReason(edges[0])).toBe("Shared tags: #kubernetes");
    expect(buildRelatedNotes(notes, [{ source: "b", target: "a" }])).toEqual(
      [],
    );
    expect(JSON.stringify(notes)).toBe(before);
  });
  it("does not connect notes just because they share a folder or a ubiquitous tag", () => {
    const notes = Array.from({ length: 8 }, (_, i) =>
      note(String(i), { tags: ["work"], folderId: "work" }),
    );
    expect(buildRelatedNotes(notes, [])).toEqual([]);
    expect(
      buildRelatedNotes(
        notes.map((n) => ({ ...n, tags: [] })),
        [],
      ),
    ).toEqual([]);
  });
  it("prefers distinctive tags and limits every node to three suggestions deterministically", () => {
    const notes = Array.from({ length: 8 }, (_, i) =>
      note(String(i), { tags: i < 2 ? ["topic", "rare"] : ["topic"] }),
    );
    const input = [
      ...notes,
      ...Array.from({ length: 12 }, (_, i) => note(`f${i}`)),
    ];
    const edges = buildRelatedNotes(input, []);
    expect(edges[0]).toMatchObject({
      source: "0",
      target: "1",
      tags: ["rare", "topic"],
    });
    for (const n of input)
      expect(
        edges.filter((e) => e.source === n.id || e.target === n.id).length,
      ).toBeLessThanOrEqual(3);
    expect(buildRelatedNotes([...input].reverse(), [])).toEqual(edges);
  });
  it("finds untagged notes by distinctive title and body terms", () => {
    const edges = buildRelatedNotes(
      [
        note("a", {
          title: "Kubernetes cluster",
          content: "Configure ingress certificates",
        }),
        note("b", {
          title: "Kubernetes cluster setup",
          content: "Renew ingress certificates",
        }),
        ...fillers,
      ],
      [],
    );
    expect(edges).toHaveLength(1);
    expect(edges[0].tags).toEqual([]);
    expect(edges[0].terms).toContain("kubernetes");
    expect(relatedReason(edges[0])).toContain("Similar wording:");
  });
  it("rejects a single shared word, boilerplate, URLs and code blocks", () => {
    for (const content of [
      "the and pour avec dans cette notre",
      "https://example.com/kubernetes/cluster/ingress",
      "```js\nkubernetes cluster ingress\n```",
      "`kubernetes cluster ingress`",
      "[[Kubernetes cluster ingress]]",
    ]) {
      expect(
        buildRelatedNotes(
          [note("a", { content }), note("b", { content }), ...fillers],
          [],
        ),
      ).toEqual([]);
    }
    expect(
      buildRelatedNotes(
        [
          note("a", { title: "Cluster deployment" }),
          note("b", { title: "Cluster troubleshooting" }),
          ...fillers,
        ],
        [],
      ),
    ).toEqual([]);
  });
  it("recognizes accented words and ignores repeated terms", () => {
    const edges = buildRelatedNotes(
      [
        note("a", { content: "sécurité réseau serveur serveur serveur" }),
        note("b", { content: "securite reseau serveur" }),
        ...fillers,
      ],
      [],
    );
    expect(edges).toHaveLength(1);
    expect(edges[0].terms).toEqual(["reseau", "securite", "serveur"]);
  });
  it("updates suggestions when content changes or a note is deleted", () => {
    const a = note("a", { title: "Kubernetes cluster" });
    const b = note("b", { title: "Kubernetes cluster setup" });
    expect(buildRelatedNotes([a, b, ...fillers], [])).toHaveLength(1);
    expect(
      buildRelatedNotes([a, { ...b, title: "Grocery list" }, ...fillers], []),
    ).toEqual([]);
    expect(buildRelatedNotes([a, ...fillers], [])).toEqual([]);
    expect(buildRelatedNotes([], [])).toEqual([]);
  });
});
