import { getDb, isDbConfigured } from "@/lib/server/db";
import { aiConfig } from "@/lib/server/hf";
import { connection } from "next/server";
import { ok } from "@/lib/server/http";

/** Coarse, non-sensitive reason for a failed connection, to help with setup. */
function classify(err: unknown): "auth" | "network" | "uri" | "unknown" {
  const e = err as { name?: string; code?: number; codeName?: string; message?: string };
  const msg = (e?.message ?? "").toLowerCase();
  if (e?.code === 18 || e?.codeName === "AuthenticationFailed" || msg.includes("auth")) return "auth";
  if (e?.name === "MongoParseError" || msg.includes("invalid scheme") || msg.includes("uri")) return "uri";
  if (e?.name === "MongoServerSelectionError" || e?.name === "MongoNetworkError" || msg.includes("timed out") || msg.includes("enotfound")) return "network";
  return "unknown";
}

export async function GET() {
  await connection();
  let db: "connected" | "not-configured" | "error" = "not-configured";
  let dbError: string | undefined;
  if (isDbConfigured()) {
    try {
      const conn = await getDb();
      await conn!.command({ ping: 1 });
      db = "connected";
    } catch (err) {
      db = "error";
      dbError = classify(err);
      console.error("[status] database connection failed:", (err as Error)?.name, dbError);
    }
  }
  const ai = aiConfig();
  return ok({ db, ...(dbError ? { dbError } : {}), ai: { configured: ai.configured, visionModel: ai.visionModel, textModel: ai.textModel } });
}
