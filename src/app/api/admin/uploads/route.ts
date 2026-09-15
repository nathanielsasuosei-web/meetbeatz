import { getAdminSession } from "@/lib/auth";
import { createUpload, storageMissingMessage } from "@/lib/files";
import { isUploadKind } from "@/lib/upload-rules";
import { UploadError } from "@/lib/upload-error";

export const dynamic = "force-dynamic";

/**
 * Opens an upload session for one file.
 *
 * Beat files are stored in PostgreSQL, so they cannot be posted as a single
 * multipart form the way they used to be: serverless hosts cap a request body
 * at 4.5 MB. The browser asks for a session here, sends the file in ~4 MB parts
 * to `/api/admin/uploads/[id]`, then completes it and submits the returned
 * storage path with the rest of the beat's fields.
 */
export async function POST(req: Request) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = (await req.json()) as { name?: string; kind?: string; size?: number; chunkSize?: number };
    const kind = String(body.kind ?? "");
    if (!isUploadKind(kind)) {
      return Response.json({ error: `Unknown file slot "${kind}".` }, { status: 400 });
    }
    const name = String(body.name ?? "");
    const size = Number(body.size ?? 0);
    // The client may ask for smaller parts when a proxy in front of the app
    // rejects large bodies with 413 (this app's own preview gateway does).
    const upload = await createUpload(kind, name, size, body.chunkSize);
    return Response.json(upload);
  } catch (err) {
    if (err instanceof UploadError) return Response.json({ error: err.message }, { status: 400 });
    const missing = storageMissingMessage(err);
    if (missing) return Response.json({ error: missing }, { status: 503 });
    console.error("[admin/uploads POST]", err);
    return Response.json({ error: "Could not start the upload. Please try again." }, { status: 500 });
  }
}
