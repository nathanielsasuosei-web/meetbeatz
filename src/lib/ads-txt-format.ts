/**
 * Lightweight validator for ads.txt contents. ads.txt is one line per record,
 * with three or four comma-separated fields:
 *   `ADSYSTEM_DOMAIN, PUBLISHER_ACCOUNT_ID, RELATIONSHIP[, CERT_ID]`
 *
 * We don't enforce the full IAB spec — we just catch the obvious mistakes
 * so admins don't ship a file AdSense will reject as malformed.
 *
 * Pure function (no I/O, no Node imports) so it can be safely imported from
 * client components.
 */
export type AdsTxtIssue = { line: number; message: string };

export function validateAdsTxt(contents: string): AdsTxtIssue[] {
  const issues: AdsTxtIssue[] = [];
  const lines = contents.split("\n");
  let recordLines = 0;
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    recordLines += 1;
    const fields = line.split(",").map((f) => f.trim());
    if (fields.length < 3) {
      issues.push({
        line: i + 1,
        message: `Expected 3 records, got ${fields.length}: "${line}"`,
      });
      continue;
    }
    const [domain, account, relation] = fields;
    if (!/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(domain)) {
      issues.push({ line: i + 1, message: `First record should be a domain like "google.com", got "${domain}"` });
    }
    if (relation !== "DIRECT" && relation !== "RESELLER") {
      issues.push({ line: i + 1, message: `Third record must be DIRECT or RESELLER, got "${relation}"` });
    }
    // AdSense account IDs are "pub-XXXXXXXXXXXXXXXX" (16 decimal digits).
    if (domain === "google.com" && !/^pub-\d{16}$/.test(account)) {
      issues.push({
        line: i + 1,
        message: `For google.com the second record must be a pub- followed by 16 digits, got "${account}"`,
      });
    }
  }
  if (recordLines === 0) {
    issues.push({ line: 0, message: "File is empty — at least one record (e.g. the Google line) is required." });
  }
  return issues;
}