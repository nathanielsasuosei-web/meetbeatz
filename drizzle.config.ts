import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/db/schema.ts",
  dbCredentials: {
    // Read from the environment so no credentials are committed to the repo.
    // Local: loaded from .env · Production: set DATABASE_URL in the host dashboard.
    url: process.env.DATABASE_URL ?? "",
  },
});
