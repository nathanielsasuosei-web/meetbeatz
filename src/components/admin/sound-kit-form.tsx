"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { uploadFileInChunks } from "@/lib/client-upload";
import { assertUploadAllowed, formatBytes } from "@/lib/upload-rules";

export function SoundKitForm() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [progressLabel, setProgressLabel] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = event.currentTarget;
    const name = String(new FormData(form).get("name") ?? "").trim();
    const input = form.elements.namedItem("file");
    const file = input instanceof HTMLInputElement ? input.files?.[0] : undefined;

    if (!name) {
      setError("Give the sound kit a name before uploading it.");
      return;
    }
    if (!file) {
      setError("Choose a ZIP, RAR or 7Z sound kit to upload.");
      return;
    }

    try {
      assertUploadAllowed("sound-kits", file.name, file.size);
      setProgress(0);
      setProgressLabel(`Uploading ${file.name} (${formatBytes(file.size)})`);
      const filePath = await uploadFileInChunks(
        file,
        "sound-kits",
        (sent, total) => setProgress(Math.min(99, Math.round((sent / total) * 100))),
        setProgressLabel,
      );

      setProgressLabel("Saving sound kit…");
      const payload = new FormData(form);
      payload.delete("file");
      payload.set("filePath", filePath);
      payload.set("fileName", file.name);

      const response = await fetch("/api/admin/sound-kits", { method: "POST", body: payload });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error ?? `Could not save the sound kit (${response.status}).`);

      router.push(`/admin/sound-kits?msg=${encodeURIComponent("Sound kit uploaded.")}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sound kit upload failed.");
    } finally {
      setProgress(null);
      setProgressLabel("");
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className="card space-y-5 p-5">
      <div>
        <p className="eyebrow">New upload</p>
        <h2 className="mt-1 text-xl font-bold">Upload a sound kit</h2>
        <p className="mt-1 text-sm text-muted">Add a kit archive and give it the name customers or your team will recognise.</p>
      </div>

      <div>
        <label className="label" htmlFor="sound-kit-name">Sound kit name</label>
        <input id="sound-kit-name" name="name" className="field" maxLength={120} placeholder="e.g. Afrobeats Essentials Vol. 1" required />
      </div>

      <div>
        <label className="label" htmlFor="sound-kit-description">Description <span className="normal-case text-muted">(optional)</span></label>
        <textarea
          id="sound-kit-description"
          name="description"
          className="field min-h-24"
          maxLength={500}
          placeholder="What is inside this kit?"
        />
      </div>

      <div>
        <label className="label" htmlFor="sound-kit-file">Sound kit file</label>
        <input
          id="sound-kit-file"
          name="file"
          type="file"
          accept=".zip,.rar,.7z"
          className="field file:mr-3 file:rounded-full file:border-0 file:bg-acid file:px-3 file:py-1 file:text-xs file:font-bold file:text-ink"
          required
        />
        <p className="mt-1 text-[11px] text-muted">ZIP, RAR or 7Z · maximum 512 MB. Large kits upload in safe pieces.</p>
      </div>

      {error && (
        <p className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger" role="alert">
          {error}
        </p>
      )}

      {progress !== null && (
        <div aria-live="polite" className="rounded-xl border border-acid/25 bg-acid/5 p-4">
          <div className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate text-muted">{progressLabel || "Uploading…"}</span>
            <span className="shrink-0 font-bold text-acid">{progress}%</span>
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-white/10">
            <div className="h-full rounded-full bg-acid transition-[width]" style={{ width: `${progress}%` }} />
          </div>
        </div>
      )}

      <button type="submit" className="btn-primary !px-6 !py-3" disabled={progress !== null}>
        {progress === null ? "Upload sound kit" : "Uploading…"}
      </button>
    </form>
  );
}