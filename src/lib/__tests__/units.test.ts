import { describe, expect, it } from "vitest";
import { areaFromSqft, areaToSqft, feetInches, fmtArea, fromFeet, toFeet } from "../units";

describe("unit conversion", () => {
  it("converts lengths exactly", () => {
    expect(toFeet(1, "m")).toBeCloseTo(3.28084, 5);
    expect(toFeet(10, "yd")).toBe(30);
    expect(fromFeet(toFeet(12.34, "m"), "m")).toBeCloseTo(12.34, 10);
  });

  it("uses the configured marla definition", () => {
    expect(areaToSqft(5, "marla", 225)).toBe(1125);
    expect(areaToSqft(5, "marla", 272.25)).toBeCloseTo(1361.25, 6);
    expect(areaToSqft(1, "kanal", 225)).toBe(4500);
    expect(areaFromSqft(1800, "marla", 225)).toBe(8);
  });

  it("converts square metres and yards", () => {
    expect(areaToSqft(1, "sqm", 225)).toBeCloseTo(10.7639, 4);
    expect(areaToSqft(1, "sqyd", 225)).toBe(9);
  });

  it("formats feet-inches", () => {
    expect(feetInches(12.5)).toBe(`12'-6"`);
    expect(feetInches(9.999)).toBe(`10'-0"`);
    expect(feetInches(0.0833)).toBe(`0'-1"`);
  });

  it("formats areas", () => {
    expect(fmtArea(1125, "marla", 225)).toBe("5.00 marla");
    expect(fmtArea(1800, "sqft", 225)).toBe("1,800 sq ft");
  });
});
