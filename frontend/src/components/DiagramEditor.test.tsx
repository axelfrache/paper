import { act, useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { DiagramEditor } from "./DiagramEditor";
import type { Diagram, DiagramMode } from "../lib/diagram";
import type { Root } from "react-dom/client";

let root: Root | null = null;

const node = (id: string, x: number) => ({
  id,
  kind: "box" as const,
  label: id,
  color: "slate" as const,
  x,
  y: 0,
  w: 100,
  h: 60,
});

/** Three boxes in a row, the middle one centred between the other two. */
function rowOfThree(mode: DiagramMode = "flat"): Diagram {
  return { version: 1, mode, nodes: [node("left", 0), node("middle", 200), node("right", 400)], edges: [] };
}

function Harness({ initial, onValue }: { initial: Diagram; onValue: (diagram: Diagram) => void }) {
  const [diagram, setDiagram] = useState(initial);
  return (
    <DiagramEditor
      diagram={diagram}
      onChange={(next) => {
        setDiagram(next);
        onValue(next);
      }}
      onClose={() => {}}
    />
  );
}

/**
 * Mounts the editor, selects one node and exposes a way to press keys. The canvas is
 * given a size so screen-pixel distances resolve the way they do in a browser; jsdom
 * reports every element as zero-sized otherwise.
 */
function mount(initial: Diagram, canvasWidth = 400) {
  const host = document.createElement("div");
  document.body.replaceChildren(host);
  root = createRoot(host);
  let latest = initial;
  act(() => {
    root?.render(<Harness initial={initial} onValue={(diagram) => { latest = diagram; }} />);
  });

  const svg = host.querySelector<SVGSVGElement>("svg.diagram-canvas");
  if (!svg) {
    throw new Error("Missing canvas");
  }
  vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, canvasWidth, 300));
  const viewBoxWidth = Number(svg.getAttribute("viewBox")?.split(/\s+/)[2]);

  return {
    /** Diagram units per screen pixel, the scale every distance is expressed through. */
    unitsPerPixel: viewBoxWidth / canvasWidth,
    host,
    value: () => latest,
    select(index: number) {
      act(() => {
        host.querySelectorAll(".diagram-node")[index]?.dispatchEvent(
          new MouseEvent("pointerdown", { button: 0, bubbles: true, cancelable: true }),
        );
        window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
      });
    },
    press(key: string, options: KeyboardEventInit = {}) {
      act(() => {
        window.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...options }));
      });
      // The move is committed once the burst of key repeats stops.
      act(() => {
        vi.advanceTimersByTime(500);
      });
    },
    x(id: string) {
      return latest.nodes.find((item) => item.id === id)?.x ?? NaN;
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  act(() => {
    root?.unmount();
  });
  root = null;
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

describe("moving a selection with the arrow keys", () => {
  it("steps by one screen pixel, whatever the zoom", () => {
    const editor = mount(rowOfThree());
    editor.select(1);

    editor.press("ArrowRight");

    expect(editor.x("middle")).toBeCloseTo(200 + editor.unitsPerPixel, 1);
  });

  it("steps by ten with Shift", () => {
    const editor = mount(rowOfThree());
    editor.select(1);

    editor.press("ArrowRight", { shiftKey: true });

    expect(editor.x("middle")).toBeCloseTo(200 + 10 * editor.unitsPerPixel, 1);
  });

  it("keeps moving away from the magnet holding it centred", () => {
    const editor = mount(rowOfThree());
    editor.select(1);

    // Equal gaps left and right: the magnet pulls back on every press, and must lose.
    const positions = [1, 2, 3].map(() => {
      editor.press("ArrowRight");
      return editor.x("middle");
    });

    expect(positions[0]).toBeGreaterThan(200);
    expect(positions[1]).toBeGreaterThan(positions[0]);
    expect(positions[2]).toBeGreaterThan(positions[1]);
  });

  it("keeps moving left away from the magnet too", () => {
    const editor = mount(rowOfThree());
    editor.select(1);

    const positions = [1, 2, 3].map(() => {
      editor.press("ArrowLeft");
      return editor.x("middle");
    });

    expect(positions[0]).toBeLessThan(200);
    expect(positions[1]).toBeLessThan(positions[0]);
    expect(positions[2]).toBeLessThan(positions[1]);
  });

  it("goes where the key points in isometric mode too", () => {
    const editor = mount(rowOfThree("iso"));
    editor.select(1);

    editor.press("ArrowRight");

    // Right on screen is a diagonal in the model, so x moves by less than a full step.
    const moved = editor.x("middle");
    expect(moved).toBeGreaterThan(200);
    expect(moved).toBeLessThan(200 + editor.unitsPerPixel);
  });

  it("ignores the arrows when nothing is selected", () => {
    const editor = mount(rowOfThree());

    editor.press("ArrowRight");

    expect(editor.x("middle")).toBe(200);
  });
});

describe("the isometric placement grid", () => {
  function mountEditor(initial: Diagram) {
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    root = createRoot(host);
    act(() => {
      root?.render(<Harness initial={initial} onValue={() => {}} />);
    });
    return host;
  }

  it("draws grid lines for an isometric diagram", () => {
    const host = mountEditor(rowOfThree("iso"));
    expect(host.querySelectorAll(".diagram-grid line").length).toBeGreaterThan(0);
  });

  it("stays hidden for a flat diagram", () => {
    const host = mountEditor(rowOfThree("flat"));
    expect(host.querySelector(".diagram-grid")).toBeNull();
    expect(host.querySelector("button[aria-label='Isometric grid']")).toBeNull();
  });

  it("clears the grid when the toggle is turned off", () => {
    const host = mountEditor(rowOfThree("iso"));
    const toggle = host.querySelector<HTMLButtonElement>("button[aria-label='Isometric grid']");
    expect(toggle).not.toBeNull();

    act(() => {
      toggle?.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });

    expect(host.querySelector(".diagram-grid")).toBeNull();
  });
});


describe("palette-family icon colors", () => {
  function mountWithProxmox() {
    const diagram: Diagram = {
      version: 1,
      mode: "iso",
      nodes: [{ id: "px", kind: "proxmox", label: "px", color: "blue", x: 0, y: 0 }],
      edges: [],
    };
    const host = document.createElement("div");
    document.body.replaceChildren(host);
    root = createRoot(host);
    let latest = diagram;
    act(() => {
      root?.render(<Harness initial={diagram} onValue={(next) => { latest = next; }} />);
    });
    const svg = host.querySelector<SVGSVGElement>("svg.diagram-canvas")!;
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue(new DOMRect(0, 0, 400, 300));
    act(() => {
      host.querySelector(".diagram-node")?.dispatchEvent(
        new MouseEvent("pointerdown", { button: 0, bubbles: true, cancelable: true }),
      );
      window.dispatchEvent(new MouseEvent("pointerup", { bubbles: true }));
    });
    return { host, value: () => latest };
  }

  it("shows the standard swatches, not tone swatches, for a palette-family icon", () => {
    const { host } = mountWithProxmox();
    const icon = host.querySelector<SVGImageElement>(".diagram-node-icon");
    expect(icon?.getAttribute("href")).toBe("/diagram-icons/cloud-native/palette/proxmox/blue.svg");
    const swatches = host.querySelectorAll(".diagram-inspector-swatches .diagram-swatch");
    expect(Array.from(swatches).map((swatch) => swatch.getAttribute("aria-label"))).toEqual([
      "slate",
      "blue",
      "green",
      "amber",
      "violet",
    ]);
  });

  it("switches the icon file and the node color together when a swatch is clicked", () => {
    const { host, value } = mountWithProxmox();
    const greenSwatch = Array.from(host.querySelectorAll(".diagram-inspector-swatches .diagram-swatch")).find(
      (swatch) => swatch.getAttribute("aria-label") === "green",
    )!;
    act(() => {
      greenSwatch.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    });
    expect(value().nodes[0].color).toBe("green");
    const icon = host.querySelector<SVGImageElement>(".diagram-node-icon");
    expect(icon?.getAttribute("href")).toBe("/diagram-icons/cloud-native/palette/proxmox/green.svg");
  });
});

describe("diagram titles", () => {
  function editTitle(host: HTMLElement, text: string) {
    const input = host.querySelector<HTMLInputElement>('[aria-label="Diagram title"]')!;
    act(() => input.focus());
    act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    return input;
  }

  it("saves a trimmed title on Enter without changing diagram contents", () => {
    const initial = rowOfThree();
    const editor = mount(initial);
    const input = editTitle(editor.host, "  Payment architecture  ");
    expect(editor.value().title).toBeUndefined();
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(editor.value()).toEqual({ ...initial, title: "Payment architecture" });
  });

  it("cancels on Escape, saves on blur and permits removing a title", () => {
    const editor = mount({ ...rowOfThree(), title: "Original" });
    let input = editTitle(editor.host, "Discard this");
    act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(editor.value().title).toBe("Original");
    expect(input.value).toBe("Original");
    input = editTitle(editor.host, "Updated");
    act(() => input.blur());
    expect(editor.value().title).toBe("Updated");
    input = editTitle(editor.host, "   ");
    act(() => input.blur());
    expect(editor.value().title).toBeUndefined();
  });

  it("does not move or delete selected nodes while typing a title", () => {
    const initial = rowOfThree();
    const editor = mount(initial);
    editor.select(1);
    const input = editTitle(editor.host, "Title");
    for (const key of ["ArrowLeft", "ArrowRight", "Delete", "Backspace"]) {
      act(() => input.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
    }
    act(() => input.blur());
    expect(editor.value().nodes).toEqual(initial.nodes);
  });
});
