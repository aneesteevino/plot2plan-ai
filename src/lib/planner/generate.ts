/**
 * Deterministic zoned-band floor-plan generator for rectangular plots.
 *
 * The buildable rectangle is divided front→rear into bands:
 *   A  public front zone   (porch, entrance foyer, drawing / guest room, front lawn)
 *   M  optional middle zone of bedrooms for deep plots (opens onto the living/lounge)
 *   B  family / service zone (living or lounge, dining, kitchen, lift, staircase)
 *   X  corridor (full width, links B to C)
 *   C  private rear zone   (bedrooms with attached baths, common bath, study, utility)
 *   R  rear open space (ground floor only, when depth remains)
 * Band depths are shared by every floor, so walls, the staircase and the lift stack
 * vertically. The generator never invents setbacks: it uses only what the user supplied.
 */
import { analyzePlot, type PlotAnalysis } from "../geometry";
import type { Floor, Issue, Layout, ProjectInput, Rect, Room, RoomKind } from "../schema";
import { fmtLength, round, toFeet } from "../units";
import { addOpenings } from "./openings";
import { DIM, OPEN_KINDS, SPECS } from "./specs";
import { validateLayout } from "./validate";

export const ENGINE_VERSION = "zoned-bands-1.0";

type BandKey = "A" | "M" | "B" | "C";

interface Item {
  kind: RoomKind;
  name: string;
  elastic?: boolean;
  optional?: boolean;
  fixedW?: number;
  attachedBath?: boolean;
  /** Utility column holding laundry + store. */
  utility?: { laundry: boolean; store: boolean };
}

interface Fixed {
  x: number;
  w: number;
  rooms: (y0: number, d: number) => Omit<Room, "id">[];
}

interface FloorPlanSpec {
  level: number;
  A: Item[];
  M: Item[];
  B: Item[];
  C: Item[];
  balcony: boolean;
}

interface Variant {
  guestInA: boolean;
  studyUp: boolean;
  useM: boolean;
  mergeDining: boolean;
  kitchenInC: boolean;
  /** Enter through the car porch into the living room (common on small plots). */
  noFoyer: boolean;
  /** Store under the staircase; laundry as an outdoor / roof area instead of a room. */
  compactUtility: boolean;
  /** Bedrooms open directly off the living / lounge instead of a corridor. */
  noCorridor: boolean;
}

interface FitFailure {
  level: number;
  band: BandKey;
  need: number;
  available: number;
  names: string[];
}

export interface GenerateResult {
  layout: Layout | null;
  issues: Issue[];
  analysis: PlotAnalysis;
}

const FLOOR_NAMES = ["Ground Floor", "First Floor", "Second Floor", "Third Floor", "Fourth Floor"];
const BAND_NAMES: Record<BandKey, string> = { A: "front zone", M: "middle zone", B: "family/service zone", C: "rear private zone" };

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// ---------- width model ----------

function widths(item: Item, d: number) {
  if (item.fixedW !== undefined) return { need: item.fixedW, want: item.fixedW, cap: item.fixedW };
  const s = SPECS[item.kind];
  let need = Math.max(s.minSide, s.minArea / d);
  let want = Math.max(need, s.target / d);
  let cap = item.elastic ? Infinity : Math.max(want, (s.target * s.maxFactor) / d);
  if (item.attachedBath) {
    need += 5;
    want += 5.5;
    cap += 6.5;
  }
  if (item.utility && item.utility.laundry && item.utility.store) {
    want = Math.max(want, 6);
  }
  return { need, want, cap };
}

const needSum = (items: Item[], d: number) => items.reduce((s, i) => s + widths(i, d).need, 0);

/** Distribute a free interval of width L among items. Returns widths or null if they cannot fit. */
function distribute(items: Item[], d: number, L: number): number[] | null {
  if (items.length === 0) return [];
  const ws = items.map((i) => widths(i, d));
  const need = ws.reduce((s, w) => s + w.need, 0);
  if (need > L + 1e-6) return null;
  const want = ws.reduce((s, w) => s + w.want, 0);
  if (want >= L) {
    const slack = want - need;
    return ws.map((w) => (slack < 1e-9 ? w.need + (L - need) / ws.length : w.need + ((L - need) * (w.want - w.need)) / slack));
  }
  const out = ws.map((w) => w.want);
  let extra = L - want;
  for (let iter = 0; iter < 10 && extra > 1e-6; iter++) {
    const open = out.map((v, i) => (v < ws[i].cap - 1e-9 ? i : -1)).filter((i) => i >= 0);
    if (open.length === 0) break;
    const base = open.reduce((s, i) => s + ws[i].want, 0);
    let used = 0;
    for (const i of open) {
      const add = Math.min((extra * ws[i].want) / base, ws[i].cap - out[i]);
      out[i] += add;
      used += add;
    }
    extra -= used;
  }
  if (extra > 1e-6) {
    // Everything is at its comfortable maximum: share the remainder proportionally.
    const base = out.reduce((s, v) => s + v, 0);
    for (let i = 0; i < out.length; i++) out[i] += (extra * out[i]) / base;
  }
  return out;
}

// ---------- column builders ----------

type Side = "front" | "rear";

function buildColumn(
  item: Item,
  x: number,
  w: number,
  y0: number,
  d: number,
  band: Room["band"],
  hubSide: Side,
  mirrorBath: boolean,
): Omit<Room, "id">[] {
  const base = { band, open: OPEN_KINDS.includes(item.kind) };
  if (item.attachedBath) {
    const bathW = clamp(w * 0.32, 5, 6.5);
    const roomX = mirrorBath ? x + bathW : x;
    const bathX = mirrorBath ? x : x + w - bathW;
    const main: Omit<Room, "id"> = { ...base, kind: item.kind, name: item.name, rect: { x: roomX, y: y0, w: w - bathW, d } };
    const bd = clamp(45 / bathW, DIM.bathDepth.min, DIM.bathDepth.max);
    const parentKey = `@${item.name}`;
    if (d - bd < 3.5) {
      return [main, { ...base, kind: "bath", name: `Bath (${item.name})`, rect: { x: bathX, y: y0, w: bathW, d }, accessVia: parentKey }];
    }
    // Bath on the exterior side (opposite the hub) for a ventilator; dress on the hub side.
    const bathY = hubSide === "front" ? y0 + d - bd : y0;
    const dressY = hubSide === "front" ? y0 : y0 + bd;
    return [
      main,
      { ...base, kind: "bath", name: `Bath (${item.name})`, rect: { x: bathX, y: bathY, w: bathW, d: bd }, accessVia: parentKey },
      { ...base, kind: "dress", name: `Dress (${item.name})`, rect: { x: bathX, y: dressY, w: bathW, d: d - bd }, accessVia: parentKey },
    ];
  }
  if (item.utility) {
    const { laundry, store } = item.utility;
    if (laundry && store && d >= 9) {
      const ld = clamp(d * 0.55, 5, d - 4);
      const ly = hubSide === "front" ? y0 : y0 + d - ld;
      const sy = hubSide === "front" ? y0 + ld : y0;
      return [
        { ...base, kind: "laundry", name: "Laundry", rect: { x, y: ly, w, d: ld } },
        { ...base, kind: "store", name: "Store", rect: { x, y: sy, w, d: d - ld }, accessVia: "@Laundry" },
      ];
    }
    return [{ ...base, kind: laundry ? "laundry" : "store", name: laundry && store ? "Laundry & Store" : laundry ? "Laundry" : "Store", rect: { x, y: y0, w, d } }];
  }
  if (item.kind === "bath" && d > 15) {
    const bd = 9;
    const by = hubSide === "front" ? y0 : y0 + d - bd;
    const sy = hubSide === "front" ? y0 + bd : y0;
    return [
      { ...base, kind: "bath", name: item.name, rect: { x, y: by, w, d: bd } },
      { band, open: true, kind: "shaft", name: "Light / Duct Shaft", rect: { x, y: sy, w, d: d - bd } },
    ];
  }
  return [{ ...base, kind: item.kind, name: item.name, rect: { x, y: y0, w, d } }];
}

interface BandResult {
  rooms: Omit<Room, "id">[];
  placed: { item: Item; x: number; w: number }[];
  failure?: { need: number; available: number; names: string[] };
}

function fillBand(
  items: Item[],
  x0: number,
  x1: number,
  y0: number,
  d: number,
  band: Room["band"],
  hubSide: Side,
  fixed: Fixed[] = [],
): BandResult {
  // Free intervals between fixed obstacles.
  const sorted = [...fixed].sort((a, b) => a.x - b.x);
  const intervals: [number, number][] = [];
  let cur = x0;
  for (const f of sorted) {
    if (f.x - cur > 1e-6) intervals.push([cur, f.x]);
    cur = Math.max(cur, f.x + f.w);
  }
  if (x1 - cur > 1e-6) intervals.push([cur, x1]);

  const rooms: Omit<Room, "id">[] = sorted.flatMap((f) => f.rooms(y0, d));
  const placed: BandResult["placed"] = [];

  // Optional open spaces only take width the rooms do not comfortably need.
  const free = intervals.reduce((s, [a, b]) => s + (b - a), 0);
  const wantRooms = items.filter((i) => !i.optional).reduce((s, i) => s + widths(i, d).want, 0);
  const needOpt = items.filter((i) => i.optional).reduce((s, i) => s + widths(i, d).need, 0);
  let pool = wantRooms + needOpt > free + 1e-6 ? items.filter((i) => !i.optional) : [...items];
  const tryFit = (): BandResult["failure"] | undefined => {
    rooms.splice(0, rooms.length, ...sorted.flatMap((f) => f.rooms(y0, d)));
    placed.length = 0;
    const totalFree = intervals.reduce((s, [a, b]) => s + (b - a), 0);
    // Greedy assignment of items to intervals in order.
    const groups: Item[][] = intervals.map(() => []);
    let gi = 0;
    for (const it of pool) {
      while (gi < intervals.length) {
        const [a, b] = intervals[gi];
        if (needSum([...groups[gi], it], d) <= b - a + 1e-6) break;
        gi++;
      }
      if (gi >= intervals.length) {
        return { need: needSum(pool, d), available: totalFree, names: pool.map((p) => p.name) };
      }
      groups[gi].push(it);
    }
    let bathToggle = false;
    for (let g = 0; g < intervals.length; g++) {
      const [a, b] = intervals[g];
      let group = groups[g];
      if (group.length === 0) {
        // Nothing assigned: keep the space usable as storage rather than leaving a void.
        if (b - a >= 3) group = [{ kind: "store", name: "Store / Utility", elastic: true }];
        else continue;
      }
      const ws = distribute(group, d, b - a);
      if (!ws) return { need: needSum(pool, d), available: totalFree, names: pool.map((p) => p.name) };
      let x = a;
      group.forEach((it, i) => {
        const mirror = it.attachedBath ? bathToggle : false;
        if (it.attachedBath) bathToggle = !bathToggle;
        rooms.push(...buildColumn(it, x, ws[i], y0, d, band, hubSide, mirror));
        placed.push({ item: it, x, w: ws[i] });
        x += ws[i];
      });
    }
    return undefined;
  };

  let failure = tryFit();
  while (failure && pool.some((p) => p.optional)) {
    const idx = pool.map((p) => !!p.optional).lastIndexOf(true);
    pool = pool.filter((_, i) => i !== idx);
    failure = tryFit();
  }
  return { rooms, placed, failure };
}

// ---------- room programme ----------

interface Programme {
  floors: FloorPlanSpec[];
  needsStair: boolean;
  roof: boolean;
}

function buildProgramme(p: ProjectInput, bedroomsPerFloor: number[], opts: Variant & { cFits: (lvl: number, items: Item[]) => boolean }): Programme {
  const r = p.requirements;
  const n = r.floors;
  const needsStair = n > 1 || r.terrace || r.futureExpansion;
  const floors: FloorPlanSpec[] = [];

  // Bedroom naming and attached-bath allocation.
  let mastersLeft = Math.min(r.masterBedrooms, r.bedrooms);
  let attachedLeft = Math.min(r.attachedBathrooms, r.bedrooms);
  let bedNo = 1;
  let masterNo = 1;
  const totalMasters = mastersLeft;
  // Masters: one per floor first, from the ground up.
  const mastersOn = new Array(n).fill(0);
  for (let pass = 0; mastersLeft > 0 && pass < 6; pass++)
    for (let l = 0; l < n && mastersLeft > 0; l++)
      if (bedroomsPerFloor[l] > mastersOn[l]) {
        mastersOn[l]++;
        mastersLeft--;
      }
  const bedItems: Item[][] = bedroomsPerFloor.map((count, l) => {
    const list: Item[] = [];
    for (let i = 0; i < count; i++) {
      const isMaster = i < mastersOn[l];
      list.push({ kind: isMaster ? "master" : "bedroom", name: isMaster ? (totalMasters > 1 ? `Master Bedroom ${masterNo++}` : "Master Bedroom") : `Bedroom ${bedNo++}` });
    }
    return list;
  });
  // Attached baths: masters first, then other bedrooms floor by floor.
  for (const wantMaster of [true, false])
    for (const list of bedItems)
      for (const it of list)
        if (attachedLeft > 0 && (it.kind === "master") === wantMaster && !it.attachedBath) {
          it.attachedBath = true;
          attachedLeft--;
        }

  // Common baths: one on ground, the rest spread over upper floors.
  const commonOn = new Array(n).fill(0);
  let commonLeft = r.commonBathrooms;
  if (commonLeft > 0) {
    commonOn[0] = 1;
    commonLeft--;
  }
  for (let l = 1; commonLeft > 0 && n > 1; l = l + 1 > n - 1 ? 1 : l + 1) {
    commonOn[l]++;
    commonLeft--;
  }
  if (n === 1) commonOn[0] += commonLeft;

  for (let l = 0; l < n; l++) {
    const A: Item[] = [];
    const M: Item[] = [];
    const B: Item[] = [];
    const C: Item[] = [];
    const extrasC: Item[] = [];
    for (let k = 0; k < commonOn[l]; k++) extrasC.push({ kind: "bath", name: commonOn[l] > 1 ? `Common Bath ${k + 1}` : "Common Bath" });

    if (l === 0) {
      if (r.parkingCars > 0) A.push({ kind: "porch", name: r.parkingCars > 1 ? `Car Porch (${r.parkingCars} cars)` : "Car Porch", fixedW: DIM.porchWidthFor(r.parkingCars) });
      if (!opts.noFoyer) A.push({ kind: "foyer", name: "Entrance Foyer" });
      if (r.drawingRoom) A.push({ kind: "drawing", name: "Drawing Room" });
      if (r.guestRoom && opts.guestInA) A.push({ kind: "guest", name: "Guest Room" });
      A.push({ kind: "lawn", name: "Front Lawn", elastic: true, optional: true });

      const diningInLiving = r.dining && (r.livingPlan === "open" || opts.mergeDining);
      B.push({ kind: "living", name: r.livingPlan === "open" ? "Living / Dining (open plan)" : diningInLiving ? "Living / Dining" : "Living / TV Lounge", elastic: true });
      if (r.dining && !diningInLiving) B.push({ kind: "dining", name: "Dining" });
      const kitchen: Item = { kind: "kitchen", name: r.kitchenType === "open" ? "Kitchen (open)" : "Kitchen" };
      if (r.kitchen && !opts.kitchenInC) B.push(kitchen);
      if (r.lift) B.push({ kind: "lift", name: "Lift & Lobby", fixedW: DIM.liftW });
      if (needsStair) B.push({ kind: "stair", name: opts.compactUtility && r.storage ? "Staircase (store below)" : "Staircase", fixedW: DIM.stairW });

      if (r.guestRoom && !opts.guestInA) extrasC.push({ kind: "guest", name: "Guest Room" });
      if (!opts.studyUp || n === 1) {
        if (r.study) extrasC.push({ kind: "study", name: "Study" });
        if (r.homeOffice) extrasC.push({ kind: "office", name: "Home Office" });
      }
      if (r.prayerRoom) extrasC.push({ kind: "prayer", name: "Prayer Room" });
      if (r.kitchen && opts.kitchenInC) extrasC.push(kitchen);
      if ((r.laundry || r.storage) && !opts.compactUtility) extrasC.push({ kind: "laundry", name: "Utility", utility: { laundry: r.laundry, store: r.storage } });
    } else {
      B.push({ kind: "lounge", name: "Family Lounge", elastic: true });
      if (opts.studyUp && l === n - 1) {
        if (r.study) extrasC.push({ kind: "study", name: "Study" });
        if (r.homeOffice) extrasC.push({ kind: "office", name: "Home Office" });
      }
    }

    // Bedrooms: rear zone first, then middle zone, then (upper floors only) front zone.
    const beds = bedItems[l];
    let cBeds = beds.length;
    while (cBeds > 0 && !opts.cFits(l, [...beds.slice(0, cBeds), ...extrasC])) cBeds--;
    C.push(...beds.slice(0, cBeds), ...extrasC);
    const overflow = beds.slice(cBeds);
    if (overflow.length) {
      if (opts.useM) M.push(...overflow);
      else if (l > 0) A.push(...overflow);
      else C.push(...overflow); // will fail the fit and be reported
    }
    if (l === 0 && r.courtyard) C.push({ kind: "courtyard", name: "Courtyard", elastic: true, optional: true });

    floors.push({ level: l, A, M, B, C, balcony: l > 0 && r.balcony });
  }
  return { floors, needsStair, roof: r.terrace && needsStair };
}

// ---------- band depths ----------

function bandMin(items: Item[], key: BandKey): number {
  let m = 0;
  for (const it of items) {
    if (it.kind === "porch") m = Math.max(m, DIM.porchDepth);
    else if (it.kind === "stair") m = Math.max(m, DIM.stairD);
    else if (it.kind === "lift") m = Math.max(m, 6);
    else if (!it.optional) m = Math.max(m, SPECS[it.kind].minSide);
  }
  if (key === "C" && items.some((i) => i.attachedBath)) m = Math.max(m, DIM.bathDepth.min);
  return m;
}

// ---------- main entry ----------

export function generatePlan(p: ProjectInput): GenerateResult {
  const analysis = analyzePlot(p.plot, p.units);
  const issues: Issue[] = [...analysis.issues];
  const fail = (msg: string, code = "INFEASIBLE"): GenerateResult => {
    issues.push({ severity: "error", code, message: msg });
    return { layout: null, issues, analysis };
  };

  if (analysis.status === "invalid") return fail("Plot measurements contain errors. Fix them before generating a plan.", "PLOT_INVALID");
  if (!analysis.layoutSupported || analysis.widthFt === undefined || analysis.depthFt === undefined)
    return fail(
      "Automatic layout generation currently supports rectangular and square plots with confirmed width and depth. For other shapes, the area can still be calculated from boundary coordinates.",
      "SHAPE_UNSUPPORTED",
    );
  if (p.type !== "residential")
    issues.push({ severity: "warning", code: "TYPE_RESIDENTIAL_ONLY", message: "The layout engine uses residential room programmes. Commercial and mixed-use requirements are not modelled and need an architect's input." });

  const r = p.requirements;
  const plotW = analysis.widthFt;
  const plotD = analysis.depthFt;
  const sb = p.constraints.setbacks;
  const sbFt = (v: number) => (sb.source === "none" ? 0 : toFeet(v, p.units.length));
  const setL = sbFt(sb.left);
  const setR = sbFt(sb.right);
  const setF = sbFt(sb.front);
  const setRear = sbFt(sb.rear);
  const W = plotW - setL - setR;
  const D = plotD - setF - setRear;
  const len = (ft: number) => fmtLength(ft, p.units.length);
  if (W <= 0 || D <= 0) return fail("The setbacks leave no buildable area. Check the setback values.", "SETBACKS_EXCEED_PLOT");
  if (W < 16) return fail(`The buildable width is ${len(W)}. At least about 16 ft is needed for a staircase plus a usable room side by side.`, "TOO_NARROW");

  if (!r.kitchen) issues.push({ severity: "warning", code: "NO_KITCHEN", message: "No kitchen was requested. Most residential layouts need one; please confirm." });
  if (r.attachedBathrooms > r.bedrooms) issues.push({ severity: "warning", code: "ATTACHED_GT_BEDROOMS", message: `You requested ${r.attachedBathrooms} attached bathrooms but only ${r.bedrooms} bedrooms. Only ${r.bedrooms} can be attached.` });
  if (r.masterBedrooms > r.bedrooms) issues.push({ severity: "warning", code: "MASTER_GT_BEDROOMS", message: "There are more master bedrooms than bedrooms. Master bedrooms are counted within the bedroom total." });

  const corridor = r.accessibility ? DIM.corridorAccessible : DIM.corridor;
  const bx = setL;
  const by = setF;

  // Candidate bedroom distributions, best-balanced first.
  const n = r.floors;
  const B = r.bedrooms;
  const dists: number[][] = [];
  const rec = (prefix: number[], left: number) => {
    if (prefix.length === n - 1) return dists.push([...prefix, left]);
    for (let k = 0; k <= left; k++) rec([...prefix, k], left - k);
  };
  rec([], B);
  const ideal = (l: number) => (l === 0 ? Math.floor(B / n) : (B - Math.floor(B / n)) / Math.max(1, n - 1));
  const score = (v: number[]) => v.reduce((s, b, l) => s + (b - ideal(l)) ** 2, 0);
  const valid = dists
    .filter((v) => !(r.accessibility && B > 0 && v[0] < 1))
    .sort((a, b) => score(a) - score(b))
    .slice(0, 40);
  // Planning fallbacks, cheapest compromise first.
  const variantMap = new Map<string, Variant>();
  for (let m = 0; m < 256; m++) {
    const v: Variant = {
      mergeDining: !!(m & 1) && r.dining && r.livingPlan !== "open",
      guestInA: !(m & 2) || !r.guestRoom,
      kitchenInC: !!(m & 4) && r.kitchen,
      studyUp: !!(m & 8) && (r.study || r.homeOffice) && r.floors > 1,
      useM: !!(m & 16),
      noFoyer: !!(m & 32) && r.parkingCars > 0,
      compactUtility: !!(m & 64) && (r.laundry || r.storage) && (r.floors > 1 || r.terrace || r.futureExpansion || !r.storage),
      noCorridor: !!(m & 128),
    };
    if (v.noFoyer && v.useM) continue;
    variantMap.set(JSON.stringify(v), v);
  }
  const variants = [...variantMap.values()];
  const cost = (v: Variant) =>
    +v.mergeDining * 1 + +!v.guestInA * 0.6 + +v.kitchenInC * 1.5 + +v.studyUp * 1.2 + +v.useM * 2.5 + +v.noFoyer * 0.8 + +v.compactUtility * 1 + +v.noCorridor * 2;
  variants.sort((a, b) => cost(a) - cost(b));

  // Collect several feasible candidates and keep the one with the fewest problems.
  type Candidate = { layout: Layout; extra: Issue[]; validation: Issue[]; score: number };
  let best: Candidate | null = null;
  let found = 0;
  let firstFailure: FitFailure | string | null = null;
  const quality = (iss: Issue[]) =>
    iss.reduce((s, i) => s + (i.severity === "error" ? 1000 : i.code === "NO_WINDOW" ? 6 : i.code === "NO_ACCESS" ? 50 : i.severity === "warning" ? 2 : 0), 0);

  outer: for (const v of variants) {
    for (const dist of valid) {
      const res = attempt(dist, v);
      if (typeof res === "object" && "layout" in res) {
        const validation = validateLayout(res.layout, p);
        const sc = quality(validation) + cost(v) * 1.5 + score(dist) * 2;
        if (!best || sc < best.score) best = { ...res, validation, score: sc };
        if (++found >= 24) break outer;
      } else if (!firstFailure) firstFailure = res;
    }
  }

  function attempt(dist: number[], v: Variant): { layout: Layout; extra: Issue[] } | FitFailure | string {
    // First pass to compute band depths using a permissive cFits, then a second pass with real fits.
    const dims = (prog: Programme) => {
      const all = (k: BandKey) => prog.floors.flatMap((f) => f[k]);
      const has = { A: true, M: all("M").length > 0, B: true, C: all("C").length > 0 };
      const minD = {
        A: bandMin(prog.floors[0].A, "A"),
        M: has.M ? Math.max(11, bandMin(all("M"), "M")) : 0,
        B: Math.max(bandMin(all("B"), "B"), 11),
        C: has.C ? bandMin(all("C"), "C") : 0,
      };
      // Upper-floor rooms placed in the front zone need the zone deep enough (plus balcony if requested).
      const upperA = prog.floors.slice(1).flatMap((f) => f.A);
      if (upperA.length) minD.A = Math.max(minD.A, bandMin(upperA, "A"));
      const hasPorch = prog.floors[0].A.some((i) => i.kind === "porch");
      const pref = {
        A: Math.max(minD.A, hasPorch ? 19 : 12),
        M: has.M ? Math.max(minD.M, 13) : 0,
        B: Math.max(minD.B, 14),
        C: has.C ? Math.max(minD.C, all("C").some((i) => i.kind === "master" || i.kind === "bedroom") ? 13 : 10) : 0,
      };
      const xC = has.C && !v.noCorridor ? corridor : 0;
      const xD = xC + (has.M ? corridor : 0);
      const sumMin = minD.A + minD.M + minD.B + minD.C + xD;
      if (sumMin > D + 1e-6) return { error: sumMin };
      const sumPref = pref.A + pref.M + pref.B + pref.C + xD;
      const keys: BandKey[] = ["A", "M", "B", "C"];
      const depth = { A: 0, M: 0, B: 0, C: 0 };
      let rear = 0;
      if (sumPref >= D) {
        const slack = sumPref - sumMin;
        for (const k of keys) depth[k] = minD[k] + (slack < 1e-9 ? 0 : ((D - sumMin) * (pref[k] - minD[k])) / slack);
      } else {
        for (const k of keys) depth[k] = pref[k];
        let extra = D - sumPref;
        // Design choice (not a bylaw): keep a rear open space first, for light and ventilation.
        if (extra >= 5) {
          rear = Math.min(extra, Math.max(5, 0.2 * D));
          extra -= rear;
        }
        const grow: BandKey[] = (["M", "B", "C"] as BandKey[]).filter((k) => depth[k] > 0);
        for (const k of grow) {
          const add = Math.min(3, extra / grow.length);
          depth[k] += add;
        }
        extra = D - (depth.A + depth.M + depth.B + depth.C + xD) - rear;
        if (rear > 0 || extra >= 5) rear += extra;
        else if (has.C) depth.C += extra;
        else depth.B += extra;
      }
      return { depth, xD: xC, xM: has.M ? corridor : 0, rear, has };
    };

    const permissive = buildProgramme(p, dist, { ...v, cFits: () => true });
    const d0 = dims(permissive);
    if ("error" in d0) return `The plot's buildable depth (${len(D)}) is less than the ~${len(d0.error ?? 0)} needed for the front, family and bedroom zones.`;
    const prog = buildProgramme(p, dist, {
      ...v,
      cFits: (_l, items) => needSum(items.filter((i) => !i.optional), d0.depth.C || 12) <= W + 1e-6,
    });
    const dd = dims(prog);
    if ("error" in dd) return `The plot's buildable depth (${len(D)}) is less than the ~${len(dd.error ?? 0)} needed for the front, family and bedroom zones.`;
    const { depth, xD, xM, rear, has } = dd;

    const yA = by;
    const yM = yA + depth.A;
    const yM2 = yM + depth.M; // passage linking the middle zone to the living / lounge
    const yB = yM2 + xM;
    const yX = yB + depth.B;
    const yC = yX + xD;
    const yR = yC + depth.C;
    const footprintD = depth.A + depth.M + xM + depth.B + xD + depth.C;

    const floors: Floor[] = [];
    let stairFixed: Fixed[] = [];
    let openAbove: Fixed[] = []; // ground-floor lawn / courtyard positions kept open above
    let lawnX: { x: number; w: number } | null = null;
    let courtyardX: { x: number; w: number } | null = null;
    let foyerX: { x: number; w: number } | null = null;
    const extra: Issue[] = [];

    for (const f of prog.floors) {
      const rooms: Omit<Room, "id">[] = [];
      const ground = f.level === 0;

      // Band A
      if (ground) {
        const ra = fillBand(f.A, bx, bx + W, yA, depth.A, "A", "rear");
        if (ra.failure) return { level: 0, band: "A", ...ra.failure };
        rooms.push(...ra.rooms);
        const lawn = ra.placed.find((pl) => pl.item.kind === "lawn");
        if (lawn) lawnX = { x: lawn.x, w: lawn.w };
        const foy = ra.placed.find((pl) => pl.item.kind === "foyer");
        if (foy) foyerX = { x: foy.x, w: foy.w };
      } else {
        const lawnFix: Fixed[] = lawnX
          ? [{ ...lawnX, rooms: (y0, d) => [{ kind: "open", name: "Open (over lawn)", band: "A", open: true, rect: { x: lawnX!.x, y: y0, w: lawnX!.w, d } }] }]
          : [];
        const x1 = lawnX ? lawnX.x : bx + W;
        if (f.A.length === 0 || has.M) {
          rooms.push({ kind: "terrace", name: "Front Terrace", band: "A", open: true, rect: { x: bx, y: yA, w: x1 - bx, d: depth.A } });
          rooms.push(...lawnFix.flatMap((fx) => fx.rooms(yA, depth.A)));
          if (f.A.length && has.M) return { level: f.level, band: "A", need: needSum(f.A, depth.A), available: 0, names: f.A.map((i) => i.name) };
        } else {
          let y0 = yA;
          let dA = depth.A;
          const roomMin = bandMin(f.A, "A");
          if (f.balcony && dA - DIM.balconyDepth >= roomMin) {
            rooms.push({ kind: "balcony", name: "Balcony", band: "A", open: true, rect: { x: bx, y: yA, w: x1 - bx, d: DIM.balconyDepth } });
            y0 += DIM.balconyDepth;
            dA -= DIM.balconyDepth;
          } else if (f.balcony) {
            extra.push({ severity: "info", code: "BALCONY_SKIPPED", floor: f.level, message: `${FLOOR_NAMES[f.level]}: the front zone is too shallow for a balcony in front of the rooms, so none was drawn.` });
          }
          const ra = fillBand([...f.A, { kind: "terrace", name: "Front Terrace", elastic: true, optional: true }], bx, bx + W, y0, dA, "A", "rear", lawnFix);
          if (ra.failure) return { level: f.level, band: "A", ...ra.failure };
          rooms.push(...ra.rooms.filter((rm) => !(rm.kind === "open" && y0 !== yA)));
          if (lawnX && y0 !== yA) rooms.push(...lawnFix.flatMap((fx) => fx.rooms(yA, depth.A)));
          if (prog.floors[0].A.some((i) => i.kind === "porch"))
            extra.push({ severity: "info", code: "ROOM_OVER_PORCH", floor: f.level, message: `${FLOOR_NAMES[f.level]}: rooms are planned over the car porch. The porch needs columns/beams designed by a structural engineer to carry them.` });
        }
      }

      // Band M
      if (has.M) {
        if (f.M.length === 0) {
          // Keep the zone usable: on ground it becomes part of living; above it is a terrace.
          if (ground) rooms.push({ kind: "living", name: "Sitting Area", band: "M", open: false, rect: { x: bx, y: yM, w: W, d: depth.M + xM } });
          else rooms.push({ kind: "terrace", name: "Terrace", band: "M", open: true, rect: { x: bx, y: yM, w: W, d: depth.M + xM } });
        } else {
          const passage: Fixed[] =
            ground && foyerX
              ? [{ ...foyerX, rooms: (y0, d) => [{ kind: "corridor", name: "Entrance Passage", band: "M", open: false, rect: { x: foyerX!.x, y: y0, w: foyerX!.w, d } }] }]
              : [];
          const rm = fillBand(f.M, bx, bx + W, yM, depth.M, "M", "rear", passage);
          if (rm.failure) return { level: f.level, band: "M", ...rm.failure };
          rooms.push(...rm.rooms);
          rooms.push({ kind: "corridor", name: "Passage", band: "X", open: false, rect: { x: bx, y: yM2, w: W, d: xM } });
        }
      }

      // Band B
      if (ground) {
        const rb = fillBand(f.B, bx, bx + W, yB, depth.B, "B", "rear");
        if (rb.failure) return { level: 0, band: "B", ...rb.failure };
        rooms.push(...rb.rooms);
        stairFixed = rb.placed
          .filter((pl) => pl.item.kind === "stair" || pl.item.kind === "lift")
          .map((pl) => ({
            x: pl.x,
            w: pl.w,
            rooms: (y0: number, d: number) => [{ kind: pl.item.kind, name: pl.item.name, band: "B" as const, open: false, rect: { x: pl.x, y: y0, w: pl.w, d } }],
          }));
      } else {
        const rb = fillBand(f.B, bx, bx + W, yB, depth.B, "B", "rear", stairFixed);
        if (rb.failure) return { level: f.level, band: "B", ...rb.failure };
        rooms.push(...rb.rooms);
      }

      // Corridor
      if (xD > 0) rooms.push({ kind: "corridor", name: "Corridor", band: "X", open: false, rect: { x: bx, y: yX, w: W, d: xD } });

      // Band C
      if (has.C) {
        if (ground) {
          const rc = fillBand(f.C, bx, bx + W, yC, depth.C, "C", "front");
          if (rc.failure) return { level: 0, band: "C", ...rc.failure };
          rooms.push(...rc.rooms);
          const cy = rc.placed.find((pl) => pl.item.kind === "courtyard");
          if (cy) courtyardX = { x: cy.x, w: cy.w };
          openAbove = courtyardX
            ? [{ ...courtyardX, rooms: (y0, d) => [{ kind: "open", name: "Open to Sky (courtyard)", band: "C", open: true, rect: { x: courtyardX!.x, y: y0, w: courtyardX!.w, d } }] }]
            : [];
        } else if (f.C.length === 0) {
          rooms.push({ kind: "terrace", name: "Rear Terrace", band: "C", open: true, rect: { x: bx, y: yC, w: W, d: depth.C } });
        } else {
          const rc = fillBand([...f.C, { kind: "terrace", name: "Rear Terrace", elastic: true, optional: true }], bx, bx + W, yC, depth.C, "C", "front", openAbove);
          if (rc.failure) return { level: f.level, band: "C", ...rc.failure };
          rooms.push(...rc.rooms);
        }
      }

      if (ground && rear > 0)
        rooms.push({ kind: "lawn", name: r.courtyard ? "Rear Open Space" : "Rear Lawn / Open Space", band: "R", open: true, rect: { x: bx, y: yR, w: W, d: rear } });

      floors.push(finalizeFloor(f.level, FLOOR_NAMES[f.level], rooms, false));
    }

    if (prog.roof) {
      const rooms: Omit<Room, "id">[] = [];
      for (const s of stairFixed) rooms.push(...s.rooms(yB, depth.B).map((rm) => ({ ...rm, name: rm.kind === "stair" ? "Stair Tower (Mumty)" : "Lift Machine Room", band: "T" as const })));
      const fy = by;
      const pieces: Rect[] = [];
      if (yB - fy > 0.01) pieces.push({ x: bx, y: fy, w: W, d: yB - fy });
      let cx = bx;
      for (const s of [...stairFixed].sort((a, b) => a.x - b.x)) {
        if (s.x - cx > 0.01) pieces.push({ x: cx, y: yB, w: s.x - cx, d: depth.B });
        cx = s.x + s.w;
      }
      if (bx + W - cx > 0.01) pieces.push({ x: cx, y: yB, w: bx + W - cx, d: depth.B });
      if (fy + footprintD - yX > 0.01) pieces.push({ x: bx, y: yX, w: W, d: fy + footprintD - yX });
      pieces.forEach((rc, i) => rooms.push({ kind: "terrace", name: i === 0 ? "Roof Terrace" : "Roof Terrace", band: "T", open: true, rect: rc }));
      floors.push(finalizeFloor(n, "Roof Plan", rooms, true));
    }

    let layout: Layout = {
      engine: ENGINE_VERSION,
      plot: { w: plotW, d: plotD },
      buildable: { x: bx, y: by, w: W, d: D },
      footprint: { x: bx, y: by, w: W, d: footprintD },
      floors,
      assumptions: [],
      feasible: true,
    };
    if (p.plot.entranceSide === "right") layout = mirrorLayout(layout);
    layout.floors = layout.floors.map((fl) => addOpenings(fl, layout, p));
    layout.assumptions = assumptions(p, layout, { corridor, rear, dist });
    const note = (code: string, message: string) => extra.push({ severity: "info", code, message });
    if (v.mergeDining) note("DINING_IN_LIVING", "Dining is combined with the living area to save width.");
    if (v.kitchenInC) note("KITCHEN_REAR", "The kitchen is in the rear zone, where it can get an external wall for light and an exhaust.");
    if (v.noFoyer) note("ENTRY_VIA_PORCH", "You enter through the car porch straight into the living area, with no separate foyer. This is common on small plots.");
    if (v.noCorridor) note("NO_CORRIDOR", "Rear rooms open directly off the living or lounge area instead of a separate corridor. This saves depth but reduces privacy.");
    if (v.compactUtility && r.storage) note("STORE_UNDER_STAIR", "Storage is planned under the staircase instead of a separate store room.");
    if (v.compactUtility && r.laundry) note("LAUNDRY_OUTDOOR", "Laundry is suggested as a covered outdoor area (rear open space or roof) rather than a separate room.");
    if (!v.guestInA && r.guestRoom) note("GUEST_REAR", "The guest room is in the rear zone because the front zone is full.");
    if (v.studyUp) note("STUDY_UPPER", "The study / home office is on the top floor because the ground floor is full.");
    return { layout, extra };
  }

  if (!best) {
    if (typeof firstFailure === "string") return fail(firstFailure);
    const f = firstFailure as FitFailure | null;
    const suggestions = [
      r.floors < 4 ? "add a floor" : null,
      r.bedrooms > 1 ? "reduce the number of bedrooms" : null,
      r.attachedBathrooms > 0 ? "reduce attached bathrooms" : null,
      r.drawingRoom || r.guestRoom || r.study || r.homeOffice || r.prayerRoom ? "remove an optional room (drawing, guest, study, office or prayer room)" : null,
      r.parkingCars > 1 ? "reduce parking to one car" : null,
      sb.source !== "none" ? "re-check the setbacks" : null,
    ].filter(Boolean);
    if (f)
      return fail(
        `The requested rooms do not fit. ${FLOOR_NAMES[f.level]}, ${BAND_NAMES[f.band]}: needs at least ${len(f.need)} of width for ${f.names.join(", ")}, but only ${len(f.available)} is available. Try to ${suggestions.join(", or ")}.`,
      );
    return fail("No feasible arrangement was found for these requirements.");
  }

  return { layout: best.layout, issues: [...issues, ...best.extra, ...best.validation], analysis };
}

function finalizeFloor(level: number, name: string, rooms: Omit<Room, "id">[], roof: boolean): Floor {
  const withIds: Room[] = rooms
    .filter((r) => r.rect.w > 0.05 && r.rect.d > 0.05)
    .map((r, i) => ({
      ...r,
      id: `f${level}-r${i + 1}`,
      rect: { x: round(r.rect.x, 4), y: round(r.rect.y, 4), w: round(r.rect.w, 4), d: round(r.rect.d, 4) },
    }));
  // Resolve "@Name" access references to room ids.
  for (const r of withIds) {
    if (r.accessVia?.startsWith("@")) {
      const target = withIds.find((o) => o.name === r.accessVia!.slice(1));
      r.accessVia = target?.id;
    }
  }
  return { level, name, roof, rooms: withIds, openings: [] };
}

function mirrorLayout(l: Layout): Layout {
  // Mirror within the buildable zone so that left/right setbacks are preserved.
  const b = l.buildable;
  const mx = (rc: Rect): Rect => ({ ...rc, x: round(2 * b.x + b.w - rc.x - rc.w, 4) });
  return {
    ...l,
    floors: l.floors.map((f) => ({ ...f, rooms: f.rooms.map((r) => ({ ...r, rect: mx(r.rect) })) })),
  };
}

function assumptions(p: ProjectInput, l: Layout, ctx: { corridor: number; rear: number; dist: number[] }): string[] {
  const len = (ft: number) => fmtLength(ft, p.units.length);
  const sb = p.constraints.setbacks;
  const out = [
    "All dimensions are approximate clear sizes measured to wall centrelines. Wall thickness (typically 9 in external, 4.5 in internal) has not been deducted.",
    "Plot corners are assumed to be right angles. The plot is drawn as viewed from the road, with the road-facing boundary at the bottom.",
    `Room sizes come from typical preliminary-planning ranges (for example, a bedroom of about ${len(12)} × ${len(12.5)}). They are not legal minimum sizes.`,
    `Staircase planned as a dog-leg stair about ${len(DIM.stairW)} wide × ${len(DIM.stairD)} long for a floor-to-floor height of about ${len(p.constraints.floorHeight)}. Its final geometry depends on riser and tread design.`,
    `Corridor width assumed ${len(ctx.corridor)}.`,
    p.requirements.parkingCars > 0
      ? `Car porch sized for ${p.requirements.parkingCars} car(s), about ${len(DIM.porchWidthFor(p.requirements.parkingCars))} wide × ${len(DIM.porchDepth)} deep.`
      : "No parking requested.",
    sb.source === "none"
      ? "No setbacks were provided, so the building zone is drawn up to the plot boundary. Local bylaws almost always require setbacks. This must be verified."
      : sb.source === "placeholder"
        ? `Planning placeholder setbacks accepted by the user (front ${len(toFeet(sb.front, p.units.length))}, rear ${len(toFeet(sb.rear, p.units.length))}, left ${len(toFeet(sb.left, p.units.length))}, right ${len(toFeet(sb.right, p.units.length))}) are used. They are not verified bylaw values.`
        : "Setbacks are taken from the values the user entered from their bylaws or documents.",
    "Walls with no side setback are treated as party walls, so no windows are placed on them.",
    `Bedrooms per floor: ${ctx.dist.map((b, i) => `${FLOOR_NAMES[i]} ${b}`).join(", ")}.`,
    "Upper floors follow the ground-floor zoning grid so that walls, the staircase and wet areas can stack. Structural grid and column positions still need a structural engineer.",
  ];
  if (ctx.rear > 0) out.push(`The remaining plot depth (${len(ctx.rear)}) is kept as rear open space.`);
  if (p.requirements.basement) out.push("A basement was requested but is not planned by this tool. It needs geotechnical and structural design.");
  if (p.requirements.futureExpansion) out.push("A staircase to the roof is included as provision for future vertical expansion. Foundations and columns must be designed for the future loads.");
  if (l.floors.some((f) => f.roof)) out.push("The roof plan shows the stair tower (mumty) and open terrace only. Parapet heights, water tanks and solar panels are not planned.");
  return out;
}
