/**
 * Email validation shared by every form that collects an address — the beat
 * checkout, the studio booking, the contact page, customer sign-up and the
 * "change my email" box on the account page.
 *
 * It runs in the browser (for instant feedback before anything is submitted)
 * and again on the server (so a request that never touched the form — a script
 * or an older cached page — is still rejected). Keep this file free of server
 * imports: client components import it too.
 */

/**
 * Practical address check: something@domain.tld, at least two letters in the
 * top-level domain, no spaces, and no consecutive dots. Deliberately not the
 * full RFC grammar — it accepts every address a real customer types while
 * rejecting the mistakes people actually make ("kwame@", "kwame@gmail",
 * "kwame @gmail.com", "kwame@gmail .com").
 */
export const EMAIL_PATTERN = /^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\.)+[A-Za-z]{2,24}$/;

/** The message shown wherever an address does not pass. */
export const EMAIL_ERROR = "Enter a valid email address, like you@example.com.";

/** Trims and lowercases an address so sign-in and order matching stay case-insensitive. */
export function normalizeEmailAddress(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

export function isValidEmail(value: unknown): boolean {
  const email = typeof value === "string" ? value.trim() : normalizeEmailAddress(value);
  if (!email || email.length > 254 || email.includes("..")) return false;
  return EMAIL_PATTERN.test(email);
}
