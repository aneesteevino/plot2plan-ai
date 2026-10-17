import "server-only";
import { z } from "zod";
import { ApiError } from "./http";

/**
 * Hugging Face Inference Providers (OpenAI-compatible chat completions router).
 * Model ids and the token come from server-side env vars only.
 */
const ROUTER = "https://router.huggingface.co/v1/chat/completions";
export const DEFAULT_MODEL = "Qwen/Qwen3.8-27B";

export function aiConfig() {
  return {
    configured: !!process.env.HF_TOKEN,
    visionModel: process.env.HF_VISION_MODEL || DEFAULT_MODEL,
    textModel: process.env.HF_TEXT_MODEL || DEFAULT_MODEL,
  };
}

type Content = string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[];

async function chat(model: string, system: string, user: Content, timeoutMs = 45000): Promise<string> {
  const token = process.env.HF_TOKEN;
  if (!token) throw new ApiError(501, "AI_NOT_CONFIGURED", "AI assistance is not configured on this deployment. You can continue entering details manually.");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(ROUTER, {
      method: "POST",
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        max_tokens: 1200,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
      }),
    });
    if (!res.ok) {
      const status = res.status;
      if (status === 401 || status === 403) throw new ApiError(502, "AI_AUTH", "The AI service rejected the configured credentials.");
      if (status === 429) throw new ApiError(503, "AI_BUSY", "The AI service is rate-limited right now. Please try again shortly.");
      if (status === 404 || status === 400) throw new ApiError(502, "AI_MODEL", "The configured AI model is unavailable for this request type.");
      throw new ApiError(502, "AI_ERROR", "The AI service returned an error. Please try again or continue manually.");
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return data.choices?.[0]?.message?.content ?? "";
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof Error && err.name === "AbortError") throw new ApiError(504, "AI_TIMEOUT", "The AI service took too long to respond. Please try again or continue manually.");
    throw new ApiError(502, "AI_UNREACHABLE", "The AI service could not be reached.");
  } finally {
    clearTimeout(timer);
  }
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
        value: z.number().finite().positive().max(1e6),
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

export async function analyzePlotImage(dataUrl: string, kind: string): Promise<ImageAnalysis> {
  const { visionModel } = aiConfig();
  const system =
    "You read plot / site images for a preliminary house-planning tool. Report ONLY what is visibly written or drawn. " +
    "Never estimate dimensions from perspective or pixel sizes. If no measurement text is visible, return an empty measurements list. " +
    'Reply with a single JSON object: {"imageType": string, "shapeGuess": "rectangular"|"square"|"l-shaped"|"polygonal"|"irregular"|"unknown", ' +
    '"hasScale": boolean, "measurements": [{"label": string, "side": "front"|"rear"|"left"|"right"|"area"|"road"|"other", "value": number, "unit": "ft"|"m"|"yd"|"marla"|"kanal"|"sqft"|"sqm"|"sqyd"|"unknown", "confidence": "low"|"medium"|"high"}], ' +
    '"visibleText": string[], "notes": string}. No other text.';
  const out = await chat(visionModel, system, [
    { type: "text", text: `The user describes this image as: ${kind}. Extract visible measurements and boundary information.` },
    { type: "image_url", image_url: { url: dataUrl } },
  ]);
  const parsed = ImageAnalysisSchema.safeParse(extractJson(out));
  if (!parsed.success) throw new ApiError(502, "AI_UNPARSEABLE", "The AI response could not be interpreted. Please enter the measurements manually.");
  return parsed.data;
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
  const { textModel } = aiConfig();
  const system =
    "Convert a homeowner's description into structured house requirements. Only include fields the text clearly states or directly implies. " +
    "Reply with ONE JSON object using any of these keys: floors, bedrooms, masterBedrooms, attachedBathrooms, commonBathrooms, parkingCars, drawingRoom, guestRoom, study, homeOffice, prayerRoom, laundry, storage, balcony, terrace, courtyard, lift, accessibility, occupants (integers/booleans), " +
    'kitchenType ("closed"|"open"), livingPlan ("open"|"separated"), privacy ("low"|"medium"|"high"). Also include "summary": a one-sentence restatement. No other text.';
  const out = await chat(textModel, system, text.slice(0, 3000), 30000);
  const raw = extractJson(out) as Record<string, unknown> | null;
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
  return { suggestions: RequirementSuggestionSchema.parse(fields), summary };
}
