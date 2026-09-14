/**
 * DATABASE_URL arrives from dashboards and .env files with all kinds of
 * decorations: pasted quotes, trailing newlines, stray spaces. Postgres
 * accepts none of them, and the resulting error ("Failed query: select 1")
 * says nothing about why, so normalise the value once here and describe what
 * was wrong for /api/health.
 */
export type DatabaseUrlReport = {
  /** The value after trimming and removing a matching pair of surrounding quotes. */
  value: string;
  /** Whether the cleaned value is a usable postgres URL. */
  valid: boolean;
  /** Human-readable problems found in the raw value (safe to display). */
  issues: string[];
};

const POSTGRES_SCHEME = /^postgres(ql)?:\/\//i;

export function inspectDatabaseUrl(raw: string | undefined): DatabaseUrlReport {
  const issues: string[] = [];

  if (!raw) {
    return { value: "", valid: false, issues: ["DATABASE_URL is not set"] };
  }

  if (raw !== raw.trim()) {
    issues.push("value has leading or trailing whitespace");
  }
  if (/[\r\n]/.test(raw)) {
    issues.push("value contains a line break");
  }

  let value = raw.trim();

  const quote = value[0];
  if ((quote === '"' || quote === "'") && value.length > 1 && value.endsWith(quote)) {
    value = value.slice(1, -1).trim();
    issues.push(`value is wrapped in ${quote === '"' ? "double" : "single"} quotes`);
  } else if (value.startsWith('"') || value.startsWith("'")) {
    issues.push("value starts with an unmatched quote");
  }

  if (/^database_url\s*=/i.test(value)) {
    issues.push('value still includes the "DATABASE_URL=" prefix — paste only the connection string');
    value = value.replace(/^database_url\s*=/i, "").trim();
  }

  if (!POSTGRES_SCHEME.test(value)) {
    issues.push('value does not start with "postgresql://" or "postgres://"');
  }

  let valid = false;
  try {
    new URL(value);
    valid = POSTGRES_SCHEME.test(value);
  } catch {
    issues.push("value is not a parseable URL");
  }

  return { value, valid, issues };
}

/** Cleaned DATABASE_URL, or null when it is missing. */
export function resolveDatabaseUrl(): string | null {
  const { value } = inspectDatabaseUrl(process.env.DATABASE_URL);
  return value.length > 0 ? value : null;
}
