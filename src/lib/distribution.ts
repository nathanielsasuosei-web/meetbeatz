import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { distributionPlans, distributionReleases, type DistributionPlan, type DistributionRelease } from "@/db/schema";
import { num, round2 } from "./format";
import { makeReference } from "./ids";
import { DISTRIBUTION_STORES } from "./release";
import { normalizeEmail } from "./customer-auth";
import { CheckoutError } from "./checkout-error";
import { isValidEmail } from "./email-address";
import { storedFileExists } from "./files";

/**
 * Music distribution: an artist hands the studio a finished song plus its
 * artwork, pays for a tier, and the studio delivers it to the streaming stores
 * and reports back.
 *
 * The studio is not a DSP and has no direct feed to Spotify — delivery is done
 * by the producer through their distributor account. What this module owns is
 * everything around that: the intake, the payment, the artwork and master, the
 * review states, and the record the artist can follow on their account.
 */

const VALID_STORES = new Set<string>(DISTRIBUTION_STORES.map((store) => store.slug));

export type ReleaseInput = {
  planId: number;
  artistName: string;
  artistEmail: string;
  artistPhone: string;
  releaseTitle: string;
  genre: string;
  releaseDate: string;
  /** Slugs from `DISTRIBUTION_STORES`; a comma-separated string also works. */
  stores: string[] | string;
  explicit: boolean;
  isrc: string;
  upc: string;
  artworkPath: string;
  audioPath: string;
  notes: string;
};

export function normalizeStores(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : String(raw ?? "").split(",");
  const seen = new Set<string>();
  for (const item of list) {
    const slug = String(item ?? "").trim().toLowerCase();
    if (VALID_STORES.has(slug)) seen.add(slug);
  }
  return [...seen];
}

export async function listActivePlans(): Promise<DistributionPlan[]> {
  return db.select().from(distributionPlans).where(eq(distributionPlans.isActive, true)).orderBy(distributionPlans.sortOrder);
}

export async function listPlans(): Promise<DistributionPlan[]> {
  return db.select().from(distributionPlans).orderBy(distributionPlans.sortOrder, distributionPlans.id);
}

export async function getPlan(id: number): Promise<DistributionPlan | null> {
  const [plan] = await db
    .select()
    .from(distributionPlans)
    .where(and(eq(distributionPlans.id, id), eq(distributionPlans.isActive, true)))
    .limit(1);
  return plan ?? null;
}

/** Validates the submission and writes the release row. Payment is attached after. */
export async function prepareRelease(input: ReleaseInput, customerId: number | null): Promise<DistributionRelease> {
  const plan = await getPlan(input.planId);
  if (!plan) throw new CheckoutError("Please choose a distribution tier.", 404);

  const artistName = input.artistName.trim();
  const artistEmail = normalizeEmail(input.artistEmail);
  const releaseTitle = input.releaseTitle.trim();
  if (artistName.length < 2) throw new CheckoutError("Please enter the artist name the release should appear under.");
  if (!isValidEmail(artistEmail)) throw new CheckoutError("Please enter a valid email address — release updates are sent there.");
  if (releaseTitle.length < 1) throw new CheckoutError("Please enter the release title.");

  const stores = normalizeStores(input.stores);
  if (!stores.length) throw new CheckoutError("Please pick at least one store to deliver to.");

  // Both files must already be in storage: the release is worthless without the
  // master, and a path that does not resolve would only be discovered weeks
  // later, mid-delivery.
  if (!input.audioPath || !(await storedFileExists(input.audioPath))) {
    throw new CheckoutError("Please upload the finished audio file (WAV or FLAC).");
  }
  if (!input.artworkPath || !(await storedFileExists(input.artworkPath))) {
    throw new CheckoutError("Please upload the cover artwork (JPG or PNG, at least 1400 × 1400).");
  }

  const releaseDate = /^\d{4}-\d{2}-\d{2}$/.test(input.releaseDate) ? input.releaseDate : "";
  const isrc = input.isrc.trim().toUpperCase().slice(0, 24);
  if (isrc && !/^[A-Z]{2}[A-Z0-9]{3}\d{7}$/.test(isrc)) {
    throw new CheckoutError("That ISRC does not look right — it is 12 characters, like GHMB12500001. Leave it blank to have one assigned.");
  }
  const upc = input.upc.trim().replace(/\s+/g, "").slice(0, 24);
  if (upc && !/^\d{12,14}$/.test(upc)) {
    throw new CheckoutError("That UPC/EAN does not look right — it is 12 to 14 digits. Leave it blank to have one assigned.");
  }

  const [release] = await db
    .insert(distributionReleases)
    .values({
      reference: makeReference("MBR"),
      planId: plan.id,
      planName: plan.name,
      customerId,
      artistName,
      artistEmail,
      artistPhone: input.artistPhone.trim().slice(0, 40),
      releaseTitle,
      genre: input.genre.trim().slice(0, 80),
      releaseDate,
      stores: stores.join(","),
      explicit: input.explicit,
      isrc,
      upc,
      artworkPath: input.artworkPath,
      audioPath: input.audioPath,
      notes: input.notes.trim().slice(0, 2000),
      status: "awaiting_payment",
    })
    .returning();
  return release;
}

export async function attachOrderToRelease(releaseId: number, orderId: number): Promise<void> {
  await db.update(distributionReleases).set({ orderId, updatedAt: new Date() }).where(eq(distributionReleases.id, releaseId));
}

export async function getReleaseByReference(reference: string): Promise<DistributionRelease | null> {
  const [release] = await db.select().from(distributionReleases).where(eq(distributionReleases.reference, reference)).limit(1);
  return release ?? null;
}

export async function getReleaseForOrder(orderId: number): Promise<DistributionRelease | null> {
  const [release] = await db.select().from(distributionReleases).where(eq(distributionReleases.orderId, orderId)).limit(1);
  return release ?? null;
}

export async function listReleases(limit = 200): Promise<DistributionRelease[]> {
  return db
    .select()
    .from(distributionReleases)
    .orderBy(desc(distributionReleases.createdAt), desc(distributionReleases.id))
    .limit(Math.max(1, Math.min(500, limit)));
}

/**
 * Releases belonging to an artist. Matched on the account id *or* the email, so
 * a submission made before the account existed still shows up — the same rule
 * `loadAccountData` uses for orders.
 */
export async function listReleasesForCustomer(customer: { id: number; email: string }): Promise<DistributionRelease[]> {
  const email = customer.email.toLowerCase();
  return db
    .select()
    .from(distributionReleases)
    .where(or(eq(distributionReleases.customerId, customer.id), sql`lower(${distributionReleases.artistEmail}) = ${email}`))
    .orderBy(desc(distributionReleases.createdAt), desc(distributionReleases.id));
}

export async function setReleaseStatus(id: number, status: string, producerNote: string): Promise<DistributionRelease | null> {
  const [release] = await db
    .update(distributionReleases)
    .set({
      status,
      producerNote: producerNote.trim().slice(0, 2000),
      liveAt: status === "live" ? new Date() : null,
      updatedAt: new Date(),
    })
    .where(eq(distributionReleases.id, id))
    .returning();
  return release ?? null;
}

export async function updatePlan(id: number, patch: Partial<DistributionPlan>): Promise<void> {
  await db.update(distributionPlans).set(patch).where(eq(distributionPlans.id, id));
}

/** How much of the streaming royalty the artist keeps, as a percentage. */
export function artistRoyaltyPercent(plan: DistributionPlan): number {
  return Math.max(0, Math.min(100, 100 - Math.round(num(plan.royaltyPercent))));
}

export function planPrice(plan: DistributionPlan): number {
  return round2(num(plan.price));
}

/** Count of releases waiting on the producer, for the dashboard badge. */
export async function countPendingReleases(): Promise<number> {
  const [{ count }] = await db
    .select({ count: sql<number>`COUNT(*)::int` })
    .from(distributionReleases)
    .where(inArray(distributionReleases.status, ["submitted", "in_review", "changes_requested", "approved"]));
  return count;
}
