import { describe, expect, it } from "vitest";
import { analyzePlot, contains, intersection, isSimplePolygon, overlapArea, polygonArea, sharedEdge } from "../geometry";
import { defaultProjectInput, type Plot, type Units } from "../schema";

const units: Units = { length: "ft", area: "sqft", marlaSqft: 225 };
const plot = (o: Partial<Plot>): Plot => ({ ...defaultProjectInput().plot, ...o });

describe("rectangles", () => {
  it("computes overlap and containment", () => {
    const a = { x: 0, y: 0, w: 10, d: 10 };
    const b = { x: 5, y: 5, w: 10, d: 10 };
    expect(overlapArea(a, b)).toBe(25);
    expect(intersection(a, { x: 10, y: 0, w: 5, d: 5 })).toBeNull();
    expect(contains(a, { x: 1, y: 1, w: 2, d: 2 })).toBe(true);
    expect(contains(a, b)).toBe(false);
  });

  it("finds shared edges between touching rectangles", () => {
    const s = sharedEdge({ x: 0, y: 0, w: 10, d: 10 }, { x: 10, y: 4, w: 5, d: 10 });
    expect(s).toEqual({ x1: 10, y1: 4, x2: 10, y2: 10 });
    expect(sharedEdge({ x: 0, y: 0, w: 1, d: 1 }, { x: 1, y: 1, w: 1, d: 1 })).toBeNull();
  });
});

describe("polygons", () => {
  it("computes shoelace area", () => {
    expect(polygonArea([{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 30, y: 60 }, { x: 0, y: 60 }])).toBe(1800);
    // L-shape: 20x20 square minus 10x10 corner
    expect(polygonArea([{ x: 0, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 10, y: 10 }, { x: 10, y: 20 }, { x: 0, y: 20 }])).toBe(300);
  });

  it("rejects self-intersecting boundaries", () => {
    expect(isSimplePolygon([{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 10, y: 0 }, { x: 0, y: 10 }])).toBe(false);
    expect(isSimplePolygon([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }])).toBe(true);
  });
});

describe("plot analysis", () => {
  it("calculates rectangular area", () => {
    const a = analyzePlot(plot({ frontWidth: 30, rearWidth: 30, leftDepth: 60, rightDepth: 60 }), units);
    expect(a.status).toBe("ok");
    expect(a.areaSqft).toBe(1800);
    expect(a.layoutSupported).toBe(true);
  });

  it("converts metres before computing area", () => {
    const a = analyzePlot(plot({ frontWidth: 10, rearWidth: 10, leftDepth: 20, rightDepth: 20 }), { ...units, length: "m" });
    expect(a.areaSqft).toBeCloseTo(200 * 10.7639, 1);
  });

  it("flags rectangles with unequal opposite sides", () => {
    const a = analyzePlot(plot({ frontWidth: 30, rearWidth: 34, leftDepth: 60, rightDepth: 60 }), units);
    expect(a.status).toBe("invalid");
    expect(a.issues.some((i) => i.code === "RECT_WIDTH_MISMATCH")).toBe(true);
  });

  it("does not compute an exact area for irregular plots from side lengths alone", () => {
    const a = analyzePlot(plot({ shape: "irregular", frontWidth: 30, rearWidth: 34, leftDepth: 60, rightDepth: 62 }), units);
    expect(a.areaSqft).toBeUndefined();
    expect(a.status).toBe("needs-info");
    expect(a.issues.some((i) => i.code === "AREA_UNDETERMINED")).toBe(true);
  });

  it("computes irregular area from coordinates but does not claim layout support", () => {
    const a = analyzePlot(plot({ shape: "irregular", coordinates: [{ x: 0, y: 0 }, { x: 30, y: 0 }, { x: 34, y: 60 }, { x: 0, y: 60 }] }), units);
    expect(a.areaSqft).toBe(1920);
    expect(a.layoutSupported).toBe(false);
  });

  it("warns when stated area disagrees with the geometry", () => {
    const a = analyzePlot(plot({ frontWidth: 30, rearWidth: 30, leftDepth: 60, rightDepth: 60, statedArea: 10 }), { ...units, area: "marla" });
    // 10 marla × 225 = 2250 vs 1800 computed
    expect(a.issues.some((i) => i.code === "STATED_AREA_MISMATCH")).toBe(true);
  });

  it("rejects zero and negative lengths", () => {
    const a = analyzePlot(plot({ frontWidth: 0, leftDepth: 60 }), units);
    expect(a.status).toBe("invalid");
  });
});
