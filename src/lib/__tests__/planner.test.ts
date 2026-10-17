import { describe, expect, it } from "vitest";
import { contains, overlapArea } from "../geometry";
import { generatePlan } from "../planner/generate";
import { defaultProjectInput, LayoutSchema, type ProjectInput } from "../schema";

function project(over: (p: ProjectInput) => void = () => {}): ProjectInput {
  const p = defaultProjectInput();
  p.name = "Test";
  over(p);
  return p;
}

const rect = (p: ProjectInput, w: number, d: number) => {
  p.plot.frontWidth = w;
  p.plot.rearWidth = w;
  p.plot.leftDepth = d;
  p.plot.rightDepth = d;
};

describe("planning engine", () => {
  it("generates a valid 2-storey plan for a 30x60 ft plot", () => {
    const res = generatePlan(project());
    expect(res.layout).not.toBeNull();
    const errors = res.issues.filter((i) => i.severity === "error");
    expect(errors).toEqual([]);
    const l = res.layout!;
    expect(() => LayoutSchema.parse(l)).not.toThrow();
    expect(l.floors.filter((f) => !f.roof)).toHaveLength(2);
    const beds = l.floors.flatMap((f) => f.rooms).filter((r) => r.kind === "bedroom" || r.kind === "master");
    expect(beds).toHaveLength(4);
    expect(l.floors[0].openings.some((o) => o.type === "main-door")).toBe(true);
  });

  it("keeps rooms inside the buildable zone and free of overlaps", () => {
    const res = generatePlan(
      project((p) => {
        rect(p, 35, 70);
        p.constraints.setbacks = { source: "user", front: 5, rear: 5, left: 3, right: 3 };
      }),
    );
    const l = res.layout!;
    for (const f of l.floors) {
      for (const r of f.rooms) expect(contains(l.buildable, r.rect)).toBe(true);
      for (let i = 0; i < f.rooms.length; i++)
        for (let j = i + 1; j < f.rooms.length; j++) expect(overlapArea(f.rooms[i].rect, f.rooms[j].rect)).toBeLessThan(0.05);
    }
    expect(l.buildable).toEqual({ x: 3, y: 5, w: 29, d: 60 });
  });

  it("aligns the staircase on every floor", () => {
    const res = generatePlan(project((p) => (p.requirements.floors = 3, (p.requirements.bedrooms = 6), (p.requirements.attachedBathrooms = 6), rect(p, 35, 70))));
    expect(res.layout).not.toBeNull();
    const stairs = res.layout!.floors.filter((f) => !f.roof).map((f) => f.rooms.find((r) => r.kind === "stair")!.rect);
    for (const s of stairs) expect(s).toEqual(stairs[0]);
  });

  it("mirrors the layout when the entrance is on the right", () => {
    const left = generatePlan(project()).layout!;
    const right = generatePlan(project((p) => (p.plot.entranceSide = "right"))).layout!;
    const pl = left.floors[0].rooms.find((r) => r.kind === "porch")!.rect;
    const pr = right.floors[0].rooms.find((r) => r.kind === "porch")!.rect;
    expect(pl.x).toBe(0);
    expect(pr.x + pr.w).toBeCloseTo(30, 3);
  });

  it("reports infeasible programmes instead of drawing impossible plans", () => {
    const res = generatePlan(project((p) => (rect(p, 20, 30), (p.requirements.floors = 1), (p.requirements.bedrooms = 8))));
    expect(res.layout).toBeNull();
    expect(res.issues.some((i) => i.severity === "error" && /do not fit|depth/.test(i.message))).toBe(true);
  });

  it("refuses non-rectangular plots for automatic layout", () => {
    const res = generatePlan(project((p) => (p.plot.shape = "irregular")));
    expect(res.layout).toBeNull();
    expect(res.issues.some((i) => i.code === "SHAPE_UNSUPPORTED")).toBe(true);
  });

  it("flags coverage beyond the user's limit", () => {
    const res = generatePlan(project((p) => (p.constraints.maxCoveragePct = 50)));
    expect(res.issues.some((i) => i.code === "COVERAGE_EXCEEDED")).toBe(true);
  });

  it("marks missing setbacks as pending, never invented", () => {
    const res = generatePlan(project());
    expect(res.issues.some((i) => i.code === "SETBACKS_PENDING")).toBe(true);
    expect(res.layout!.buildable).toEqual({ x: 0, y: 0, w: 30, d: 60 });
  });

  it("supports a common 5-marla (25x45 ft) double-storey brief", () => {
    const res = generatePlan(project((p) => (rect(p, 25, 45), (p.requirements.bedrooms = 2), (p.requirements.attachedBathrooms = 2), (p.requirements.floors = 2))));
    expect(res.layout).not.toBeNull();
    expect(res.issues.filter((i) => i.severity === "error")).toEqual([]);
  });

  it("adds a roof plan when a terrace is requested", () => {
    const res = generatePlan(project((p) => (p.requirements.terrace = true)));
    expect(res.layout!.floors.at(-1)!.roof).toBe(true);
  });

  it("produces error-free layouts across common Pakistani plot sizes", () => {
    const sizes: [number, number][] = [[25, 45], [25, 50], [30, 60], [35, 70], [40, 80], [50, 90], [60, 120]];
    const failures: string[] = [];
    let feasible = 0;
    for (const [w, d] of sizes)
      for (const floors of [1, 2, 3])
        for (const bedrooms of [2, 3, 4, 5, 6])
          for (const side of ["left", "right"] as const) {
            const res = generatePlan(
              project((p) => {
                rect(p, w, d);
                p.requirements.floors = floors;
                p.requirements.bedrooms = bedrooms;
                p.requirements.attachedBathrooms = bedrooms;
                p.requirements.masterBedrooms = Math.min(2, bedrooms);
                p.plot.entranceSide = side;
                p.requirements.terrace = floors > 1;
              }),
            );
            if (!res.layout) continue;
            feasible++;
            const errs = res.issues.filter((i) => i.severity === "error");
            if (errs.length) failures.push(`${w}x${d} f${floors} b${bedrooms} ${side}: ${errs.map((e) => e.message).join(" | ")}`);
          }
    expect(failures).toEqual([]);
    expect(feasible).toBeGreaterThan(130);
  });
});
