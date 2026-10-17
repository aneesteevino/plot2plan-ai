import { getOwnerId, handle, ok, rateLimit, readJson } from "@/lib/server/http";
import { addDocument } from "@/lib/server/repo";
import { DocumentInputSchema } from "@/lib/schema";


export const POST = handle(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const owner = await getOwnerId();
  rateLimit(`write:${owner}`, 60, 60_000);
  const d = await readJson(req, DocumentInputSchema);
  return ok({ document: await addDocument(owner, id, d) }, 201);
});
