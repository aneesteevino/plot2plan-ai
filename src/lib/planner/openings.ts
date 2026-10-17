import { boundaryEdges, segLength, sharedEdge, type Segment } from "../geometry";
import type { Floor, Layout, Opening, ProjectInput, Room, RoomKind } from "../schema";
import { CIRCULATION, DIM, OPEN_KINDS, SPECS } from "./specs";

const PRIORITY: Partial<Record<RoomKind, RoomKind[]>> = {
  bedroom: ["corridor", "lounge", "living", "foyer", "dining"],
  master: ["corridor", "lounge", "living", "foyer", "dining"],
  guest: ["foyer", "corridor", "living", "lounge", "drawing"],
  study: ["corridor", "lounge", "living", "foyer"],
  office: ["foyer", "corridor", "lounge", "living"],
  prayer: ["corridor", "lounge", "living", "foyer"],
  bath: ["corridor", "lounge", "living", "foyer", "dining"],
  laundry: ["kitchen", "corridor", "dining", "living"],
  store: ["corridor", "kitchen", "laundry", "lounge", "living", "dining"],
  kitchen: ["dining", "living", "corridor", "lounge", "foyer"],
  dining: ["living", "lounge", "foyer", "corridor"],
  living: ["foyer", "corridor", "dining"],
  lounge: ["stair", "corridor"],
  drawing: ["foyer", "living", "porch", "dining"],
  stair: ["corridor", "living", "lounge", "foyer", "dining"],
  lift: ["corridor", "lounge", "living", "stair", "foyer"],
  corridor: ["living", "lounge", "stair", "dining", "foyer"],
  porch: ["foyer", "drawing", "living"],
  balcony: ["lounge", "master", "bedroom", "guest", "study", "office", "corridor"],
  terrace: ["lounge", "stair", "corridor", "master", "bedroom", "study", "office", "guest"],
  courtyard: ["corridor", "living", "lounge", "dining"],
  lawn: ["laundry", "kitchen", "corridor", "living", "dining", "drawing", "master", "bedroom", "guest"],
};

const isHub = (k: RoomKind) => CIRCULATION.includes(k);

function placeOnSegment(s: Segment, width: number, centred: boolean): Segment {
  const L = segLength(s);
  const w = Math.min(width, Math.max(0, L - 0.5));
  const start = centred || L <= 8 ? (L - w) / 2 : 1.25;
  const ux = (s.x2 - s.x1) / L;
  const uy = (s.y2 - s.y1) / L;
  return { x1: s.x1 + ux * start, y1: s.y1 + uy * start, x2: s.x1 + ux * (start + w), y2: s.y1 + uy * (start + w) };
}

/** Adds doors, openings and windows to a floor using adjacency rules. */
export function addOpenings(floor: Floor, layout: Layout, p: ProjectInput): Floor {
  const rooms = floor.rooms;
  const openings: Opening[] = [];
  const pairs = new Set<string>();
  const acc = p.requirements.accessibility;
  let n = 0;
  const id = (t: string) => `${t}${floor.level}-${++n}`;

  const addLink = (a: Room, b: Room, seg: Segment) => {
    const key = [a.id, b.id].sort().join("|");
    if (pairs.has(key)) return;
    pairs.add(key);
    const bothHubs = isHub(a.kind) && isHub(b.kind) && !(a.kind === "foyer" && b.kind === "living") && a.kind !== "stair" && b.kind !== "stair";
    const openPlan =
      (p.requirements.kitchenType === "open" && [a.kind, b.kind].includes("kitchen") && [a.kind, b.kind].some((k) => k === "dining" || k === "living")) ||
      [a.kind, b.kind].includes("dress");
    const stairLink = a.kind === "stair" || b.kind === "stair";
    const type: Opening["type"] = bothHubs || openPlan || stairLink ? "opening" : "door";
    const isBath = a.kind === "bath" || b.kind === "bath";
    let width: number = isBath ? DIM.bathDoor : acc ? DIM.doorAccessible : DIM.door;
    if (type === "opening") width = Math.min(stairLink ? 3.5 : 6, segLength(seg) * 0.6);
    if ([a.kind, b.kind].includes("porch") || (a.kind === "foyer" && b.kind === "living") || (b.kind === "foyer" && a.kind === "living")) width = 3.5;
    const s = placeOnSegment(seg, width, type === "opening");
    openings.push({ id: id(type === "door" ? "D" : "O"), type, ...s, width: segLength(s), rooms: [a.id, b.id] });
  };

  const neighbours = (r: Room, minLen: number) =>
    rooms
      .filter((o) => o.id !== r.id)
      .map((o) => ({ o, seg: sharedEdge(r.rect, o.rect) }))
      .filter((x): x is { o: Room; seg: Segment } => !!x.seg && segLength(x.seg) >= minLen);

  // Ground floor: main door and gate (placed first so the entry link is not duplicated).
  if (floor.level === 0 && !floor.roof) {
    const fp = layout.footprint;
    const foyer = rooms.find((r) => r.kind === "foyer");
    const porch = rooms.find((r) => r.kind === "porch");
    if (foyer) {
      const front = boundaryEdges(foyer.rect, fp).find((e) => e.y1 === e.y2 && Math.abs(e.y1 - fp.y) < 1e-3);
      if (front) openings.push({ id: id("M"), type: "main-door", ...placeOnSegment(front, DIM.mainDoor, true), width: DIM.mainDoor, rooms: [foyer.id] });
    } else if (porch) {
      // Entry from the porch straight into the house.
      const target = neighbours(porch, DIM.mainDoor)
        .filter((x) => isHub(x.o.kind) || x.o.kind === "drawing")
        .sort((a, b) => +(b.o.kind === "living") - +(a.o.kind === "living") || segLength(b.seg) - segLength(a.seg))[0];
      if (target) {
        pairs.add([porch.id, target.o.id].sort().join("|"));
        openings.push({ id: id("M"), type: "main-door", ...placeOnSegment(target.seg, DIM.mainDoor, true), width: DIM.mainDoor, rooms: [porch.id, target.o.id] });
      }
    }
    const gateRoom = porch ?? foyer;
    if (gateRoom) {
      const w = porch ? Math.max(3, porch.rect.w - 1) : DIM.mainDoor;
      const seg = { x1: gateRoom.rect.x, y1: 0, x2: gateRoom.rect.x + gateRoom.rect.w, y2: 0 };
      openings.push({ id: id("G"), type: "gate", ...placeOnSegment(seg, w, true), width: w, rooms: [] });
    }
  }

  for (const r of rooms) {
    if (r.kind === "shaft" || r.kind === "open") continue;
    if (r.accessVia) {
      const t = rooms.find((o) => o.id === r.accessVia);
      const seg = t && sharedEdge(r.rect, t.rect);
      if (t && seg) addLink(r, t, seg);
      continue;
    }
    const ns = neighbours(r, 3);
    if (isHub(r.kind)) {
      // Circulation spaces connect to every adjoining circulation space.
      for (const x of ns) if (isHub(x.o.kind) && x.o.band !== "T") addLink(r, x.o, x.seg);
    }
    const prio = PRIORITY[r.kind];
    if (!prio) continue;
    let picked = false;
    for (const k of prio) {
      const c = ns.filter((x) => x.o.kind === k && !(x.o.band === "T" && r.band !== "T")).sort((a, b) => segLength(b.seg) - segLength(a.seg))[0];
      if (c) {
        addLink(r, c.o, c.seg);
        picked = true;
        break;
      }
    }
    // Front lawn on ground is reached directly from the road side, no door needed.
    if (!picked && r.kind === "lawn" && r.band === "A") continue;
  }

  // Windows: on walls facing the road, a setback of >= 3 ft, a side road, or an open space.
  const fp = layout.footprint;
  const plotW = layout.plot.w;
  const plotD = layout.plot.d;
  const leftOpen = fp.x >= DIM.minWindowSetback || (p.plot.cornerPlot && p.plot.secondRoadSide === "left");
  const rightOpen = plotW - (fp.x + fp.w) >= DIM.minWindowSetback || (p.plot.cornerPlot && p.plot.secondRoadSide === "right");
  const rearOpen = plotD - (fp.y + fp.d) >= DIM.minWindowSetback;

  for (const r of rooms) {
    if (OPEN_KINDS.includes(r.kind) || r.kind === "porch" || r.kind === "corridor" || r.kind === "foyer" || r.kind === "dress" || r.kind === "lift" || r.kind === "store") continue;
    const candidates: Segment[] = [];
    for (const e of boundaryEdges(r.rect, fp)) {
      const horizontal = Math.abs(e.y1 - e.y2) < 1e-6;
      if (horizontal && Math.abs(e.y1 - fp.y) < 1e-3) candidates.push(e);
      else if (horizontal && rearOpen) candidates.push(e);
      else if (!horizontal && Math.abs(e.x1 - fp.x) < 1e-3 && leftOpen) candidates.push(e);
      else if (!horizontal && Math.abs(e.x1 - (fp.x + fp.w)) < 1e-3 && rightOpen) candidates.push(e);
    }
    for (const o of rooms) {
      if (o.id === r.id || !(OPEN_KINDS.includes(o.kind) || o.kind === "porch") || o.kind === "open" && o.band === "T") continue;
      const seg = sharedEdge(r.rect, o.rect);
      if (seg) candidates.push(seg);
    }
    const best = candidates.filter((c) => segLength(c) >= 2.5).sort((a, b) => segLength(b) - segLength(a))[0];
    if (!best) continue;
    const habitable = SPECS[r.kind].habitable;
    const target = r.kind === "bath" || r.kind === "laundry" ? 2 : r.kind === "stair" ? 3 : r.kind === "living" || r.kind === "lounge" || r.kind === "drawing" ? 5 : habitable ? 4 : 3;
    const w = Math.min(target, segLength(best) * 0.6);
    openings.push({ id: id("W"), type: "window", ...placeOnSegment(best, w, true), width: w, rooms: [r.id] });
  }

  return { ...floor, openings };
}
