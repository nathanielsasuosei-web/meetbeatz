#!/usr/bin/env node
/**
 * Deploy Meetbeatz to Vercel from your own machine.
 *
 *   npm run deploy            full flow: verify → create tables → env vars → deploy
 *   npm run deploy -- --db-only    only create the tables in the hosted database
 *
 * Why it runs locally: the deployment needs YOUR Vercel login, and the database
 * schema has to be pushed from a machine that can reach your hosted Postgres.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const isWindows = process.platform === "win32";
const OK = "✓";
const BAD = "✗";
const arrow = isWindows ? "→" : "→";

// Everything the app needs in production. NEXT_PUBLIC_APP_URL is filled in after
// the first deploy, so it is allowed to be empty here.
const REQUIRED_VARS = ["DATABASE_URL", "SESSION_SECRET", "ADMIN_EMAIL", "ADMIN_PASSWORD"];
const OPTIONAL_VARS = [
  "NEXT_PUBLIC_APP_URL",
  "PAYSTACK_SECRET_KEY",
  "PAYMENT_MODE",
  "GMAIL_USER",
  "GMAIL_APP_PASSWORD",
  "EMAIL_FROM",
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_USER",
  "SMTP_PASS",
  "SMTP_SECURE",
  "RESEND_API_KEY",
];

function loadEnv(file) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const rawLine of readFileSync(file, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[line.slice(0, eq).trim()] = value;
  }
  return out;
}

function fail(message, hint) {
  console.error(`\n${BAD} ${message}`);
  if (hint) console.error(hint);
  process.exit(1);
}

function isLocal(url) {
  return /@(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|host\.docker\.internal)/i.test(url);
}

function run(command, args, opts = {}) {
  console.log(`\n$ ${command} ${args.join(" ")}`);
  const result = spawnSync(command, args, {
    cwd: root,
    stdio: opts.input ? ["pipe", "inherit", "inherit"] : "inherit",
    input: opts.input,
    shell: isWindows,
    env: { ...process.env, ...opts.env },
  });
  return result.status ?? 1;
}

function which(command) {
  const probe = spawnSync(command, ["--version"], { stdio: "ignore", shell: isWindows });
  return probe.status === 0;
}

// ---------------------------------------------------------------------------

const args = process.argv.slice(2);
const dbOnly = args.includes("--db-only");

console.log("Meetbeatz → Vercel");
console.log("=".repeat(50));

const env = { ...loadEnv(path.join(root, ".env")), ...process.env };
const databaseUrl = env.DATABASE_URL?.trim();

if (!databaseUrl) {
  fail("DATABASE_URL is missing.", "   Add it to .env (see .env.example).");
}

// 1. The database must be reachable from Vercel — localhost never is.
if (!dbOnly && isLocal(databaseUrl)) {
  fail(
    "DATABASE_URL still points at your own machine:",
    `   ${databaseUrl.replace(/:[^:@/]+@/, ":****@")}

   Create a hosted PostgreSQL first (Neon, Supabase, Railway or Vercel Postgres)
   and put its connection string in .env. It must include sslmode=require, e.g.

   DATABASE_URL=postgresql://user:pass@ep-xxx.eu-central-1.aws.neon.tech/app_db?sslmode=require

   Then run: npm run deploy`,
  );
}

// 2. Missing secrets are the usual reason a deploy "works" but cannot log in.
const missing = REQUIRED_VARS.filter((key) => !env[key]?.trim());
if (missing.length) {
  fail(`Missing required environment variables: ${missing.join(", ")}`, "   Fill them in .env first.");
}

// 3. Warn about the things that make a fresh deploy look broken.
const notes = [];
if ((env.SESSION_SECRET ?? "").length < 32) {
  notes.push("SESSION_SECRET is shorter than 32 characters — generate a longer one.");
}
if (!env.NEXT_PUBLIC_APP_URL?.trim()) {
  notes.push("NEXT_PUBLIC_APP_URL is empty — the app auto-detects the URL, so that is fine;");
  notes.push("  set it to your real domain afterwards so emails link to the right place.");
}
if (!env.PAYSTACK_SECRET_KEY?.trim() || env.PAYSTACK_SECRET_KEY.trim() === "sk_") {
  notes.push("PAYSTACK_SECRET_KEY is empty — checkout stays in simulated test mode.");
}
if (!env.GMAIL_APP_PASSWORD?.trim() && !env.SMTP_HOST?.trim() && !env.RESEND_API_KEY?.trim()) {
  notes.push("No email provider configured — order emails will be logged but not sent.");
}
if (notes.length) {
  console.log("\nNotes:");
  for (const note of notes) console.log(`  • ${note}`);
}

// 4. Create the tables in the hosted database (the step everyone forgets).
console.log(`\n[1/4] Creating tables in the hosted database…`);
console.log(`      ${databaseUrl.replace(/:[^:@/]+@/, ":****@")}`);
if (run("npx", ["drizzle-kit", "push"]) !== 0) {
  fail("drizzle-kit push failed — check DATABASE_URL and that the database exists.");
}
console.log(`${OK} Schema is up to date`);

if (dbOnly) {
  console.log("\nNext: npm run deploy   (without --db-only)");
  process.exit(0);
}

// 5. Write a file you can bulk-paste into Vercel's env var UI.
const productionEnv = REQUIRED_VARS.concat(OPTIONAL_VARS)
  .filter((key) => env[key]?.trim())
  .map((key) => `${key}=${env[key].trim()}`)
  .join("\n");
const envFile = path.join(root, ".env.production");
writeFileSync(envFile, `${productionEnv}\n`);
console.log(`\n[2/4] Wrote ${path.relative(root, envFile)} (git-ignored)`);
console.log("      Vercel dashboard → Settings → Environment Variables → paste its contents\n      (add them to Production AND Preview), or let the CLI below do it for you.");

// 6. Drive the Vercel CLI when it is available.
const vercel = which("npx") ? ["npx", "--yes", "vercel@latest"] : null;
let deployed = false;

if (vercel) {
  console.log(`\n[3/4] Vercel CLI…`);
  const who = spawnSync(vercel[0], [...vercel.slice(1), "whoami"], {
    cwd: root,
    encoding: "utf8",
    shell: isWindows,
  });
  const loggedIn = who.status === 0 && !/not logged in|Error/i.test(who.stdout ?? "");
  if (!loggedIn) {
    console.log("      Not logged in — a browser window will open (this is your own Vercel account).");
    if (run(vercel[0], [...vercel.slice(1), "login"]) !== 0) {
      fail("vercel login failed — you can also deploy from vercel.com/new in the browser.");
    }
  } else {
    console.log(`      ${OK} logged in as ${(who.stdout ?? "").trim()}`);
  }

  if (run(vercel[0], [...vercel.slice(1), "link", "--yes"]) === 0) {
    console.log("\n      Uploading environment variables…");
    for (const line of productionEnv.split("\n")) {
      const [key, ...rest] = line.split("=");
      const value = rest.join("=");
      for (const target of ["production", "preview"]) {
        spawnSync(vercel[0], [...vercel.slice(1), "env", "rm", key, target, "--yes"], {
          cwd: root,
          stdio: "ignore",
          shell: isWindows,
        });
        const status = spawnSync(vercel[0], [...vercel.slice(1), "env", "add", key, target], {
          cwd: root,
          input: `${value}\n`,
          stdio: ["pipe", "ignore", "pipe"],
          encoding: "utf8",
          shell: isWindows,
        }).status;
        console.log(`      ${status === 0 ? OK : "•"} ${key} → ${target}`);
      }
    }

    console.log("\n[4/4] Deploying to production…");
    deployed = run(vercel[0], [...vercel.slice(1), "--prod"]) === 0;
  }
}

if (!deployed) {
  console.log(`\n[3/4] Could not run the Vercel CLI here. Deploy in the browser instead:`);
  console.log("      1. Open https://vercel.com/new and import this repository");
  console.log("      2. Add the variables from .env.production (Settings → Environment Variables)");
  console.log("         — Vercel lets you paste the whole file at once; add them to Production and Preview.");
  console.log("         Set NEXT_PUBLIC_APP_URL to the https://…vercel.app URL it gives you.");
  console.log("      3. Deploy, open the site once (it creates your admin account + demo beats)");
  console.log("      4. Log in at /admin/login with ADMIN_EMAIL / ADMIN_PASSWORD");
  console.log("      5. Paystack → Settings → Webhooks → https://your-domain/api/paystack/webhook (charge.success)");
} else {
  console.log(`\n${OK} Deployed. Open the site once to seed it, then log in at /admin/login.`);
  console.log("   Remember: NEXT_PUBLIC_APP_URL should be your final https URL, and the Paystack");
  console.log("   webhook must point at https://your-domain/api/paystack/webhook (charge.success).");
}

console.log(`\n${arrow} Local development still uses .env — .env.production is only for hosting.`);
