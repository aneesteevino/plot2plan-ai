import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { aiConfig, extractJson, extractRequirements, OPENROUTER_FREE_TEXT } from "../server/ai";

const reply = (status: number, content?: string) =>
  new Response(JSON.stringify(content === undefined ? { error: "x" } : { choices: [{ message: { content } }] }), { status, headers: { "content-type": "application/json" } });

describe("AI provider chain", () => {
  beforeEach(() => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubEnv("HF_TOKEN", "");
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("uses only free OpenRouter models by default", () => {
    expect(OPENROUTER_FREE_TEXT.every((m) => m.endsWith(":free"))).toBe(true);
    expect(aiConfig().providers).toEqual(["OpenRouter (free models)"]);
  });

  it("falls back to the next free model when one is rate-limited", async () => {
    const calls: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_url, init) => {
      const model = JSON.parse(String((init as RequestInit).body)).model as string;
      calls.push(model);
      return calls.length === 1 ? reply(429) : reply(200, '{"bedrooms": 4, "floors": 2, "drawingRoom": true, "summary": "Two storeys"}');
    });
    const res = await extractRequirements("Double storey with four bedrooms and a drawing room");
    expect(calls).toEqual(OPENROUTER_FREE_TEXT.slice(0, 2));
    expect(res.suggestions).toEqual({ bedrooms: 4, floors: 2, drawingRoom: true });
    expect(res.source).toContain(OPENROUTER_FREE_TEXT[1]);
  });

  it("drops invalid fields instead of trusting them", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(reply(200, '```json\n{"bedrooms": 99, "floors": "two", "lift": true}\n```'));
    const res = await extractRequirements("A house with a lift and many rooms");
    expect(res.suggestions).toEqual({ lift: true });
  });

  it("stops trying a provider whose key is rejected", async () => {
    const spy = vi.spyOn(globalThis, "fetch").mockResolvedValue(reply(401));
    await expect(extractRequirements("Two bedrooms please, single storey")).rejects.toMatchObject({ code: "AI_AUTH" });
    expect(spy).toHaveBeenCalledTimes(1);
  });

  it("reports busy when every free model is rate-limited", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply(429));
    await expect(extractRequirements("Two bedrooms please, single storey")).rejects.toMatchObject({ code: "AI_BUSY" });
  });

  it("extracts JSON from reasoning output", () => {
    expect(extractJson('<think>hmm {"a":0}</think> Answer: {"a": 1}')).toEqual({ a: 1 });
    expect(extractJson("no json")).toBeNull();
  });
});
