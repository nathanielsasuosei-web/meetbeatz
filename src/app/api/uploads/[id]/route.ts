import { getCustomerSession } from "@/lib/customer-auth";
import { abortUpload, completeUpload, getUploadKind, storageMissingMessage, writeChunk } from "@/lib/files";
import { UploadError } from "@/lib/upload-error";
import { isCustomerUploadKind } from "@/lib/upload-rules";

export const dynamic = "force-dynamic";
/** A part is at most 4 MB, and a phone on a slow connection can take a while to deliver it. */
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

function parseId(raw: string): number | null {
  const id = parseInt(raw, 10);
  return Number.isFinite(id) && id > 0 ? id : null;
}

/**
 * Refuses a session that does not belong to an artist slot.
 *
 * Upload ids are sequential, so without this check a signed-in artist could
 * write parts into — or cancel — an in-progress admin upload of a beat master
 * simply by guessing the number next to their own.
 */
async function artistSession(id: number): Promise<Response | null> {
  const kind = await getUploadKind(id);
  if (!kind) return Response.json({ error: "This upload has expired. Please start again." }, { status: 404 });
  if (!isCustomerUploadKind(kind)) return Response.json({ error: "Not your upload." }, { status: 403 });
  return null;
}

/** Stores one part of an artist's upload. `?index=` is the 0-based part number. */
export async function PUT(req: Request, { params }: Params) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Sign in to upload." }, { status: 401 });

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return Response.json({ error: "Unknown upload." }, { status: 404 });

  const refused = await artistSession(id);
  if (refused) return refused;

  const index = parseInt(new URL(req.url).searchParams.get("index") ?? "", 10);
  try {
    const body = Buffer.from(await req.arrayBuffer());
    return Response.json(await writeChunk(id, index, body));
  } catch (err) {
    if (err instanceof UploadError) return Response.json({ error: err.message }, { status: 400 });
    const missing = storageMissingMessage(err);
    if (missing) return Response.json({ error: missing }, { status: 503 });
    console.error("[uploads PUT]", err);
    return Response.json({ error: "Could not save this part of the file. Please try again." }, { status: 500 });
  }
}

/** Finishes the upload and returns the storage path to submit with the form. */
export async function POST(_req: Request, { params }: Params) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Sign in to upload." }, { status: 401 });

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return Response.json({ error: "Unknown upload." }, { status: 404 });

  const refused = await artistSession(id);
  if (refused) return refused;

  try {
    const file = await completeUpload(id);
    return Response.json({ path: file.path, size: file.size, contentType: file.contentType });
  } catch (err) {
    if (err instanceof UploadError) return Response.json({ error: err.message }, { status: 400 });
    const missing = storageMissingMessage(err);
    if (missing) return Response.json({ error: missing }, { status: 503 });
    console.error("[uploads POST complete]", err);
    return Response.json({ error: "Could not finish the upload. Please try again." }, { status: 500 });
  }
}

/** Cancels an upload that never completed (the form was abandoned or a part failed). */
export async function DELETE(_req: Request, { params }: Params) {
  const session = await getCustomerSession();
  if (!session) return Response.json({ error: "Sign in to upload." }, { status: 401 });

  const { id: rawId } = await params;
  const id = parseId(rawId);
  if (!id) return Response.json({ error: "Unknown upload." }, { status: 404 });

  const refused = await artistSession(id);
  if (refused) return refused;

  await abortUpload(id);
  return Response.json({ ok: true });
}
