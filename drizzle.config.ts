import "dotenv/config";
import { defineConfig } from "drizzle-kit";

// Single source of truth: DATABASE_URL from .env (never hard-code credentials here).
const url = process.env.DATABASE_URL?.trim();

if (!url) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env and point DATABASE_URL at your PostgreSQL database.",
  );
}

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: { url },
  strict: false,
  verbose: true,
});
