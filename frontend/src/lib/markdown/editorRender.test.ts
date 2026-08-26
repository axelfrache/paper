import { describe, expect, it } from "vitest";
import { createDefaultDiagram, serializeDiagramMarker } from "../diagram";
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

  it("renders inactive diagram markers as editable cards", () => {
    const marker = serializeDiagramMarker(createDefaultDiagram());
    const host = render(renderEditableMarkdown(marker, -1));

    expect(host.querySelector("[data-diagram-line='0']")).not.toBeNull();
    expect(host.querySelector("[data-diagram-edit-line='0']")).not.toBeNull();
  });

  it("keeps active diagram markers as plain editable source", () => {
    const marker = serializeDiagramMarker(createDefaultDiagram());
    const host = render(renderEditableMarkdown(marker, 0));

    expect(host.querySelector("[data-diagram-line='0']")).toBeNull();
    expect(host.textContent).toBe(marker);
  });
});
