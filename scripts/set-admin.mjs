#!/usr/bin/env node
/**
 * Create or reset the admin login directly in the database.
 *
 *   node scripts/set-admin.mjs you@example.com 'new-password'
 *   npm run set-admin -- you@example.com 'new-password'
 *
 * Give just an email to change the address and keep the current password.
 *
 * Reads DATABASE_URL from the environment (or a local .env). Use this for the
 * very first admin, or if you are locked out — otherwise change the email and
 * password from Admin → Settings, which asks for the current password first.
 */
import { randomBytes, scryptSync } from "node:crypto";
import dotenv from "dotenv";
import { Client } from "pg";

dotenv.config();

// Keep in sync with src/lib/auth.ts: scrypt, 16-byte salt, 64-byte hash, "salt:hash".
function hashPassword(password) {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(password, salt, 64).toString("hex")}`;
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function parseArgs(argv) {
  const args = { email: "", password: "" };
  const positional = [];
  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") args.help = true;
    else if (arg.startsWith("--email=")) args.email = arg.slice("--email=".length);
    else if (arg.startsWith("--password=")) args.password = arg.slice("--password=".length);
    else positional.push(arg);
  }
  args.email = (args.email || positional[0] || "").trim().toLowerCase();
  args.password = args.password || positional[1] || "";
  return args;
}

const args = parseArgs(process.argv.slice(2));

if (args.help) {
  console.log(
    [
      "Usage: npm run set-admin -- <email> [password]",
      "",
      "  email      New admin login email (required)",
      "  password   New admin password, min 8 characters (optional — omit to keep the current one)",
      "",
      "Requires DATABASE_URL in the environment or in .env, and a database that has been",
      "migrated once with `npx drizzle-kit push`.",
    ].join("\n"),
  );
  process.exit(0);
}

if (!args.email || !EMAIL_PATTERN.test(args.email)) {
  console.error("✖ A valid admin email is required, e.g. npm run set-admin -- you@example.com 'new-password'");
  process.exit(1);
}
if (args.password && args.password.length < 8) {
  console.error("✖ Password must be at least 8 characters.");
  process.exit(1);
}
if (!process.env.DATABASE_URL) {
  console.error("✖ DATABASE_URL is not set. Add it to your environment or .env first.");
  process.exit(1);
}

const client = new Client({ connectionString: process.env.DATABASE_URL });

try {
  await client.connect();

  const { rows: tableRows } = await client.query("select to_regclass('public.admins') as admins_table");
  if (!tableRows[0]?.admins_table) {
    console.error("✖ The admins table does not exist. Run `npx drizzle-kit push` first.");
    process.exit(1);
  }

  const { rows: existing } = await client.query(
    "select id, email from admins order by id limit 1",
  );
  const admin = existing[0];

  if (admin) {
    const sets = ["email = $1"];
    const params = [args.email];
    if (args.password) {
      params.push(hashPassword(args.password));
      sets.push(`password_hash = $${params.length}`);
    }
    params.push(admin.id);
    await client.query(`update admins set ${sets.join(", ")} where id = $${params.length}`, params);
    console.log(
      `✔ Admin login updated: ${admin.email} → ${args.email}` +
        (args.password ? " (password changed)" : " (password unchanged)"),
    );
  } else {
    if (!args.password) {
      console.error("✖ No admin exists yet, so a password is required to create one.");
      process.exit(1);
    }
    await client.query("insert into admins (email, name, password_hash) values ($1, $2, $3)", [
      args.email,
      "Meetbeatz",
      hashPassword(args.password),
    ]);
    console.log(`✔ Admin created: ${args.email}`);
  }
} catch (error) {
  console.error(`✖ ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
} finally {
  await client.end().catch(() => {});
}
