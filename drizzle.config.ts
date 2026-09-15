import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { resolveDatabaseUrl } from "./src/lib/database-url";

/**
 * Same resolution order the app uses, so `npm run db:push` works against a
 * Vercel-attached database (which exposes POSTGRES_URL) as well as a plain
 * DATABASE_URL in .env — a mismatch between the two is how you end up pushing
 * a schema to a database the running app never reads.
 */
const resolved = resolveDatabaseUrl();

if (!resolved.value) {
  throw new Error(
    "No database connection string found. Set DATABASE_URL (or POSTGRES_URL) in .env, or export " +
      "it, and point it at a running PostgreSQL. `npm run doctor` shows which names were checked.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: resolved.value,
  },
});

