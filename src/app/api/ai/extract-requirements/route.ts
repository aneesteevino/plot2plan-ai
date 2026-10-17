import { z } from "zod";
import { extractRequirements } from "@/lib/server/hf";
import { getOwnerId, handle, ok, rateLimit, readJson } from "@/lib/server/http";

export const maxDuration = 60;

export const POST = handle(async (req: Request) => {
  const owner = await getOwnerId();
  rateLimit(`ai:${owner}`, 10, 10 * 60_000);
  const { text } = await readJson(req, z.object({ text: z.string().trim().min(10).max(3000) }), 16 * 1024);
  return ok(await extractRequirements(text));
});
