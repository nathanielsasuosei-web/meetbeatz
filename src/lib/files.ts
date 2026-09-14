import fs from "fs";
import fsp from "fs/promises";
import os from "os";
import path from "path";
import { Readable } from "stream";
import { randomFileName } from "./ids";

/** Where uploaded files live. Override with UPLOAD_DIR (useful on a VPS or in tests). */
export const UPLOAD_ROOT = process.env.UPLOAD_DIR?.trim()
  ? path.resolve(process.env.UPLOAD_DIR.trim())
  : path.join(process.cwd(), "uploads");

export const UPLOAD_STORAGE_HELP =
  "Read-only filesystem: uploaded files cannot be stored on this host. " +
  "Set UPLOAD_DIR to a writable path (e.g. /tmp/uploads) or move uploads to object " +
  "storage (Cloudinary, S3, R2). Demo beats keep working — their audio is generated on the fly.";

function writable(dir: string): boolean {
  try {
    fs.mkdirSync(dir, { recursive: true });
    fs.accessSync(dir, fs.constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

let cachedWritable: boolean | null = null;

/** True when uploads can be written to disk (false on read-only serverless hosts). */
export function uploadsWritable(): boolean {
  if (cachedWritable === null) cachedWritable = writable(UPLOAD_ROOT);
  return cachedWritable;
}

/** Folder used for temporary files on hosts with a read-only working directory. */
export function tempUploadRoot(): string {
  return path.join(os.tmpdir(), "meetbeatz-uploads");
}

export type UploadKind = "covers" | "previews" | "mp3" | "wav" | "stems";

const ALLOWED_EXT: Record<UploadKind, string[]> = {
  covers: [".jpg", ".jpeg", ".png", ".webp"],
  previews: [".mp3", ".wav", ".m4a", ".ogg", ".aac"],
  mp3: [".mp3", ".m4a", ".wav", ".aac"],
  wav: [".wav", ".aif", ".aiff", ".flac", ".zip"],
  stems: [".zip", ".rar", ".7z"],
};

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

export async function ensureUploadDir(kind: UploadKind): Promise<string> {
  const root = uploadsWritable() ? UPLOAD_ROOT : tempUploadRoot();
  const dir = path.join(root, kind);
  try {
    await fsp.mkdir(dir, { recursive: true });
  } catch (err) {
    throw new Error(`${UPLOAD_STORAGE_HELP} (${(err as Error).message})`);
  }
  if (!uploadsWritable()) {
    throw new Error(UPLOAD_STORAGE_HELP);
  }
  return dir;
}

export function isValidUpload(file: File | null | undefined): file is File {
  return !!file && typeof file === "object" && "arrayBuffer" in file && file.size > 0;
}

/** Saves a browser File to disk and returns the relative path (e.g. `mp3/abc.mp3`). */
export async function saveUpload(file: File, kind: UploadKind): Promise<string> {
  const ext = path.extname(file.name || "").toLowerCase();
  if (!ALLOWED_EXT[kind].includes(ext)) {
    throw new Error(`Unsupported ${kind} file type "${ext || "unknown"}". Allowed: ${ALLOWED_EXT[kind].join(", ")}`);
  }
  const dir = await ensureUploadDir(kind);
  const name = randomFileName(ext);
  const buffer = Buffer.from(await file.arrayBuffer());
  await fsp.writeFile(path.join(dir, name), buffer);
  return `${kind}/${name}`;
}

/** Writes raw bytes into the uploads folder (used for demo assets). */
export async function writeUploadBuffer(kind: UploadKind, fileName: string, data: Buffer): Promise<string> {
  const dir = await ensureUploadDir(kind);
  await fsp.writeFile(path.join(dir, fileName), data);
  return `${kind}/${fileName}`;
}

/** Resolves a stored relative path to an absolute path, guarding against traversal. */
export function resolveUpload(relative: string | null | undefined): string | null {
  if (!relative) return null;
  // Look in uploads first, then in the temp folder used on read-only hosts.
  for (const root of [UPLOAD_ROOT, tempUploadRoot()]) {
    const abs = path.resolve(root, relative);
    if (!abs.startsWith(root + path.sep)) continue;
    if (fs.existsSync(abs)) return abs;
  }
  return null;
}

export async function deleteUpload(relative: string | null | undefined) {
  const abs = resolveUpload(relative);
  if (!abs) return;
  try {
    await fsp.unlink(abs);
  } catch {
    // ignore
  }
}

type FileResponseOptions = {
  downloadName?: string;
  rangeHeader?: string | null;
  cache?: boolean;
};

/** Streams a file with HTTP Range support (needed for audio scrubbing). */
export function fileResponse(absPath: string, opts: FileResponseOptions = {}): Response {
  const stat = fs.statSync(absPath);
  const total = stat.size;
  const type = contentTypeFor(absPath);
  const headers = new Headers({
    "Content-Type": type,
    "Accept-Ranges": "bytes",
    "Cache-Control": opts.cache ? "public, max-age=31536000, immutable" : "private, no-store",
  });
  if (opts.downloadName) {
    headers.set(
      "Content-Disposition",
      `attachment; filename="${opts.downloadName.replace(/[^\w.\- ]+/g, "_")}"`,
    );
  }

  const range = opts.rangeHeader;
  if (range && /^bytes=\d*-\d*$/.test(range)) {
    const [startStr, endStr] = range.replace("bytes=", "").split("-");
    let start = startStr ? parseInt(startStr, 10) : 0;
    let end = endStr ? parseInt(endStr, 10) : total - 1;
    if (Number.isNaN(start)) start = 0;
    if (Number.isNaN(end) || end >= total) end = total - 1;
    if (start > end || start >= total) {
      return new Response(null, {
        status: 416,
        headers: { "Content-Range": `bytes */${total}` },
      });
    }
    headers.set("Content-Range", `bytes ${start}-${end}/${total}`);
    headers.set("Content-Length", String(end - start + 1));
    const stream = Readable.toWeb(fs.createReadStream(absPath, { start, end })) as ReadableStream;
    return new Response(stream, { status: 206, headers });
  }

  headers.set("Content-Length", String(total));
  const stream = Readable.toWeb(fs.createReadStream(absPath)) as ReadableStream;
  return new Response(stream, { status: 200, headers });
}
