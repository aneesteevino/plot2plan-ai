/**
 * Converts a structured floor layout into renderer-agnostic drawing primitives.
 * The same primitives drive the on-screen SVG and the vector PDF, so both show
 * identical geometry. Units are feet; y grows downward (road at the bottom).
 */
import type { Layout, Opening, Room } from "./schema";
import { roomFill } from "./report";
import type { LengthUnit } from "./units";
import { fmtLength } from "./units";

export type Prim =
  | { t: "rect"; x: number; y: number; w: number; h: number; fill?: string; stroke?: string; sw?: number; dash?: number[]; roomId?: string }
  | { t: "line"; x1: number; y1: number; x2: number; y2: number; stroke: string; sw: number; dash?: number[] }
  | { t: "poly"; pts: [number, number][]; stroke?: string; sw?: number; fill?: string; closed?: boolean }
  | { t: "text"; x: number; y: number; text: string; size: number; bold?: boolean; anchor?: "start" | "middle" | "end"; fill?: string; rotate?: number };

export interface Drawing {
  view: { x: number; y: number; w: number; h: number };
  prims: Prim[];
}

const INK = "#0f1f3d";
const INK2 = "#3b4a66";
const MUTED = "#6b7890";
const ACCENT = "#1f4fd1";
const DIR_DEG: Record<string, number> = { N: 0, NE: 45, E: 90, SE: 135, S: 180, SW: 225, W: 270, NW: 315 };
const OPEN_DASHED = ["lawn", "courtyard", "terrace", "balcony", "open", "shaft", "porch"];

export interface DrawOptions {
  unit: LengthUnit;
  facing?: string;
  roadWidthLabel?: string;
  selectedRoomId?: string;
  showDims?: boolean;
}

export function drawFloor(layout: Layout, floorIndex: number, o: DrawOptions): Drawing {
  const f = layout.floors[floorIndex];
  const P = layout.plot;
  const sy = (y: number) => P.d - y; // plot coords → screen
  const len = (ft: number) => fmtLength(ft, o.unit);
  const prims: Prim[] = [];
  const margin = Math.max(7, Math.min(P.w, P.d) * 0.12);

  // Plot boundary
  prims.push({ t: "rect", x: 0, y: 0, w: P.w, h: P.d, fill: "#ffffff", stroke: INK2, sw: 0.14, dash: [1.2, 0.6, 0.25, 0.6] });

  // Setback / buildable line
  const b = layout.buildable;
  if (b.x > 0.01 || b.y > 0.01 || b.w < P.w - 0.01 || b.d < P.d - 0.01)
    prims.push({ t: "rect", x: b.x, y: sy(b.y + b.d), w: b.w, h: b.d, stroke: MUTED, sw: 0.08, dash: [0.6, 0.4] });

  // Rooms (fills)
  const sorted = [...f.rooms].sort((a, b2) => +b2.open - +a.open);
  for (const r of sorted) {
    const dashed = r.open || OPEN_DASHED.includes(r.kind);
    prims.push({
      t: "rect",
      x: r.rect.x,
      y: sy(r.rect.y + r.rect.d),
      w: r.rect.w,
      h: r.rect.d,
      fill: roomFill(r.kind),
      stroke: dashed ? MUTED : INK,
      sw: dashed ? 0.08 : 0.32,
      dash: dashed ? [0.5, 0.35] : undefined,
      roomId: r.id,
    });
    if (r.kind === "stair") prims.push(...stairHatch(r, sy));
    if (r.kind === "porch") prims.push(...carOutline(r, sy));
  }

  // Exterior footprint walls (heavier), ground covered rooms only
  const fp = layout.footprint;
  if (!f.roof) prims.push({ t: "rect", x: fp.x, y: sy(fp.y + fp.d), w: fp.w, h: fp.d, stroke: INK, sw: 0.6 });

  // Openings
  for (const op of f.openings) prims.push(...openingPrims(op, f.rooms, sy));

  // Selection highlight
  const sel = f.rooms.find((r) => r.id === o.selectedRoomId);
  if (sel) prims.push({ t: "rect", x: sel.rect.x + 0.15, y: sy(sel.rect.y + sel.rect.d) + 0.15, w: sel.rect.w - 0.3, h: sel.rect.d - 0.3, stroke: ACCENT, sw: 0.3 });

  // Labels
  for (const r of f.rooms) prims.push(...roomLabel(r, sy, len));

  // Road
  prims.push({ t: "rect", x: -margin * 0.6, y: P.d + 0.8, w: P.w + margin * 1.2, h: 2.6, fill: "#eef1f5" });
  prims.push({ t: "text", x: P.w / 2, y: P.d + 2.55, text: `ROAD${o.roadWidthLabel ? ` (${o.roadWidthLabel} wide)` : ""}`, size: 1.05, bold: true, anchor: "middle", fill: INK2 });

  if (o.showDims !== false) {
    // Overall plot width (below road) and depth (left side)
    prims.push(...dimLine(0, P.d + 5.2, P.w, P.d + 5.2, len(P.w), "h"));
    prims.push(...dimLine(-3.6, 0, -3.6, P.d, len(P.d), "v"));
    // Building footprint dims (top and right)
    if (!f.roof) {
      prims.push(...dimLine(fp.x, -2.6, fp.x + fp.w, -2.6, len(fp.w), "h"));
      prims.push(...dimLine(P.w + 2.8, sy(fp.y + fp.d), P.w + 2.8, sy(fp.y), len(fp.d), "v"));
    }
  }

  // North arrow
  if (o.facing && o.facing in DIR_DEG) {
    const rot = (360 - ((DIR_DEG[o.facing] + 180) % 360)) % 360;
    prims.push(...northArrow(P.w + margin * 0.55, -margin * 0.35, rot));
  }

  // Scale bar (10 ft) — valid because the drawing is in true proportion.
  const sbx = 0;
  const sby = P.d + 8.6;
  for (let i = 0; i < 5; i++) prims.push({ t: "rect", x: sbx + i * 2, y: sby, w: 2, h: 0.5, fill: i % 2 ? "#ffffff" : INK, stroke: INK, sw: 0.06 });
  prims.push({ t: "text", x: sbx, y: sby + 1.7, text: "0", size: 0.7, anchor: "middle", fill: INK2 });
  prims.push({ t: "text", x: sbx + 10, y: sby + 1.7, text: o.unit === "ft" ? "10 ft" : len(10), size: 0.7, anchor: "middle", fill: INK2 });

  return { view: { x: -margin, y: -margin, w: P.w + margin * 2, h: P.d + margin + 11 }, prims };
}

function roomLabel(r: Room, sy: (y: number) => number, len: (ft: number) => string): Prim[] {
  const cx = r.rect.x + r.rect.w / 2;
  const cy = sy(r.rect.y + r.rect.d / 2);
  const small = r.rect.w < 6.5 || r.rect.d < 5;
  const tiny = r.rect.w < 4.2 || r.rect.d < 3.2;
  let size = tiny ? 0.55 : small ? 0.7 : Math.min(1.05, Math.max(0.8, r.rect.w / 12));
  let name = r.name.replace(/ \((Master Bedroom|Bedroom)[^)]*\)/, "").replace("Living / TV Lounge", "Living / TV").replace("Light / Duct Shaft", "Shaft");
  if (tiny) name = name.split(" ")[0];
  const out: Prim[] = [];
  // Approximate glyph width of the bold sans label: ~0.62 em per character.
  const widthAt = (s: number) => name.length * s * 0.62;
  const fits = widthAt(size) < r.rect.w - 0.5;
  const rotate = !fits && r.rect.d > r.rect.w * 1.4 ? -90 : undefined;
  const room = rotate ? r.rect.d - 0.8 : r.rect.w - 0.5;
  if (widthAt(size) > room) size = Math.max(0.42, room / (name.length * 0.62));
  if (widthAt(size) > room && name.includes(" ")) name = name.split(" ")[0];
  out.push({ t: "text", x: cx, y: cy - (tiny ? 0 : size * 0.25), text: name.toUpperCase(), size, bold: true, anchor: "middle", fill: r.open ? "#4b5a75" : INK, rotate });
  if (!tiny && !(r.open && r.kind === "open"))
    out.push({ t: "text", x: rotate ? cx + size * 1.1 : cx, y: rotate ? cy - size * 0.25 : cy + size * 1.05, text: `${len(r.rect.w)} × ${len(r.rect.d)}`, size: size * 0.78, anchor: "middle", fill: INK2, rotate });
  return out;
}

function openingPrims(op: Opening, rooms: Room[], sy: (y: number) => number): Prim[] {
  const x1 = op.x1;
  const y1 = sy(op.y1);
  const x2 = op.x2;
  const y2 = sy(op.y2);
  const horizontal = Math.abs(y1 - y2) < 1e-6;
  const out: Prim[] = [];
  const gapW = op.type === "gate" ? 0.3 : 0.75;
  out.push({ t: "line", x1, y1, x2, y2, stroke: "#ffffff", sw: gapW });
  if (op.type === "window") {
    const off = 0.14;
    for (const d of [-off, off]) out.push(horizontal ? { t: "line", x1, y1: y1 + d, x2, y2: y2 + d, stroke: INK, sw: 0.05 } : { t: "line", x1: x1 + d, y1, x2: x2 + d, y2, stroke: INK, sw: 0.05 });
    out.push({ t: "line", x1, y1, x2, y2, stroke: ACCENT, sw: 0.07 });
    return out;
  }
  if (op.type === "gate") {
    out.push({ t: "text", x: (x1 + x2) / 2, y: y1 - 0.5, text: "GATE", size: 0.6, bold: true, anchor: "middle", fill: MUTED });
    return out;
  }
  // Ticks at jambs
  const tick = (x: number, y: number): Prim => (horizontal ? { t: "line", x1: x, y1: y - 0.35, x2: x, y2: y + 0.35, stroke: INK, sw: 0.08 } : { t: "line", x1: x - 0.35, y1: y, x2: x + 0.35, y2: y, stroke: INK, sw: 0.08 });
  out.push(tick(x1, y1), tick(x2, y2));
  if (op.type === "opening") return out;

  // Door leaf + swing into the first room
  const room = rooms.find((r) => r.id === op.rooms[0]);
  const w = Math.hypot(x2 - x1, y2 - y1);
  let nx = 0;
  let ny = 0;
  if (room) {
    const rcx = room.rect.x + room.rect.w / 2;
    const rcy = sy(room.rect.y + room.rect.d / 2);
    if (horizontal) ny = rcy > y1 ? 1 : -1;
    else nx = rcx > x1 ? 1 : -1;
  } else if (horizontal) ny = -1;
  if (op.type === "main-door" && op.rooms.length === 1) {
    // Main door from the outside: swing into the foyer
    ny = horizontal ? -1 : ny;
  }
  const hx = x1;
  const hy = y1;
  const lx = hx + nx * w;
  const ly = hy + ny * w;
  out.push({ t: "line", x1: hx, y1: hy, x2: lx, y2: ly, stroke: INK, sw: op.type === "main-door" ? 0.14 : 0.09 });
  const a0 = Math.atan2(ly - hy, lx - hx);
  const a1 = Math.atan2(y2 - hy, x2 - hx);
  let da = a1 - a0;
  while (da > Math.PI) da -= 2 * Math.PI;
  while (da < -Math.PI) da += 2 * Math.PI;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 12; i++) {
    const a = a0 + (da * i) / 12;
    pts.push([hx + Math.cos(a) * w, hy + Math.sin(a) * w]);
  }
  out.push({ t: "poly", pts, stroke: MUTED, sw: 0.05 });
  if (op.type === "main-door") {
    const mx = (x1 + x2) / 2;
    out.push({ t: "poly", pts: [[mx - 0.5, y1 + 1.6], [mx + 0.5, y1 + 1.6], [mx, y1 + 0.9]], fill: ACCENT, closed: true });
    out.push({ t: "text", x: mx, y: y1 + 2.5, text: "ENTRY", size: 0.6, bold: true, anchor: "middle", fill: ACCENT });
  }
  return out;
}

function stairHatch(r: Room, sy: (y: number) => number): Prim[] {
  const out: Prim[] = [];
  const x = r.rect.x;
  const top = sy(r.rect.y + r.rect.d);
  const w = r.rect.w;
  const d = r.rect.d;
  const flight = (d - 3.5) / 2 > 0 ? Math.min(d - 3.5, 10) : d * 0.7;
  const half = w / 2;
  const treads = 9;
  // Two flights side by side (dog-leg), landing at the far end.
  for (let i = 1; i < treads; i++) {
    const yy = top + d - (flight * i) / treads;
    out.push({ t: "line", x1: x + 0.2, y1: yy, x2: x + half - 0.1, y2: yy, stroke: MUTED, sw: 0.04 });
    out.push({ t: "line", x1: x + half + 0.1, y1: yy, x2: x + w - 0.2, y2: yy, stroke: MUTED, sw: 0.04 });
  }
  out.push({ t: "line", x1: x + half, y1: top + d - flight, x2: x + half, y2: top + d, stroke: MUTED, sw: 0.06 });
  out.push({ t: "line", x1: x + half * 0.5, y1: top + d - 0.6, x2: x + half * 0.5, y2: top + d - flight + 0.6, stroke: ACCENT, sw: 0.06 });
  out.push({ t: "poly", pts: [[x + half * 0.5 - 0.3, top + d - flight + 1.1], [x + half * 0.5 + 0.3, top + d - flight + 1.1], [x + half * 0.5, top + d - flight + 0.5]], fill: ACCENT, closed: true });
  return out;
}

function carOutline(r: Room, sy: (y: number) => number): Prim[] {
  const out: Prim[] = [];
  const cars = Math.max(1, Math.round((r.rect.w - 1) / 9.5));
  const cw = 6;
  const cl = Math.min(15, r.rect.d - 2);
  for (let i = 0; i < cars; i++) {
    const cx = r.rect.x + (r.rect.w / cars) * (i + 0.5);
    const top = sy(r.rect.y + r.rect.d) + (r.rect.d - cl) / 2;
    out.push({ t: "rect", x: cx - cw / 2, y: top, w: cw, h: cl, stroke: "#9aa4b6", sw: 0.06, dash: [0.3, 0.3] });
  }
  return out;
}

function dimLine(x1: number, y1: number, x2: number, y2: number, label: string, dir: "h" | "v"): Prim[] {
  const out: Prim[] = [{ t: "line", x1, y1, x2, y2, stroke: INK2, sw: 0.06 }];
  const t = 0.45;
  for (const [x, y] of [[x1, y1], [x2, y2]] as const) {
    out.push({ t: "line", x1: x - t, y1: y + t, x2: x + t, y2: y - t, stroke: INK2, sw: 0.08 });
    out.push(dir === "h" ? { t: "line", x1: x, y1: y - 0.7, x2: x, y2: y + 0.7, stroke: INK2, sw: 0.04 } : { t: "line", x1: x - 0.7, y1: y, x2: x + 0.7, y2: y, stroke: INK2, sw: 0.04 });
  }
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  if (dir === "h") out.push({ t: "text", x: mx, y: my - 0.45, text: label, size: 0.85, anchor: "middle", fill: INK, bold: true });
  else out.push({ t: "text", x: mx - 0.45, y: my, text: label, size: 0.85, anchor: "middle", fill: INK, bold: true, rotate: -90 });
  return out;
}

function northArrow(cx: number, cy: number, rot: number): Prim[] {
  const rad = (rot * Math.PI) / 180;
  const R = (x: number, y: number): [number, number] => [cx + x * Math.cos(rad) - y * Math.sin(rad), cy + x * Math.sin(rad) + y * Math.cos(rad)];
  const s = 1.6;
  return [
    { t: "poly", pts: [R(0, -s), R(s * 0.5, s * 0.7), R(0, s * 0.35), R(-s * 0.5, s * 0.7)], fill: INK, stroke: INK, sw: 0.05, closed: true },
    { t: "text", x: R(0, -s - 0.9)[0], y: R(0, -s - 0.9)[1] + 0.35, text: "N", size: 1, bold: true, anchor: "middle", fill: INK },
  ];
}
