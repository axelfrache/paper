import { describe, expect, it } from "vitest";
import { createDefaultDiagram, serializeDiagramMarker } from "../diagram";
import { readSource } from "./dom";
import { renderEditableLine, renderEditableMarkdown } from "./editorRender";

function render(html: string) {
  const host = document.createElement("div");
  host.innerHTML = html;
  return host;
}

describe("editable markdown renderer", () => {
  it("renders formatted inline text", () => {
    const host = render(renderEditableMarkdown("Use **bold**, *italic*, ~~strike~~, <u>underline</u> and `code`.", -1));

    expect(host.querySelector("strong")?.textContent).toBe("bold");
    expect(host.querySelector("em")?.textContent).toBe("italic");
    expect(host.querySelector("s")?.textContent).toBe("strike");
    expect(host.querySelector("u")?.textContent).toBe("underline");
    expect(host.querySelector("code")?.textContent).toBe("code");
  });

  it("keeps syntax markers visible on the active line", () => {
    const host = render(renderEditableMarkdown("# Title", 0));
    const line = host.querySelector("[data-line='0']");

    expect(line?.textContent).toBe("# Title");
    expect(line?.querySelector("span")?.getAttribute("style")).toContain("color:#a7acb2;");
  });

  it("hides syntax markers on inactive headings", () => {
    const host = render(renderEditableMarkdown("# Title", -1));
    const marker = host.querySelector("[data-line='0'] span");

    expect(marker?.getAttribute("style")).toContain("display:none;");
  });

  it("renders safe and unsafe links", () => {
    const host = render(renderEditableMarkdown("[Paper](https://paper.home.axelfrache.com)\n[bad](javascript:alert(1))", -1));

    expect(host.querySelector("a")?.getAttribute("href")).toBe("https://paper.home.axelfrache.com");
    expect(host.querySelector(".markdown-link-invalid")?.textContent).toBe("bad");
  });

  it("escapes plain text before assigning it as HTML", () => {
    const host = render(renderEditableMarkdown("<script>alert(1)</script>", -1));

    expect(host.querySelector("script")).toBeNull();
    expect(host.textContent).toBe("<script>alert(1)</script>");
  });

  it("renders task controls as non-source decoration", () => {
    const host = render(renderEditableLine("- [x] Done **now**", false, 3));

    expect(host.querySelector("[data-check='3']")?.textContent).toBe("☑");
    expect(host.querySelector("[data-deco='1']")).not.toBeNull();
    expect(host.querySelector("strong")?.textContent).toBe("now");
  });

  it("adds no extra line after a divider, wherever it sits", () => {
    // Unlike a resource, a divider line can hold the caret, so it needs no trailing line.
    expect(render(renderEditableMarkdown("---", -1)).querySelectorAll("[data-line]")).toHaveLength(1);
    expect(render(renderEditableMarkdown("---\nAfter", -1)).querySelectorAll("[data-line]")).toHaveLength(2);
  });

  it("aligns a line and hands the marker back through readSource", () => {
    const host = render(renderEditableLine("Hello{align=center}", false, 0));

    const line = host.querySelector<HTMLElement>("[data-line='0']");
    expect(line?.style.textAlign).toBe("center");
    // Drawn without the marker, but the source round-trips it.
    expect(line?.textContent).toBe("Hello");
    expect(readSource(host as HTMLDivElement)).toBe("Hello{align=center}");
  });

  it("leaves a default-aligned line free of any marker", () => {
    const host = render(renderEditableLine("Hello", false, 0));

    expect(host.querySelector<HTMLElement>("[data-line='0']")?.style.textAlign).toBe("");
    expect(readSource(host as HTMLDivElement)).toBe("Hello");
  });

  it("renders the divider rule as a direct flex child of its line", () => {
    const host = render(renderEditableLine("---", false, 2));

    const line = host.querySelector("[data-line='2']");
    const rule = host.querySelector(".markdown-editor-divider-rule");
    // `flex: 1` only stretches the rule if it is a flex item of the line itself.
    expect(rule?.parentElement).toBe(line);
    expect(rule?.getAttribute("data-deco")).toBe("1");
    expect(readSource(host as HTMLDivElement)).toBe("---");
  });

  it("renders diagram markers as atomic resource blocks", () => {
    const marker = serializeDiagramMarker(createDefaultDiagram());
    const host = render(renderEditableMarkdown(marker, -1));

    expect(host.querySelector("[data-diagram-line='0']")).not.toBeNull();
    expect(host.querySelector("[data-diagram-edit-line='0']")).not.toBeNull();
    expect(host.querySelector("[data-resource-delete-line='0']")).not.toBeNull();
  });

  it("keeps selected diagrams atomic without exposing their source", () => {
    const marker = serializeDiagramMarker(createDefaultDiagram());
    const host = render(renderEditableMarkdown(marker, 0, 0));

    expect(host.querySelector("[data-resource-line='0']")?.classList.contains("is-selected")).toBe(true);
    expect(host.querySelector("[data-resource-line='0']")?.getAttribute("data-source")).toBe(marker);
    expect(host.textContent).not.toContain(marker);
  });

  it("renders standalone images as selectable atomic resources", () => {
    const marker = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
    const host = render(renderEditableMarkdown(marker, 0, 0));

    expect(host.querySelector("[data-resource-kind='image']")?.classList.contains("is-selected")).toBe(true);
    expect(host.querySelector("img")?.getAttribute("src")).toBe("/api/images/0123456789abcdef0123456789abcdef.png");
    expect(host.querySelector("[data-resource-line='0']")?.getAttribute("data-source")).toBe(marker);
    expect(host.textContent).not.toContain(marker);
  });

  it("renders a persisted image width with a resize handle", () => {
    const marker = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png){width=640}";
    const host = render(renderEditableMarkdown(marker, -1, 0));

    expect(host.querySelector("[data-resource-surface='0']")?.getAttribute("style")).toContain("640px");
    expect(host.querySelector(".markdown-editor-image")?.classList.contains("is-resized")).toBe(true);
    expect(host.querySelector("[data-image-resize-line='0']")).not.toBeNull();
    expect(host.querySelector("[data-resource-line='0']")?.getAttribute("data-source")).toBe(marker);
  });

  it("adds an editable line after a resource at the end of the document", () => {
    const marker = "![Architecture](/api/images/0123456789abcdef0123456789abcdef.png)";
    const host = render(renderEditableMarkdown(marker, -1));

    expect(host.querySelector("[data-line='1']")?.innerHTML).toContain("<br>");
  });
});
