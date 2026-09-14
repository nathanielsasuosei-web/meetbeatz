import "dotenv/config";
import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is not set. Copy .env.example to .env (or export DATABASE_URL) and point it at a running PostgreSQL.",
  );
}

/**
 * The connection string is read from the environment so that drizzle-kit and the
 * app can never drift apart — that mismatch was enough to leave every page 500ing.
 */
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
