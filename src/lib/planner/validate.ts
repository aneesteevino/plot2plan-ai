import { area, contains, overlapArea, sharedEdge } from "../geometry";
import type { Floor, Issue, Layout, ProjectInput, Room } from "../schema";
import { fmtArea, fmtLength, round, toFeet } from "../units";
import { OPEN_KINDS, SPECS } from "./specs";

export interface AreaSummary {
  level: number;
  name: string;
  coveredSqft: number;
  porchSqft: number;
  openSqft: number;
  roomsSqft: number;
}

export function floorAreas(f: Floor): AreaSummary {
  let covered = 0;
  let porch = 0;
  let open = 0;
  let roomsA = 0;
  for (const r of f.rooms) {
    const a = area(r.rect);
    if (r.kind === "porch") porch += a;
    else if (r.open || OPEN_KINDS.includes(r.kind)) open += a;
    else {
      covered += a;
      if (r.kind !== "corridor") roomsA += a;
    }
  }
  return { level: f.level, name: f.name, coveredSqft: covered, porchSqft: porch, openSqft: open, roomsSqft: roomsA };
}

/** Deterministic checks on a layout. Never hides problems: every failed check is reported. */
export function validateLayout(l: Layout, p: ProjectInput): Issue[] {
  const issues: Issue[] = [];
  const len = (ft: number) => fmtLength(ft, p.units.length);
  const plotRect = { x: 0, y: 0, w: l.plot.w, d: l.plot.d };
  const plotArea = l.plot.w * l.plot.d;
  const r = p.requirements;

  for (const f of l.floors) {
    const lvl = f.level;
    const tag = `${f.name}:`;
    for (const room of f.rooms) {
      if (room.rect.w <= 0 || room.rect.d <= 0)
        issues.push({ severity: "error", code: "ROOM_DEGENERATE", floor: lvl, roomId: room.id, message: `${tag} ${room.name} has a zero or negative dimension.` });
      if (!contains(plotRect, room.rect))
        issues.push({ severity: "error", code: "OUTSIDE_PLOT", floor: lvl, roomId: room.id, message: `${tag} ${room.name} extends beyond the plot boundary.` });
      else if (!contains(l.buildable, room.rect))
        issues.push({ severity: "error", code: "OUTSIDE_BUILDABLE", floor: lvl, roomId: room.id, message: `${tag} ${room.name} extends into the setback zone.` });

      const s = SPECS[room.kind];
      const minSide = Math.min(room.rect.w, room.rect.d);
      if (!room.open && room.kind !== "corridor" && room.kind !== "dress" && room.kind !== "store" && !f.roof) {
        if (minSide < s.minSide * 0.97)
          issues.push({ severity: "warning", code: "ROOM_TOO_NARROW", floor: lvl, roomId: room.id, message: `${tag} ${room.name} is ${len(minSide)} wide, below the ${len(s.minSide)} planning minimum.` });
        if (area(room.rect) < s.minArea * 0.97)
          issues.push({ severity: "warning", code: "ROOM_TOO_SMALL", floor: lvl, roomId: room.id, message: `${tag} ${room.name} is ${fmtArea(area(room.rect), "sqft", p.units.marlaSqft)}, below the ~${s.minArea} sq ft planning guide.` });
        const ratio = Math.max(room.rect.w, room.rect.d) / Math.max(minSide, 0.01);
        if (s.habitable && ratio > 2.2)
          issues.push({ severity: "warning", code: "ROOM_ELONGATED", floor: lvl, roomId: room.id, message: `${tag} ${room.name} is long and narrow (${round(ratio, 1)}:1). Furniture layout may be difficult.` });
      }
    }

    // Overlaps
    for (let i = 0; i < f.rooms.length; i++)
      for (let j = i + 1; j < f.rooms.length; j++) {
        const ov = overlapArea(f.rooms[i].rect, f.rooms[j].rect);
        if (ov > 0.05)
          issues.push({ severity: "error", code: "ROOM_OVERLAP", floor: lvl, roomId: f.rooms[i].id, message: `${tag} ${f.rooms[i].name} overlaps ${f.rooms[j].name} by ${round(ov, 1)} sq ft.` });
      }

    // Natural light & ventilation
    const windowed = new Set(f.openings.filter((o) => o.type === "window").flatMap((o) => o.rooms));
    for (const room of f.rooms) {
      if (room.open || f.roof) continue;
      const s = SPECS[room.kind];
      if (s.habitable && !windowed.has(room.id))
        issues.push({ severity: "warning", code: "NO_WINDOW", floor: lvl, roomId: room.id, message: `${tag} ${room.name} has no wall facing the road, a setback or an open space, so it gets no window. Consider a courtyard, a light shaft or side setbacks.` });
      else if (room.kind === "bath" && !windowed.has(room.id))
        issues.push({ severity: "info", code: "BATH_NO_VENTILATOR", floor: lvl, roomId: room.id, message: `${tag} ${room.name} has no external wall. It needs a duct or mechanical exhaust.` });
    }

    // Reachability through doors / openings
    const adj = new Map<string, Set<string>>();
    const link = (a: string, b: string) => {
      if (!adj.has(a)) adj.set(a, new Set());
      if (!adj.has(b)) adj.set(b, new Set());
      adj.get(a)!.add(b);
      adj.get(b)!.add(a);
    };
    for (const o of f.openings) if (o.rooms.length === 2) link(o.rooms[0], o.rooms[1]);
    const openRooms = f.rooms.filter((rm) => rm.open);
    for (let i = 0; i < openRooms.length; i++)
      for (let j = i + 1; j < openRooms.length; j++)
        if (sharedEdge(openRooms[i].rect, openRooms[j].rect)) link(openRooms[i].id, openRooms[j].id);

    const starts = f.rooms.filter((rm) =>
      lvl === 0 && !f.roof ? rm.kind === "foyer" || rm.kind === "porch" || (rm.kind === "lawn" && rm.band === "A") : rm.kind === "stair" || rm.kind === "lift",
    );
    const seen = new Set(starts.map((s) => s.id));
    const queue = [...seen];
    while (queue.length) {
      const cur = queue.shift()!;
      for (const nb of adj.get(cur) ?? [])
        if (!seen.has(nb)) {
          seen.add(nb);
          queue.push(nb);
        }
    }
    for (const room of f.rooms) {
      if (room.kind === "shaft" || room.kind === "open" || seen.has(room.id)) continue;
      issues.push({ severity: room.open ? "warning" : "error", code: "NO_ACCESS", floor: lvl, roomId: room.id, message: `${tag} ${room.name} cannot be reached from the ${lvl === 0 && !f.roof ? "entrance" : "staircase"} through doors or openings.` });
    }
    if (lvl === 0 && !f.roof && !f.openings.some((o) => o.type === "main-door"))
      issues.push({ severity: "error", code: "NO_MAIN_DOOR", floor: lvl, message: "Ground floor: no main entrance door could be placed on the road-facing side." });
  }

  // Vertical alignment of staircase / lift
  const stairs = l.floors.map((f) => f.rooms.filter((rm) => rm.kind === "stair" || rm.kind === "lift"));
  if (l.floors.length > 1) {
    const ref = stairs[0];
    if (ref.length === 0) issues.push({ severity: "error", code: "NO_STAIR", message: "A multi-floor plan has no staircase on the ground floor." });
    for (let i = 1; i < stairs.length; i++) {
      const aligned = ref.every((s) => stairs[i].some((t) => t.kind === s.kind && overlapArea(s.rect, t.rect) > area(s.rect) * 0.98));
      if (!aligned) issues.push({ severity: "error", code: "STAIR_MISALIGNED", floor: l.floors[i].level, message: `${l.floors[i].name}: the staircase does not line up with the floor below.` });
    }
  }

  // Wet-area stacking (plumbing)
  for (let i = 1; i < l.floors.length; i++) {
    const f = l.floors[i];
    if (f.roof) continue;
    const below = l.floors[i - 1].rooms.filter((rm) => rm.kind === "bath" || rm.kind === "kitchen" || rm.kind === "laundry" || rm.kind === "shaft");
    const unstacked = f.rooms.filter((rm) => rm.kind === "bath" && !below.some((b) => overlapArea(b.rect, rm.rect) > area(rm.rect) * 0.5));
    if (unstacked.length)
      issues.push({ severity: "info", code: "WET_NOT_STACKED", floor: f.level, message: `${f.name}: ${unstacked.map((u) => u.name).join(", ")} ${unstacked.length > 1 ? "are" : "is"} not above a wet area. Plumbing routes need coordination with the floor below.` });
  }

  // Programme check: requested vs placed
  const placed = (k: Room["kind"]) => l.floors.reduce((s, f) => s + f.rooms.filter((rm) => rm.kind === k).length, 0);
  const beds = placed("bedroom") + placed("master");
  if (beds !== r.bedrooms) issues.push({ severity: "warning", code: "BEDROOM_COUNT", message: `${beds} of ${r.bedrooms} requested bedrooms were placed.` });

  // Coverage
  const ground = l.floors.find((f) => f.level === 0 && !f.roof);
  if (ground) {
    const a = floorAreas(ground);
    const cov = ((a.coveredSqft + a.porchSqft) / plotArea) * 100;
    const max = p.constraints.maxCoveragePct;
    if (max !== undefined && cov > max + 0.05)
      issues.push({ severity: "error", code: "COVERAGE_EXCEEDED", message: `Ground coverage is ${round(cov, 1)}% (including the porch), which exceeds the permitted ${max}% you entered. Reduce the footprint or add setbacks / open space.` });
    else
      issues.push({ severity: "info", code: "COVERAGE", message: `Approximate ground coverage is ${round(cov, 1)}% of the plot (including the porch).${max === undefined ? " No maximum coverage was provided, so compliance is unverified." : ` This is within the ${max}% you entered.`}` });
  }

  // Height
  const builtFloors = l.floors.filter((f) => !f.roof).length;
  const estHeight = builtFloors * p.constraints.floorHeight + (l.floors.some((f) => f.roof) ? 3.5 + 9 : 3.5);
  if (p.constraints.maxHeight !== undefined) {
    const maxFt = toFeet(p.constraints.maxHeight, p.units.length);
    if (estHeight > maxFt)
      issues.push({ severity: "error", code: "HEIGHT_EXCEEDED", message: `Estimated building height of about ${len(estHeight)} (floors plus parapet${l.floors.some((f) => f.roof) ? " and stair tower" : ""}) exceeds the ${len(maxFt)} limit you entered.` });
  } else {
    issues.push({ severity: "info", code: "HEIGHT_UNVERIFIED", message: `Estimated height is about ${len(estHeight)}. No height limit was provided, so it has not been checked.` });
  }

  if (p.constraints.setbacks.source === "none")
    issues.push({ severity: "warning", code: "SETBACKS_PENDING", message: "No setbacks were provided, so the building is drawn up to the plot boundary. Get the required setbacks from your housing society or development authority before relying on this plan." });
  else if (p.constraints.setbacks.source === "placeholder")
    issues.push({ severity: "warning", code: "SETBACKS_PLACEHOLDER", message: "The setbacks are planning placeholders, not verified bylaw values." });

  return issues;
}
