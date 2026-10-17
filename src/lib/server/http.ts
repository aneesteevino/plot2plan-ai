import "server-only";
import { cookies } from "next/headers";
import type { ZodType } from "zod";

export const OWNER_COOKIE = "p2p_owner";
const ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export const isId = (v: string) => ID_RE.test(v);

/**
 * Anonymous, device-scoped ownership: a random 122-bit id in an httpOnly cookie.
 * This keeps one browser's projects private from other visitors. It is NOT account
 * authentication: clearing cookies loses access, and there is no cross-device sign-in.
 */
export async function getOwnerId(): Promise<string> {
  const store = await cookies();
  const existing = store.get(OWNER_COOKIE)?.value;
  if (existing && isId(existing)) return existing;
  const id = crypto.randomUUID();
  store.set(OWNER_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return id;
}

const buckets = new Map<string, { count: number; reset: number }>();

/** Best-effort, per-instance fixed-window rate limiter. */
export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const b = buckets.get(key);
  if (!b || b.reset < now) {
    buckets.set(key, { count: 1, reset: now + windowMs });
    if (buckets.size > 5000) for (const [k, v] of buckets) if (v.reset < now) buckets.delete(k);
    return;
  }
  b.count++;
  if (b.count > limit) throw new ApiError(429, "RATE_LIMITED", "Too many requests. Please wait a moment and try again.");
}

export async function readJson<T>(req: Request, schema: ZodType<T>, maxBytes = 512 * 1024): Promise<T> {
  const len = Number(req.headers.get("content-length") || 0);
  if (len > maxBytes) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
  const text = await req.text();
  if (text.length > maxBytes) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Request body is too large.");
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError(400, "INVALID_JSON", "Request body must be valid JSON.");
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    throw new ApiError(400, "VALIDATION_FAILED", `Invalid input${first ? ` at ${first.path.join(".") || "body"}: ${first.message}` : ""}.`);
  }
  return parsed.data;
}

export function ok(data: unknown, status = 200) {
  return Response.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

/** Wraps a handler so errors become safe JSON responses (no stack traces or secrets). */
export function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (err) {
      if (err instanceof ApiError) return Response.json({ error: { code: err.code, message: err.message } }, { status: err.status });
      console.error("[api] unexpected error:", err instanceof Error ? err.name + ": " + err.message.slice(0, 200) : "unknown");
      return Response.json({ error: { code: "INTERNAL", message: "Something went wrong on the server. Please try again." } }, { status: 500 });
    }
  };
}
