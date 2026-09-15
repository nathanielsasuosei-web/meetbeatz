/**
 * Rules shared by the admin upload form (browser) and the upload API (server).
 *
 * Nothing here may import `fs`, `@/db` or anything else server-only: the beat
 * form is a client component and imports this file directly, so the browser
 * rejects a wrong file type or an oversized file before a single byte is sent,
 * while the server re-checks the same table and stays the source of truth.
 */
import { UploadError } from "./upload-error";

export type UploadKind = "covers" | "previews" | "mp3" | "wav" | "stems";

export const UPLOAD_KINDS: UploadKind[] = ["covers", "previews", "mp3", "wav", "stems"];

export const ALLOWED_EXT: Record<UploadKind, string[]> = {
  covers: [".jpg", ".jpeg", ".png", ".webp"],
  previews: [".mp3", ".wav", ".m4a", ".ogg", ".aac"],
  mp3: [".mp3", ".m4a", ".wav", ".aac"],
  wav: [".wav", ".aif", ".aiff", ".flac", ".zip"],
  stems: [".zip", ".rar", ".7z"],
};

/**
 * Uploads travel in parts of this size. Vercel (and most serverless hosts)
 * rejects request bodies over 4.5 MB, so a 60 MB WAV is sent as 15 requests.
 */
export const CHUNK_SIZE = 4 * 1024 * 1024;

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
