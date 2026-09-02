import { describe, expect, it } from "vitest";
import { guidesAt, snapToGuides, stepWithMagnet } from "./diagramGuides";
import type { GuideBox } from "./diagramGuides";

const box = (id: string, x: number, y: number, w = 100, h = 60): GuideBox => ({ id, x, y, w, h });

describe("alignment guides", () => {
  const target = box("static", 300, 200);

  it("pulls a near miss onto the left edge and reports the line", () => {
    const { dx, guides } = snapToGuides([box("moving", 0, 0)], [target], 296, 0, 8);

    expect(dx).toBe(300);
    expect(guides).toContainEqual({ axis: "x", at: 300, from: 0, to: 260 });
  });

  it("aligns centres, not just edges", () => {
    // Moving box is 40 wide, so its centre lands on the target's centre at dx = 330.
    const { dx } = snapToGuides([box("moving", 0, 0, 40, 20)], [target], 327, 0, 8);

    expect(dx).toBe(330);
  });

  it("snaps both axes independently in one drag", () => {
    const { dx, dy } = snapToGuides([box("moving", 0, 0)], [target], 297, 203, 8);

    expect([dx, dy]).toEqual([300, 200]);
  });

  it("leaves a drag alone beyond the threshold", () => {
    const { dx, guides } = snapToGuides([box("moving", 0, 0)], [target], 280, 0, 8);

    expect(dx).toBe(280);
    expect(guides).toEqual([]);
  });

  it("takes the nearest of two competing alignments", () => {
    // Left edge would land at 306: six units from the target, two from the other.
    const { dx } = snapToGuides([box("moving", 0, 0)], [target, box("other", 308, 200)], 306, 0, 8);

    expect(dx).toBe(308);
  });

  it("reports every line that matches, so equal widths show all three", () => {
    const { guides } = snapToGuides([box("moving", 0, 0)], [target], 300, 0, 8);

    expect(guides.filter((guide) => guide.axis === "x").map((guide) => guide.at)).toEqual([300, 350, 400]);
  });

  it("spans a guide across everything it connects", () => {
    // A narrower box far below: only its left edge lines up with the moving one.
    const { guides } = snapToGuides([box("moving", 0, 0)], [box("far", 300, 600, 40, 60)], 300, 0, 8);

    const vertical = guides.filter((guide) => guide.axis === "x");
    expect(vertical).toHaveLength(1);
    expect(vertical[0]).toEqual({ axis: "x", at: 300, from: 0, to: 660 });
  });

  it("aligns a multi-node selection by its outer bounds", () => {
    const moving = [box("a", 0, 0), box("b", 140, 0)];
    // The selection spans 0..240, so its right edge meets the target's left edge at dx = 60.
    const { dx } = snapToGuides(moving, [target], 57, 0, 8);

    expect(dx).toBe(60);
  });

  it("does nothing without a reference or a threshold", () => {
    expect(snapToGuides([box("moving", 0, 0)], [], 5, 5, 8)).toEqual({ dx: 5, dy: 5, guides: [], spacing: [] });
    expect(snapToGuides([box("moving", 0, 0)], [target], 296, 0, 0).dx).toBe(296);
  });
});

describe("equal spacing", () => {
  // A row of three: the outer two are fixed 400 apart, leaving a 100 gap on each side.
  const left = box("left", 0, 0, 100, 60);
  const right = box("right", 400, 0, 100, 60);

  it("centres the box between its neighbours and measures both gaps", () => {
    const { dx, spacing } = snapToGuides([box("moving", 0, 0, 100, 60)], [left, right], 196, 0, 8);

    expect(dx).toBe(200);
    expect(spacing).toHaveLength(1);
    expect(spacing[0].axis).toBe("x");
    expect(spacing[0].gap).toBe(100);
    expect(spacing[0].segments).toEqual([
      { start: 100, end: 200, at: 30 },
      { start: 300, end: 400, at: 30 },
    ]);
  });

  it("leaves the drag alone when centring is out of reach", () => {
    const { dx, spacing } = snapToGuides([box("moving", 0, 0, 100, 60)], [left, right], 160, 0, 8);

    expect(dx).toBe(160);
    expect(spacing).toEqual([]);
  });

  it("ignores neighbours from another row", () => {
    const elsewhere = box("elsewhere", 400, 500, 100, 60);
    const { dx, spacing } = snapToGuides([box("moving", 0, 0, 100, 60)], [left, elsewhere], 196, 0, 8);

    expect(dx).toBe(196);
    expect(spacing).toEqual([]);
  });

  it("stops measuring once the drag has left the row", () => {
    // Same horizontal centring, but dragged 300 down: it is no longer between anything.
    const { spacing } = snapToGuides([box("moving", 0, 0, 100, 60)], [left, right], 196, 300, 8);

    expect(spacing).toEqual([]);
  });

  it("draws the measurement at the box's current height, not where the drag began", () => {
    const { spacing } = snapToGuides([box("moving", 0, 0, 100, 60)], [left, right], 196, 20, 8);

    expect(spacing[0].segments.map((segment) => segment.at)).toEqual([50, 50]);
  });

  it("lets an edge alignment win over centring on the same axis", () => {
    // Centring wants 200; the right neighbour's left edge wants 300 and is nearer.
    const { dx, spacing } = snapToGuides([box("moving", 0, 0, 100, 60)], [left, right], 298, 0, 8);

    expect(dx).toBe(300);
    expect(spacing).toEqual([]);
  });

  it("centres on one axis while aligning on the other", () => {
    const { dx, dy, guides, spacing } = snapToGuides([box("moving", 0, 0, 100, 60)], [left, right], 196, 3, 8);

    expect([dx, dy]).toEqual([200, 0]);
    expect(spacing.map((hint) => hint.axis)).toEqual(["x"]);
    expect(guides.some((guide) => guide.axis === "y")).toBe(true);
  });
});

describe("guidesAt", () => {
  const target = box("static", 300, 200);

  it("reports the alignments a position already sits on", () => {
    expect(guidesAt([box("moving", 0, 0)], [target], 300, 0).map((guide) => guide.at)).toContain(300);
  });

  it("reports nothing when nothing lines up, and moves nothing", () => {
    expect(guidesAt([box("moving", 0, 0)], [target], 297, 0)).toEqual([]);
    expect(guidesAt([box("moving", 0, 0)], [], 300, 200)).toEqual([]);
  });
});

describe("stepping with the keyboard", () => {
  const forward = stepWithMagnet;
  const target = box("static", 300, 200);
  const moving = [box("moving", 0, 0)];

  it("jumps onto an alignment that lies ahead", () => {
    const { dx } = snapToGuides(moving, [target], 297, 0, 8);

    expect(forward(297, dx)).toBe(300);
  });

  it("leaves the alignment instead of being pinned to it", () => {
    // Sitting on the line at 300: the next press would be pulled straight back.
    const settled = [box("moving", 300, 0)];
    const { dx } = snapToGuides(settled, [target], 1, 0, 8);

    expect(dx).toBe(0);
    expect(forward(1, dx)).toBe(1);
  });

  it("never drifts sideways on the axis that was not pressed", () => {
    const { dy } = snapToGuides(moving, [target], 297, 0, 8);

    expect(forward(0, dy)).toBe(0);
  });
});

describe("stepWithMagnet", () => {
  it("takes a magnet that carries the step onward", () => {
    expect(stepWithMagnet(1, 3)).toBe(3);
    expect(stepWithMagnet(-1, -3)).toBe(-3);
  });

  it("refuses a magnet pulling the other way", () => {
    expect(stepWithMagnet(1, -2)).toBe(1);
    expect(stepWithMagnet(-1, 2)).toBe(-1);
  });

  it("refuses a cancelled step, residue included", () => {
    // Cancelling a step against a gap does not land on exactly zero in binary floating
    // point; the leftover carries the step's sign and would read as a legitimate move.
    expect(stepWithMagnet(2.6, 0)).toBe(2.6);
    expect(stepWithMagnet(2.6, 5.773159728050814e-15)).toBe(2.6);
    expect(stepWithMagnet(-2.6, -5.773159728050814e-15)).toBe(-2.6);
  });

  it("still lets a short hop onto a nearby line through", () => {
    expect(stepWithMagnet(2.6, 0.4)).toBe(0.4);
  });
});
