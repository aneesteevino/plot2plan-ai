import { getOwnerId, handle, ok, rateLimit, readJson } from "@/lib/server/http";
import { deleteProject, getProject, updateProject } from "@/lib/server/repo";
import { ProjectInputSchema } from "@/lib/schema";

type Ctx = { params: Promise<{ id: string }> };

export const GET = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  return ok({ project: await getProject(await getOwnerId(), id) });
});

export const PUT = handle(async (req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  const owner = await getOwnerId();
  rateLimit(`write:${owner}`, 60, 60_000);
  const input = await readJson(req, ProjectInputSchema);
  return ok({ project: await updateProject(owner, id, input) });
});

export const DELETE = handle(async (_req: Request, ctx: Ctx) => {
  const { id } = await ctx.params;
  await deleteProject(await getOwnerId(), id);
  return ok({ deleted: true });
});
