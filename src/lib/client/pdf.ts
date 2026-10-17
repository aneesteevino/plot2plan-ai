"use client";
import type { jsPDF as JsPDF } from "jspdf";
import { drawFloor, type Drawing, type Prim } from "../plan-draw";
import { buildReport, DISCLAIMER, TAG_LABEL, type ReportData, type Row } from "../report";
import type { DesignVersion, Project } from "../schema";

/**
 * Vector PDF report. Plans are drawn from the same primitives as the screen view,
 * at a standard architectural scale chosen so the drawing fits the sheet. The scale
 * note is stated only because the geometry is drawn at exactly that ratio.
 */

const INK: [number, number, number] = [15, 31, 61];
const INK2: [number, number, number] = [59, 74, 102];
const MUTED: [number, number, number] = [107, 120, 144];
const WARN: [number, number, number] = [161, 92, 7];
const SCALES = [50, 75, 100, 125, 150, 200, 250, 300, 400, 500];

/** jsPDF's standard fonts use WinAnsi; replace characters it cannot encode. */
const clean = (s: string) =>
  s
    .replace(/↔/g, "-")
    .replace(/[≠≈]/g, "~")
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/→/g, "->")
    .replace(/[^\x09\x0A\x0D\x20-\x7E -ÿ–—…×]/g, "");

const hex = (h: string): [number, number, number] => {
  const m = h.replace("#", "");
  return [parseInt(m.slice(0, 2), 16), parseInt(m.slice(2, 4), 16), parseInt(m.slice(4, 6), 16)];
};

function drawPrims(doc: JsPDF, d: Drawing, ox: number, oy: number, k: number) {
  const X = (x: number) => ox + (x - d.view.x) * k;
  const Y = (y: number) => oy + (y - d.view.y) * k;
  for (const p of d.prims) {
    if (p.t === "rect") {
      if (p.dash) doc.setLineDashPattern(p.dash.map((v) => v * k), 0);
      if (p.fill) doc.setFillColor(...hex(p.fill));
      if (p.stroke) {
        doc.setDrawColor(...hex(p.stroke));
        doc.setLineWidth(Math.max(0.05, (p.sw ?? 0.1) * k));
      }
      const style = p.fill && p.stroke ? "FD" : p.fill ? "F" : "S";
      if (p.fill || p.stroke) doc.rect(X(p.x), Y(p.y), p.w * k, p.h * k, style);
      if (p.dash) doc.setLineDashPattern([], 0);
    } else if (p.t === "line") {
      doc.setDrawColor(...hex(p.stroke));
      doc.setLineWidth(Math.max(0.05, p.sw * k));
      if (p.dash) doc.setLineDashPattern(p.dash.map((v) => v * k), 0);
      doc.line(X(p.x1), Y(p.y1), X(p.x2), Y(p.y2));
      if (p.dash) doc.setLineDashPattern([], 0);
    } else if (p.t === "poly") {
      const pts = p.pts.map(([x, y]) => [X(x), Y(y)] as [number, number]);
      const segs = pts.slice(1).map((pt, i) => [pt[0] - pts[i][0], pt[1] - pts[i][1]]);
      if (p.fill) doc.setFillColor(...hex(p.fill));
      if (p.stroke) {
        doc.setDrawColor(...hex(p.stroke));
        doc.setLineWidth(Math.max(0.05, (p.sw ?? 0.1) * k));
      }
      const style = p.fill && p.stroke ? "FD" : p.fill ? "F" : "S";
      doc.lines(segs, pts[0][0], pts[0][1], [1, 1], style, !!p.closed);
    } else if (p.t === "text") {
      const sizePt = (p.size * k) / 0.3528;
      if (sizePt < 2.5) continue;
      doc.setFont("helvetica", p.bold ? "bold" : "normal");
      doc.setFontSize(sizePt);
      doc.setTextColor(...hex(p.fill ?? "#0f1f3d"));
      const text = clean(p.text);
      const w = doc.getTextWidth(text);
      const x = X(p.x);
      const y = Y(p.y);
      if (p.rotate === -90) {
        const off = p.anchor === "middle" ? w / 2 : p.anchor === "end" ? w : 0;
        doc.text(text, x, y + off, { angle: 90 });
      } else {
        const off = p.anchor === "middle" ? w / 2 : p.anchor === "end" ? w : 0;
        doc.text(text, x - off, y);
      }
    }
  }
}

class Writer {
  y = 0;
  constructor(
    public doc: JsPDF,
    public margin = 16,
  ) {}
  get W() {
    return this.doc.internal.pageSize.getWidth();
  }
  get H() {
    return this.doc.internal.pageSize.getHeight();
  }
  get inner() {
    return this.W - this.margin * 2;
  }
  newPage() {
    this.doc.addPage("a4", "portrait");
    this.y = this.margin + 4;
  }
  ensure(h: number) {
    if (this.y + h > this.H - 20) this.newPage();
  }
  h1(t: string, num?: number) {
    this.ensure(16);
    this.doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(...INK);
    this.doc.text(clean(num ? `${num}. ${t}` : t), this.margin, this.y + 5);
    this.doc.setDrawColor(195, 202, 214).setLineWidth(0.3).line(this.margin, this.y + 7.5, this.W - this.margin, this.y + 7.5);
    this.y += 12;
  }
  para(t: string, opts: { size?: number; color?: [number, number, number]; bold?: boolean; indent?: number } = {}) {
    const size = opts.size ?? 9.5;
    this.doc.setFont("helvetica", opts.bold ? "bold" : "normal").setFontSize(size).setTextColor(...(opts.color ?? INK2));
    const lines = this.doc.splitTextToSize(clean(t), this.inner - (opts.indent ?? 0)) as string[];
    const lh = size * 0.3528 * 1.35;
    for (const line of lines) {
      this.ensure(lh);
      this.doc.text(line, this.margin + (opts.indent ?? 0), this.y + lh * 0.8);
      this.y += lh;
    }
    this.y += 1.5;
  }
  bullets(items: string[]) {
    for (const it of items) {
      this.ensure(5);
      this.doc.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(...INK2);
      this.doc.text("•", this.margin + 1, this.y + 3.6);
      this.para(it, { indent: 5 });
    }
  }
  table(head: string[], rows: string[][], widths: number[], opts: { size?: number } = {}) {
    const size = opts.size ?? 8.5;
    const total = widths.reduce((a, b) => a + b, 0);
    const ws = widths.map((w) => (w / total) * this.inner);
    const lh = size * 0.3528 * 1.3;
    const pad = 1.6;
    const drawRow = (cells: string[], header: boolean) => {
      this.doc.setFont("helvetica", header ? "bold" : "normal").setFontSize(size);
      const wrapped = cells.map((c, i) => this.doc.splitTextToSize(clean(c), ws[i] - pad * 2) as string[]);
      const h = Math.max(...wrapped.map((w) => w.length)) * lh + pad * 2;
      if (this.y + h > this.H - 20) {
        this.newPage();
        if (!header) drawRow(head, true);
      }
      if (header) {
        this.doc.setFillColor(238, 241, 245);
        this.doc.rect(this.margin, this.y, this.inner, h, "F");
      }
      this.doc.setTextColor(...(header ? INK : INK2));
      let x = this.margin;
      wrapped.forEach((lines, i) => {
        lines.forEach((ln, j) => this.doc.text(ln, x + pad, this.y + pad + lh * (j + 0.8)));
        x += ws[i];
      });
      this.doc.setDrawColor(223, 227, 234).setLineWidth(0.2).line(this.margin, this.y + h, this.W - this.margin, this.y + h);
      this.y += h;
    };
    drawRow(head, true);
    rows.forEach((r) => drawRow(r, false));
    this.y += 4;
  }
  rows(rows: Row[]) {
    this.table(["Item", "Value", "Source"], rows.map((r) => [r.label, r.value, TAG_LABEL[r.tag]]), [32, 48, 20]);
  }
}

export async function generatePdf(project: Project, version: DesignVersion, opts: { floors?: number[] } = {}) {
  const { jsPDF } = await import("jspdf");
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true });
  doc.setProperties({ title: `${project.name} — Preliminary planning report`, subject: DISCLAIMER, creator: "Plot2Plan AI" });
  const report: ReportData = buildReport(project, version);
  const w = new Writer(doc);
  const layout = version.layout;
  const unit = project.units.length;
  const floorIdx = (opts.floors ?? layout.floors.map((_, i) => i)).filter((i) => i >= 0 && i < layout.floors.length);
  const draw = (i: number) => drawFloor(layout, i, { unit, facing: project.plot.facing, roadWidthLabel: project.plot.roadWidth ? `${project.plot.roadWidth} ${unit}` : undefined });

  // 1. Cover
  doc.setFillColor(15, 31, 61);
  doc.rect(0, 0, w.W, 62, "F");
  doc.setTextColor(255, 255, 255).setFont("helvetica", "bold").setFontSize(10).text("PLOT2PLAN AI · PRELIMINARY ARCHITECTURAL PLANNING REPORT", 16, 18);
  doc.setFontSize(24).text(doc.splitTextToSize(clean(project.name), w.W - 32) as string[], 16, 34);
  doc.setFont("helvetica", "normal").setFontSize(10).text(clean(`${[project.city, project.country].filter(Boolean).join(", ")} · Design version ${version.version} · ${new Date(version.createdAt).toLocaleDateString()}`), 16, 54);
  const thumb = draw(0);
  const tk = Math.min((w.W - 40) / thumb.view.w, 150 / thumb.view.h);
  drawPrims(doc, thumb, (w.W - thumb.view.w * tk) / 2, 72, tk);
  doc.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED).text(clean(`${layout.floors[0].name} — overview, not to scale`), w.W / 2, 72 + thumb.view.h * tk + 5, { align: "center" });
  doc.setDrawColor(240, 217, 181).setFillColor(253, 243, 226).roundedRect(16, w.H - 52, w.W - 32, 22, 2, 2, "FD");
  doc.setFont("helvetica", "bold").setFontSize(9).setTextColor(...WARN).text(doc.splitTextToSize(DISCLAIMER, w.W - 44) as string[], 22, w.H - 44);

  // 2–9: text sections
  w.newPage();
  let s = 1;
  w.h1("Project overview", ++s);
  w.rows(report.overview);
  w.para("Source key: User-provided = entered by you; Calculated = deterministic geometry; Design suggestion = generated by the planning engine; Assumption = default used where no data was given; Needs professional confirmation = must be verified.", { size: 8, color: MUTED });
  w.h1("Plot information", ++s);
  w.rows(report.plot);
  w.h1("Confirmed dimensions and calculated area", ++s);
  w.rows(report.areaSummary.slice(0, 2));
  w.h1("Design brief and client requirements", ++s);
  w.rows(report.brief);
  w.h1("Design assumptions", ++s);
  w.bullets(report.assumptions);
  w.h1("Proposed space allocation", ++s);
  w.table(["Floor", "Covered area", "Car porch", "Open / terrace"], report.allocation.map((a) => [a.floor, a.covered, a.porch, a.open]), [25, 25, 25, 25]);
  w.h1("Floor-wise room schedule (dimensions and approximate areas)", ++s);
  for (const sch of report.schedules) {
    w.para(sch.floor, { bold: true, color: INK, size: 10 });
    w.table(["Space", "Dimensions (W × D)", "Approx. area", "Type"], sch.rows.map((r) => [r.name, r.dims, r.area, r.open ? "Open / semi-open" : "Covered"]), [40, 25, 25, 18]);
  }

  // 10. Floor plans (A3 landscape, standard scale)
  const planSection = ++s;
  for (const i of floorIdx) {
    doc.addPage("a3", "landscape");
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    const d = draw(i);
    const availW = PW - 30;
    const availH = PH - 52;
    const ftToMm = 304.8;
    const scale = SCALES.find((sc) => d.view.w * (ftToMm / sc) <= availW && d.view.h * (ftToMm / sc) <= availH) ?? null;
    const k = scale ? ftToMm / scale : Math.min(availW / d.view.w, availH / d.view.h);
    const ox = 15 + (availW - d.view.w * k) / 2;
    drawPrims(doc, d, ox, 26, k);
    doc.setFont("helvetica", "bold").setFontSize(14).setTextColor(...INK).text(clean(`${planSection}. Floor plan — ${layout.floors[i].name}`), 15, 16);
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(...INK2);
    doc.text(clean(`${project.name} · v${version.version} · Dimensions in ${unit === "ft" ? "feet-inches" : unit} (wall centrelines, approximate)`), 15, 21);
    // Title block
    doc.setDrawColor(195, 202, 214).setLineWidth(0.3).rect(PW - 130, PH - 24, 115, 16);
    doc.setFont("helvetica", "bold").setFontSize(8).setTextColor(...INK).text(scale ? `SCALE 1:${scale} ON A3 (PRINT AT 100%, NO FIT-TO-PAGE)` : "NOT TO A STANDARD SCALE — USE THE SCALE BAR", PW - 127, PH - 18);
    doc.setFont("helvetica", "normal").setFontSize(7).setTextColor(...WARN).text(doc.splitTextToSize(DISCLAIMER, 108) as string[], PW - 127, PH - 13.5);
  }

  doc.addPage("a4", "portrait");
  w.y = w.margin + 4;
  w.h1("Door and window schedule", ++s);
  for (const o of report.openings) {
    if (!o.rows.length) continue;
    w.para(o.floor, { bold: true, color: INK, size: 10 });
    w.table(["Ref", "Type", "Width", "Between"], o.rows.map((r) => [r.id, r.type, r.width, r.between]), [12, 22, 14, 52], { size: 8 });
  }
  w.h1("Circulation and privacy considerations", ++s);
  w.bullets(report.circulation);
  w.h1("Natural lighting and ventilation", ++s);
  w.bullets(report.lighting);
  w.h1("Parking and open-space arrangements", ++s);
  w.bullets(report.parking);
  w.h1("Preliminary area summary", ++s);
  w.rows(report.areaSummary);
  w.h1("Budget planning notes", ++s);
  w.bullets(report.budget);
  w.h1("Regulatory checks still requiring verification", ++s);
  w.rows(report.regulatory);
  w.h1("Validation results", s);
  w.table(["Severity", "Finding"], report.issues.map((i) => [i.severity.toUpperCase(), i.message]), [14, 86], { size: 8 });
  w.h1("Unresolved design questions", ++s);
  w.bullets(report.questions);
  w.h1("Professional review checklist", ++s);
  w.bullets(report.checklist.map((c) => `[  ] ${c}`));
  w.h1("Important limitations and disclaimers", ++s);
  w.bullets(report.limitations);

  // Footer on every page
  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    const PW = doc.internal.pageSize.getWidth();
    const PH = doc.internal.pageSize.getHeight();
    doc.setFont("helvetica", "normal").setFontSize(6.5).setTextColor(...MUTED);
    doc.text(clean(`Plot2Plan AI · ${project.name} · v${version.version} · PRELIMINARY CONCEPT — NOT FOR CONSTRUCTION`), 15, PH - 6);
    doc.text(`Page ${i} of ${pages}`, PW - 15, PH - 6, { align: "right" });
  }

  return { doc, pages };
}

export type { Prim };
