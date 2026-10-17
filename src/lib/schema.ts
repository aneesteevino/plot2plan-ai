import { z } from "zod";

/**
 * Shared, validated data model for Plot2Plan AI.
 * User-entered measurements are stored exactly as entered (value + unit);
 * the planning engine converts to feet internally.
 */

export const LENGTH_UNITS = ["ft", "m", "yd"] as const;
export const AREA_UNITS = ["sqft", "sqm", "sqyd", "marla", "kanal"] as const;
export const PROJECT_TYPES = ["residential", "commercial", "mixed-use", "other"] as const;
export const PLOT_SHAPES = ["rectangular", "square", "l-shaped", "polygonal", "irregular"] as const;
export const DIRECTIONS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"] as const;

const num = (min: number, max: number) => z.number().finite().min(min).max(max);
const optNum = (min: number, max: number) => num(min, max).optional();
const text = (max: number) => z.string().trim().max(max);

export const UnitsSchema = z.object({
  length: z.enum(LENGTH_UNITS),
  area: z.enum(AREA_UNITS),
  /** Square feet per marla. Varies by locality (commonly 225, 250 or 272.25). */
  marlaSqft: num(100, 400),
});

export const PointSchema = z.object({ x: num(-100000, 100000), y: num(-100000, 100000) });

export const PlotSchema = z.object({
  shape: z.enum(PLOT_SHAPES),
  /** All lengths are in `units.length`. Front = road-facing boundary. */
  frontWidth: optNum(0, 100000),
  rearWidth: optNum(0, 100000),
  leftDepth: optNum(0, 100000),
  rightDepth: optNum(0, 100000),
  /** Area stated on documents, in `units.area`. Never overrides geometry silently. */
  statedArea: optNum(0, 1e9),
  /** Boundary vertices (in `units.length`) for polygonal/irregular plots. */
  coordinates: z.array(PointSchema).max(64).optional(),
  roadWidth: optNum(0, 1000),
  /** Compass direction the road-facing (front) boundary faces, if known. */
  facing: z.enum(DIRECTIONS).optional(),
  cornerPlot: z.boolean(),
  secondRoadSide: z.enum(["left", "right"]).optional(),
  entranceSide: z.enum(["left", "right"]),
  obstructions: text(1000).optional(),
});

export const SetbacksSchema = z.object({
  /** user = from bylaws/documents; placeholder = user-accepted planning placeholder; none = not provided. */
  source: z.enum(["user", "placeholder", "none"]),
  front: num(0, 1000),
  rear: num(0, 1000),
  left: num(0, 1000),
  right: num(0, 1000),
});

export const ConstraintsSchema = z.object({
  setbacks: SetbacksSchema,
  maxCoveragePct: optNum(1, 100),
  /** In `units.length`. */
  maxHeight: optNum(1, 10000),
  floorHeight: num(7, 20).default(10.5),
  bylawsNotes: text(4000).optional(),
  materials: text(500).optional(),
});

export const RequirementsSchema = z.object({
  floors: z.number().int().min(1).max(4),
  basement: z.boolean(),
  futureExpansion: z.boolean(),
  bedrooms: z.number().int().min(0).max(12),
  masterBedrooms: z.number().int().min(0).max(6),
  attachedBathrooms: z.number().int().min(0).max(12),
  commonBathrooms: z.number().int().min(0).max(6),
  kitchen: z.boolean(),
  dining: z.boolean(),
  living: z.boolean(),
  drawingRoom: z.boolean(),
  guestRoom: z.boolean(),
  study: z.boolean(),
  homeOffice: z.boolean(),
  prayerRoom: z.boolean(),
  laundry: z.boolean(),
  storage: z.boolean(),
  parkingCars: z.number().int().min(0).max(3),
  balcony: z.boolean(),
  terrace: z.boolean(),
  courtyard: z.boolean(),
  lift: z.boolean(),
  accessibility: z.boolean(),
  occupants: z.number().int().min(1).max(40).optional(),
  privacy: z.enum(["low", "medium", "high"]),
  kitchenType: z.enum(["closed", "open"]),
  livingPlan: z.enum(["open", "separated"]),
  lightingPriority: z.enum(["normal", "high"]),
  ventilationPriority: z.enum(["normal", "high"]),
  indoorOutdoor: z.boolean(),
  orientationNotes: text(1000).optional(),
  sustainabilityNotes: text(1000).optional(),
  notes: text(4000).optional(),
});

export const ProjectInputSchema = z.object({
  name: text(120).min(1, "Project name is required"),
  type: z.enum(PROJECT_TYPES),
  country: text(80),
  city: text(80).optional(),
  location: text(300).optional(),
  style: text(80).optional(),
  budget: z.object({ amount: num(0, 1e13), currency: text(8) }).optional(),
  units: UnitsSchema,
  plot: PlotSchema,
  constraints: ConstraintsSchema,
  requirements: RequirementsSchema,
  image: z
    .object({
      name: text(200),
      type: z.enum(["image/png", "image/jpeg", "image/webp"]),
      size: num(0, 20 * 1024 * 1024),
      kind: z.enum(["photo", "plot-map", "survey", "sketch", "site-plan"]),
      /** Images stay in the user's browser (IndexedDB) and are never stored on the server. */
      storedIn: z.literal("browser"),
    })
    .optional(),
  confirmedMeasurements: z.boolean(),
});

// ---------- Layout (output of the planning engine) ----------

export const ROOM_KINDS = [
  "porch", "foyer", "drawing", "living", "lounge", "dining", "kitchen", "bedroom", "master",
  "guest", "bath", "dress", "study", "office", "prayer", "laundry", "store", "stair", "lift",
  "corridor", "lawn", "courtyard", "shaft", "balcony", "terrace", "open",
] as const;
export type RoomKind = (typeof ROOM_KINDS)[number];

export const RectSchema = z.object({ x: num(-1e5, 1e5), y: num(-1e5, 1e5), w: num(0, 1e5), d: num(0, 1e5) });

export const OpeningSchema = z.object({
  id: text(40),
  type: z.enum(["door", "window", "opening", "main-door", "gate"]),
  /** Segment on the room boundary, in feet. */
  x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number(),
  width: z.number(),
  rooms: z.array(text(40)).max(2),
});

export const RoomSchema = z.object({
  id: text(40),
  kind: z.enum(ROOM_KINDS),
  name: text(60),
  rect: RectSchema,
  band: z.enum(["A", "M", "B", "C", "X", "R", "T"]),
  /** Open-to-sky or open-sided spaces are excluded from covered area. */
  open: z.boolean(),
  accessVia: text(40).optional(),
});

export const FloorSchema = z.object({
  level: z.number().int().min(0).max(5),
  name: text(40),
  roof: z.boolean(),
  rooms: z.array(RoomSchema).max(80),
  openings: z.array(OpeningSchema).max(400),
});

export const IssueSchema = z.object({
  severity: z.enum(["error", "warning", "info"]),
  code: text(60),
  message: text(600),
  floor: z.number().int().optional(),
  roomId: text(40).optional(),
});

export const LayoutSchema = z.object({
  engine: text(40),
  /** All layout geometry is in feet; origin = front-left plot corner; y grows away from the road. */
  plot: z.object({ w: z.number(), d: z.number() }),
  buildable: RectSchema,
  footprint: RectSchema,
  floors: z.array(FloorSchema).min(1).max(6),
  assumptions: z.array(text(400)).max(60),
  feasible: z.boolean(),
});

export type Units = z.infer<typeof UnitsSchema>;
export type Plot = z.infer<typeof PlotSchema>;
export type Setbacks = z.infer<typeof SetbacksSchema>;
export type Constraints = z.infer<typeof ConstraintsSchema>;
export type Requirements = z.infer<typeof RequirementsSchema>;
export type ProjectInput = z.infer<typeof ProjectInputSchema>;
export type Rect = z.infer<typeof RectSchema>;
export type Room = z.infer<typeof RoomSchema>;
export type Opening = z.infer<typeof OpeningSchema>;
export type Floor = z.infer<typeof FloorSchema>;
export type Issue = z.infer<typeof IssueSchema>;
export type Layout = z.infer<typeof LayoutSchema>;

export const VersionInputSchema = z.object({
  layout: LayoutSchema,
  issues: z.array(IssueSchema).max(500),
  source: z.enum(["generated", "edited"]),
  note: text(300).optional(),
  aiNotes: z.array(text(600)).max(20).optional(),
});
export type VersionInput = z.infer<typeof VersionInputSchema>;

export interface Project extends ProjectInput {
  id: string;
  status: "draft" | "generated";
  latestVersion: number;
  createdAt: string;
  updatedAt: string;
}

export interface DesignVersion extends VersionInput {
  id: string;
  projectId: string;
  version: number;
  createdAt: string;
}

/** Strips server-managed fields from a stored project. */
export function toInput(p: Project): ProjectInput {
  const { id, status, latestVersion, createdAt, updatedAt, ...rest } = p;
  void [id, status, latestVersion, createdAt, updatedAt];
  return rest;
}

export const DocumentInputSchema = z.object({
  version: z.number().int().min(1),
  kind: z.enum(["pdf", "svg", "png", "json"]),
  fileName: text(200),
  pages: z.number().int().min(0).max(500).optional(),
});

export function defaultProjectInput(): ProjectInput {
  return {
    name: "",
    type: "residential",
    country: "Pakistan",
    city: "",
    location: "",
    style: "Contemporary",
    units: { length: "ft", area: "marla", marlaSqft: 225 },
    plot: {
      shape: "rectangular",
      frontWidth: 30,
      rearWidth: 30,
      leftDepth: 60,
      rightDepth: 60,
      cornerPlot: false,
      entranceSide: "left",
    },
    constraints: {
      setbacks: { source: "none", front: 0, rear: 0, left: 0, right: 0 },
      floorHeight: 10.5,
    },
    requirements: {
      floors: 2,
      basement: false,
      futureExpansion: false,
      bedrooms: 4,
      masterBedrooms: 1,
      attachedBathrooms: 4,
      commonBathrooms: 1,
      kitchen: true,
      dining: true,
      living: true,
      drawingRoom: true,
      guestRoom: false,
      study: false,
      homeOffice: false,
      prayerRoom: false,
      laundry: true,
      storage: true,
      parkingCars: 1,
      balcony: true,
      terrace: false,
      courtyard: false,
      lift: false,
      accessibility: false,
      privacy: "medium",
      kitchenType: "closed",
      livingPlan: "separated",
      lightingPriority: "normal",
      ventilationPriority: "high",
      indoorOutdoor: false,
    },
    confirmedMeasurements: false,
  };
}
