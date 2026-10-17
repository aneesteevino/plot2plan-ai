import { getOwnerId, handle, ok, rateLimit } from "@/lib/server/http";
import { duplicateProject } from "@/lib/server/repo";


export const POST = handle(async (_req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const owner = await getOwnerId();
  rateLimit(`write:${owner}`, 60, 60_000);
  return ok({ project: await duplicateProject(owner, id) }, 201);
});
