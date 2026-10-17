import { getDb, isDbConfigured } from "@/lib/server/db";
import { aiConfig } from "@/lib/server/hf";
import { connection } from "next/server";
import { ok } from "@/lib/server/http";


export async function GET() {
  await connection();
  let db: "connected" | "not-configured" | "error" = "not-configured";
  if (isDbConfigured()) {
    try {
      const conn = await getDb();
      await conn!.command({ ping: 1 });
      db = "connected";
    } catch {
      db = "error";
    }
  }
  const ai = aiConfig();
  return ok({ db, ai: { configured: ai.configured, visionModel: ai.visionModel, textModel: ai.textModel } });
}
