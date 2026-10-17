import { analyzePlotImage } from "@/lib/server/hf";
import { ApiError, getOwnerId, handle, ok, rateLimit } from "@/lib/server/http";

export const maxDuration = 60;

const MAX_BYTES = 3.5 * 1024 * 1024;
const KINDS = ["photo", "plot-map", "survey", "sketch", "site-plan"];

function sniff(b: Uint8Array): string | null {
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  return null;
}

/** The image is forwarded to the AI provider for this request only; it is never stored by Plot2Plan. */
export const POST = handle(async (req: Request) => {
  const owner = await getOwnerId();
  rateLimit(`ai:${owner}`, 10, 10 * 60_000);
  const len = Number(req.headers.get("content-length") || 0);
  if (len > MAX_BYTES + 64 * 1024) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Image is too large for analysis (max 3.5 MB after compression).");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  const kind = String(form?.get("kind") ?? "photo");
  if (!(file instanceof Blob)) throw new ApiError(400, "NO_FILE", "Attach an image file.");
  if (file.size > MAX_BYTES) throw new ApiError(413, "PAYLOAD_TOO_LARGE", "Image is too large for analysis (max 3.5 MB after compression).");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const mime = sniff(bytes);
  if (!mime) throw new ApiError(415, "UNSUPPORTED_TYPE", "Only PNG, JPG and WebP images are supported.");
  const dataUrl = `data:${mime};base64,${Buffer.from(bytes).toString("base64")}`;
  const analysis = await analyzePlotImage(dataUrl, KINDS.includes(kind) ? kind : "photo");
  return ok({ analysis });
});
