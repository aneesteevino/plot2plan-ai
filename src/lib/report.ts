import { analyzePlot } from "./geometry";
import { floorAreas } from "./planner/validate";
import { SPECS } from "./planner/specs";
import type { DesignVersion, Issue, Project } from "./schema";
import { AREA_LABEL, companionArea, fmtArea, fmtLength, LENGTH_LABEL, toFeet } from "./units";

export const DISCLAIMER =
  "PRELIMINARY CONCEPT — NOT FOR CONSTRUCTION OR PERMIT SUBMISSION WITHOUT REVIEW AND APPROVAL BY QUALIFIED PROFESSIONALS.";

export type Tag = "user" | "calculated" | "suggestion" | "assumption" | "verify";
export const TAG_LABEL: Record<Tag, string> = {
  user: "User-provided",
  calculated: "Calculated",
  suggestion: "Design suggestion",
  assumption: "Assumption",
  verify: "Needs professional confirmation",
};

export interface Row {
  label: string;
  value: string;
  tag: Tag;
}

export interface ScheduleRow {
  name: string;
  dims: string;
  area: string;
  areaSqft: number;
  open: boolean;
}

export interface ReportData {
  title: string;
  version: number;
  createdAt: string;
  overview: Row[];
  plot: Row[];
  brief: Row[];
  assumptions: string[];
  allocation: { floor: string; covered: string; porch: string; open: string }[];
  schedules: { floor: string; rows: ScheduleRow[] }[];
  openings: { floor: string; rows: { id: string; type: string; width: string; between: string }[] }[];
  circulation: string[];
  lighting: string[];
  parking: string[];
  areaSummary: Row[];
  budget: string[];
  regulatory: Row[];
  questions: string[];
  checklist: string[];
  limitations: string[];
  issues: Issue[];
}

const yesNo = (b: boolean) => (b ? "Yes" : "No");

export function buildReport(p: Project, v: DesignVersion): ReportData {
  const u = p.units;
  const len = (ft: number) => fmtLength(ft, u.length);
  const ar = (sqft: number) => `${fmtArea(sqft, companionArea(u.length), u.marlaSqft)}${u.area === "marla" || u.area === "kanal" ? ` (${fmtArea(sqft, u.area, u.marlaSqft)})` : ""}`;
  const a = analyzePlot(p.plot, u);
  const l = v.layout;
  const r = p.requirements;
  const c = p.constraints;
  const plotArea = l.plot.w * l.plot.d;
  const floors = l.floors;
  const builtFloors = floors.filter((f) => !f.roof);
  const areas = floors.map(floorAreas);
  const totalCovered = areas.filter((_, i) => !floors[i].roof).reduce((s, x) => s + x.coveredSqft, 0);
  const groundA = areas[0];

  const entered = (val: number | undefined) => (val === undefined ? "—" : `${val} ${u.length}`);

  const overview: Row[] = [
    { label: "Project", value: p.name, tag: "user" },
    { label: "Project type", value: p.type, tag: "user" },
    { label: "Location", value: [p.location, p.city, p.country].filter(Boolean).join(", ") || "—", tag: "user" },
    { label: "Architectural style", value: p.style || "—", tag: "user" },
    { label: "Floors planned", value: `${builtFloors.length}${floors.some((f) => f.roof) ? " + roof" : ""}`, tag: "suggestion" },
    { label: "Design version", value: `v${v.version} (${v.source === "edited" ? "user-edited" : "engine-generated"})`, tag: "calculated" },
    { label: "Planning engine", value: l.engine, tag: "calculated" },
  ];

  const plot: Row[] = [
    { label: "Plot shape", value: p.plot.shape, tag: "user" },
    { label: "Measurement units", value: `${LENGTH_LABEL[u.length]}; area in ${AREA_LABEL[u.area]}`, tag: "user" },
    { label: "Marla definition", value: `${u.marlaSqft} sq ft per marla`, tag: "user" },
    { label: "Front width (road side)", value: entered(p.plot.frontWidth), tag: "user" },
    { label: "Rear width", value: entered(p.plot.rearWidth), tag: "user" },
    { label: "Left side length", value: entered(p.plot.leftDepth), tag: "user" },
    { label: "Right side length", value: entered(p.plot.rightDepth), tag: "user" },
    { label: "Measurements confirmed by user", value: yesNo(p.confirmedMeasurements), tag: "user" },
    { label: "Calculated plot area", value: a.areaSqft ? ar(a.areaSqft) : "Not determinable from the data provided", tag: "calculated" },
    { label: "Stated area", value: p.plot.statedArea !== undefined ? `${p.plot.statedArea} ${AREA_LABEL[u.area]}` : "—", tag: "user" },
    { label: "Road width", value: p.plot.roadWidth !== undefined ? `${p.plot.roadWidth} ${u.length}` : "Not provided", tag: "user" },
    { label: "Front faces", value: p.plot.facing ?? "Not provided", tag: "user" },
    { label: "Corner plot", value: p.plot.cornerPlot ? `Yes (second road on the ${p.plot.secondRoadSide ?? "unspecified"} side)` : "No", tag: "user" },
    { label: "Entrance / driveway side", value: p.plot.entranceSide, tag: "user" },
    { label: "Existing structures / obstructions", value: p.plot.obstructions || "None reported", tag: "user" },
    { label: "Plot image", value: p.image ? `${p.image.name} (${p.image.kind}; kept in the user's browser only)` : "None uploaded", tag: "user" },
  ];

  const brief: Row[] = [
    { label: "Floors requested", value: String(r.floors), tag: "user" },
    { label: "Bedrooms (of which master)", value: `${r.bedrooms} (${r.masterBedrooms})`, tag: "user" },
    { label: "Attached / common bathrooms", value: `${r.attachedBathrooms} / ${r.commonBathrooms}`, tag: "user" },
    { label: "Parking", value: r.parkingCars ? `${r.parkingCars} car(s)` : "None", tag: "user" },
    {
      label: "Other spaces",
      value:
        [
          r.drawingRoom && "drawing room", r.dining && "dining", r.guestRoom && "guest room", r.study && "study", r.homeOffice && "home office",
          r.prayerRoom && "prayer room", r.laundry && "laundry", r.storage && "storage", r.balcony && "balcony", r.terrace && "terrace",
          r.courtyard && "courtyard", r.lift && "lift", r.basement && "basement (not planned)",
        ].filter(Boolean).join(", ") || "—",
      tag: "user",
    },
    { label: "Occupants", value: r.occupants ? String(r.occupants) : "Not provided", tag: "user" },
    { label: "Kitchen / living", value: `${r.kitchenType} kitchen; ${r.livingPlan} living`, tag: "user" },
    { label: "Privacy / light / ventilation priority", value: `${r.privacy} / ${r.lightingPriority} / ${r.ventilationPriority}`, tag: "user" },
    { label: "Accessibility features", value: yesNo(r.accessibility), tag: "user" },
    { label: "Future expansion", value: yesNo(r.futureExpansion), tag: "user" },
    { label: "Budget", value: p.budget ? `${p.budget.amount.toLocaleString()} ${p.budget.currency}` : "Not provided", tag: "user" },
    { label: "Preferred materials", value: c.materials || "Not provided", tag: "user" },
    { label: "Orientation / Vastu notes", value: r.orientationNotes || "None", tag: "user" },
    { label: "Sustainability notes", value: r.sustainabilityNotes || "None", tag: "user" },
    { label: "Additional notes", value: r.notes || "None", tag: "user" },
  ];

  const allocation = floors.map((f, i) => ({
    floor: f.name,
    covered: ar(areas[i].coveredSqft),
    porch: areas[i].porchSqft ? ar(areas[i].porchSqft) : "—",
    open: areas[i].openSqft ? ar(areas[i].openSqft) : "—",
  }));

  const schedules = floors.map((f) => ({
    floor: f.name,
    rows: f.rooms.map((rm) => ({
      name: rm.name,
      dims: `${len(rm.rect.w)} × ${len(rm.rect.d)}`,
      area: ar(rm.rect.w * rm.rect.d),
      areaSqft: rm.rect.w * rm.rect.d,
      open: rm.open,
    })),
  }));

  const nameOf = (fId: number, id: string) => floors[fId].rooms.find((x) => x.id === id)?.name ?? id;
  const openings = floors.map((f, fi) => ({
    floor: f.name,
    rows: f.openings.map((o) => ({
      id: o.id,
      type: o.type === "main-door" ? "Main door" : o.type === "gate" ? "Gate" : o.type === "opening" ? "Opening (no shutter)" : o.type === "window" ? (o.width <= 2.1 ? "Ventilator" : "Window") : "Door",
      width: len(o.width),
      between: o.rooms.map((id) => nameOf(fi, id)).join(" ↔ ") || "Plot boundary",
    })),
  }));

  const has = (code: string) => v.issues.some((i) => i.code === code);
  const noWindow = v.issues.filter((i) => i.code === "NO_WINDOW").length;
  const circulation = [
    "The house is zoned from front to back: public spaces (entrance, drawing room) at the front, family and service spaces in the middle, and bedrooms at the rear for privacy.",
    has("NO_CORRIDOR") ? "Rear rooms open directly off the living or lounge area. Consider a corridor if privacy is a priority." : "A corridor links the family zone to the rear rooms, so bedrooms do not open into the living room.",
    builtFloors.length > 1 ? "The staircase is in the same position on every floor, and each upper floor arrives into a family lounge." : "Single-storey plan: no vertical circulation except the roof stair where requested.",
    r.drawingRoom ? "The drawing room is next to the entrance so guests can be received without passing through family areas." : "",
    r.accessibility ? "Accessibility: a ground-floor bedroom and wider corridors/doors are planned. Ramps, grab bars and threshold details need detailed design." : "",
  ].filter(Boolean);
  const lighting = [
    noWindow
      ? `${noWindow} habitable room(s) have no external wall facing open space. Side walls with no setback are treated as party walls. Consider a courtyard, light shaft or side setback.`
      : "Every habitable room has at least one wall facing the road, a setback or an open space for a window.",
    "Bathrooms on external walls get ventilators. Internal bathrooms need ducts or mechanical exhaust.",
    p.plot.facing ? `The front faces ${p.plot.facing}. Window shading should respond to sun direction. Detailed solar analysis has not been done.` : "Plot orientation was not provided, so sun and wind direction were not considered.",
    r.ventilationPriority === "high" ? "Cross-ventilation was requested. Front-to-back openings along the corridor should be checked in detailed design." : "",
  ].filter(Boolean);
  const porch = floors[0].rooms.find((x) => x.kind === "porch");
  const parking = [
    porch ? `Car porch of about ${len(porch.rect.w)} × ${len(porch.rect.d)} for ${r.parkingCars} car(s). Check the gate width, road width and turning space on site.` : "No on-site parking is planned.",
    ...floors[0].rooms.filter((x) => x.kind === "lawn" || x.kind === "courtyard").map((x) => `${x.name}: about ${len(x.rect.w)} × ${len(x.rect.d)}.`),
  ];

  const areaSummary: Row[] = [
    { label: "Plot area", value: ar(plotArea), tag: "calculated" },
    { label: "Buildable zone (after setbacks)", value: ar(l.buildable.w * l.buildable.d), tag: c.setbacks.source === "user" ? "calculated" : "assumption" },
    { label: "Ground floor covered area", value: ar(groundA.coveredSqft), tag: "calculated" },
    { label: "Car porch (covered, open-sided)", value: groundA.porchSqft ? ar(groundA.porchSqft) : "—", tag: "calculated" },
    { label: "Total covered area (all floors, excluding porch)", value: ar(totalCovered), tag: "calculated" },
    { label: "Approximate ground coverage", value: `${(((groundA.coveredSqft + groundA.porchSqft) / plotArea) * 100).toFixed(1)}%`, tag: "calculated" },
    { label: "Floor area ratio (covered ÷ plot)", value: (totalCovered / plotArea).toFixed(2), tag: "calculated" },
  ];

  const budget = p.budget
    ? [
        `Budget provided: ${p.budget.amount.toLocaleString()} ${p.budget.currency}. Divided by the total covered area, this is about ${(p.budget.amount / Math.max(totalCovered, 1)).toLocaleString(undefined, { maximumFractionDigits: 0 })} ${p.budget.currency} per sq ft. Compare this with current local construction rates from a quantity surveyor or contractor.`,
        "No cost estimate has been produced. Material quantities and rates are not modelled in this version.",
      ]
    : ["No budget was provided. No cost estimate has been produced."];

  const pending = "Pending verification";
  const regulatory: Row[] = [
    { label: "Setbacks (front / rear / sides)", value: c.setbacks.source === "user" ? "User-entered values applied. Verify against the approved bylaws." : c.setbacks.source === "placeholder" ? "Placeholder values only. " + pending : "Not provided. " + pending, tag: "verify" },
    { label: "Maximum ground coverage", value: c.maxCoveragePct !== undefined ? `Checked against the user-entered ${c.maxCoveragePct}%` : "Not provided. " + pending, tag: "verify" },
    { label: "Maximum height / storeys", value: c.maxHeight !== undefined ? `Checked against the user-entered ${c.maxHeight} ${u.length}` : "Not provided. " + pending, tag: "verify" },
    { label: "Parking requirements", value: pending, tag: "verify" },
    { label: "Minimum room sizes, ventilation and stair rules", value: "Planning heuristics only. " + pending, tag: "verify" },
    { label: "Fire safety and egress", value: pending, tag: "verify" },
    { label: "Structural design (foundations, columns, beams, slabs)", value: "Not designed. Requires a structural engineer.", tag: "verify" },
    { label: "Plumbing, electrical and drainage", value: "Not designed.", tag: "verify" },
    { label: "Housing society / development authority approval", value: pending, tag: "verify" },
  ];
  if (c.bylawsNotes) regulatory.push({ label: "User-supplied bylaw notes", value: c.bylawsNotes, tag: "user" });

  const questions = [
    c.setbacks.source !== "user" ? "What setbacks does your housing society or authority require for this plot size?" : "",
    c.maxCoveragePct === undefined ? "What is the permitted ground coverage?" : "",
    c.maxHeight === undefined ? "What is the permitted building height or number of storeys?" : "",
    !p.plot.facing ? "Which compass direction does the road-facing side face?" : "",
    !p.confirmedMeasurements ? "Have the plot measurements been confirmed by a survey or demarcation?" : "",
    "Is there a soil investigation report for foundation design?",
    "Where are the sewer, water and electricity connection points?",
    r.basement ? "Is a basement permitted, and is the water table suitable?" : "",
    noWindow ? "Can a courtyard or light shaft be added for rooms without external windows?" : "",
  ].filter(Boolean);

  const checklist = [
    "Licensed architect: review the layout, room sizes, circulation and compliance with local bylaws.",
    "Structural engineer: column grid, foundations, slabs, beams over the porch and any cantilevers, and seismic design.",
    "Land surveyor: confirm plot boundaries, dimensions, levels and corner angles.",
    "Geotechnical engineer: soil bearing capacity and water table.",
    "MEP engineer: plumbing stacks, drainage, electrical load and ventilation.",
    "Local authority / housing society: setbacks, coverage, height, parking and approval drawings.",
    "Quantity surveyor / contractor: cost estimate based on current local rates.",
  ];

  const limitations = [
    DISCLAIMER,
    "Plot2Plan AI is a preliminary planning and visualisation assistant. It is not a substitute for a licensed architect, structural engineer, land surveyor or local building authority.",
    "Layouts come from a deterministic zoning algorithm for rectangular plots, using typical planning dimensions. They have not been optimised for every constraint.",
    "No structural, geotechnical, MEP or fire-safety design has been done. No column, beam, reinforcement or foundation specification is provided.",
    "Regulatory compliance is not verified. Any check against a limit uses only the values you entered.",
    "Dimensions are approximate wall-centreline sizes. Wall thicknesses, finishes and construction tolerances are not deducted.",
    "AI-assisted outputs, where used, are suggestions only and are always shown to you for confirmation.",
  ];

  return {
    title: p.name,
    version: v.version,
    createdAt: v.createdAt,
    overview,
    plot,
    brief,
    assumptions: l.assumptions,
    allocation,
    schedules,
    openings,
    circulation,
    lighting,
    parking,
    areaSummary,
    budget,
    regulatory,
    questions,
    checklist,
    limitations,
    issues: v.issues,
  };
}

export const roomFill = (kind: string): string => {
  const s = SPECS[kind as keyof typeof SPECS];
  if (!s) return "#ffffff";
  if (["lawn", "courtyard"].includes(kind)) return "#e8f3ea";
  if (["balcony", "terrace", "open", "shaft"].includes(kind)) return "#f1f4f8";
  if (["porch"].includes(kind)) return "#eef0f3";
  if (["corridor", "foyer", "stair", "lift"].includes(kind)) return "#f6f3ec";
  if (s.wet) return "#e9f1fb";
  if (["bedroom", "master", "guest", "dress"].includes(kind)) return "#fbf8f2";
  return "#ffffff";
};

export { toFeet };
