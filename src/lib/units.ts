import type { Units } from "./schema";

export type LengthUnit = Units["length"];
export type AreaUnit = Units["area"];

/** Exact by definition: 1 ft = 0.3048 m, 1 yd = 3 ft. */
export const FT_PER: Record<LengthUnit, number> = { ft: 1, m: 1 / 0.3048, yd: 3 };

export const LENGTH_LABEL: Record<LengthUnit, string> = { ft: "feet", m: "meters", yd: "yards" };
export const AREA_LABEL: Record<AreaUnit, string> = {
  sqft: "sq ft",
  sqm: "m²",
  sqyd: "sq yd",
  marla: "marla",
  kanal: "kanal",
};

/** Common marla definitions. The correct one depends on the locality / housing society. */
export const MARLA_PRESETS = [
  { sqft: 225, label: "225 sq ft (common in many housing societies)" },
  { sqft: 250, label: "250 sq ft" },
  { sqft: 272.25, label: "272.25 sq ft (traditional revenue marla)" },
] as const;

export function toFeet(value: number, unit: LengthUnit): number {
  return value * FT_PER[unit];
}

export function fromFeet(feet: number, unit: LengthUnit): number {
  return feet / FT_PER[unit];
}

/** Square feet per one unit of the given area unit. */
export function sqftPer(unit: AreaUnit, marlaSqft: number): number {
  switch (unit) {
    case "sqft":
      return 1;
    case "sqm":
      return 1 / (0.3048 * 0.3048);
    case "sqyd":
      return 9;
    case "marla":
      return marlaSqft;
    case "kanal":
      return marlaSqft * 20;
  }
}

export function areaToSqft(value: number, unit: AreaUnit, marlaSqft: number): number {
  return value * sqftPer(unit, marlaSqft);
}

export function areaFromSqft(sqft: number, unit: AreaUnit, marlaSqft: number): number {
  return sqft / sqftPer(unit, marlaSqft);
}

export function round(n: number, dp = 2): number {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}

/** Feet → 12'-6" style string (nearest inch). */
export function feetInches(feet: number): string {
  const totalIn = Math.round(feet * 12);
  const sign = totalIn < 0 ? "-" : "";
  const abs = Math.abs(totalIn);
  const f = Math.floor(abs / 12);
  const i = abs % 12;
  return `${sign}${f}'-${i}"`;
}

/** Format a length held in feet for display in the user's unit. */
export function fmtLength(feet: number, unit: LengthUnit): string {
  if (unit === "ft") return feetInches(feet);
  const v = fromFeet(feet, unit);
  return `${round(v, 2).toFixed(2)} ${unit}`;
}

export function fmtArea(sqft: number, unit: AreaUnit, marlaSqft: number, dp?: number): string {
  const v = areaFromSqft(sqft, unit, marlaSqft);
  const digits = dp ?? (unit === "marla" || unit === "kanal" ? 2 : unit === "sqft" ? 0 : 1);
  return `${v.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits })} ${AREA_LABEL[unit]}`;
}

/** The area unit used alongside a length unit when the user's area unit is a land unit. */
export function companionArea(unit: LengthUnit): AreaUnit {
  return unit === "m" ? "sqm" : unit === "yd" ? "sqyd" : "sqft";
}
