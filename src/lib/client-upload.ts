import {
  CHUNK_SIZE,
  MIN_CHUNK_SIZE,
  assertUploadAllowed,
  formatBytes,
  type UploadKind,
} from "./upload-rules";

const CHUNK_STORAGE_KEY = "mb-upload-chunk-size";

type UploadProgress = (sent: number, total: number) => void;
type UploadStatus = (message: string) => void;

function readStoredChunkSize(): number {
  try {
    const stored = Number(window.sessionStorage.getItem(CHUNK_STORAGE_KEY));
    if (Number.isFinite(stored) && stored >= MIN_CHUNK_SIZE && stored <= CHUNK_SIZE) return stored;
  } catch {
    // sessionStorage is optional — the upload still works without it.
  }
  return CHUNK_SIZE;
}

function rememberChunkSize(size: number) {
  try {
    window.sessionStorage.setItem(CHUNK_STORAGE_KEY, String(size));
  } catch {
    // Not fatal. The next upload will simply rediscover the safe size.
  }
}

function readJson(text: string): { error?: string; path?: string; id?: number; chunkSize?: number } {
  try {
    return JSON.parse(text) as { error?: string; path?: string; id?: number; chunkSize?: number };
  } catch {
    return {};
  }
}

function isTooLarge(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /\b413\b|too large|payload too large|content too large/i.test(message);
}

function putChunk(sessionId: number, index: number, blob: Blob, onProgress: (loaded: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `/api/admin/uploads/${sessionId}?index=${index}`);
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      const response = readJson(xhr.responseText);
      reject(new Error(response.error ?? `Upload failed (${xhr.status}).`));
    };
    xhr.onerror = () => reject(new Error("Network error while uploading. Check your connection and try again."));
    xhr.send(blob);
  });
}

async function putChunkWithRetry(
  sessionId: number,
  index: number,
  blob: Blob,
  onProgress: (loaded: number) => void,
): Promise<void> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      await putChunk(sessionId, index, blob, onProgress);
      return;
    } catch (error) {
      lastError = error;
      if (isTooLarge(error)) throw error;
      if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 700 * (attempt + 1)));
    }
  }
  throw lastError instanceof Error ? lastError : new Error("Upload failed.");
}

/** Upload one admin file in proxy-safe chunks and return its stored path. */
export async function uploadFileInChunks(
  file: File,
  kind: UploadKind,
  onProgress: UploadProgress,
  onStatus: UploadStatus = () => {},
): Promise<string> {
  assertUploadAllowed(kind, file.name, file.size);
  let partSize = readStoredChunkSize();

  for (;;) {
    const start = await fetch("/api/admin/uploads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: file.name, kind, size: file.size, chunkSize: partSize }),
    });
    const info = readJson(await start.text());
    const sessionId = Number(info.id);
    const chunkSize = Number(info.chunkSize) || partSize;

    if (!start.ok || !sessionId) {
      const error = new Error(info.error ?? `Could not start the upload (${start.status}).`);
      if (isTooLarge(error) && partSize > MIN_CHUNK_SIZE) {
        partSize = Math.max(MIN_CHUNK_SIZE, Math.floor(partSize / 2));
        onStatus(`Preparing ${file.name} in smaller pieces (${formatBytes(partSize)})…`);
        continue;
      }
      throw error;
    }

    try {
      let sent = 0;
      for (let index = 0; sent < file.size; index++) {
        const blob = file.slice(sent, Math.min(sent + chunkSize, file.size));
        const offset = sent;
        await putChunkWithRetry(sessionId, index, blob, (loaded) => onProgress(offset + loaded, file.size));
        sent += blob.size;
        onProgress(sent, file.size);
      }

      const done = await fetch(`/api/admin/uploads/${sessionId}`, { method: "POST" });
      const finished = readJson(await done.text());
      if (!done.ok || !finished.path) {
        throw new Error(finished.error ?? "The file uploaded but could not be saved.");
      }
      rememberChunkSize(chunkSize);
      onProgress(file.size, file.size);
      return finished.path;
    } catch (error) {
      void fetch(`/api/admin/uploads/${sessionId}`, { method: "DELETE" }).catch(() => {});
      const smaller = Math.max(MIN_CHUNK_SIZE, Math.floor(chunkSize / 2));
      if (!isTooLarge(error) || chunkSize <= MIN_CHUNK_SIZE) {
        if (isTooLarge(error)) {
          throw new Error(
            `${file.name} is too large for the upload proxy to accept, even in ${formatBytes(MIN_CHUNK_SIZE)} pieces. ` +
              "Try a smaller file or a deployment with a higher request-body limit.",
          );
        }
        throw error;
      }
      partSize = smaller;
      onProgress(0, file.size);
      onStatus(`Uploading ${file.name} in smaller pieces (${formatBytes(smaller)})…`);
    }
  }
}