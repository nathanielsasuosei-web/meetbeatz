/**
 * Rules shared by the admin upload form (browser) and the upload API (server).
 *
 * Nothing here may import `fs`, `@/db` or anything else server-only: the beat
 * form is a client component and imports this file directly, so the browser
 * rejects a wrong file type or an oversized file before a single byte is sent,
 * while the server re-checks the same table and stays the source of truth.
 */
import { UploadError } from "./upload-error";

export type UploadKind =
  | "covers"
  | "previews"
  | "videos"
  | "mp3"
  | "wav"
  | "stems"
  | "sound-kits"
  // Voice notes and audio messages in the artist ↔ producer chat.
  | "chat-audio"
  // Artist-facing slots (see CUSTOMER_UPLOAD_KINDS): release artwork, the
  // finished master submitted for distribution, and a take recorded in the
  // browser studio. Same storage, different callers.
  | "artwork"
  | "masters"
  | "takes";

export const UPLOAD_KINDS: UploadKind[] = [
  "covers",
  "previews",
  "videos",
  "mp3",
  "wav",
  "stems",
  "sound-kits",
  "chat-audio",
  "artwork",
  "masters",
  "takes",
];

/**
 * The slots a signed-in artist may upload to through `/api/uploads`. Everything
 * else is admin-only: without this list the public upload route would let any
 * visitor write into the beat master or stem slots.
 *
 * `chat-audio` is deliberately *not* here. Voice notes go through
 * `/api/admin/uploads`, which carves out an explicit exception for that one kind
 * so both sides of the chat can send one; routing it here as well would let a
 * signed-in artist complete or cancel somebody else's in-flight voice note,
 * because upload ids are sequential.
 */
export const CUSTOMER_UPLOAD_KINDS: UploadKind[] = ["artwork", "masters", "takes"];

export function isCustomerUploadKind(value: string): value is UploadKind {
  return (CUSTOMER_UPLOAD_KINDS as string[]).includes(value);
}

export const ALLOWED_EXT: Record<UploadKind, string[]> = {
  covers: [".jpg", ".jpeg", ".png", ".webp"],
  previews: [".mp3", ".wav", ".m4a", ".ogg", ".aac"],
  videos: [".mp4", ".webm", ".mov", ".m4v"],
  mp3: [".mp3", ".m4a", ".wav", ".aac"],
  wav: [".wav", ".aif", ".aiff", ".flac", ".zip"],
  stems: [".zip", ".rar", ".7z"],
  "sound-kits": [".zip", ".rar", ".7z"],
  "chat-audio": [".webm", ".ogg", ".m4a", ".mp3", ".wav", ".aac", ".flac", ".aif", ".aiff", ".mp4", ".opus"],
  artwork: [".jpg", ".jpeg", ".png", ".webp"],
  // Only formats a distributor can ingest. The browser studio always encodes
  // WAV, so no container-dependent types (webm/ogg) are accepted here — a voice
  // note is a different job and has its own slot above.
  masters: [".wav", ".flac", ".mp3", ".aif", ".aiff", ".m4a"],
  takes: [".wav", ".mp3", ".m4a", ".flac"],
};

/**
 * Uploads travel in parts of this size. Vercel (and most serverless hosts)
 * rejects request bodies over 4.5 MB, so a 60 MB WAV is sent as 15 requests.
 */
export const CHUNK_SIZE = 4 * 1024 * 1024;

/**
 * Smallest part the browser will fall back to.
 *
 * Not every host allows 4 MB: a reverse proxy in front of the app (the
 * gateway that fronts a preview deployment, Cloudflare, nginx with its 1 MB
 * default) can answer 413 long before the app sees the request. The browser
 * then retries the file with smaller parts, and this is as small as it goes.
 */
export const MIN_CHUNK_SIZE = 128 * 1024;

/** Clamps a part size requested by the browser to something storage can honour. */
export function clampChunkSize(requested: unknown): number {
  const value = Math.floor(Number(requested));
  if (!Number.isFinite(value) || value <= 0) return CHUNK_SIZE;
  return Math.min(CHUNK_SIZE, Math.max(MIN_CHUNK_SIZE, value));
}

/** Ceiling per file. Everything lives in Postgres, so this is a storage decision. */
export const MAX_UPLOAD_BYTES = 512 * 1024 * 1024;

export function isUploadKind(value: string): value is UploadKind {
  return (UPLOAD_KINDS as string[]).includes(value);
}

export function extensionOf(fileName: string): string {
  const dot = fileName.lastIndexOf(".");
  if (dot <= 0) return "";
  return fileName.slice(dot).toLowerCase();
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function allowedExtensionsLabel(kind: UploadKind): string {
  return ALLOWED_EXT[kind].map((e) => e.replace(".", "").toUpperCase()).join(", ");
}

/** Throws an `UploadError` (which the API routes turn into a 400) when a file is not acceptable. */
export function assertUploadAllowed(kind: UploadKind, fileName: string, size: number): string {
  const ext = extensionOf(fileName);
  if (!ALLOWED_EXT[kind].includes(ext)) {
    throw new UploadError(`Unsupported file type "${ext || "unknown"}". Allowed: ${allowedExtensionsLabel(kind)}.`);
  }
  if (!Number.isFinite(size) || size <= 0) {
    throw new UploadError("The selected file is empty.");
  }
  if (size > MAX_UPLOAD_BYTES) {
    throw new UploadError(`Files must be ${formatBytes(MAX_UPLOAD_BYTES)} or smaller — this one is ${formatBytes(size)}.`);
  }
  return ext;
}
