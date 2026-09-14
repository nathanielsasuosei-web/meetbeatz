import "dotenv/config";
import { spawnSync } from "node:child_process";

/**
 * Syncs the schema to whatever DATABASE_URL points at, as part of `npm run build`.
 *
 * This exists because a deployed preview used to fail site-wide with "tables that were
 * never created" — the app auto-seeds its *rows* on first request, but the tables themselves
 * depended on someone remembering to run `npx drizzle-kit push` by hand against the hosted
 * database, which nobody does on a first deploy.
 *
 * A missing DATABASE_URL is a warning, not a build failure: platforms often build before any
 * database is attached, and failing there would hide the real fix behind a red deploy. A real
 * push failure (bad credentials, unreachable host, or a destructive change that drizzle-kit
 * refuses to apply without a TTY) still fails the build, because that is the moment worth
 * stopping at.
 */
const url = process.env.DATABASE_URL?.trim();

if (!url) {
  console.warn(
    "[build] DATABASE_URL is not set — skipping schema sync.\n" +
      "[build] The app will build, but every page needs tables to exist. Set DATABASE_URL\n" +
      "[build] (a hosted PostgreSQL in CI/preview environments) and rebuild, or run\n" +
      "[build] `npm run db:push` against the target database manually.",
  );
  process.exit(0);
}

let host = "(unparsable DATABASE_URL)";
try {
  host = `${new URL(url).hostname}:${new URL(url).port || "5432"}`;
} catch {
  // keep the placeholder above; never print the URL itself, it contains a password
}

console.log(`[build] syncing schema to ${host} ...`);

const result = spawnSync("npx", ["drizzle-kit", "push"], {
  stdio: "inherit",
  shell: process.platform === "win32",
  env: process.env,
});

if (result.status !== 0) {
  console.error(
    "[build] schema sync failed. Reproduce and review it interactively with `npm run db:push`\n" +
      "[build] (destructive changes are refused without a terminal, by design).",
  );
  process.exit(result.status ?? 1);
}

console.log("[build] schema is up to date.");
