import { execFileSync } from "node:child_process";

/**
 * Warns when the working tree contains source files that git does not track.
 *
 * A deployment is built from what git tracks, so a file that `.gitignore`
 * happens to match exists locally and in every test run, then simply is not in
 * production. That is exactly how the upload API went missing: the rule meant
 * for the runtime `uploads/` folder also matched `src/app/api/admin/uploads/`,
 * so the beat form shipped calling an endpoint that was never deployed, and the
 * only symptom was a 404 in the browser.
 *
 * Runs as the first step of `npm run build` so the warning lands in the build
 * log of the platform doing the deploy. It never fails the build: a project
 * downloaded as a ZIP has no git metadata, and a build is the wrong place to
 * discover that.
 */
const SOURCE_DIRS = ["src/", "scripts/", "public/"];

function ignoredSourceFiles() {
  try {
    return execFileSync("git", ["status", "--ignored", "--porcelain"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    })
      .split("\n")
      .filter((line) => line.startsWith("!!"))
      .map((line) => line.slice(3).trim())
      .filter((p) => SOURCE_DIRS.some((dir) => p.startsWith(dir)));
  } catch {
    return null; // no git available (a ZIP download, a Docker context)
  }
}

const ignored = ignoredSourceFiles();
if (ignored === null) {
  console.log("[build] no git metadata found — skipping the tracked-source check.");
} else if (ignored.length) {
  console.warn(
    `[build] WARNING: ${ignored.length} source file(s) are ignored by .gitignore and will be missing from this deployment:\n` +
      ignored
        .slice(0, 10)
        .map((p) => `[build]   ${p}`)
        .join("\n") +
      (ignored.length > 10 ? `\n[build]   … and ${ignored.length - 10} more` : "") +
      "\n[build] Fix the matching rule in .gitignore (anchor it to the repository root, e.g. /uploads/).",
  );
} else {
  console.log("[build] every source file is tracked by git.");
}
