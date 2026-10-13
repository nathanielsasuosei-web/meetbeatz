import { getCustomerSession } from "@/lib/customer-auth";
import { createUpload, storageMissingMessage } from "@/lib/files";
import { UploadError } from "@/lib/upload-error";
import { isCustomerUploadKind } from "@/lib/upload-rules";

export const dynamic = "force-dynamic";

/**
 * Opens an upload session for a signed-in artist.
 *
 * This is the artist-facing twin of `/api/admin/uploads`: same chunked storage
 * (files live in PostgreSQL, so a body over ~4.5 MB has to arrive in parts),
 * but it only accepts the slots an artist legitimately fills — release artwork,
 * a finished master for distribution, and a take from the browser studio. The
 * admin-only slots (beat masters, stems, covers, sound kits) are refused here so
 * the public route can never be used to write into the store's own catalogue.
 *
 * Sign-in is required for the same reason: anonymous uploads would be free,
 * unattributed storage.
 */
export async function POST(req: Request) {
  const session = await getCustomerSession();
  if (!session) {
    return Response.json({ error: "Sign in to upload — it takes a minute and your files stay on your account." }, { status: 401 });
  }

  try {
    const body = (await req.json().catch(() => ({}))) as { name?: string; kind?: string; size?: number; chunkSize?: number };
    const kind = String(body.kind ?? "");
    if (!isCustomerUploadKind(kind)) {
      return Response.json({ error: `Unknown file slot "${kind}".` }, { status: 400 });
    }
    const name = String(body.name ?? "");
    const size = Number(body.size ?? 0);
    const upload = await createUpload(kind, name, size, body.chunkSize);
    return Response.json(upload);
  } catch (err) {
    if (err instanceof UploadError) return Response.json({ error: err.message }, { status: 400 });
    const missing = storageMissingMessage(err);
    if (missing) return Response.json({ error: missing }, { status: 503 });
    console.error("[uploads POST]", err);
    return Response.json({ error: "Could not start the upload. Please try again." }, { status: 500 });
  }
}
