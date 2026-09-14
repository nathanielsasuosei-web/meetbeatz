import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { resolveDatabaseUrl } from "./src/lib/database-url";

// Resolve the same way the app does at runtime, so `npx drizzle-kit push`
// targets the database you actually deployed (Vercel's Postgres/Supabase
// integrations expose POSTGRES_URL rather than DATABASE_URL).
const resolved = resolveDatabaseUrl();

if (!resolved.value) {
  throw new Error(
    "No database URL found. Set DATABASE_URL (or POSTGRES_URL / POSTGRES_URL_NON_POOLING) in your environment or .env.",
  );
}

console.log(`drizzle-kit: using ${resolved.source}`);

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url: resolved.value },
});
