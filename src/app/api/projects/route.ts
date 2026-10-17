import { getOwnerId, handle, ok, rateLimit, readJson } from "@/lib/server/http";
import { createProject, listProjects } from "@/lib/server/repo";
import { ProjectInputSchema } from "@/lib/schema";


export const GET = handle(async () => {
  const owner = await getOwnerId();
  return ok({ projects: await listProjects(owner) });
});

export const POST = handle(async (req: Request) => {
  const owner = await getOwnerId();
  rateLimit(`write:${owner}`, 60, 60_000);
  const input = await readJson(req, ProjectInputSchema);
  return ok({ project: await createProject(owner, input) }, 201);
});
