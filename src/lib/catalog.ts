import { and, asc, desc, eq, ilike, min, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { beatLicenses, beats, licenseTypes, services, type Beat } from "@/db/schema";
import { coverUrl, num } from "./format";

export type BeatCardData = {
  id: number;
  slug: string;
  title: string;
  genre: string;
  mood: string;
  bpm: number | null;
  musicalKey: string;
  tags: string;
  cover: string | null;
  previewUrl: string;
  priceFrom: number | null;
  isDemo: boolean;
  isFeatured: boolean;
  exclusiveSold: boolean;
  createdAt: string;
};

export function toCard(beat: Beat, priceFrom: string | number | null): BeatCardData {
  return {
    id: beat.id,
    slug: beat.slug,
    title: beat.title,
    genre: beat.genre,
    mood: beat.mood,
    bpm: beat.bpm,
    musicalKey: beat.musicalKey,
    tags: beat.tags,
    cover: coverUrl(beat.coverPath),
    previewUrl: `/api/beats/${beat.id}/preview`,
    priceFrom: priceFrom === null ? null : num(priceFrom),
    isDemo: beat.isDemo,
    isFeatured: beat.isFeatured,
    exclusiveSold: beat.exclusiveSold,
    createdAt: beat.createdAt.toISOString(),
  };
}

export async function listBeats(opts: { q?: string; genre?: string; featured?: boolean; limit?: number } = {}) {
  const priceSub = db
    .select({
      beatId: beatLicenses.beatId,
      priceFrom: min(beatLicenses.price).as("price_from"),
    })
    .from(beatLicenses)
    .where(eq(beatLicenses.isEnabled, true))
    .groupBy(beatLicenses.beatId)
    .as("mp");

  const conditions = [eq(beats.isPublished, true)];
  if (opts.featured) conditions.push(eq(beats.isFeatured, true));
  if (opts.genre) conditions.push(ilike(beats.genre, `%${opts.genre}%`));
  if (opts.q) {
    const like = `%${opts.q}%`;
    conditions.push(
      or(ilike(beats.title, like), ilike(beats.tags, like), ilike(beats.genre, like), ilike(beats.mood, like), ilike(beats.musicalKey, like))!,
    );
  }

  const rows = await db
    .select({ beat: beats, priceFrom: priceSub.priceFrom })
    .from(beats)
    .leftJoin(priceSub, eq(priceSub.beatId, beats.id))
    .where(and(...conditions))
    .orderBy(desc(beats.isFeatured), desc(beats.createdAt))
    .limit(opts.limit ?? 200);

  return rows.map((r) => toCard(r.beat, r.priceFrom));
}

export async function listGenres(): Promise<string[]> {
  const rows = await db
    .selectDistinct({ genre: beats.genre })
    .from(beats)
    .where(and(eq(beats.isPublished, true), sql`${beats.genre} <> ''`))
    .orderBy(asc(beats.genre));
  return rows.map((r) => r.genre);
}

export type BeatLicenseOption = {
  id: number;
  name: string;
  slug: string;
  tagline: string;
  description: string;
  terms: string;
  deliverables: string;
  isExclusive: boolean;
  price: number;
  sortOrder: number;
};

export async function getBeatBySlug(slug: string): Promise<{ beat: Beat; licenses: BeatLicenseOption[] } | null> {
  const [beat] = await db.select().from(beats).where(eq(beats.slug, slug)).limit(1);
  if (!beat) return null;
  const rows = await db
    .select({ bl: beatLicenses, lt: licenseTypes })
    .from(beatLicenses)
    .innerJoin(licenseTypes, eq(beatLicenses.licenseTypeId, licenseTypes.id))
    .where(and(eq(beatLicenses.beatId, beat.id), eq(beatLicenses.isEnabled, true), eq(licenseTypes.isActive, true)))
    .orderBy(asc(licenseTypes.sortOrder));
  return {
    beat,
    licenses: rows.map((r) => ({
      id: r.lt.id,
      name: r.lt.name,
      slug: r.lt.slug,
      tagline: r.lt.tagline,
      description: r.lt.description,
      terms: r.lt.terms,
      deliverables: r.lt.deliverables,
      isExclusive: r.lt.isExclusive,
      price: num(r.bl.price),
      sortOrder: r.lt.sortOrder,
    })),
  };
}

export async function listActiveServices() {
  return db.select().from(services).where(eq(services.isActive, true)).orderBy(asc(services.sortOrder), asc(services.id));
}

export async function listLicenseTypes(activeOnly = true) {
  const query = db.select().from(licenseTypes).orderBy(asc(licenseTypes.sortOrder), asc(licenseTypes.id));
  if (activeOnly) return query.where(eq(licenseTypes.isActive, true));
  return query;
}
