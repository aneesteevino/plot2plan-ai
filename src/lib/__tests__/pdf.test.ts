import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { generatePdf } from "../client/pdf";
import { drawingToSvg } from "../client/export";
import { drawFloor } from "../plan-draw";
import { generatePlan } from "../planner/generate";
import { buildReport } from "../report";
import { defaultProjectInput, type DesignVersion, type Project } from "../schema";

function sample(): { project: Project; version: DesignVersion } {
  const input = defaultProjectInput();
  input.name = "PDF Test House";
  input.city = "Lahore";
  input.plot = { ...input.plot, frontWidth: 35, rearWidth: 35, leftDepth: 70, rightDepth: 70, facing: "N" };
  input.requirements.terrace = true;
  const res = generatePlan(input);
  const now = new Date().toISOString();
  const project: Project = { ...input, id: "00000000-0000-4000-8000-000000000000", status: "generated", latestVersion: 1, createdAt: now, updatedAt: now };
  const version: DesignVersion = { id: "v1", projectId: project.id, version: 1, createdAt: now, layout: res.layout!, issues: res.issues, source: "generated" };
  return { project, version };
}

describe("exports", () => {
  it("builds a report that separates fact, calculation and assumption", () => {
    const { project, version } = sample();
    const r = buildReport(project, version);
    expect(r.plot.find((x) => x.label === "Calculated plot area")?.tag).toBe("calculated");
    expect(r.plot.find((x) => x.label === "Front width (road side)")?.tag).toBe("user");
    expect(r.regulatory.every((x) => x.tag === "verify" || x.tag === "user")).toBe(true);
    expect(r.limitations[0]).toMatch(/PRELIMINARY CONCEPT/);
  });

  it("generates a multi-page vector PDF with plan pages", async () => {
    const { project, version } = sample();
    const { doc, pages } = await generatePdf(project, version);
    expect(pages).toBeGreaterThanOrEqual(6);
    const bytes = doc.output("arraybuffer");
    const head = new TextDecoder().decode(new Uint8Array(bytes).slice(0, 5));
    expect(head).toBe("%PDF-");
    if (process.env.PDF_OUT) writeFileSync(process.env.PDF_OUT, Buffer.from(bytes));
  });

  it("exports a standalone SVG in feet units", () => {
    const { version } = sample();
    const svg = drawingToSvg(drawFloor(version.layout, 0, { unit: "ft" }), "Ground");
    expect(svg.startsWith("<?xml")).toBe(true);
    expect(svg).toContain("1 drawing unit = 1 foot");
    expect(svg).toContain("CAR PORCH");
  });
});
