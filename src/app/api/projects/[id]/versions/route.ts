import { getOwnerId, handle, ok, rateLimit, readJson } from "@/lib/server/http";
import { addVersion, listVersions } from "@/lib/server/repo";
import { VersionInputSchema } from "@/lib/schema";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return ok({ versions: await listVersions(await getOwnerId(), id) });
});

export const POST = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const owner = await getOwnerId();
  rateLimit(`write:${owner}`, 60, 60_000);
  const v = await readJson(req, VersionInputSchema, 2 * 1024 * 1024);
  return ok({ version: await addVersion(owner, id, v) }, 201);
});
