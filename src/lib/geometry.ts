import type { Issue, Plot, Rect, Units } from "./schema";
import { areaFromSqft, areaToSqft, fmtArea, round, toFeet } from "./units";

export const EPS = 1e-6;

// ---------- Rectangles ----------

export const area = (r: Rect) => r.w * r.d;

export function intersection(a: Rect, b: Rect): Rect | null {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.d, b.y + b.d);
  if (x2 - x1 <= EPS || y2 - y1 <= EPS) return null;
  return { x: x1, y: y1, w: x2 - x1, d: y2 - y1 };
}

export const overlapArea = (a: Rect, b: Rect) => {
  const i = intersection(a, b);
  return i ? area(i) : 0;
};

export function contains(outer: Rect, inner: Rect, tol = 1e-3): boolean {
  return (
    inner.x >= outer.x - tol &&
    inner.y >= outer.y - tol &&
    inner.x + inner.w <= outer.x + outer.w + tol &&
    inner.y + inner.d <= outer.y + outer.d + tol
  );
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** The shared boundary segment of two touching rectangles (length > 0), or null. */
export function sharedEdge(a: Rect, b: Rect, tol = 1e-3): Segment | null {
  // vertical shared edge
  for (const [xa, xb] of [
    [a.x + a.w, b.x],
    [a.x, b.x + b.w],
  ]) {
    if (Math.abs(xa - xb) < tol) {
      const y1 = Math.max(a.y, b.y);
      const y2 = Math.min(a.y + a.d, b.y + b.d);
      if (y2 - y1 > tol) return { x1: xa, y1, x2: xa, y2 };
    }
  }
  for (const [ya, yb] of [
    [a.y + a.d, b.y],
    [a.y, b.y + b.d],
  ]) {
    if (Math.abs(ya - yb) < tol) {
      const x1 = Math.max(a.x, b.x);
      const x2 = Math.min(a.x + a.w, b.x + b.w);
      if (x2 - x1 > tol) return { x1, y1: ya, x2, y2: ya };
    }
  }
  return null;
}

export const segLength = (s: Segment) => Math.hypot(s.x2 - s.x1, s.y2 - s.y1);

/** Edges of `r` that lie on the outer boundary of `outer`. */
export function boundaryEdges(r: Rect, outer: Rect, tol = 1e-3): Segment[] {
  const out: Segment[] = [];
  if (Math.abs(r.y - outer.y) < tol) out.push({ x1: r.x, y1: r.y, x2: r.x + r.w, y2: r.y });
  if (Math.abs(r.y + r.d - (outer.y + outer.d)) < tol)
    out.push({ x1: r.x, y1: r.y + r.d, x2: r.x + r.w, y2: r.y + r.d });
  if (Math.abs(r.x - outer.x) < tol) out.push({ x1: r.x, y1: r.y, x2: r.x, y2: r.y + r.d });
  if (Math.abs(r.x + r.w - (outer.x + outer.w)) < tol)
    out.push({ x1: r.x + r.w, y1: r.y, x2: r.x + r.w, y2: r.y + r.d });
  return out;
}

// ---------- Polygons ----------

export interface Pt {
  x: number;
  y: number;
}

/** Shoelace formula. Returns absolute area. */
export function polygonArea(pts: Pt[]): number {
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    s += a.x * b.y - b.x * a.y;
  }
  return Math.abs(s) / 2;
}

function orient(a: Pt, b: Pt, c: Pt) {
  const v = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
  return Math.abs(v) < EPS ? 0 : v > 0 ? 1 : -1;
}

function segmentsIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt) {
  const o1 = orient(p1, p2, p3);
  const o2 = orient(p1, p2, p4);
  const o3 = orient(p3, p4, p1);
  const o4 = orient(p3, p4, p2);
  return o1 !== o2 && o3 !== o4;
}

/** True when no two non-adjacent edges cross and there are no repeated vertices. */
export function isSimplePolygon(pts: Pt[]): boolean {
  const n = pts.length;
  if (n < 3) return false;
  for (let i = 0; i < n; i++)
    for (let j = i + 1; j < n; j++)
      if (Math.abs(pts[i].x - pts[j].x) < EPS && Math.abs(pts[i].y - pts[j].y) < EPS) return false;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (j === i || (j + 1) % n === i || (i + 1) % n === j) continue;
      if (segmentsIntersect(pts[i], pts[(i + 1) % n], pts[j], pts[(j + 1) % n])) return false;
    }
  }
  return polygonArea(pts) > EPS;
}

export function bbox(pts: Pt[]): Rect {
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => p.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, d: Math.max(...ys) - y };
}

// ---------- Plot analysis ----------

export interface PlotAnalysis {
  /** ok = geometry determined; needs-info = more data required; invalid = contradictory input. */
  status: "ok" | "needs-info" | "invalid";
  widthFt?: number;
  depthFt?: number;
  areaSqft?: number;
  areaMethod: "rectangle" | "polygon" | "none";
  statedAreaSqft?: number;
  /** Layout generation is currently implemented for rectangular/square plots only. */
  layoutSupported: boolean;
  issues: Issue[];
}

const REL_TOL = 0.01;

export function analyzePlot(plot: Plot, units: Units): PlotAnalysis {
  const issues: Issue[] = [];
  const L = (v?: number) => (v === undefined ? undefined : toFeet(v, units.length));
  const statedAreaSqft =
    plot.statedArea !== undefined ? areaToSqft(plot.statedArea, units.area, units.marlaSqft) : undefined;

  const front = L(plot.frontWidth);
  const rear = L(plot.rearWidth);
  const left = L(plot.leftDepth);
  const right = L(plot.rightDepth);

  for (const [label, v] of [
    ["Front width", front],
    ["Rear width", rear],
    ["Left side length", left],
    ["Right side length", right],
  ] as const) {
    if (v !== undefined && v <= 0) issues.push({ severity: "error", code: "NON_POSITIVE", message: `${label} must be greater than zero.` });
  }

  const result = (r: Omit<PlotAnalysis, "issues" | "statedAreaSqft">): PlotAnalysis => {
    if (r.areaSqft !== undefined && statedAreaSqft !== undefined && statedAreaSqft > 0) {
      const diff = Math.abs(r.areaSqft - statedAreaSqft) / statedAreaSqft;
      if (diff > 0.03) {
        issues.push({
          severity: "warning",
          code: "STATED_AREA_MISMATCH",
          message: `Calculated area (${fmtArea(r.areaSqft, "sqft", units.marlaSqft)}) differs from the stated area (${fmtArea(statedAreaSqft, "sqft", units.marlaSqft)}) by ${round(diff * 100, 1)}%. Check the measurements and the marla definition used by your locality (${units.marlaSqft} sq ft/marla is currently selected).`,
        });
      }
    }
    if (r.widthFt !== undefined && r.depthFt !== undefined) {
      const minSide = Math.min(r.widthFt, r.depthFt);
      if (minSide < 15)
        issues.push({ severity: "warning", code: "VERY_NARROW", message: "One plot side is under 15 ft. Most residential layouts will not fit; please double-check the measurement." });
      if (Math.max(r.widthFt, r.depthFt) > 2000)
        issues.push({ severity: "warning", code: "VERY_LARGE", message: "A plot side exceeds 2,000 ft. Please check the unit selection." });
    }
    const hasError = issues.some((i) => i.severity === "error");
    return { ...r, status: hasError ? "invalid" : r.status, issues, statedAreaSqft };
  };

  if (issues.some((i) => i.severity === "error")) {
    return result({ status: "invalid", areaMethod: "none", layoutSupported: false });
  }

  if (plot.shape === "rectangular" || plot.shape === "square") {
    const w = front ?? rear;
    const d = left ?? right;
    if (w === undefined || d === undefined) {
      issues.push({ severity: "error", code: "MISSING_DIMENSION", message: "Enter at least the front width and one side length for a rectangular plot." });
      return result({ status: "needs-info", areaMethod: "none", layoutSupported: false });
    }
    if (front !== undefined && rear !== undefined && Math.abs(front - rear) > Math.max(0.25, REL_TOL * front)) {
      issues.push({
        severity: "error",
        code: "RECT_WIDTH_MISMATCH",
        message: "Front and rear widths differ, so the plot is not rectangular. Select 'Irregular' and enter boundary coordinates, or correct the measurement.",
      });
    }
    if (left !== undefined && right !== undefined && Math.abs(left - right) > Math.max(0.25, REL_TOL * left)) {
      issues.push({
        severity: "error",
        code: "RECT_DEPTH_MISMATCH",
        message: "Left and right side lengths differ, so the plot is not rectangular. Select 'Irregular' and enter boundary coordinates, or correct the measurement.",
      });
    }
    if (plot.shape === "square" && Math.abs(w - d) > Math.max(0.25, REL_TOL * w)) {
      issues.push({ severity: "warning", code: "SQUARE_NOT_SQUARE", message: "Plot marked as square but width and depth differ. It will be treated as rectangular." });
    }
    issues.push({
      severity: "info",
      code: "RIGHT_ANGLES_ASSUMED",
      message: "Rectangular area assumes all four corners are right angles. Confirm with a survey or diagonal measurement.",
    });
    return result({ status: "ok", widthFt: w, depthFt: d, areaSqft: w * d, areaMethod: "rectangle", layoutSupported: true });
  }

  // Non-rectangular shapes: only compute area when vertices are supplied.
  const pts = (plot.coordinates ?? []).map((p) => ({ x: toFeet(p.x, units.length), y: toFeet(p.y, units.length) }));
  if (pts.length >= 3) {
    if (!isSimplePolygon(pts)) {
      issues.push({ severity: "error", code: "POLYGON_INVALID", message: "The boundary coordinates cross themselves or repeat a point. List vertices in order around the boundary." });
      return result({ status: "invalid", areaMethod: "none", layoutSupported: false });
    }
    const bb = bbox(pts);
    issues.push({
      severity: "warning",
      code: "LAYOUT_SHAPE_UNSUPPORTED",
      message: "Area is calculated from your boundary coordinates. Automatic floor-plan generation currently supports rectangular plots only.",
    });
    return result({ status: "ok", widthFt: bb.w, depthFt: bb.d, areaSqft: polygonArea(pts), areaMethod: "polygon", layoutSupported: false });
  }

  issues.push({
    severity: "warning",
    code: "AREA_UNDETERMINED",
    message:
      "The area of a non-rectangular plot cannot be determined uniquely from side lengths alone. Provide boundary coordinates (from a survey or site plan) to calculate it." +
      (statedAreaSqft ? ` The stated area of ${round(areaFromSqft(statedAreaSqft, units.area, units.marlaSqft), 2)} ${units.area} is shown as unverified.` : ""),
  });
  return result({ status: "needs-info", areaMethod: "none", layoutSupported: false });
}
