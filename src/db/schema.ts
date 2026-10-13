import {
  boolean,
  customType,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

/** Postgres `bytea`. node-postgres hands it back (and accepts it) as a Buffer. */
const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => "bytea",
});

// ---------------------------------------------------------------------------
// Admin (only Meetbeatz can log in and upload beats)
// ---------------------------------------------------------------------------
export const admins = pgTable("admins", {
  id: serial("id").primaryKey(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Key/value store for site + payment settings
export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Producer-managed campaigns. Each active code can be used by many customers. */
export const promoCodes = pgTable("promo_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Customers (artist accounts) & private artist ↔ producer chat
// ---------------------------------------------------------------------------

/** Artist/customer accounts — separate from admins. Owns a purchase history and a private producer chat thread. */
export const customers = pgTable("customers", {
  id: serial("id").primaryKey(),
  /** Always stored lowercase so sign-in and order matching are case-insensitive. */
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  phone: text("phone").default("").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** One private thread per artist: artist ↔ producer messages, plus system notices. */
export const customerMessages = pgTable("customer_messages", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  /** customer | admin | system */
  fromRole: text("from_role").default("customer").notNull(),
  body: text("body").notNull(),
  /** Set when the other side has seen it — drives the unread badges. */
  readAt: timestamp("read_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Private, signaled WebRTC audio calls between one artist and the producer. */
export const voiceCalls = pgTable("voice_calls", {
  id: serial("id").primaryKey(),
  customerId: integer("customer_id")
    .notNull()
    .references(() => customers.id, { onDelete: "cascade" }),
  /** ringing | accepted | missed | declined | cancelled | ended */
  status: text("status").default("ringing").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Short-lived SDP/ICE messages exchanged only by the two participants. */
export const voiceCallSignals = pgTable("voice_call_signals", {
  id: serial("id").primaryKey(),
  callId: integer("call_id")
    .notNull()
    .references(() => voiceCalls.id, { onDelete: "cascade" }),
  senderRole: text("sender_role").notNull(), // artist | producer
  recipientRole: text("recipient_role").notNull(), // artist | producer
  kind: text("kind").notNull(), // offer | answer | ice-candidate
  payload: jsonb("payload").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Beats & licensing
// ---------------------------------------------------------------------------
export const beats = pgTable("beats", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").default("").notNull(),
  genre: text("genre").default("").notNull(),
  mood: text("mood").default("").notNull(),
  bpm: integer("bpm"),
  musicalKey: text("musical_key").default("").notNull(),
  tags: text("tags").default("").notNull(),
  coverPath: text("cover_path"),
  previewPath: text("preview_path"),
  /** Optional video preview (visualizer, studio clip…), streamed on the beat page. */
  videoPath: text("video_path"),
  mp3Path: text("mp3_path"),
  wavPath: text("wav_path"),
  stemsPath: text("stems_path"),
  isPublished: boolean("is_published").default(true).notNull(),
  isFeatured: boolean("is_featured").default(false).notNull(),
  exclusiveSold: boolean("exclusive_sold").default(false).notNull(),
  isDemo: boolean("is_demo").default(false).notNull(),
  plays: integer("plays").default(0).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const licenseTypes = pgTable("license_types", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  tagline: text("tagline").default("").notNull(),
  description: text("description").default("").notNull(),
  terms: text("terms").default("").notNull(),
  // comma separated: mp3,wav,stems
  deliverables: text("deliverables").default("mp3").notNull(),
  isExclusive: boolean("is_exclusive").default(false).notNull(),
  defaultPrice: numeric("default_price", { precision: 10, scale: 2 }).default("0").notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
});

export const beatLicenses = pgTable(
  "beat_licenses",
  {
    id: serial("id").primaryKey(),
    beatId: integer("beat_id")
      .notNull()
      .references(() => beats.id, { onDelete: "cascade" }),
    licenseTypeId: integer("license_type_id")
      .notNull()
      .references(() => licenseTypes.id, { onDelete: "cascade" }),
    price: numeric("price", { precision: 10, scale: 2 }).notNull(),
    isEnabled: boolean("is_enabled").default(true).notNull(),
  },
  (t) => [uniqueIndex("beat_licenses_beat_license_idx").on(t.beatId, t.licenseTypeId)],
);

// ---------------------------------------------------------------------------
// Studio services, hours & bookings
// ---------------------------------------------------------------------------
export const services = pgTable("services", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description").default("").notNull(),
  pricePerHour: numeric("price_per_hour", { precision: 10, scale: 2 }).notNull(),
  minHours: integer("min_hours").default(1).notNull(),
  maxHours: integer("max_hours").default(8).notNull(),
  // percentage of the session price that must be paid online to lock the slot
  depositPercent: integer("deposit_percent").default(50).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
});

export const studioHours = pgTable("studio_hours", {
  id: serial("id").primaryKey(),
  dayOfWeek: integer("day_of_week").notNull().unique(), // 0 = Sunday
  opensAt: text("opens_at").default("09:00").notNull(),
  closesAt: text("closes_at").default("21:00").notNull(),
  isOpen: boolean("is_open").default(true).notNull(),
});

// ---------------------------------------------------------------------------
// Orders (beats + bookings share one payment pipeline)
// ---------------------------------------------------------------------------
export const orders = pgTable("orders", {
  id: serial("id").primaryKey(),
  reference: text("reference").notNull().unique(),
  kind: text("kind").notNull(), // beat | booking
  /** Set when the buyer was signed in — puts the order on their account page. */
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone").default("").notNull(),
  network: text("network").default("").notNull(), // mtn | vodafone | airteltigo | card
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
  /** Discount is recorded separately so receipts can show the original price and promo savings. */
  discount: numeric("discount", { precision: 10, scale: 2 }).default("0").notNull(),
  promoCode: text("promo_code").default("").notNull(),
  feePercent: numeric("fee_percent", { precision: 5, scale: 2 }).notNull(),
  fee: numeric("fee", { precision: 10, scale: 2 }).notNull(),
  total: numeric("total", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").default("GHS").notNull(),
  status: text("status").default("pending").notNull(), // pending | paid | failed | cancelled
  paymentProvider: text("payment_provider").default("paystack").notNull(), // paystack | simulation
  splitSubaccount: text("split_subaccount"),
  providerData: jsonb("provider_data"),
  paidAt: timestamp("paid_at", { withTimezone: true }),
  emailSentAt: timestamp("email_sent_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/**
 * Legacy one-time promo claims retained for database compatibility. Current
 * producer campaigns are unlimited-use and the application no longer reads or
 * writes this table.
 */
export const promoRedemptions = pgTable("promo_redemptions", {
  id: serial("id").primaryKey(),
  code: text("code").notNull().unique(),
  orderId: integer("order_id")
    .notNull()
    .unique()
    .references(() => orders.id, { onDelete: "cascade" }),
  reservedAt: timestamp("reserved_at", { withTimezone: true }).defaultNow().notNull(),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
});

export const orderItems = pgTable("order_items", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  beatId: integer("beat_id").references(() => beats.id, { onDelete: "set null" }),
  licenseTypeId: integer("license_type_id").references(() => licenseTypes.id, {
    onDelete: "set null",
  }),
  beatTitle: text("beat_title").notNull(),
  licenseName: text("license_name").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
});

export const licenses = pgTable("licenses", {
  id: serial("id").primaryKey(),
  licenseKey: text("license_key").notNull().unique(),
  orderId: integer("order_id")
    .notNull()
    .references(() => orders.id, { onDelete: "cascade" }),
  orderItemId: integer("order_item_id")
    .notNull()
    .references(() => orderItems.id, { onDelete: "cascade" }),
  beatId: integer("beat_id").references(() => beats.id, { onDelete: "set null" }),
  licenseTypeId: integer("license_type_id").references(() => licenseTypes.id, {
    onDelete: "set null",
  }),
  beatTitle: text("beat_title").notNull(),
  licenseName: text("license_name").notNull(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  currency: text("currency").default("GHS").notNull(),
  terms: text("terms").default("").notNull(),
  deliverables: text("deliverables").default("mp3").notNull(),
  isExclusive: boolean("is_exclusive").default(false).notNull(),
  downloadToken: text("download_token").notNull().unique(),
  downloadCount: integer("download_count").default(0).notNull(),
  issuedAt: timestamp("issued_at", { withTimezone: true }).defaultNow().notNull(),
});

export const bookings = pgTable("bookings", {
  id: serial("id").primaryKey(),
  orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
  serviceId: integer("service_id").references(() => services.id, { onDelete: "set null" }),
  serviceName: text("service_name").notNull(),
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone").default("").notNull(),
  bookingDate: text("booking_date").notNull(), // YYYY-MM-DD
  startTime: text("start_time").notNull(), // HH:MM
  endTime: text("end_time").notNull(), // HH:MM
  hours: integer("hours").notNull(),
  notes: text("notes").default("").notNull(),
  sessionPrice: numeric("session_price", { precision: 10, scale: 2 }).notNull(),
  amountPaid: numeric("amount_paid", { precision: 10, scale: 2 }).default("0").notNull(),
  status: text("status").default("pending_payment").notNull(), // pending_payment | confirmed | completed | cancelled
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// Producer inbox: on-site notification messages (booking requests, confirmations).
// The same alerts are also pushed to the producer's WhatsApp when configured.
export const notifications = pgTable(
  "notifications",
  {
    id: serial("id").primaryKey(),
    // Which alert this is. Not constrained in the database because the producer
    // inbox shows every kind generically — see notifications.ts.
    // booking_request | booking_confirmed | release_submitted | release_paid |
    // session_requested
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    reference: text("reference").default("").notNull(),
    link: text("link").default("").notNull(),
    readAt: timestamp("read_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("notifications_kind_reference_idx").on(t.kind, t.reference)],
);

export const emailLogs = pgTable("email_logs", {
  id: serial("id").primaryKey(),
  toEmail: text("to_email").notNull(),
  subject: text("subject").notNull(),
  htmlBody: text("html_body").notNull(),
  status: text("status").notNull(), // sent | failed | skipped
  error: text("error"),
  orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Uploaded files (beat covers, previews, masters, stems)
//
// These used to be written to ./uploads on the app's filesystem, which cannot
// work on a serverless host: the deployment bundle is read-only, so
// `mkdir('/var/task/uploads')` threw ENOENT and every upload failed. They live
// in PostgreSQL instead, split into fixed-size chunks so a large WAV or stem
// zip never has to travel in a single request (Vercel rejects bodies over
// 4.5 MB) and so reads can stream and slice without loading the whole file.
// ---------------------------------------------------------------------------
export const storedFiles = pgTable("stored_files", {
  id: serial("id").primaryKey(),
  /** Relative path used everywhere else in the app, e.g. `mp3/lq3k-9f2.mp3`. */
  path: text("path").notNull().unique(),
  /** covers | previews | videos | mp3 | wav | stems | sound-kits */
  kind: text("kind").notNull(),
  contentType: text("content_type").notNull(),
  /** Byte length of the whole file, as declared by the client. */
  size: integer("size").notNull(),
  chunkSize: integer("chunk_size").notNull(),
  /** Bytes stored so far; a file only becomes readable once it is complete. */
  uploadedBytes: integer("uploaded_bytes").default(0).notNull(),
  isComplete: boolean("is_complete").default(false).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const storedFileChunks = pgTable(
  "stored_file_chunks",
  {
    id: serial("id").primaryKey(),
    fileId: integer("file_id")
      .notNull()
      .references(() => storedFiles.id, { onDelete: "cascade" }),
    /** 0-based part number; part N starts at N * chunk_size. */
    idx: integer("idx").notNull(),
    data: bytea("data").notNull(),
  },
  (t) => [uniqueIndex("stored_file_chunks_file_idx").on(t.fileId, t.idx)],
);

// ---------------------------------------------------------------------------
// Sound kits (admin-managed downloadable kit archives)
// ---------------------------------------------------------------------------
export const soundKits = pgTable("sound_kits", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  description: text("description").default("").notNull(),
  filePath: text("file_path").notNull().unique(),
  fileName: text("file_name").notNull(),
  fileSize: integer("file_size").notNull(),
  /** Visible on the public store and downloadable without an account. */
  isPublished: boolean("is_published").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Music distribution (the studio releases an artist's finished song to the DSPs)
// ---------------------------------------------------------------------------
/**
 * The tiers on the distribution page. Seeded once (see src/lib/seed.ts) and
 * editable in Admin → Distribution, so the producer can change prices without a
 * deploy. A release copies the plan's name and price onto itself at checkout —
 * editing a plan later must not rewrite what someone already paid for.
 */
export const distributionPlans = pgTable("distribution_plans", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  tagline: text("tagline").default("").notNull(),
  /** How many tracks the tier covers. */
  tracks: integer("tracks").default(1).notNull(),
  price: numeric("price", { precision: 10, scale: 2 }).notNull(),
  /** Working days from approval to live on the stores. */
  turnaroundDays: integer("turnaround_days").default(7).notNull(),
  /** Share of streaming royalties the studio keeps, in percent. */
  royaltyPercent: integer("royalty_percent").default(0).notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  sortOrder: integer("sort_order").default(0).notNull(),
});

/** One song (or EP/album) an artist has submitted for release. */
export const distributionReleases = pgTable("distribution_releases", {
  id: serial("id").primaryKey(),
  reference: text("reference").notNull().unique(),
  planId: integer("plan_id").references(() => distributionPlans.id, { onDelete: "set null" }),
  /** Frozen at submission so a later price change cannot rewrite history. */
  planName: text("plan_name").notNull(),
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
  /** The payment order for this release, once checkout has started. */
  orderId: integer("order_id").references(() => orders.id, { onDelete: "set null" }),
  artistName: text("artist_name").notNull(),
  artistEmail: text("artist_email").notNull(),
  artistPhone: text("artist_phone").default("").notNull(),
  releaseTitle: text("release_title").notNull(),
  genre: text("genre").default("").notNull(),
  /** Requested release date, YYYY-MM-DD. Empty means "as soon as possible". */
  releaseDate: text("release_date").default("").notNull(),
  /** Comma-separated store slugs the artist ticked. */
  stores: text("stores").default("").notNull(),
  explicit: boolean("explicit").default(false).notNull(),
  /** Supplied by the artist if they already have one, otherwise assigned later. */
  isrc: text("isrc").default("").notNull(),
  upc: text("upc").default("").notNull(),
  artworkPath: text("artwork_path"),
  audioPath: text("audio_path"),
  notes: text("notes").default("").notNull(),
  /**
   * awaiting_payment | submitted | in_review | changes_requested | approved |
   * live | rejected | cancelled
   */
  status: text("status").default("awaiting_payment").notNull(),
  /** The producer's reply shown to the artist on their account page. */
  producerNote: text("producer_note").default("").notNull(),
  liveAt: timestamp("live_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Online recording with the producer (remote sessions)
// ---------------------------------------------------------------------------
/**
 * A remote session request. The artist records takes in the browser studio
 * (src/components/remote-recorder.tsx), sends the best one here, and the
 * producer schedules the live session — payment for the time itself goes
 * through the normal studio booking flow, using the `online-session` service.
 */
export const remoteSessions = pgTable("remote_sessions", {
  id: serial("id").primaryKey(),
  reference: text("reference").notNull().unique(),
  customerId: integer("customer_id").references(() => customers.id, { onDelete: "set null" }),
  artistName: text("artist_name").notNull(),
  artistEmail: text("artist_email").notNull(),
  artistPhone: text("artist_phone").default("").notNull(),
  /** Preferred date (YYYY-MM-DD) and time (HH:MM) — a request, not a booking. */
  preferredDate: text("preferred_date").default("").notNull(),
  preferredTime: text("preferred_time").default("").notNull(),
  /** The store beat they want to record over, when they picked one. */
  beatId: integer("beat_id").references(() => beats.id, { onDelete: "set null" }),
  beatTitle: text("beat_title").default("").notNull(),
  /** vocals | topline | mix-feedback | full-production */
  goal: text("goal").default("vocals").notNull(),
  notes: text("notes").default("").notNull(),
  /** The take recorded in the browser studio and uploaded with the request. */
  takePath: text("take_path"),
  takeName: text("take_name").default("").notNull(),
  takeSeconds: integer("take_seconds").default(0).notNull(),
  /** requested | scheduled | completed | cancelled */
  status: text("status").default("requested").notNull(),
  producerNote: text("producer_note").default("").notNull(),
  /** Confirmed start of the live session, set by the producer. */
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Website enquiries (the public contact page form)
// ---------------------------------------------------------------------------
/**
 * The public contact form. Unlike `customerMessages` (a signed-in artist's chat
 * thread) this is open to anyone, so it stores the sender's own details and an
 * optional order reference instead of a customer id.
 */
export const contactMessages = pgTable("contact_messages", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull(),
  phone: text("phone").default("").notNull(),
  /** Buying a beat | Licensing | Studio booking | Refund | Something else */
  topic: text("topic").default("general").notNull(),
  orderReference: text("order_reference").default("").notNull(),
  body: text("body").notNull(),
  /** Which page the enquiry came from, e.g. `contact` or `licensing`. */
  source: text("source").default("contact").notNull(),
  /** Null until an admin marks the enquiry as answered. */
  handledAt: timestamp("handled_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

// ---------------------------------------------------------------------------
// Content protection (screen-capture guard)
// ---------------------------------------------------------------------------
/**
 * Attempts to record, screenshot or rip the storefront, reported by the
 * screen guard running in the visitor's browser (see
 * src/components/screen-guard.tsx). A browser cannot stop an operating-system
 * recorder, so these rows are the forensic half of the protection: who saw
 * what, when, and which capture path they used.
 */
export const securityEvents = pgTable(
  "security_events",
  {
    id: serial("id").primaryKey(),
    /** capture_device | display_capture | policy_violation | print_screen | save_attempt | devtools | hidden */
    kind: text("kind").notNull(),
    /** What exactly tripped it, e.g. the label of the capture device that appeared. */
    detail: text("detail").default("").notNull(),
    /** low | medium | high — drives the badge colour in the producer dashboard. */
    severity: text("severity").default("medium").notNull(),
    /** Page the visitor was on, e.g. `/beats/lq3k`. */
    path: text("path").default("").notNull(),
    /** Random per-tab id so repeat events from one visitor can be grouped. */
    visitorId: text("visitor_id").default("").notNull(),
    /** Signed-in artist's email when known; empty for anonymous visitors. */
    customerEmail: text("customer_email").default("").notNull(),
    userAgent: text("user_agent").default("").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("security_events_created_idx").on(t.createdAt), index("security_events_visitor_idx").on(t.visitorId)],
);

export type Beat = typeof beats.$inferSelect;
export type Customer = typeof customers.$inferSelect;
export type CustomerMessage = typeof customerMessages.$inferSelect;
export type VoiceCall = typeof voiceCalls.$inferSelect;
export type VoiceCallSignal = typeof voiceCallSignals.$inferSelect;
export type LicenseType = typeof licenseTypes.$inferSelect;
export type BeatLicense = typeof beatLicenses.$inferSelect;
export type Service = typeof services.$inferSelect;
export type StudioHour = typeof studioHours.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type License = typeof licenses.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type EmailLog = typeof emailLogs.$inferSelect;
export type StoredFile = typeof storedFiles.$inferSelect;
export type StoredFileChunk = typeof storedFileChunks.$inferSelect;
export type SoundKit = typeof soundKits.$inferSelect;
export type ContactMessage = typeof contactMessages.$inferSelect;
export type SecurityEvent = typeof securityEvents.$inferSelect;
export type DistributionPlan = typeof distributionPlans.$inferSelect;
export type DistributionRelease = typeof distributionReleases.$inferSelect;
export type RemoteSession = typeof remoteSessions.$inferSelect;
