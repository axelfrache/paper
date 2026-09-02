export type GuideBox = { id: string; x: number; y: number; w: number; h: number };

/** A line the drag snapped to. `from`/`to` span the perpendicular axis. */
export type AlignmentGuide = { axis: "x" | "y"; at: number; from: number; to: number };

/** Equal gaps on either side of the dragged box, with the span of each gap to measure. */
export type SpacingHint = {
  axis: "x" | "y";
  gap: number;
  segments: Array<{ start: number; end: number; at: number }>;
};

export type GuideSnap = { dx: number; dy: number; guides: AlignmentGuide[]; spacing: SpacingHint[] };

type Axis = "x" | "y";
type Box = { x: number; y: number; w: number; h: number };

// Two lines closer than this are the same line; it absorbs the rounding of a drag delta.
const epsilon = 0.5;

/**
 * Nudges a drag so the moving selection lines up with the nodes around it, and reports
 * what it matched so guides and distances can be drawn.
 *
 * Coordinates are whatever space the diagram is drawn in — the caller projects first for
 * an isometric diagram, so alignment always follows what the eye sees on screen rather
 * than the underlying model axes.
 */
export function snapToGuides(
  moving: GuideBox[],
  statics: GuideBox[],
  dx: number,
  dy: number,
  threshold: number,
): GuideSnap {
  if (!moving.length || !statics.length || threshold <= 0) {
    return { dx, dy, guides: [], spacing: [] };
  }

  const bounds = boundsOf(moving);
  const x = snapAxis(bounds, statics, dx, "x", threshold);
  const y = snapAxis(bounds, statics, dy, "y", threshold);

  // Equal spacing only claims an axis that alignment left alone, so a clear edge match
  // is never overridden by a centring the user did not ask for. Each call gets the other
  // axis' delta too: which boxes count as neighbours, and where the measurement is drawn,
  // both depend on where the box is now — not on where the drag started.
  const spacedX = x.snapped ? x : spaceAxis(bounds, statics, x.delta, y.delta, "x", threshold);
  const spacedY = y.snapped ? y : spaceAxis(bounds, statics, y.delta, spacedX.delta, "y", threshold);

  const moved = shifted(bounds, spacedX.delta, spacedY.delta);

  return {
    dx: spacedX.delta,
    dy: spacedY.delta,
    guides: [...guidesForAxis(moved, statics, "x"), ...guidesForAxis(moved, statics, "y")],
    spacing: [spacedX.spacing, spacedY.spacing].filter((hint): hint is SpacingHint => hint !== null),
  };
}

/**
 * How far a key press should actually move, given what the magnet proposed.
 *
 * A magnet is taken only when it carries the step further the same way: pulling back onto
 * the line just left would pin the selection there. It also has to move by a visible
 * fraction of the step — cancelling a step against a gap leaves a floating-point residue
 * of about 1e-15 with the step's own sign, which would otherwise be accepted as a move
 * and freeze the selection just as surely.
 */
export function stepWithMagnet(step: number, snapped: number) {
  const advances = Math.sign(snapped) === Math.sign(step) && Math.abs(snapped) >= Math.abs(step) / 20;
  return step !== 0 && advances ? snapped : step;
}

/** Alignments a position already sits on, without moving it. */
export function guidesAt(moving: GuideBox[], statics: GuideBox[], dx: number, dy: number): AlignmentGuide[] {
  if (!moving.length || !statics.length) {
    return [];
  }
  const moved = shifted(boundsOf(moving), dx, dy);
  return [...guidesForAxis(moved, statics, "x"), ...guidesForAxis(moved, statics, "y")];
}

/** The three lines a box can align on: its two edges and its centre. */
function linesOf(box: Box, axis: Axis) {
  const start = axis === "x" ? box.x : box.y;
  const size = axis === "x" ? box.w : box.h;
  return [start, start + size / 2, start + size];
}

function extentOf(box: Box, axis: Axis) {
  const start = axis === "x" ? box.x : box.y;
  return { start, end: start + (axis === "x" ? box.w : box.h) };
}

function boundsOf(boxes: GuideBox[]): Box {
  const x = Math.min(...boxes.map((box) => box.x));
  const y = Math.min(...boxes.map((box) => box.y));
  return {
    x,
    y,
    w: Math.max(...boxes.map((box) => box.x + box.w)) - x,
    h: Math.max(...boxes.map((box) => box.y + box.h)) - y,
  };
}

function shifted(box: Box, dx: number, dy: number): Box {
  return { x: box.x + dx, y: box.y + dy, w: box.w, h: box.h };
}

function alongAxis(box: Box, axis: Axis, delta: number) {
  return shifted(box, axis === "x" ? delta : 0, axis === "y" ? delta : 0);
}

type AxisSnap = { delta: number; snapped: boolean; spacing: SpacingHint | null };

/** Moves the delta onto the nearest edge or centre alignment within threshold. */
function snapAxis(bounds: Box, statics: GuideBox[], delta: number, axis: Axis, threshold: number): AxisSnap {
  const movingLines = linesOf(alongAxis(bounds, axis, delta), axis);
  let best: number | null = null;

  for (const box of statics) {
    for (const target of linesOf(box, axis)) {
      for (const line of movingLines) {
        const offset = target - line;
        if (Math.abs(offset) <= threshold && (best === null || Math.abs(offset) < Math.abs(best))) {
          best = offset;
        }
      }
    }
  }

  return best === null ? { delta, snapped: false, spacing: null } : { delta: delta + best, snapped: true, spacing: null };
}

/** Centres the box between its two nearest neighbours on this axis, gaps made equal. */
function spaceAxis(
  bounds: Box,
  statics: GuideBox[],
  delta: number,
  crossDelta: number,
  axis: Axis,
  threshold: number,
): AxisSnap {
  const cross: Axis = axis === "x" ? "y" : "x";
  const moved = alongAxis(alongAxis(bounds, cross, crossDelta), axis, delta);
  const movedSpan = extentOf(moved, axis);
  const movedCross = extentOf(moved, cross);

  // Only boxes sharing the same row (or column) are neighbours worth measuring against.
  const neighbours = statics.filter((box) => {
    const span = extentOf(box, cross);
    return span.start < movedCross.end && span.end > movedCross.start;
  });

  let before: { start: number; end: number } | null = null;
  let after: { start: number; end: number } | null = null;
  for (const box of neighbours) {
    const span = extentOf(box, axis);
    if (span.end <= movedSpan.start && (!before || span.end > before.end)) {
      before = span;
    }
    if (span.start >= movedSpan.end && (!after || span.start < after.start)) {
      after = span;
    }
  }

  if (!before || !after) {
    return { delta, snapped: false, spacing: null };
  }

  const gapBefore = movedSpan.start - before.end;
  const gapAfter = after.start - movedSpan.end;
  const adjust = (gapAfter - gapBefore) / 2;
  if (Math.abs(adjust) > threshold) {
    return { delta, snapped: false, spacing: null };
  }

  const gap = (gapBefore + gapAfter) / 2;
  if (gap <= 0) {
    return { delta, snapped: false, spacing: null };
  }

  const centred = extentOf(alongAxis(moved, axis, adjust), axis);
  const at = (movedCross.start + movedCross.end) / 2;
  return {
    delta: delta + adjust,
    snapped: true,
    spacing: {
      axis,
      gap,
      segments: [
        { start: before.end, end: centred.start, at },
        { start: centred.end, end: after.start, at },
      ],
    },
  };
}

function guidesForAxis(moved: Box, statics: GuideBox[], axis: Axis) {
  const guides: AlignmentGuide[] = [];

  for (const at of linesOf(moved, axis)) {
    const aligned = statics.filter((box) => linesOf(box, axis).some((line) => Math.abs(line - at) <= epsilon));
    if (!aligned.length || guides.some((guide) => Math.abs(guide.at - at) <= epsilon)) {
      continue;
    }
    // The guide runs across everything it connects, so it reads as a relationship.
    const spans = [moved, ...aligned].map((box) => extentOf(box, axis === "x" ? "y" : "x"));
    guides.push({
      axis,
      at,
      from: Math.min(...spans.map((span) => span.start)),
      to: Math.max(...spans.map((span) => span.end)),
    });
  }

  return guides;
}
