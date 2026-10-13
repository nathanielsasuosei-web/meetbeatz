/**
 * Shared vocabulary for releases and remote sessions: the stores a song goes to,
 * and the statuses a submission moves through.
 *
 * Nothing here may import `@/db`, `fs` or anything else server-only — the
 * distribution form, the recorder and the admin pages all import it from the
 * browser, and the labels have to match the values the server writes.
 */

/** Where a release is delivered. The artist ticks the ones they want. */
export const DISTRIBUTION_STORES = [
  { slug: "spotify", name: "Spotify" },
  { slug: "apple-music", name: "Apple Music" },
  { slug: "boomplay", name: "Boomplay" },
  { slug: "audiomack", name: "Audiomack" },
  { slug: "youtube-music", name: "YouTube Music" },
  { slug: "tiktok", name: "TikTok & Instagram" },
  { slug: "deezer", name: "Deezer" },
  { slug: "tidal", name: "Tidal" },
  { slug: "amazon", name: "Amazon Music" },
  { slug: "shazam", name: "Shazam" },
] as const;

export type StoreSlug = (typeof DISTRIBUTION_STORES)[number]["slug"];

/** The two stores that matter most in Ghana go first, and are ticked by default. */
export const DEFAULT_STORES: string[] = ["spotify", "apple-music", "boomplay", "audiomack", "youtube-music", "tiktok"];

export function storeName(slug: string): string {
  return DISTRIBUTION_STORES.find((store) => store.slug === slug)?.name ?? slug;
}

/** Comma-separated slugs → readable list, for emails, receipts and the dashboard. */
export function storeList(csv: string): string[] {
  return csv
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean)
    .map(storeName);
}

export const RELEASE_STATUSES = [
  "awaiting_payment",
  "submitted",
  "in_review",
  "changes_requested",
  "approved",
  "live",
  "rejected",
  "cancelled",
] as const;

export type ReleaseStatus = (typeof RELEASE_STATUSES)[number];

export const RELEASE_STATUS_LABELS: Record<ReleaseStatus, string> = {
  awaiting_payment: "Awaiting payment",
  submitted: "Submitted",
  in_review: "In review",
  changes_requested: "Changes requested",
  approved: "Approved — being delivered",
  live: "Live on the stores",
  rejected: "Not accepted",
  cancelled: "Cancelled",
};

/** What the artist is told at each stage, on their account page. */
export const RELEASE_STATUS_HINTS: Record<ReleaseStatus, string> = {
  awaiting_payment: "Finish the payment to send this release to the studio.",
  submitted: "Paid and received. The studio checks the artwork and audio against store specs.",
  in_review: "Being reviewed — you will hear back within one working day.",
  changes_requested: "Something needs fixing before it can go out. Read the note below.",
  approved: "Accepted and queued for delivery to your stores.",
  live: "Your release is live. Royalty reports follow each month.",
  rejected: "This release was not accepted. The note below explains why.",
  cancelled: "This release was cancelled.",
};

export function releaseStatusOf(value: string): ReleaseStatus {
  return (RELEASE_STATUSES as readonly string[]).includes(value) ? (value as ReleaseStatus) : "submitted";
}

/** Tailwind classes for a status badge, shared by the storefront and the dashboard. */
export const RELEASE_STATUS_TONES: Record<ReleaseStatus, string> = {
  awaiting_payment: "badge",
  submitted: "badge",
  in_review: "badge !border-amber-500/40 !text-amber-300",
  changes_requested: "badge !border-amber-500/40 !text-amber-300",
  approved: "badge-acid",
  live: "badge-acid",
  rejected: "badge !border-danger/40 !text-danger",
  cancelled: "badge !border-danger/40 !text-danger",
};

/** What an artist wants out of a remote session with the producer. */
export const SESSION_GOALS = [
  { slug: "vocals", name: "Record vocals", hint: "Sing or rap over a beat with the producer directing the takes" },
  { slug: "topline", name: "Topline & writing", hint: "Melody and lyrics written together over an instrumental" },
  { slug: "mix-feedback", name: "Mix feedback", hint: "Play your rough mix, get notes you can act on" },
  { slug: "full-production", name: "Full remote production", hint: "Arrange, record and finish the record over several sessions" },
] as const;

export type SessionGoal = (typeof SESSION_GOALS)[number]["slug"];

export const SESSION_GOAL_LABELS: Record<string, string> = Object.fromEntries(
  SESSION_GOALS.map((goal) => [goal.slug, goal.name]),
);

export const SESSION_STATUSES = ["requested", "scheduled", "completed", "cancelled"] as const;

export type SessionStatus = (typeof SESSION_STATUSES)[number];

export const SESSION_STATUS_LABELS: Record<SessionStatus, string> = {
  requested: "Requested",
  scheduled: "Scheduled",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const SESSION_STATUS_TONES: Record<SessionStatus, string> = {
  requested: "badge !border-amber-500/40 !text-amber-300",
  scheduled: "badge-acid",
  completed: "badge",
  cancelled: "badge !border-danger/40 !text-danger",
};

export function sessionStatusOf(value: string): SessionStatus {
  return (SESSION_STATUSES as readonly string[]).includes(value) ? (value as SessionStatus) : "requested";
}
