import { describe, expect, it } from "vitest";
import { defaultProjectInput, ProjectInputSchema, VersionInputSchema } from "../schema";

describe("schema validation", () => {
  it("accepts the default project once named", () => {
    const p = { ...defaultProjectInput(), name: "House" };
    expect(ProjectInputSchema.safeParse(p).success).toBe(true);
  });

  it("rejects missing names, negative lengths and bad enums", () => {
    expect(ProjectInputSchema.safeParse(defaultProjectInput()).success).toBe(false);
    const bad = { ...defaultProjectInput(), name: "x", plot: { ...defaultProjectInput().plot, frontWidth: -3 } };
    expect(ProjectInputSchema.safeParse(bad).success).toBe(false);
    const badUnit = { ...defaultProjectInput(), name: "x", units: { length: "furlong", area: "sqft", marlaSqft: 225 } };
    expect(ProjectInputSchema.safeParse(badUnit).success).toBe(false);
  });

  it("rejects out-of-range marla definitions", () => {
    const p = { ...defaultProjectInput(), name: "x", units: { length: "ft", area: "marla", marlaSqft: 5 } };
    expect(ProjectInputSchema.safeParse(p).success).toBe(false);
  });

  it("strips unknown keys so stored documents stay clean", () => {
    const parsed = ProjectInputSchema.parse({ ...defaultProjectInput(), name: "x", $where: "evil()" });
    expect("$where" in parsed).toBe(false);
  });

  it("rejects malformed layouts", () => {
    expect(VersionInputSchema.safeParse({ layout: { floors: [] }, issues: [], source: "generated" }).success).toBe(false);
  });
});
