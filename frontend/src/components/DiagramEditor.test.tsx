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
