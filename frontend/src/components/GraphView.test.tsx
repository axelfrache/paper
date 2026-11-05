import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { forceSimulation } from "d3-force";
import { GraphView } from "./GraphView";
import type { Note } from "../types/note";

vi.mock("d3-force", async (importOriginal) => {
  const actual = await importOriginal<typeof import("d3-force")>();
  return { ...actual, forceSimulation: vi.fn(actual.forceSimulation) };
});
const onSelect = vi.fn();
let root: Root;
let host: HTMLDivElement;
let resize: (width: number, height: number) => void;
const notes: Note[] = [
  {
    id: "a",
    title: "First note",
    content: "",
    tags: [],
    favorite: false,
    createdAt: "",
    updatedAt: "",
  },
];
for (const method of ["showModal", "close"] as const) {
  if (!HTMLDialogElement.prototype[method])
    Object.defineProperty(HTMLDialogElement.prototype, method, {
      configurable: true,
      writable: true,
      value() {},
    });
}
beforeEach(() => {
  onSelect.mockClear();
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(
    function (this: HTMLDialogElement) {
      this.setAttribute("open", "");
    },
  );
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.removeAttribute("open");
  });
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = (width, height) =>
          callback(
            [{ contentRect: { width, height } } as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
      }
      observe() {}
      disconnect() {}
    },
  );
  vi.spyOn(Math, "random").mockReturnValue(0.5);
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
function mount(
  items = notes,
  activeId: string | null = "a",
  sidebarHidden = false,
  onToggleSidebar = () => {},
) {
  act(() =>
    root.render(
      <StrictMode>
        <div>
          <GraphView
            sidebarHidden={sidebarHidden}
            onToggleSidebar={onToggleSidebar}
            notes={items}
            folders={[]}
            activeId={activeId}
            onSelect={onSelect}
            onResizeStart={() => {}}
            onResizeBy={() => {}}
          />
          <button id="outside">Editor</button>
        </div>
      </StrictMode>,
    ),
  );
  const svg = host.querySelector<SVGSVGElement>(".graph-canvas")!;
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(
    new DOMRect(0, 0, 400, 300),
  );
  host.querySelectorAll(".graph-node").forEach((node) => {
    if (!("getBBox" in node))
      Object.defineProperty(node, "getBBox", {
        configurable: true,
        value: () => ({ x: -12, y: -12, width: 24, height: 38 }),
      });
  });
  act(() => resize(400, 300));
  return svg;
}
function button(label: string) {
  return host.querySelector<HTMLButtonElement>(
    `button[aria-label="${label}"]`,
  )!;
}
function click(label: string) {
  act(() => button(label).click());
}
function camera() {
  const transform = host
    .querySelector(".graph-canvas > g")!
    .getAttribute("transform")!;
  const [x, y, k] = transform
    .match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/g)!
    .map(Number);
  return { x, y, k };
}
describe("Graph navigation", () => {
  it("zooms around the viewport center and resets to 100%", () => {
    mount();
    click("Zoom in");
    expect(camera()).toEqual({ x: -40, y: -30, k: 1.2 });
    click("Reset zoom to 100%");
    expect(camera()).toEqual({ x: 0, y: 0, k: 1 });
    click("Zoom out");
    expect(camera().k).toBeCloseTo(1 / 1.2);
  });
  it("anchors wheel zoom at the pointer", () => {
    const svg = mount();
    act(() =>
      svg.dispatchEvent(
        new WheelEvent("wheel", {
          clientX: 100,
          clientY: 80,
          deltaY: -100,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(camera().k).toBeCloseTo(1.1);
    expect(camera().x).toBeCloseTo(-10);
    expect(camera().y).toBeCloseTo(-8);
  });
  it("fits node labels with a margin, independently of reset zoom", () => {
    mount();
    Object.defineProperty(host.querySelector(".graph-node"), "getBBox", {
      value: () => ({ x: -250, y: -12, width: 500, height: 38 }),
    });
    const stop = vi.spyOn(simulation(), "stop");
    click("Fit all notes");
    expect(stop).toHaveBeenCalled();
    expect(camera().k).toBeCloseTo(336 / 500);
    expect(camera().x + 50 * camera().k).toBeCloseTo(32);
    expect(camera().x + 550 * camera().k).toBeCloseTo(368);
    click("Reset zoom to 100%");
    expect(camera().k).toBe(1);
  });
  it("centers the active note at the current zoom", () => {
    mount();
    click("Zoom in");
    click("Center active note");
    expect(camera()).toEqual({ x: -160, y: -90, k: 1.2 });
  });
  it("restores the camera and focus after expansion and Escape", () => {
    mount();
    click("Zoom in");
    const before = camera();
    click("Expand graph");
    expect(
      host.querySelector('[role="dialog"][aria-modal="true"]'),
    ).not.toBeNull();
    expect(host.querySelector<HTMLElement>("#outside")!.inert).toBe(true);
    act(() => resize(1000, 700));
    expect(camera()).toEqual({
      x: before.x + 300,
      y: before.y + 200,
      k: before.k,
    });
    click("Zoom out");
    act(() =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Escape", bubbles: true }),
      ),
    );
    act(() => resize(400, 300));
    expect(camera()).toEqual(before);
    expect(host.querySelector('[role="dialog"]')).toBeNull();
    expect(host.querySelector<HTMLElement>("#outside")!.inert).toBeFalsy();
    expect(document.activeElement).toBe(button("Expand graph"));
  });
  it("keeps keyboard focus inside the expanded graph", () => {
    mount();
    click("Expand graph");
    button("Center active note").focus();
    act(() =>
      window.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Tab",
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    expect(document.activeElement?.getAttribute("aria-label")).toBe(
      "Search graph notes",
    );
  });
  it("disables controls without a target in an empty graph", () => {
    mount([], null);
    expect(button("Fit all notes").disabled).toBe(true);
    expect(button("Center active note").disabled).toBe(true);
    click("Expand graph");
    click("Restore graph");
    expect(camera().k).toBe(1);
  });
});

function pointer(
  target: Element,
  type: string,
  id: number,
  x: number,
  y: number,
  button = 0,
) {
  const event = new MouseEvent(type, {
    bubbles: true,
    cancelable: true,
    clientX: x,
    clientY: y,
    button,
  });
  Object.defineProperty(event, "pointerId", { value: id });
  act(() => target.dispatchEvent(event));
}
function key(target: Element, value: string) {
  act(() =>
    target.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: value,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
}
function simulation() {
  return vi.mocked(forceSimulation).mock.results.at(-1)!.value as ReturnType<
    typeof forceSimulation
  >;
}

describe("Reliable graph interactions", () => {
  it("does not restart settled physics when selecting a note", () => {
    const svg = mount();
    const sim = simulation().stop();
    const restart = vi.spyOn(sim, "restart");
    pointer(host.querySelector(".graph-node")!, "pointerdown", 1, 100, 100);
    pointer(svg, "pointerup", 1, 100, 100);
    expect(restart).not.toHaveBeenCalled();
    expect(onSelect).toHaveBeenCalledTimes(1);
  });
  it("keeps linked notes close during a sustained drag without pushing unrelated notes away", () => {
    const svg = mount(chain);
    const sim = simulation().stop();
    sim.tick(300);
    const nodes = sim.nodes();
    const first = nodes[0];
    const orphan = nodes[4];
    const orphanPosition = { x: orphan.x, y: orphan.y };
    const before = camera();
    const x = first.x! + 240;
    const y = first.y! + 80;
    pointer(
      host.querySelector('[data-note-id="a"]')!,
      "pointerdown",
      1,
      first.x!,
      first.y!,
    );
    pointer(svg, "pointermove", 1, x, y);
    sim.stop().tick(400);
    expect({ x: first.x, y: first.y }).toEqual({ x, y });
    expect({ x: orphan.x, y: orphan.y }).toEqual(orphanPosition);
    for (let index = 0; index < 3; index++) {
      expect(
        Math.hypot(
          nodes[index].x! - nodes[index + 1].x!,
          nodes[index].y! - nodes[index + 1].y!,
        ),
      ).toBeLessThan(115);
    }
    pointer(svg, "pointerup", 1, x, y);
    sim.tick(300);
    expect(
      Math.hypot(orphan.x! - orphanPosition.x!, orphan.y! - orphanPosition.y!),
    ).toBeLessThan(30);
    for (const node of nodes) {
      expect(node.fx == null && node.fy == null).toBe(true);
    }
    expect(camera()).toEqual(before);
    expect(onSelect).not.toHaveBeenCalled();
  });
  it.each(["pointercancel", "lostpointercapture", "blur"])(
    "releases unrelated nodes after a drag ends through %s",
    (type) => {
      const svg = mount(chain);
      const sim = simulation().stop();
      sim.tick(200);
      const first = sim.nodes()[0];
      const orphan = sim.nodes()[4];
      pointer(
        host.querySelector('[data-note-id="a"]')!,
        "pointerdown",
        1,
        first.x!,
        first.y!,
      );
      pointer(svg, "pointermove", 1, first.x! + 100, first.y!);
      expect(orphan.fx).toBe(orphan.x);
      if (type === "blur") act(() => window.dispatchEvent(new Event("blur")));
      else pointer(svg, type, 1, 200, 100);
      for (const node of sim.nodes()) {
        expect(node.fx == null && node.fy == null).toBe(true);
      }
      expect(sim.alphaTarget()).toBe(0);
    },
  );
  it("relaxes stretched links after a quick drag without changing the zoom", () => {
    const svg = mount(chain);
    const sim = simulation().stop();
    sim.tick(300);
    const first = sim.nodes()[0];
    const x = first.x! + 240;
    const y = first.y!;
    const before = camera();
    pointer(
      host.querySelector('[data-note-id="a"]')!,
      "pointerdown",
      1,
      first.x!,
      first.y!,
    );
    pointer(svg, "pointermove", 1, x, y);
    pointer(svg, "pointerup", 1, x, y);
    sim.stop().tick(300);
    const nodes = sim.nodes();
    for (let index = 0; index < 3; index++) {
      expect(
        Math.hypot(
          nodes[index].x! - nodes[index + 1].x!,
          nodes[index].y! - nodes[index + 1].y!,
        ),
      ).toBeLessThan(130);
    }
    expect(camera()).toEqual(before);
  });
  it("opens a note on a tap but not after a drag, cancellation or right click", () => {
    const svg = mount();
    const node = host.querySelector(".graph-node")!;
    pointer(node, "pointerdown", 1, 100, 100);
    pointer(svg, "pointerup", 1, 100, 100);
    expect(onSelect).toHaveBeenCalledTimes(1);
    pointer(node, "pointerdown", 2, 100, 100);
    pointer(svg, "pointermove", 2, 140, 140);
    pointer(svg, "pointerup", 2, 140, 140);
    pointer(node, "pointerdown", 3, 100, 100);
    pointer(svg, "pointercancel", 3, 100, 100);
    pointer(svg, "pointerup", 3, 100, 100);
    pointer(node, "pointerdown", 4, 100, 100, 2);
    pointer(svg, "pointerup", 4, 100, 100, 2);
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(simulation().nodes()[0].fx).toBeNull();
    expect(simulation().alphaTarget()).toBe(0);
  });
  it("pinches around the midpoint then lets the remaining finger pan without opening a note", () => {
    const svg = mount();
    const node = host.querySelector(".graph-node")!;
    pointer(node, "pointerdown", 1, 100, 100);
    pointer(svg, "pointerdown", 2, 200, 100);
    pointer(svg, "pointermove", 2, 300, 100);
    expect(camera()).toEqual({ x: -100, y: -100, k: 2 });
    expect(simulation().nodes()[0].fx).toBeNull();
    pointer(svg, "pointerup", 2, 300, 100);
    pointer(svg, "pointermove", 1, 110, 120);
    expect(camera()).toEqual({ x: -90, y: -80, k: 2 });
    pointer(svg, "pointerup", 1, 110, 120);
    expect(onSelect).not.toHaveBeenCalled();
  });
  it.each(["pointercancel", "lostpointercapture"])(
    "stops moving after %s",
    (type) => {
      const svg = mount();
      pointer(svg, "pointerdown", 1, 100, 100);
      pointer(svg, "pointermove", 1, 120, 130);
      const before = camera();
      pointer(svg, type, 1, 120, 130);
      pointer(svg, "pointermove", 1, 220, 230);
      expect(camera()).toEqual(before);
    },
  );
  it("releases a dragged node on blur and on unmount", () => {
    const svg = mount();
    const sim = simulation();
    pointer(host.querySelector(".graph-node")!, "pointerdown", 1, 100, 100);
    act(() => window.dispatchEvent(new Event("blur")));
    expect(sim.nodes()[0].fx).toBeNull();
    pointer(host.querySelector(".graph-node")!, "pointerdown", 2, 100, 100);
    act(() => root.render(null));
    expect(sim.nodes()[0].fx).toBeNull();
    pointer(svg, "pointerup", 2, 100, 100);
    expect(onSelect).not.toHaveBeenCalled();
  });
  it("navigates nodes and opens the focused note using the keyboard", () => {
    const second = { ...notes[0], id: "b", title: "Second" };
    const svg = mount([...notes, second]);
    key(svg, "+");
    expect(camera().k).toBe(1.2);
    key(svg, "0");
    key(svg, "ArrowRight");
    expect(camera().x).toBe(-40);
    const first = host.querySelector(".graph-node")!;
    act(() => (first as SVGElement).focus());
    key(first, "ArrowRight");
    expect(document.activeElement?.getAttribute("data-note-id")).toBe("b");
    key(document.activeElement!, "Enter");
    expect(onSelect).toHaveBeenCalledWith(second, false);
  });
  it("preserves settled positions without restarting physics for presentation or ordering changes", () => {
    const second = { ...notes[0], id: "b", title: "Second" };
    mount([...notes, second]);
    const sim = simulation();
    sim.stop();
    sim.tick(200);
    const positions = sim.nodes().map((node) => [node.x, node.y]);
    const restart = vi.spyOn(sim, "restart");
    mount([
      second,
      { ...notes[0], title: "Renamed", tags: ["new"], folderId: "f" },
    ]);
    expect(restart).not.toHaveBeenCalled();
    expect(sim.nodes().map((node) => [node.x, node.y])).toEqual(positions);
    expect(
      host.querySelector('[aria-label="Open note: Renamed"]'),
    ).not.toBeNull();
  });
  it("removes a linked node without retaining obsolete simulation links", () => {
    const first = { ...notes[0], content: "[[Second]]" };
    mount([first, { ...notes[0], id: "b", title: "Second" }]);
    expect(host.querySelectorAll(".graph-edge")).toHaveLength(1);
    expect(() => mount([first])).not.toThrow();
    expect(host.querySelectorAll(".graph-edge")).toHaveLength(0);
    click("1 unresolved link");
    expect(host.querySelector(".graph-link-issues")?.textContent).toContain(
      "note not found",
    );
  });
});

function changeValue(
  element: HTMLInputElement | HTMLSelectElement,
  value: string,
) {
  const prototype =
    element instanceof HTMLInputElement
      ? HTMLInputElement.prototype
      : HTMLSelectElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      element,
      value,
    );
    element.dispatchEvent(
      new Event(element instanceof HTMLInputElement ? "input" : "change", {
        bubbles: true,
      }),
    );
  });
}
function shownIds() {
  return Array.from(host.querySelectorAll<SVGGElement>(".graph-node"))
    .filter((node) => node.style.display !== "none")
    .map((node) => node.dataset.noteId);
}
const chain: Note[] = [
  {
    ...notes[0],
    title: "Alpha",
    content: "[[Beta]]",
    tags: ["work", "shared"],
  },
  {
    ...notes[0],
    id: "b",
    title: "Beta",
    content: "[[Gamma]]",
    tags: ["shared"],
  },
  { ...notes[0], id: "c", title: "Gamma", content: "[[Delta]]" },
  { ...notes[0], id: "d", title: "Delta" },
  { ...notes[0], id: "o", title: "Orphan" },
];

describe("Graph exploration controls", () => {
  it("filters by local depth and tags without restarting physics", () => {
    mount(chain);
    const sim = simulation();
    sim.stop();
    const restart = vi.spyOn(sim, "restart");
    changeValue(
      host.querySelector<HTMLSelectElement>('[aria-label="Graph scope"]')!,
      "1",
    );
    expect(shownIds()).toEqual(["a", "b"]);
    changeValue(
      host.querySelector<HTMLSelectElement>('[aria-label="Graph scope"]')!,
      "2",
    );
    expect(shownIds()).toEqual(["a", "b", "c"]);
    tagFilter("shared");
    expect(shownIds()).toEqual(["a", "b"]);
    expect(restart).not.toHaveBeenCalled();
    expect(
      host.querySelector('[data-note-id="c"]')?.getAttribute("tabindex"),
    ).toBe("-1");
  });
  it("searches all notes, clears restrictive filters and centers a result without opening the editor", () => {
    mount(chain);
    tagFilter("shared");
    expect(shownIds()).not.toContain("d");
    const search = host.querySelector<HTMLInputElement>(
      '[aria-label="Search graph notes"]',
    )!;
    changeValue(search, "delta");
    expect(host.querySelector(".graph-search-results")?.textContent).toContain(
      "Delta",
    );
    key(search, "Enter");
    expect(shownIds()).toContain("d");
    expect(document.activeElement?.getAttribute("data-note-id")).toBe("d");
    expect(camera().x + 300 * camera().k).toBeCloseTo(200);
    expect(onSelect).not.toHaveBeenCalled();
  });
  it("highlights neighbors and hides secondary labels at low zoom", () => {
    const svg = mount(chain);
    expect(
      host.querySelector('[data-note-id="c"]')?.classList.contains("is-dimmed"),
    ).toBe(true);
    expect(
      host.querySelector('[data-note-id="b"]')?.classList.contains("is-dimmed"),
    ).toBe(false);
    for (let i = 0; i < 3; i++) key(svg, "-");
    expect(
      host.querySelector<SVGTextElement>('[data-note-id="c"] text')!.style
        .display,
    ).toBe("none");
    expect(
      host.querySelector<SVGTextElement>('[data-note-id="a"] text')!.style
        .display,
    ).not.toBe("none");
    act(() => host.querySelector<SVGGElement>('[data-note-id="c"]')!.focus());
    expect(
      host.querySelector<SVGTextElement>('[data-note-id="c"] text')!.style
        .display,
    ).not.toBe("none");
    expect(
      host.querySelector('[data-note-id="d"]')?.classList.contains("is-dimmed"),
    ).toBe(false);
  });
  it("explains empty filtered views and restores all notes", () => {
    mount(chain);
    tagFilter("work");
    click("Graph filters");
    act(() =>
      host
        .querySelector<HTMLInputElement>(
          '[aria-label="Hide notes without visible links"]',
        )!
        .click(),
    );
    expect(shownIds()).toEqual([]);
    click("Close graph panel");
    expect(host.querySelector(".graph-empty")?.textContent).toContain(
      "No notes match",
    );
    act(() =>
      host.querySelector<HTMLButtonElement>(".graph-empty button")!.click(),
    );
    expect(shownIds()).toHaveLength(5);
  });
  it("provides an honest tag legend and a useful empty graph message", () => {
    mount(chain);
    act(() =>
      Array.from(
        host.querySelectorAll<HTMLButtonElement>(".graph-color-toggle button"),
      )
        .find((button) => button.textContent === "Tag")!
        .click(),
    );
    expect(
      host.querySelector(".graph-legend")?.getAttribute("title"),
    ).toContain("first tag");
    expect(host.querySelector(".graph-legend")?.textContent).toContain(
      "No tag",
    );
    mount([], null);
    expect(host.querySelector(".graph-empty")?.textContent).toContain(
      "[[Note title]]",
    );
  });
});

function tagFilter(tag: string) {
  act(() =>
    Array.from(
      host.querySelectorAll<HTMLButtonElement>(".graph-color-toggle button"),
    )
      .find((button) => button.textContent === "Tag")!
      .click(),
  );
  click(`Filter tag: ${tag}`);
}

describe("Overlay graph filters", () => {
  it("keeps camera and simulation positions when toggling filters and opening panels", () => {
    mount(chain);
    const sim = simulation();
    sim.stop();
    click("Zoom in");
    const before = camera();
    const positions = sim.nodes().map((node) => [node.x, node.y]);
    click("Graph filters");
    expect(host.querySelector("dialog[open]")).not.toBeNull();
    click("Filter tag: shared");
    expect(shownIds()).toEqual(["a", "b"]);
    expect(camera()).toEqual(before);
    click("Close graph panel");
    expect(camera()).toEqual(before);
    expect(sim.nodes().map((node) => [node.x, node.y])).toEqual(positions);
    expect(document.activeElement).toBe(button("Graph filters"));
  });
  it("uses any tag, stable totals and multiple selections", () => {
    mount(chain);
    tagFilter("shared");
    expect(shownIds()).toEqual(["a", "b"]);
    expect(button("Filter tag: shared").textContent).toContain("2");
    expect(button("Filter tag: No tag").textContent).toContain("3");
    click("Filter tag: No tag");
    expect(shownIds()).toHaveLength(5);
    click("Filter tag: shared");
    expect(shownIds()).toEqual(["c", "d", "o"]);
    expect(button("Filter tag: shared").getAttribute("aria-pressed")).toBe(
      "false",
    );
    click("Remove tag filter: No tag");
    expect(shownIds()).toHaveLength(5);
  });
  it("unions folder chips and clears them on the second click", () => {
    mount([{ ...chain[0], folderId: "f1" }, chain[1]]);
    const chips = host.querySelectorAll<HTMLButtonElement>(
      ".graph-legend .graph-facet",
    );
    act(() => chips[0].click());
    expect(shownIds()).toEqual(["a"]);
    act(() => chips[1].click());
    expect(shownIds()).toEqual(["a", "b"]);
    act(() => chips[0].click());
    expect(shownIds()).toEqual(["b"]);
  });
  it("cancels a filter dialog without leaving expanded mode", () => {
    mount(chain);
    click("Expand graph");
    click("Graph filters");
    const dialog = host.querySelector("dialog")!;
    key(dialog, "Escape");
    expect(host.querySelector(".graph-view.is-expanded")).not.toBeNull();
    act(() => dialog.dispatchEvent(new Event("cancel", { cancelable: true })));
    expect(host.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(button("Graph filters"));
    expect(host.querySelector(".graph-view.is-expanded")).not.toBeNull();
  });
  it("opens link details only on request and closes on an outside click", () => {
    mount([{ ...notes[0], content: "[[missing]]" }]);
    expect(host.querySelector(".graph-link-issues")).toBeNull();
    click("1 unresolved link");
    expect(host.querySelector(".graph-link-issues")?.textContent).toContain(
      "missing",
    );
    act(() =>
      host.querySelector("dialog")!.dispatchEvent(
        new MouseEvent("click", {
          bubbles: true,
          clientX: -10,
          clientY: -10,
        }),
      ),
    );
    expect(host.querySelector("dialog")).toBeNull();
    expect(document.activeElement).toBe(button("1 unresolved link"));
  });
});

describe("Graph navigation in expanded mode", () => {
  it.each(["button", "Escape"])(
    "hides Paper while expanded and restores it after closing with %s",
    (method) => {
      const onToggleSidebar = vi.fn();
      mount(notes, "a", true, onToggleSidebar);
      expect(button("Expand navigation")).not.toBeNull();
      click("Expand graph");
      expect(host.querySelector(".notes-brand")).toBeNull();
      expect(host.querySelector(".graph-heading")?.textContent).toBe("Graph");
      expect(onToggleSidebar).not.toHaveBeenCalled();
      if (method === "button") click("Restore graph");
      else key(host.querySelector(".graph-canvas")!, "Escape");
      expect(button("Expand navigation")).not.toBeNull();
      click("Expand navigation");
      expect(onToggleSidebar).toHaveBeenCalledOnce();
      click("Expand graph");
      expect(host.querySelector(".notes-brand")).toBeNull();
    },
  );
  it("does not expose navigation if the sidebar state changes while expanded", () => {
    mount();
    click("Expand graph");
    mount(notes, "a", true);
    expect(host.querySelector(".graph-view.is-expanded")).not.toBeNull();
    expect(host.querySelector(".notes-brand")).toBeNull();
    click("Restore graph");
    expect(button("Expand navigation")).not.toBeNull();
  });
});

describe("Suggested graph connections", () => {
  const related = [
    { ...notes[0], title: "Deploy plan", tags: ["kubernetes"] },
    { ...notes[0], id: "b", title: "Cluster notes", tags: ["kubernetes"] },
    { ...notes[0], id: "c", title: "Grocery list" },
  ];
  const shownSuggestions = () =>
    Array.from(
      host.querySelectorAll<SVGLineElement>(".graph-related-edge"),
    ).filter((edge) => edge.style.display !== "none");
  it("reveals explainable suggestions on selection without counting them as references", () => {
    mount(related);
    expect(shownSuggestions()).toHaveLength(1);
    expect(host.querySelectorAll(".graph-edge")).toHaveLength(0);
    expect(host.querySelector(".graph-explorer-status")?.textContent).toContain(
      "0 links",
    );
    expect(host.querySelector(".graph-related-panel")?.textContent).toContain(
      "Shared tags: #kubernetes",
    );
    const panel = host.querySelector<HTMLDetailsElement>(
      ".graph-related-panel",
    )!;
    act(() => {
      panel.open = true;
      panel.querySelector<HTMLButtonElement>("button")!.click();
    });
    expect(onSelect).toHaveBeenCalledWith(related[1], false);
    expect(document.activeElement?.getAttribute("data-note-id")).toBe("b");
  });
  it("keeps suggested lines hidden at rest and reveals them on hover and keyboard focus", () => {
    mount(related, null);
    expect(shownSuggestions()).toHaveLength(0);
    const node = host.querySelector('[data-note-id="a"]')!;
    pointer(node, "pointerover", 1, 100, 100);
    expect(shownSuggestions()).toHaveLength(1);
    pointer(node, "pointerout", 1, 100, 100);
    expect(shownSuggestions()).toHaveLength(0);
    act(() => (node as SVGElement).focus());
    expect(shownSuggestions()).toHaveLength(1);
  });
  it("includes suggestions in local views and can disable them without changing zoom", () => {
    mount(related);
    changeValue(host.querySelector('[aria-label="Graph scope"]')!, "1");
    expect(shownIds()).toEqual(["a", "b"]);
    const before = camera();
    click("Graph filters");
    act(() =>
      host
        .querySelector<HTMLInputElement>(
          '[aria-label="Suggest related notes"]',
        )!
        .click(),
    );
    expect(shownIds()).toEqual(["a"]);
    expect(host.querySelectorAll(".graph-related-edge")).toHaveLength(0);
    expect(host.querySelector(".graph-related-panel")).toBeNull();
    expect(camera()).toEqual(before);
  });
  it("hides suggestions whose other endpoint is filtered out", () => {
    mount(
      related.map((note, index) => ({
        ...note,
        tags: [...note.tags, index === 0 ? "first" : "second"],
      })),
    );
    click("Graph filters");
    click("Filter tag: first");
    expect(shownSuggestions()).toHaveLength(0);
    expect(host.querySelector(".graph-related-panel")).toBeNull();
  });
  it("removes outdated suggestions from both the drawing and physics", () => {
    mount(related);
    simulation().stop();
    expect(shownSuggestions()).toHaveLength(1);
    mount(related.map((note) => ({ ...note, tags: [] })));
    expect(host.querySelectorAll(".graph-related-edge")).toHaveLength(0);
    expect(() => simulation().stop().tick(10)).not.toThrow();
    expect(host.querySelector(".graph-related-panel")).toBeNull();
  });
});
