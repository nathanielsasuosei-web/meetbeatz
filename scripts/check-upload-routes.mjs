import fs from "node:fs";
import path from "node:path";

/**
 * Fails the build when the API routes the admin beat form calls are missing
 * from the build output.
 *
 * Why this exists: `src/components/admin/beat-form.tsx` sends every file to
 * `/api/admin/uploads`, so a build that ships the form *without* those route
 * handlers gives the producer a 404 the instant they press "Upload beat" —
 * "Could not start the upload (404)". Nothing else complains: the deployment
 * succeeds, no server log is written (the request never reaches a handler), and
 * the files exist in the working tree, so it also passes locally. That is
 * exactly how it went wrong once: the `.gitignore` rule meant for the runtime
 * `uploads/` folder also matched `src/app/api/admin/uploads/`, so the two route
 * files were never committed and never reached a deployment.
 *
 * Runs after `next build` (see package.json), where the route manifests exist.
 * Deliberately forgiving about the manifest itself: a future Next.js release
 * that renames these files, or a build whose output cannot be read, is a reason
 * to warn — never a reason to block a deploy.
 */
const REQUIRED = [
  "/api/admin/uploads",
  "/api/admin/uploads/[id]",
  "/api/admin/beats",
  "/api/admin/beats/[id]",
];

const MANIFESTS = [".next/app-path-routes-manifest.json", ".next/server/app-paths-manifest.json"];

function routesInBuild() {
  for (const rel of MANIFESTS) {
    let raw;
    try {
      raw = fs.readFileSync(path.join(process.cwd(), rel), "utf8");
    } catch {
      continue; // not produced by this build layout
    }
    try {
      const manifest = JSON.parse(raw);
      const routes = new Set();
      for (const [key, value] of Object.entries(manifest)) {
        routes.add(key.replace(/\/(page|route)$/, ""));
        if (typeof value === "string") routes.add(value);
      }
      if (routes.size) return { file: rel, routes };
    } catch {
      // unreadable manifest — try the next one
    }
  }
  return null;
}

const built = routesInBuild();

if (!built) {
  console.log("[build] no Next.js route manifest found — skipping the upload-route check.");
} else {
  const missing = REQUIRED.filter((route) => !built.routes.has(route));
  if (missing.length) {
    // Where the missing route's source file belongs, e.g. `src/app/api/admin/uploads/`.
    const sourceDir = `src/app${missing[0].replace(/\/\[[^\]]+\]$/, "")}/`;
    console.error(
      [
        `[build] ERROR: this build has no handler for ${missing.join(", ")}.`,
        "[build] The admin beat form calls those endpoints, so an upload would fail in the browser",
        '[build] with "Could not start the upload (404)" while the deployment still looks healthy.',
        "[build] The usual cause is a source file that git does not track — a .gitignore rule that",
        "[build] matches a source path, or a file that was never committed. Check with:",
        "[build]   node scripts/check-tracked-sources.mjs",
        `[build]   git ls-files "${sourceDir}"`,
      ].join("\n"),
    );
    process.exit(1);
  }
  console.log(`[build] upload API present in ${built.file} (${REQUIRED.length} routes).`);
}
