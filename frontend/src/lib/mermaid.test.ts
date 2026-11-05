import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mountMermaidPreview } from "./mermaid";

const engine = vi.hoisted(() => ({ initialize: vi.fn(), render: vi.fn() }));
vi.mock("mermaid", () => ({ default: engine }));

let disposals: Array<() => void> = [];

function mount(source = "flowchart LR\nA --> B") {
  const host = document.createElement("div");
  document.body.appendChild(host);
  disposals.push(mountMermaidPreview(host, source));
  return host;
}

async function renderPending() {
  await vi.advanceTimersByTimeAsync(200);
  await vi.dynamicImportSettled();
}

beforeEach(() => {
  vi.useFakeTimers();
  engine.initialize.mockReset();
  engine.render
    .mockReset()
    .mockImplementation(async (id: string) => ({
      svg: `<svg id="${id}"><text>A to B</text></svg>`,
    }));
});

afterEach(() => {
  disposals.forEach((dispose) => dispose());
  disposals = [];
  document.body.replaceChildren();
  delete document.documentElement.dataset.theme;
  vi.useRealTimers();
});

describe("Mermaid previews", () => {
  it("loads only when needed, renders with unique IDs, and cleans temporary DOM", async () => {
    const first = mount(),
      second = mount();
    expect(engine.render).not.toHaveBeenCalled();
    await renderPending();
    expect(first.dataset.state).toBe("ready");
    expect(second.dataset.state).toBe("ready");
    expect(first.querySelector("svg")?.id).not.toBe(
      second.querySelector("svg")?.id,
    );
    expect(engine.initialize).toHaveBeenCalledWith(
      expect.objectContaining({
        securityLevel: "strict",
        startOnLoad: false,
        suppressErrorRendering: true,
      }),
    );
    expect(document.querySelector(".mermaid-render-container")).toBeNull();
  });

  it("shows errors and the original source as text, then allows other diagrams to render", async () => {
    engine.render.mockRejectedValueOnce(
      new Error("Invalid <img src=x onerror=alert(1)>"),
    );
    const invalid = mount("<script>bad syntax</script>");
    const valid = mount();
    await renderPending();
    expect(invalid.dataset.state).toBe("error");
    expect(invalid.textContent).toContain("<script>bad syntax</script>");
    expect(invalid.querySelector("script, img")).toBeNull();
    expect(valid.dataset.state).toBe("ready");
    expect(document.querySelector(".mermaid-render-container")).toBeNull();
  });

  it("ignores late results after disposal", async () => {
    let resolve!: (value: { svg: string }) => void;
    engine.render.mockReturnValueOnce(
      new Promise<{ svg: string }>((done) => {
        resolve = done;
      }),
    );
    const host = mount();
    await renderPending();
    disposals[0]();
    resolve({ svg: "<svg><text>Obsolete</text></svg>" });
    await renderPending();
    expect(host.querySelector("svg")).toBeNull();
    expect(document.querySelector(".mermaid-render-container")).toBeNull();
  });

  it("rerenders on theme changes and cancels work when removed before debounce", async () => {
    const host = mount();
    await renderPending();
    document.documentElement.dataset.theme = "dark";
    await Promise.resolve();
    await renderPending();
    expect(host.dataset.state).toBe("ready");
    expect(engine.initialize).toHaveBeenLastCalledWith(
      expect.objectContaining({ theme: "dark" }),
    );
    const calls = engine.render.mock.calls.length;
    mount().remove();
    await renderPending();
    expect(engine.render).toHaveBeenCalledTimes(calls);
  });
});
