import {
  boolean,
  integer,
  jsonb,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

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
  customerName: text("customer_name").notNull(),
  customerEmail: text("customer_email").notNull(),
  customerPhone: text("customer_phone").default("").notNull(),
  network: text("network").default("").notNull(), // mtn | vodafone | airteltigo | card
  subtotal: numeric("subtotal", { precision: 10, scale: 2 }).notNull(),
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

export type Beat = typeof beats.$inferSelect;
export type LicenseType = typeof licenseTypes.$inferSelect;
export type BeatLicense = typeof beatLicenses.$inferSelect;
export type Service = typeof services.$inferSelect;
export type StudioHour = typeof studioHours.$inferSelect;
export type Order = typeof orders.$inferSelect;
export type OrderItem = typeof orderItems.$inferSelect;
export type License = typeof licenses.$inferSelect;
export type Booking = typeof bookings.$inferSelect;
export type EmailLog = typeof emailLogs.$inferSelect;
