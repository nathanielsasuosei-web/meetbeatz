import { eq } from "drizzle-orm";
import { db } from "@/db";
import { admins, beatLicenses, beats, licenseTypes, services, studioHours } from "@/db/schema";
import { hashPassword } from "./auth";
import { ensureMigrated } from "./migrate";
import { DEMO_SYNTH_BY_SLUG, synthBeat } from "./audio-synth";
import { resolveUpload, writeUploadBuffer } from "./files";

export const DEFAULT_ADMIN_EMAIL = "admin@meetbeatz.app";
export const DEFAULT_ADMIN_PASSWORD = "meetbeatz123";

const LICENSE_TYPES = [
  {
    name: "Basic Lease",
    slug: "basic",
    tagline: "MP3 · perfect for demos & SoundCloud",
    description: "Tagless MP3 of the beat. Great for mixtapes, demos and online streaming while you build your audience.",
    deliverables: "mp3",
    isExclusive: false,
    defaultPrice: "150.00",
    sortOrder: 1,
    terms:
      "Non-exclusive license. Use the beat in one (1) new song. Distribute up to 5,000 copies/streams combined. One (1) music video and non-profit live performances allowed. Radio broadcast not included. Producer retains full ownership of the composition and may continue to license it to others. Credit must read 'Prod. by Meetbeatz'. The license is non-transferable and may not be resold or used in a different song.",
  },
  {
    name: "Premium Lease",
    slug: "premium",
    tagline: "MP3 + WAV · release-ready",
    description: "High-quality WAV plus MP3 for a clean release on all streaming platforms.",
    deliverables: "mp3,wav",
    isExclusive: false,
    defaultPrice: "300.00",
    sortOrder: 2,
    terms:
      "Non-exclusive license. Use the beat in one (1) new song. Distribute up to 100,000 copies/streams combined across all platforms. One (1) music video and unlimited non-profit performances. Radio broadcast on up to two (2) stations. Producer retains full ownership and may continue to license it to others. Credit must read 'Prod. by Meetbeatz'. Non-transferable; may not be resold.",
  },
  {
    name: "Unlimited Lease",
    slug: "unlimited",
    tagline: "MP3 + WAV + Stems · no caps",
    description: "Everything including track stems for a professional mix. Unlimited streams, videos and performances.",
    deliverables: "mp3,wav,stems",
    isExclusive: false,
    defaultPrice: "600.00",
    sortOrder: 3,
    terms:
      "Non-exclusive license. Use the beat in one (1) new song with unlimited distribution, streams, music videos, radio broadcast and paid live performances. Producer retains ownership of the composition and may continue to license it to others until exclusive rights are sold. Credit must read 'Prod. by Meetbeatz'. Non-transferable; may not be resold.",
  },
  {
    name: "Exclusive Rights",
    slug: "exclusive",
    tagline: "MP3 + WAV + Stems · beat removed from store",
    description: "Own it. The beat is removed from the store and never licensed again after your purchase.",
    deliverables: "mp3,wav,stems",
    isExclusive: true,
    defaultPrice: "2500.00",
    sortOrder: 4,
    terms:
      "Exclusive license. The licensee receives exclusive rights to use the beat in unlimited songs, distribution, streams, videos, broadcasts and performances. The beat is removed from sale upon purchase and will not be licensed to anyone else afterwards. Previously issued non-exclusive licenses remain valid. Producer retains songwriting credit and 50% of publishing on the composition unless agreed otherwise in writing. Credit must read 'Prod. by Meetbeatz'.",
  },
];

const SERVICES = [
  {
    name: "Recording",
    slug: "recording",
    description: "Vocal recording in a treated booth with a session engineer. Includes rough mix at the end of your session.",
    pricePerHour: "120.00",
    minHours: 1,
    maxHours: 8,
    depositPercent: 50,
    sortOrder: 1,
  },
  {
    name: "Mixing",
    slug: "mixing",
    description: "Professional mix of your recorded song. Bring your stems or record with us first.",
    pricePerHour: "150.00",
    minHours: 2,
    maxHours: 6,
    depositPercent: 50,
    sortOrder: 2,
  },
  {
    name: "Mastering",
    slug: "mastering",
    description: "Loud, clean, streaming-ready masters for Spotify, Apple Music, Boomplay and Audiomack.",
    pricePerHour: "100.00",
    minHours: 1,
    maxHours: 4,
    depositPercent: 50,
    sortOrder: 3,
  },
];

const DEMO_BEATS = [
  {
    title: "Midnight in Osu",
    slug: "midnight-in-osu",
    genre: "Afrobeats",
    mood: "Smooth",
    bpm: 102,
    musicalKey: "F# minor",
    tags: "afrobeats, wizkid type beat, burna boy, smooth",
    description: "Late-night Afrobeats groove with rolling log drums, warm keys and a bassline that sits deep in the pocket.",
    synth: DEMO_SYNTH_BY_SLUG["midnight-in-osu"],
    cover: "/images/covers/demo-1.jpg",
    featured: true,
  },
  {
    title: "Kumasi Drill",
    slug: "kumasi-drill",
    genre: "Asakaa / Drill",
    mood: "Dark",
    bpm: 142,
    musicalKey: "C minor",
    tags: "asakaa, drill, kumerica, dark, sliding 808",
    description: "Hard-hitting Asakaa drill with sliding 808s, eerie bells and skipping hi-hats built for the streets of Kumasi.",
    synth: DEMO_SYNTH_BY_SLUG["kumasi-drill"],
    cover: "/images/covers/demo-2.jpg",
    featured: true,
  },
  {
    title: "Sunday Highlife",
    slug: "sunday-highlife",
    genre: "Highlife",
    mood: "Uplifting",
    bpm: 118,
    musicalKey: "G major",
    tags: "highlife, guitar, uplifting, kuami eugene type beat",
    description: "Feel-good highlife with palm-wine guitars, bright horns and a bounce made for weddings and Sunday afternoons.",
    synth: DEMO_SYNTH_BY_SLUG["sunday-highlife"],
    cover: "/images/covers/demo-3.jpg",
    featured: true,
  },
];

let seededPromise: Promise<void> | null = null;

export function ensureSeeded(): Promise<void> {
  if (!seededPromise) {
    seededPromise = runSeed().catch((err) => {
      seededPromise = null;
      throw err;
    });
  }
  return seededPromise;
}

async function runSeed() {
  await ensureMigrated();
  const [existingAdmin] = await db.select({ id: admins.id }).from(admins).limit(1);
  if (!existingAdmin) {
    const configuredEmail = process.env.ADMIN_EMAIL?.trim();
    const configuredPassword = process.env.ADMIN_PASSWORD?.trim();
    if (process.env.NODE_ENV === "production" && (!configuredEmail || !configuredPassword)) {
      throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD are required before first production start");
    }
    const email = (configuredEmail || DEFAULT_ADMIN_EMAIL).toLowerCase();
    const password = configuredPassword || DEFAULT_ADMIN_PASSWORD;
    await db.insert(admins).values({ email, name: "Meetbeatz", passwordHash: hashPassword(password) }).onConflictDoNothing({ target: admins.email });
  }

  const [existingLicense] = await db.select({ id: licenseTypes.id }).from(licenseTypes).limit(1);
  if (!existingLicense) {
    await db.insert(licenseTypes).values(LICENSE_TYPES).onConflictDoNothing({ target: licenseTypes.slug });
  }

  const [existingService] = await db.select({ id: services.id }).from(services).limit(1);
  if (!existingService) {
    await db.insert(services).values(SERVICES).onConflictDoNothing({ target: services.slug });
  }

  const [existingHours] = await db.select({ id: studioHours.id }).from(studioHours).limit(1);
  if (!existingHours) {
    await db.insert(studioHours).values(
      Array.from({ length: 7 }, (_, dow) => ({
        dayOfWeek: dow,
        opensAt: dow === 6 ? "10:00" : "09:00",
        closesAt: dow === 6 ? "18:00" : "21:00",
        isOpen: dow !== 0,
      })))
      .onConflictDoNothing({ target: studioHours.dayOfWeek });
  }

  const [existingBeat] = await db.select({ id: beats.id }).from(beats).limit(1);
  if (!existingBeat) {
    const types = await db.select().from(licenseTypes);
    for (let i = 0; i < DEMO_BEATS.length; i++) {
      const demo = DEMO_BEATS[i];
      const fileName = `demo-${i + 1}.wav`;
      const rel = `previews/${fileName}`;
      if (!resolveUpload(rel)) {
        try {
          await writeUploadBuffer("previews", fileName, synthBeat(demo.synth));
        } catch (err) {
          // Read-only filesystem (e.g. Vercel serverless): seeding must not
          // fail — the preview API regenerates demo audio in memory instead.
          console.warn(`[seed] could not write ${rel}, using in-memory demo audio:`, err);
        }
      }
      const [beat] = await db
        .insert(beats)
        .values({
          title: demo.title,
          slug: demo.slug,
          description: demo.description,
          genre: demo.genre,
          mood: demo.mood,
          bpm: demo.bpm,
          musicalKey: demo.musicalKey,
          tags: demo.tags,
          coverPath: demo.cover,
          previewPath: rel,
          mp3Path: rel,
          wavPath: rel,
          stemsPath: null,
          isPublished: true,
          isFeatured: demo.featured,
          isDemo: true,
        })
        .onConflictDoNothing({ target: beats.slug })
        .returning();
      const beatRow = beat ?? (await db.select().from(beats).where(eq(beats.slug, demo.slug)).limit(1))[0];
      if (!beatRow) continue;
      if (types.length) {
        await db
          .insert(beatLicenses)
          .values(
            types.map((t) => ({
              beatId: beatRow.id,
              licenseTypeId: t.id,
              price: t.defaultPrice,
              isEnabled: t.deliverables.includes("stems") ? false : true,
            })),
          )
          .onConflictDoNothing();
      }
    }
  }
}
