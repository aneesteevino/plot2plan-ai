import "server-only";
import { z } from "zod";
import { ApiError } from "./http";

/**
 * AI provider chain (OpenAI-compatible chat completions).
 * 1. OpenRouter free models (OPENROUTER_API_KEY), tried in order.
 * 2. Hugging Face Inference Providers (HF_TOKEN).
 * A model that is rate-limited, unavailable, out of credits or returns nothing is skipped
 * and the next one is tried. Keys and model ids come from server-side env vars only.
 */
export const DEFAULT_MODEL = "Qwen/Qwen3.8-27B";
/** Free OpenRouter models with image input (checked against openrouter.ai/api/v1/models). */
export const OPENROUTER_FREE_VISION = ["google/gemma-4-31b-it:free", "google/gemma-4-26b-a4b-it:free", "nvidia/nemotron-3.5-super-vl:free", "minimax/minimax-m3.1-flash:free"];
export const OPENROUTER_FREE_TEXT = ["google/gemma-4-31b-it:free", "nvidia/nemotron-3-super-120b-a12b:free", "google/gemma-4-26b-a4b-it:free"];

type Kind = "vision" | "text";
interface Provider {
  id: "openrouter" | "huggingface";
  label: string;
  url: string;
  key: string;
  models: Record<Kind, string[]>;
  headers?: Record<string, string>;
}

const list = (v: string | undefined, fallback: string[]) => (v ? v.split(",").map((m) => m.trim()).filter(Boolean) : fallback);

function providers(): Provider[] {
  const out: Provider[] = [];
  if (process.env.OPENROUTER_API_KEY)
    out.push({
      id: "openrouter",
      label: "OpenRouter (free models)",
      url: "https://openrouter.ai/api/v1/chat/completions",
      key: process.env.OPENROUTER_API_KEY,
      models: { vision: list(process.env.OPENROUTER_VISION_MODELS, OPENROUTER_FREE_VISION), text: list(process.env.OPENROUTER_TEXT_MODELS, OPENROUTER_FREE_TEXT) },
      headers: { "HTTP-Referer": process.env.APP_URL || "https://plot2plan-ai.vercel.app", "X-Title": "Plot2Plan AI" },
    });
  if (process.env.HF_TOKEN)
    out.push({
      id: "huggingface",
      label: "Hugging Face",
      url: "https://router.huggingface.co/v1/chat/completions",
      key: process.env.HF_TOKEN,
      models: { vision: [process.env.HF_VISION_MODEL || DEFAULT_MODEL], text: [process.env.HF_TEXT_MODEL || DEFAULT_MODEL] },
    });
  return out;
}

export function aiConfig() {
  const ps = providers();
  return {
    configured: ps.length > 0,
    providers: ps.map((p) => p.label),
    visionModel: ps.map((p) => p.models.vision[0]).join(" → "),
    textModel: ps.map((p) => p.models.text[0]).join(" → "),
  };
}

type Content = string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];

/** Error from one model attempt; `skipProvider` means the key itself was rejected. */
class AttemptError extends Error {
  constructor(
    public code: string,
    public skipProvider = false,
  ) {
    super(code);
  }
}

async function attempt(p: Provider, model: string, system: string, user: Content, timeoutMs: number): Promise<string> {
  // Instructions are sent inside the user turn: some free models do not accept a system role.
  const content: Content = typeof user === "string" ? `${system}

${user}` : [{ type: "text", text: system }, ...user];
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(p.url, {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${p.key}`, "Content-Type": "application/json", ...(p.headers ?? {}) },
      body: JSON.stringify({ model, temperature: 0.1, max_tokens: 1500, messages: [{ role: "user", content }] }),
    });
    if (!res.ok) {
      console.error(`[ai] ${p.id} ${model} -> HTTP ${res.status}`);
      if (res.status === 401 || res.status === 403) throw new AttemptError("AI_AUTH", true);
      if (res.status === 402) throw new AttemptError("AI_CREDITS", p.id === "huggingface");
      if (res.status === 429) throw new AttemptError("AI_BUSY");
      if (res.status === 400 || res.status === 404 || res.status === 422) throw new AttemptError("AI_MODEL");
      throw new AttemptError("AI_ERROR");
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string | null } }[]; error?: unknown };
    const text = data.choices?.[0]?.message?.content ?? "";
    if (!text.trim()) throw new AttemptError("AI_EMPTY");
    return text;
  } catch (err) {
    if (err instanceof AttemptError) throw err;
    if (err instanceof Error && err.name === "AbortError") throw new AttemptError("AI_TIMEOUT");
    throw new AttemptError("AI_UNREACHABLE");
  } finally {
    clearTimeout(timer);
  }
}

const MESSAGES: Record<string, string> = {
  AI_AUTH: "The AI service rejected the configured credentials.",
  AI_CREDITS: "The AI provider has no remaining credits for this request.",
  AI_BUSY: "The free AI models are busy or rate-limited right now. Please try again in a minute, or continue manually.",
  AI_MODEL: "The configured AI models are unavailable for this request.",
  AI_TIMEOUT: "The AI service took too long to respond. Please try again or continue manually.",
  AI_EMPTY: "The AI models returned no answer. Please try again or continue manually.",
};

/** Tries each provider and model in order until one answers, within an overall time budget. */
async function chat(kind: Kind, system: string, user: Content, budgetMs = 50000): Promise<{ text: string; model: string; provider: string }> {
  const ps = providers();
  if (!ps.length) throw new ApiError(501, "AI_NOT_CONFIGURED", "AI assistance is not configured on this deployment. You can continue entering details manually.");
  const deadline = Date.now() + budgetMs;
  let last = "AI_ERROR";
  for (const p of ps) {
    for (const model of p.models[kind]) {
      const left = deadline - Date.now();
      if (left < 4000) break;
      try {
        return { text: await attempt(p, model, system, user, Math.min(left, 30000)), model, provider: p.label };
      } catch (err) {
        const e = err as AttemptError;
        last = e.code;
        if (e.skipProvider) break;
      }
    }
  }
  throw new ApiError(last === "AI_BUSY" ? 503 : 502, last, MESSAGES[last] ?? "The AI service returned an error. Please try again or continue manually.");
}

/** Extracts the first JSON object from model output (ignores reasoning blocks and code fences). */
export function extractJson(text: string): unknown {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, "").replace(/```(?:json)?/g, "");
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch {
    return null;
  }
}

// ---------- Plot image interpretation ----------

export const ImageAnalysisSchema = z.object({
  imageType: z.string().max(80).catch("unknown"),
  shapeGuess: z.enum(["rectangular", "square", "l-shaped", "polygonal", "irregular", "unknown"]).catch("unknown"),
  hasScale: z.boolean().catch(false),
  measurements: z
    .array(
      z.object({
        label: z.string().max(80),
        side: z.enum(["front", "rear", "left", "right", "area", "road", "other"]).catch("other"),
        value: z.coerce.number().finite().positive().max(1e6),
        unit: z.enum(["ft", "m", "yd", "marla", "kanal", "sqft", "sqm", "sqyd", "unknown"]).catch("unknown"),
        confidence: z.enum(["low", "medium", "high"]).catch("low"),
      }),
    )
    .max(20)
    .catch([]),
  visibleText: z.array(z.string().max(120)).max(30).catch([]),
  notes: z.string().max(800).catch(""),
});
export type ImageAnalysis = z.infer<typeof ImageAnalysisSchema>;

export async function analyzePlotImage(dataUrl: string, kind: string): Promise<ImageAnalysis & { source: string }> {
  const system =
    "You read plot / site images for a preliminary house-planning tool. Report ONLY what is visibly written or drawn. " +
    "Never estimate dimensions from perspective or pixel sizes. If no measurement text is visible, return an empty measurements list. " +
    'Reply with a single JSON object: {"imageType": string, "shapeGuess": "rectangular"|"square"|"l-shaped"|"polygonal"|"irregular"|"unknown", ' +
    '"hasScale": boolean, "measurements": [{"label": string, "side": "front"|"rear"|"left"|"right"|"area"|"road"|"other", "value": number, "unit": "ft"|"m"|"yd"|"marla"|"kanal"|"sqft"|"sqm"|"sqyd"|"unknown", "confidence": "low"|"medium"|"high"}], ' +
    '"visibleText": string[], "notes": string}. No other text.';
  const out = await chat("vision", system, [
    { type: "text", text: `The user describes this image as: ${kind}. Extract visible measurements and boundary information.` },
    { type: "image_url", image_url: { url: dataUrl } },
  ]);
  const parsed = ImageAnalysisSchema.safeParse(extractJson(out.text));
  if (!parsed.success) throw new ApiError(502, "AI_UNPARSEABLE", "The AI response could not be interpreted. Please enter the measurements manually.");
  return { ...parsed.data, source: `${out.provider} · ${out.model}` };
}

// ---------- Requirement extraction from free text ----------

export const RequirementSuggestionSchema = z
  .object({
    floors: z.number().int().min(1).max(4),
    bedrooms: z.number().int().min(0).max(12),
    masterBedrooms: z.number().int().min(0).max(6),
    attachedBathrooms: z.number().int().min(0).max(12),
    commonBathrooms: z.number().int().min(0).max(6),
    parkingCars: z.number().int().min(0).max(3),
    drawingRoom: z.boolean(),
    guestRoom: z.boolean(),
    study: z.boolean(),
    homeOffice: z.boolean(),
    prayerRoom: z.boolean(),
    laundry: z.boolean(),
    storage: z.boolean(),
    balcony: z.boolean(),
    terrace: z.boolean(),
    courtyard: z.boolean(),
    lift: z.boolean(),
    accessibility: z.boolean(),
    occupants: z.number().int().min(1).max(40),
    kitchenType: z.enum(["closed", "open"]),
    livingPlan: z.enum(["open", "separated"]),
    privacy: z.enum(["low", "medium", "high"]),
  })
  .partial();

export async function extractRequirements(text: string) {
  const system =
    "Convert a homeowner's description into structured house requirements. Only include fields the text clearly states or directly implies. " +
    "Reply with ONE JSON object using any of these keys: floors, bedrooms, masterBedrooms, attachedBathrooms, commonBathrooms, parkingCars, drawingRoom, guestRoom, study, homeOffice, prayerRoom, laundry, storage, balcony, terrace, courtyard, lift, accessibility, occupants (integers/booleans), " +
    'kitchenType ("closed"|"open"), livingPlan ("open"|"separated"), privacy ("low"|"medium"|"high"). Also include "summary": a one-sentence restatement. No other text.';
  const out = await chat("text", system, text.slice(0, 3000), 45000);
  const raw = extractJson(out.text) as Record<string, unknown> | null;
  if (!raw || typeof raw !== "object") throw new ApiError(502, "AI_UNPARSEABLE", "The AI response could not be interpreted.");
  // Validate field by field: invalid fields are dropped rather than trusted.
  const fields: Record<string, unknown> = {};
  const shape = RequirementSuggestionSchema.shape;
  for (const [k, v] of Object.entries(raw)) {
    const s = (shape as Record<string, z.ZodType>)[k];
    if (!s) continue;
    const r = s.safeParse(v);
    if (r.success && r.data !== undefined) fields[k] = r.data;
  }
  const summary = typeof raw.summary === "string" ? raw.summary.slice(0, 300) : "";
  return { suggestions: RequirementSuggestionSchema.parse(fields), summary, source: `${out.provider} · ${out.model}` };
}
