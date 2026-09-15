import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Baseline schema — auto-created on first boot against an empty database.
 *
 * Why this exists: hosted environments (Vercel + Supabase) give you an empty
 * database with no shell to run `drizzle-kit push` from. `ensureMigrated()`
 * runs before seeding and creates every table when (and only when) the
 * database is fresh, so a new deployment self-heals on first visit.
 *
 * The statements below are the output of `drizzle-kit generate` for
 * `src/db/schema.ts`, made idempotent (`IF NOT EXISTS` /
 * `duplicate_object` guards) so a retry or a concurrent cold start is safe.
 *
 * Evolving the schema: for future schema changes, prefer `drizzle-kit push`
 * / migrations against each database. If you change `schema.ts`, regenerate
 * (`npx drizzle-kit generate`) and add the new statements here so fresh
 * databases still match.
 */

const BASELINE_TABLES: string[] = [
  `CREATE TABLE IF NOT EXISTS "admins" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"name" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admins_email_unique" UNIQUE("email")
)`,
  `CREATE TABLE IF NOT EXISTS "beat_licenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"beat_id" integer NOT NULL,
	"license_type_id" integer NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"is_enabled" boolean DEFAULT true NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "beats" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"genre" text DEFAULT '' NOT NULL,
	"mood" text DEFAULT '' NOT NULL,
	"bpm" integer,
	"musical_key" text DEFAULT '' NOT NULL,
	"tags" text DEFAULT '' NOT NULL,
	"cover_path" text,
	"preview_path" text,
	"mp3_path" text,
	"wav_path" text,
	"stems_path" text,
	"is_published" boolean DEFAULT true NOT NULL,
	"is_featured" boolean DEFAULT false NOT NULL,
	"exclusive_sold" boolean DEFAULT false NOT NULL,
	"is_demo" boolean DEFAULT false NOT NULL,
	"plays" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "beats_slug_unique" UNIQUE("slug")
)`,
  `CREATE TABLE IF NOT EXISTS "bookings" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer,
	"service_id" integer,
	"service_name" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"customer_phone" text DEFAULT '' NOT NULL,
	"booking_date" text NOT NULL,
	"start_time" text NOT NULL,
	"end_time" text NOT NULL,
	"hours" integer NOT NULL,
	"notes" text DEFAULT '' NOT NULL,
	"session_price" numeric(10, 2) NOT NULL,
	"amount_paid" numeric(10, 2) DEFAULT '0' NOT NULL,
	"status" text DEFAULT 'pending_payment' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "email_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"to_email" text NOT NULL,
	"subject" text NOT NULL,
	"html_body" text NOT NULL,
	"status" text NOT NULL,
	"error" text,
	"order_id" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "license_types" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"tagline" text DEFAULT '' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"terms" text DEFAULT '' NOT NULL,
	"deliverables" text DEFAULT 'mp3' NOT NULL,
	"is_exclusive" boolean DEFAULT false NOT NULL,
	"default_price" numeric(10, 2) DEFAULT '0' NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "license_types_slug_unique" UNIQUE("slug")
)`,
  `CREATE TABLE IF NOT EXISTS "licenses" (
	"id" serial PRIMARY KEY NOT NULL,
	"license_key" text NOT NULL,
	"order_id" integer NOT NULL,
	"order_item_id" integer NOT NULL,
	"beat_id" integer,
	"license_type_id" integer,
	"beat_title" text NOT NULL,
	"license_name" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"price" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'GHS' NOT NULL,
	"terms" text DEFAULT '' NOT NULL,
	"deliverables" text DEFAULT 'mp3' NOT NULL,
	"is_exclusive" boolean DEFAULT false NOT NULL,
	"download_token" text NOT NULL,
	"download_count" integer DEFAULT 0 NOT NULL,
	"issued_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "licenses_license_key_unique" UNIQUE("license_key"),
	CONSTRAINT "licenses_download_token_unique" UNIQUE("download_token")
)`,
  `CREATE TABLE IF NOT EXISTS "order_items" (
	"id" serial PRIMARY KEY NOT NULL,
	"order_id" integer NOT NULL,
	"beat_id" integer,
	"license_type_id" integer,
	"beat_title" text NOT NULL,
	"license_name" text NOT NULL,
	"price" numeric(10, 2) NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "orders" (
	"id" serial PRIMARY KEY NOT NULL,
	"reference" text NOT NULL,
	"kind" text NOT NULL,
	"customer_name" text NOT NULL,
	"customer_email" text NOT NULL,
	"customer_phone" text DEFAULT '' NOT NULL,
	"network" text DEFAULT '' NOT NULL,
	"subtotal" numeric(10, 2) NOT NULL,
	"fee_percent" numeric(5, 2) NOT NULL,
	"fee" numeric(10, 2) NOT NULL,
	"total" numeric(10, 2) NOT NULL,
	"currency" text DEFAULT 'GHS' NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"payment_provider" text DEFAULT 'paystack' NOT NULL,
	"split_subaccount" text,
	"provider_data" jsonb,
	"paid_at" timestamp with time zone,
	"email_sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_reference_unique" UNIQUE("reference")
)`,
  `CREATE TABLE IF NOT EXISTS "services" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price_per_hour" numeric(10, 2) NOT NULL,
	"min_hours" integer DEFAULT 1 NOT NULL,
	"max_hours" integer DEFAULT 8 NOT NULL,
	"deposit_percent" integer DEFAULT 50 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "services_slug_unique" UNIQUE("slug")
)`,
  `CREATE TABLE IF NOT EXISTS "settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
)`,
  `CREATE TABLE IF NOT EXISTS "studio_hours" (
	"id" serial PRIMARY KEY NOT NULL,
	"day_of_week" integer NOT NULL,
	"opens_at" text DEFAULT '09:00' NOT NULL,
	"closes_at" text DEFAULT '21:00' NOT NULL,
	"is_open" boolean DEFAULT true NOT NULL,
	CONSTRAINT "studio_hours_day_of_week_unique" UNIQUE("day_of_week")
)`,
];

const BASELINE_FOREIGN_KEYS: Array<{ name: string; ddl: string }> = [
  {
    name: "beat_licenses_beat_id_beats_id_fk",
    ddl: `ALTER TABLE "beat_licenses" ADD CONSTRAINT "beat_licenses_beat_id_beats_id_fk" FOREIGN KEY ("beat_id") REFERENCES "public"."beats"("id") ON DELETE cascade ON UPDATE no action`,
  },
  {
    name: "beat_licenses_license_type_id_license_types_id_fk",
    ddl: `ALTER TABLE "beat_licenses" ADD CONSTRAINT "beat_licenses_license_type_id_license_types_id_fk" FOREIGN KEY ("license_type_id") REFERENCES "public"."license_types"("id") ON DELETE cascade ON UPDATE no action`,
  },
  {
    name: "bookings_order_id_orders_id_fk",
    ddl: `ALTER TABLE "bookings" ADD CONSTRAINT "bookings_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action`,
  },
  {
    name: "bookings_service_id_services_id_fk",
    ddl: `ALTER TABLE "bookings" ADD CONSTRAINT "bookings_service_id_services_id_fk" FOREIGN KEY ("service_id") REFERENCES "public"."services"("id") ON DELETE set null ON UPDATE no action`,
  },
  {
    name: "email_logs_order_id_orders_id_fk",
    ddl: `ALTER TABLE "email_logs" ADD CONSTRAINT "email_logs_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE set null ON UPDATE no action`,
  },
  {
    name: "licenses_order_id_orders_id_fk",
    ddl: `ALTER TABLE "licenses" ADD CONSTRAINT "licenses_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action`,
  },
  {
    name: "licenses_order_item_id_order_items_id_fk",
    ddl: `ALTER TABLE "licenses" ADD CONSTRAINT "licenses_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE cascade ON UPDATE no action`,
  },
  {
    name: "licenses_beat_id_beats_id_fk",
    ddl: `ALTER TABLE "licenses" ADD CONSTRAINT "licenses_beat_id_beats_id_fk" FOREIGN KEY ("beat_id") REFERENCES "public"."beats"("id") ON DELETE set null ON UPDATE no action`,
  },
  {
    name: "licenses_license_type_id_license_types_id_fk",
    ddl: `ALTER TABLE "licenses" ADD CONSTRAINT "licenses_license_type_id_license_types_id_fk" FOREIGN KEY ("license_type_id") REFERENCES "public"."license_types"("id") ON DELETE set null ON UPDATE no action`,
  },
  {
    name: "order_items_order_id_orders_id_fk",
    ddl: `ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action`,
  },
  {
    name: "order_items_beat_id_beats_id_fk",
    ddl: `ALTER TABLE "order_items" ADD CONSTRAINT "order_items_beat_id_beats_id_fk" FOREIGN KEY ("beat_id") REFERENCES "public"."beats"("id") ON DELETE set null ON UPDATE no action`,
  },
  {
    name: "order_items_license_type_id_license_types_id_fk",
    ddl: `ALTER TABLE "order_items" ADD CONSTRAINT "order_items_license_type_id_license_types_id_fk" FOREIGN KEY ("license_type_id") REFERENCES "public"."license_types"("id") ON DELETE set null ON UPDATE no action`,
  },
];

const BASELINE_INDEXES: string[] = [
  `CREATE UNIQUE INDEX IF NOT EXISTS "beat_licenses_beat_license_idx" ON "beat_licenses" USING btree ("beat_id","license_type_id")`,
];

async function tableExists(table: string): Promise<boolean> {
  const result = await db.execute(
    sql`select 1 from information_schema.tables where table_schema = 'public' and table_name = ${table} limit 1`,
  );
  return result.rows.length > 0;
}

/** Creates the baseline schema on a fresh database. Safe to call on every boot. */
export async function ensureMigrated(): Promise<void> {
  // Fast path: a migrated database always has the admins table.
  if (await tableExists("admins")) return;

  console.log("[db] empty database detected — creating tables…");
  for (const ddl of BASELINE_TABLES) {
    await db.execute(sql.raw(ddl));
  }
  for (const fk of BASELINE_FOREIGN_KEYS) {
    // No IF NOT EXISTS for ADD CONSTRAINT, so guard via duplicate_object.
    await db.execute(sql.raw(`DO $$ BEGIN ${fk.ddl}; EXCEPTION WHEN duplicate_object THEN NULL; END $$;`));
  }
  for (const ddl of BASELINE_INDEXES) {
    await db.execute(sql.raw(ddl));
  }
  console.log("[db] tables created");
}
