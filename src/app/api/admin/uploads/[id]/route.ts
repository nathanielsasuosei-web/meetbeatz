import { getAdminSession } from "@/lib/auth";
import { abortUpload, completeUpload, storageMissingMessage, writeChunk } from "@/lib/files";
import { UploadError } from "@/lib/upload-error";

export const dynamic = "force-dynamic";
/** A part is at most 4 MB, but a slow mobile connection can take a while to deliver it. */
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/** Stores one part of an upload. `?index=` is the 0-based part number. */
export async function PUT(req: Request, { params }: Params) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return Response.json({ error: "Unknown upload." }, { status: 404 });

  const index = parseInt(new URL(req.url).searchParams.get("index") ?? "", 10);
  try {
    const body = Buffer.from(await req.arrayBuffer());
    const result = await writeChunk(id, index, body);
    return Response.json(result);
  } catch (err) {
    if (err instanceof UploadError) return Response.json({ error: err.message }, { status: 400 });
    const missing = storageMissingMessage(err);
    if (missing) return Response.json({ error: missing }, { status: 503 });
    console.error("[admin/uploads PUT]", err);
    return Response.json({ error: "Could not save this part of the file. Please try again." }, { status: 500 });
  }
}

/** Finishes an upload and returns the storage path to attach to the beat. */
export async function POST(_req: Request, { params }: Params) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return Response.json({ error: "Unknown upload." }, { status: 404 });

  try {
    const file = await completeUpload(id);
    return Response.json({ path: file.path, size: file.size, contentType: file.contentType });
  } catch (err) {
    if (err instanceof UploadError) return Response.json({ error: err.message }, { status: 400 });
    const missing = storageMissingMessage(err);
    if (missing) return Response.json({ error: missing }, { status: 503 });
    console.error("[admin/uploads POST complete]", err);
    return Response.json({ error: "Could not finish the upload. Please try again." }, { status: 500 });
  }
}

/** Cancels an upload that never completed (the form was abandoned or a part failed). */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await getAdminSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return Response.json({ error: "Unknown upload." }, { status: 404 });

  await abortUpload(id);
  return Response.json({ ok: true });
}
