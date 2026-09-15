import { Readable } from "stream";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import { and, asc, eq, gte, inArray, lt, lte, sql } from "drizzle-orm";
import { db } from "@/db";
import { storedFileChunks, storedFiles } from "@/db/schema";
import { randomFileName } from "./ids";
import {
  ALLOWED_EXT,
  CHUNK_SIZE,
  MAX_UPLOAD_BYTES,
  assertUploadAllowed,
  isUploadKind,
  type UploadKind,
} from "./upload-rules";
import { UploadError } from "./upload-error";

/**
 * Beat files (covers, previews, masters, stems) are stored **in PostgreSQL**.
 *
 * Why: the app is deployed to Vercel, where the code lives on a read-only
 * filesystem — `mkdir(process.cwd() + "/uploads")` fails with
 * `ENOENT: no such file or directory, mkdir '/var/task/uploads'`, so uploads
 * (and the demo previews written during seeding) could never be saved. The
 * database is the one piece of durable storage the app already has.
 *
 * Each file is split into `CHUNK_SIZE` parts. Writes arrive one part per
 * request because serverless hosts reject request bodies over ~4.5 MB; reads
 * pull only the parts a request needs and slice them in SQL, so serving a
 * 60 MB WAV with a `Range` header never loads 60 MB into memory.
 */

/** Where uploads used to live on disk. Read once, to migrate leftovers (see `importFilesFromDisk`). */
export const UPLOAD_ROOT = path.join(process.cwd(), "uploads");

const MIME: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".aac": "audio/aac",
  ".ogg": "audio/ogg",
  ".aif": "audio/aiff",
  ".aiff": "audio/aiff",
  ".flac": "audio/flac",
  ".zip": "application/zip",
  ".rar": "application/vnd.rar",
  ".7z": "application/x-7z-compressed",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
};

export function contentTypeFor(filePath: string): string {
  return MIME[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

/** How long an abandoned upload (a session that never received its last part) is kept. */
const INCOMPLETE_UPLOAD_TTL_HOURS = 24;
/** Complete files that no beat references are leftovers from abandoned forms. */
const ORPHAN_TTL_DAYS = 7;

/**
 * Turns "relation stored_files does not exist" into something actionable.
 * `npm run build` syncs the schema, so this only appears when a deployment
 * built without a database connection (for example a Vercel preview that only
 * has Production-scoped variables).
 */
export function storageMissingMessage(err: unknown): string | null {
  const message = err instanceof Error ? err.message : String(err);
  if (!/relation "stored_file(_chunks)?" does not exist/i.test(message)) return null;
  return (
    "This database is missing the upload storage tables (stored_files, stored_file_chunks). " +
    "Run `npm run db:push` against it — a deploy normally does this automatically — then try again."
  );
}

export type StoredFileInfo = {
  id: number;
  path: string;
  kind: UploadKind;
  contentType: string;
  size: number;
  chunkSize: number;
  uploadedBytes: number;
  isComplete: boolean;
};

type StoredFileRow = typeof storedFiles.$inferSelect;

function toInfo(row: StoredFileRow): StoredFileInfo {
  return {
    id: row.id,
    path: row.path,
    kind: (isUploadKind(row.kind) ? row.kind : "mp3") as UploadKind,
    contentType: row.contentType,
    size: row.size,
    chunkSize: row.chunkSize > 0 ? row.chunkSize : CHUNK_SIZE,
    uploadedBytes: row.uploadedBytes,
    isComplete: row.isComplete,
  };
}

/** Metadata for a *finished* file, or null. Untrusted paths never reach the database lookup shape. */
export async function getReadyFile(relative: string | null | undefined): Promise<StoredFileInfo | null> {
  if (!relative) return null;
  const [row] = await db.select().from(storedFiles).where(eq(storedFiles.path, relative)).limit(1);
  if (!row || !row.isComplete) return null;
  return toInfo(row);
}

export async function storedFileExists(relative: string | null | undefined): Promise<boolean> {
  return (await getReadyFile(relative)) !== null;
}

async function getUploadById(id: number): Promise<StoredFileRow | null> {
  if (!Number.isFinite(id) || id <= 0) return null;
  const [row] = await db.select().from(storedFiles).where(eq(storedFiles.id, id)).limit(1);
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Writing (admin uploads)
// ---------------------------------------------------------------------------

export type UploadSession = {
  id: number;
  path: string;
  chunkSize: number;
  size: number;
  uploadedBytes: number;
  chunksExpected: number;
};

/**
 * Opens an upload session. Called once per file, before the first part is sent;
 * the returned `id` is used for every part and for the final `complete` call.
 */
export async function createUpload(kind: UploadKind, fileName: string, size: number): Promise<UploadSession> {
  const ext = assertUploadAllowed(kind, fileName, size);
  await collectGarbage();
  const relative = `${kind}/${randomFileName(ext)}`;
  const [row] = await db
    .insert(storedFiles)
    .values({
      path: relative,
      kind,
      contentType: contentTypeFor(relative),
      size: Math.floor(size),
      chunkSize: CHUNK_SIZE,
      uploadedBytes: 0,
      isComplete: false,
    })
    .returning();
  return {
    id: row.id,
    path: row.path,
    chunkSize: CHUNK_SIZE,
    size: row.size,
    uploadedBytes: 0,
    chunksExpected: Math.ceil(row.size / CHUNK_SIZE),
  };
}

/**
 * Stores one part of an upload. Re-sending a part overwrites it, so a dropped
 * request is recoverable by simply retrying it.
 */
export async function writeChunk(
  id: number,
  index: number,
  data: Buffer,
): Promise<{ uploadedBytes: number; size: number; chunksReceived: number; chunksExpected: number }> {
  const row = await getUploadById(id);
  if (!row) throw new UploadError("This upload session has expired or was cancelled. Please try again.");
  if (row.isComplete) throw new UploadError("This file has already finished uploading.");

  const chunkSize = row.chunkSize > 0 ? row.chunkSize : CHUNK_SIZE;
  const chunksExpected = Math.ceil(row.size / chunkSize);
  if (!Number.isInteger(index) || index < 0 || index >= chunksExpected) {
    throw new UploadError(`Part ${index} is outside this file (it has ${chunksExpected} parts).`);
  }
  if (data.length > chunkSize) {
    throw new UploadError(`Part ${index} is larger than the ${Math.round(chunkSize / (1024 * 1024))} MB limit.`);
  }
  const isLast = index === chunksExpected - 1;
  // A short middle part means the request was cut off in transit; storing it
  // would silently corrupt the file, so ask for that part again instead.
  if (!isLast && data.length !== chunkSize) {
    throw new UploadError(`Part ${index} arrived incomplete (${data.length} of ${chunkSize} bytes). Retrying…`);
  }
  if (isLast && data.length !== row.size - index * chunkSize) {
    throw new UploadError(`The last part of this file is the wrong size. Please upload the file again.`);
  }

  await db
    .insert(storedFileChunks)
    .values({ fileId: id, idx: index, data })
    .onConflictDoUpdate({
      target: [storedFileChunks.fileId, storedFileChunks.idx],
      set: { data: sql`excluded.data` },
    });

  // Recomputed from the rows themselves rather than incremented, so a retried
  // part can never inflate the count.
  const [{ received, parts }] = await db
    .select({
      received: sql<number>`COALESCE(SUM(length(${storedFileChunks.data})), 0)::int`,
      parts: sql<number>`COUNT(*)::int`,
    })
    .from(storedFileChunks)
    .where(eq(storedFileChunks.fileId, id));

  await db.update(storedFiles).set({ uploadedBytes: received, updatedAt: new Date() }).where(eq(storedFiles.id, id));
  return { uploadedBytes: received, size: row.size, chunksReceived: parts, chunksExpected };
}

/** Verifies every part is present and correct, then makes the file readable. */
export async function completeUpload(id: number): Promise<StoredFileInfo> {
  const row = await getUploadById(id);
  if (!row) throw new UploadError("This upload session has expired or was cancelled. Please try again.");
  if (row.isComplete) return toInfo(row);

  const chunkSize = row.chunkSize > 0 ? row.chunkSize : CHUNK_SIZE;
  const chunksExpected = Math.ceil(row.size / chunkSize);
  const [{ received, parts, minIdx, maxIdx, shortParts }] = await db
    .select({
      received: sql<number>`COALESCE(SUM(length(${storedFileChunks.data})), 0)::int`,
      parts: sql<number>`COUNT(*)::int`,
      minIdx: sql<number>`COALESCE(MIN(${storedFileChunks.idx}), -1)::int`,
      maxIdx: sql<number>`COALESCE(MAX(${storedFileChunks.idx}), -1)::int`,
      shortParts: sql<number>`COUNT(*) FILTER (WHERE ${storedFileChunks.idx} < ${chunksExpected - 1} AND length(${storedFileChunks.data}) <> ${chunkSize})::int`,
    })
    .from(storedFileChunks)
    .where(eq(storedFileChunks.fileId, id));

  const missing = received < row.size || parts !== chunksExpected || minIdx !== 0 || maxIdx !== chunksExpected - 1 || shortParts > 0;
  if (missing) {
    throw new UploadError(
      `Upload incomplete: ${received} of ${row.size} bytes received. Please try uploading the file again.`,
    );
  }

  const [updated] = await db
    .update(storedFiles)
    .set({ isComplete: true, uploadedBytes: received, size: received, updatedAt: new Date() })
    .where(eq(storedFiles.id, id))
    .returning();
  return toInfo(updated);
}

/** Drops a half-finished upload (its parts cascade with the row). */
export async function abortUpload(id: number): Promise<void> {
  try {
    await db.delete(storedFiles).where(and(eq(storedFiles.id, id), eq(storedFiles.isComplete, false)));
  } catch {
    // nothing to clean up
  }
}

/** Removes a stored file. Used when a beat's file is replaced or the beat is deleted. */
export async function deleteUpload(relative: string | null | undefined): Promise<void> {
  if (!relative || relative.startsWith("/") || relative.startsWith("http")) return;
  try {
    await db.delete(storedFiles).where(eq(storedFiles.path, relative));
  } catch {
    // ignore — the row may already be gone
  }
}

/**
 * Stores a whole buffer in one go (no chunked request). Used by the seed for
 * generated demo previews and by the on-disk import.
 */
export async function putStoredFile(kind: UploadKind, fileName: string, data: Buffer): Promise<string> {
  const relative = `${kind}/${fileName}`;
  await db.delete(storedFiles).where(eq(storedFiles.path, relative));
  const [row] = await db
    .insert(storedFiles)
    .values({
      path: relative,
      kind,
      contentType: contentTypeFor(relative),
      size: data.length,
      chunkSize: CHUNK_SIZE,
      uploadedBytes: data.length,
      isComplete: true,
    })
    .returning();

  for (let offset = 0, index = 0; offset < data.length; offset += CHUNK_SIZE, index++) {
    await db.insert(storedFileChunks).values({ fileId: row.id, idx: index, data: data.subarray(offset, offset + CHUNK_SIZE) });
  }
  return relative;
}

/** Storage hygiene, run opportunistically when an upload starts. Never fatal. */
async function collectGarbage(): Promise<void> {
  try {
    await db.delete(storedFiles).where(
      and(
        eq(storedFiles.isComplete, false),
        lt(storedFiles.updatedAt, sql`now() - make_interval(hours => ${INCOMPLETE_UPLOAD_TTL_HOURS})`),
      ),
    );
    await db.execute(sql`
      DELETE FROM stored_files f
      WHERE f.is_complete = true
        AND f.created_at < now() - make_interval(days => ${ORPHAN_TTL_DAYS})
        AND NOT EXISTS (
          SELECT 1 FROM beats b
          WHERE b.cover_path = f.path
             OR b.preview_path = f.path
             OR b.mp3_path = f.path
             OR b.wav_path = f.path
             OR b.stems_path = f.path
        )
    `);
  } catch (err) {
    console.warn("[storage] cleanup skipped:", err instanceof Error ? err.message : err);
  }
}

// ---------------------------------------------------------------------------
// Legacy migration: files written to ./uploads before this change
// ---------------------------------------------------------------------------

/**
 * Copies files that sit in `./uploads` into the database, for deployments that
 * were running the old disk-backed version (a VPS, or local development).
 * Paths already in the database are left untouched; on a serverless host the
 * folder does not exist, so this is a no-op.
 */
export async function importFilesFromDisk(relativePaths: Iterable<string>): Promise<number> {
  const wanted = [...new Set(relativePaths)].filter(
    (rel) => !!rel && !rel.startsWith("/") && !rel.startsWith("http") && rel.split("/").length === 2,
  );
  if (!wanted.length || !fs.existsSync(UPLOAD_ROOT)) return 0;

  const existing = new Set(
    (
      await db
        .select({ path: storedFiles.path })
        .from(storedFiles)
        .where(inArray(storedFiles.path, wanted))
    ).map((r) => r.path),
  );

  let imported = 0;
  for (const rel of wanted) {
    if (existing.has(rel)) continue;
    const kind = rel.split("/")[0];
    if (!isUploadKind(kind)) continue;
    const abs = path.resolve(UPLOAD_ROOT, rel);
    if (!abs.startsWith(UPLOAD_ROOT + path.sep) || !fs.existsSync(abs)) continue;
    try {
      const data = await fsp.readFile(abs);
      if (!data.length) continue;
      await putStoredFile(kind, path.basename(rel), data);
      imported++;
    } catch (err) {
      console.warn(`[storage] could not import uploads/${rel}:`, err instanceof Error ? err.message : err);
    }
  }
  return imported;
}

// ---------------------------------------------------------------------------
// Reading (API responses)
// ---------------------------------------------------------------------------

type FileResponseOptions = {
  downloadName?: string;
  rangeHeader?: string | null;
  cache?: boolean;
};

function parseRange(header: string | null | undefined, total: number): { start: number; end: number } | "invalid" | null {
  if (!header) return null;
  if (!/^bytes=\d*-\d*$/.test(header)) return "invalid";
  const [startStr, endStr] = header.replace("bytes=", "").split("-");
  let start = startStr ? parseInt(startStr, 10) : 0;
  let end = endStr ? parseInt(endStr, 10) : total - 1;
  if (Number.isNaN(start)) start = 0;
  if (Number.isNaN(end) || end >= total) end = total - 1;
  if (total === 0 || start > end || start >= total) return "invalid";
  return { start, end };
}

/** Yields the bytes of `[start, end]` (inclusive), one stored part at a time. */
async function* readRange(file: StoredFileInfo, start: number, end: number): AsyncGenerator<Buffer> {
  const chunkSize = file.chunkSize;
  const first = Math.floor(start / chunkSize);
  const last = Math.floor(end / chunkSize);
  const BATCH = 8; // ~32 MB per query; keeps memory flat on large masters

  for (let low = first; low <= last; low += BATCH) {
    const high = Math.min(last, low + BATCH - 1);
    // Slice inside SQL: a request for `bytes=0-1023` of a 60 MB WAV reads 1 KB,
    // not the first 4 MB part.
    const from = sql<number>`(greatest(${start}::int, ${storedFileChunks.idx} * ${chunkSize}::int) - ${storedFileChunks.idx} * ${chunkSize}::int) + 1`;
    const length = sql<number>`(least(${end + 1}::int, (${storedFileChunks.idx} + 1) * ${chunkSize}::int) - greatest(${start}::int, ${storedFileChunks.idx} * ${chunkSize}::int))`;
    const rows = await db
      .select({
        idx: storedFileChunks.idx,
        data: sql<Buffer>`substring(${storedFileChunks.data} from ${from} for ${length})`,
      })
      .from(storedFileChunks)
      .where(and(eq(storedFileChunks.fileId, file.id), gte(storedFileChunks.idx, low), lte(storedFileChunks.idx, high)))
      .orderBy(asc(storedFileChunks.idx));

    if (rows.length !== high - low + 1) {
      // Only possible if a part vanished mid-upload; fail loudly instead of
      // handing the buyer a truncated master.
      throw new Error(`Stored file ${file.path} is missing part of its data.`);
    }
    for (const row of rows) yield Buffer.isBuffer(row.data) ? row.data : Buffer.from(row.data);
  }
}

/** Streams a stored file with HTTP Range support (audio scrubbing, resumable downloads). */
export async function storedFileResponse(relative: string, opts: FileResponseOptions = {}): Promise<Response> {
  const file = await getReadyFile(relative);
  if (!file) return new Response("Not found", { status: 404 });

  const total = file.size;
  const headers = new Headers({
    "Content-Type": file.contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": opts.cache ? "public, max-age=31536000, immutable" : "private, no-store",
  });
  if (opts.downloadName) {
    headers.set("Content-Disposition", `attachment; filename="${opts.downloadName.replace(/[^\w.\- ]+/g, "_")}"`);
  }

  const range = parseRange(opts.rangeHeader, total);
  if (range === "invalid") {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
  }
  if (total === 0) {
    headers.set("Content-Length", "0");
    return new Response(null, { status: 200, headers });
  }

  const start = range ? range.start : 0;
  const end = range ? range.end : total - 1;
  headers.set("Content-Length", String(end - start + 1));
  if (range) headers.set("Content-Range", `bytes ${start}-${end}/${total}`);

  const stream = Readable.toWeb(Readable.from(readRange(file, start, end))) as ReadableStream;
  return new Response(stream, { status: range ? 206 : 200, headers });
}

export { UploadError };
export type { UploadKind };
export { ALLOWED_EXT, CHUNK_SIZE, MAX_UPLOAD_BYTES };
