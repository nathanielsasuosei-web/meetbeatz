import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { beatLicenses, beats, licenseTypes } from "@/db/schema";
import { deleteUpload, isValidUpload, saveUpload, type UploadKind } from "./files";
import { slugify } from "./format";

export class UploadError extends Error {}

function str(fd: FormData, key: string): string {
  const v = fd.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export async function uniqueSlug(title: string, excludeId?: number): Promise<string> {
  const base = slugify(title) || `beat-${Date.now().toString(36)}`;
  let slug = base;
  for (let i = 2; i < 100; i++) {
    const clash = await db
      .select({ id: beats.id })
      .from(beats)
      .where(excludeId ? and(eq(beats.slug, slug), ne(beats.id, excludeId)) : eq(beats.slug, slug))
      .limit(1);
    if (!clash.length) return slug;
    slug = `${base}-${i}`;
  }
  return `${base}-${Date.now().toString(36)}`;
}

export function parseBeatFields(fd: FormData) {
  const title = str(fd, "title");
  if (title.length < 2) throw new UploadError("Please give the beat a title.");
  const bpmRaw = parseInt(str(fd, "bpm"), 10);
  return {
    title,
    genre: str(fd, "genre"),
    mood: str(fd, "mood"),
    bpm: Number.isFinite(bpmRaw) && bpmRaw > 0 ? bpmRaw : null,
    musicalKey: str(fd, "musicalKey"),
    tags: str(fd, "tags"),
    description: str(fd, "description"),
    isPublished: fd.get("isPublished") === "on" || fd.get("isPublished") === "true",
    isFeatured: fd.get("isFeatured") === "on" || fd.get("isFeatured") === "true",
  };
}

const FILE_KINDS: { field: string; kind: UploadKind; column: "coverPath" | "previewPath" | "mp3Path" | "wavPath" | "stemsPath" }[] = [
  { field: "cover", kind: "covers", column: "coverPath" },
  { field: "preview", kind: "previews", column: "previewPath" },
  { field: "mp3", kind: "mp3", column: "mp3Path" },
  { field: "wav", kind: "wav", column: "wavPath" },
  { field: "stems", kind: "stems", column: "stemsPath" },
];

/** Saves any uploaded files and returns a partial column map. */
export async function saveBeatFiles(fd: FormData): Promise<Partial<Record<(typeof FILE_KINDS)[number]["column"], string>>> {
  const saved: Partial<Record<(typeof FILE_KINDS)[number]["column"], string>> = {};
  try {
    for (const f of FILE_KINDS) {
      const file = fd.get(f.field);
      if (isValidUpload(file as File | null)) {
        saved[f.column] = await saveUpload(file as File, f.kind);
      }
    }
  } catch (err) {
    for (const p of Object.values(saved)) await deleteUpload(p);
    throw new UploadError(err instanceof Error ? err.message : "File upload failed.");
  }
  return saved;
}

export async function syncBeatPrices(beatId: number, fd: FormData) {
  const types = await db.select().from(licenseTypes);
  await db.delete(beatLicenses).where(eq(beatLicenses.beatId, beatId));
  const values = types
    .map((t) => {
      const enabled = str(fd, `enabled_${t.id}`);
      const price = parseFloat(str(fd, `price_${t.id}`));
      if (enabled === "" && !Number.isFinite(price)) return null;
      return {
        beatId,
        licenseTypeId: t.id,
        price: (Number.isFinite(price) ? Math.max(0, price) : Number(t.defaultPrice)).toFixed(2),
        isEnabled: enabled === "1" || enabled === "on" || enabled === "true",
      };
    })
    .filter((v): v is NonNullable<typeof v> => v !== null);
  if (values.length) await db.insert(beatLicenses).values(values);
}

export async function removeOldFiles(
  old: { coverPath: string | null; previewPath: string | null; mp3Path: string | null; wavPath: string | null; stemsPath: string | null },
  replaced: Partial<Record<string, string>>,
) {
  for (const [column, newPath] of Object.entries(replaced)) {
    const prev = (old as Record<string, string | null>)[column];
    if (newPath && prev && !prev.startsWith("/") && !prev.startsWith("previews/demo-")) {
      await deleteUpload(prev);
    }
  }
}
