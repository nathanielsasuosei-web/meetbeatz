# Security Policy

## Reporting a Vulnerability

Please do not open a public issue. Email the address in the site footer
(Admin → Settings → Contact) with what you found, the steps to reproduce it, and
whether it has been exploited. Aim to hear back within 3 working days. Do not
test against a deployment that is serving real customers without permission —
run it locally with `npm run dev` and the simulated payment mode.

---

## Content protection (screen recording and capture)

Beats, artwork and unreleased masters are the product, so the storefront tries to
stop them being captured. **Read this section before promising a customer that
recording is impossible — it is not, and the honest limits are part of the
design.**

### What is actually enforced

| Layer | Where | Effect |
| --- | --- | --- |
| `Permissions-Policy: display-capture=()` | `next.config.mjs` → `headers()` | Blocks `getDisplayMedia()` in Chrome, Edge and Safari before any JavaScript runs. This is the strongest layer: the browser refuses the capture at policy level, including for extensions using the API. |
| `getDisplayMedia` replacement | `src/components/screen-guard.tsx` | Where the header is not honoured (Firefox, older browsers), the call itself rejects and the attempt is logged. Restored on unmount so it cannot leak into other pages. |
| Capture-device detection | same file | `enumerateDevices()` baseline, then a 2 s poll plus `devicechange`. A new video input whose label matches a known recorder ("OBS", "Loom", "Screen Recording", …) is treated as capture software. A label-less new video input must survive two consecutive scans before it counts, so a webcam being plugged in is not reported as an attack. |
| Print Screen and shortcut interception | same file | Capture-phase `keydown` swallows `PrintScreen`, ⌘⇧3/4/5, Ctrl/⌘+S/P/U, F12 and the DevTools chords, and writes a 1×1 transparent PNG over the clipboard so a screenshot lands nowhere useful. |
| Veil on tab hide | same file | `visibilitychange` (and `blur`, after 900 ms, only when not framed) drops an opaque blurred cover over the store, so a recording of a background tab captures nothing. Skipped inside an iframe because the tab is not really hidden there. |
| Watermark | same file | A tiled diagonal canvas watermark carrying the signed-in email (or a per-session visitor id) and the minute. Not a deterrent — a **tracer**: a leaked video can be tied to one account and one time. |
| Media hardening | `src/components/beat-video.tsx` | `controlsList="nodownload noremoteplayback noplaybackrate"`, `disablePictureInPicture`, no context menu, plus `data-sg-protect` which also blocks drag-out on images and audio. |
| Print replacement | `src/app/globals.css` | `@media print` swaps the page for a notice, so Ctrl+P produces nothing. |
| Audio pause on incident | `screen-guard.tsx` → `raise()` | Any high-severity event pauses every `audio`/`video` element, which stops a preview being played into a recorder while the guard reacts. |

Every reaction funnels through one `raise()` function, so the three enforcement
levels stay consistent:

- **Full block** (default, Admin → Settings → Content protection): high-severity
  events veil the page and show an `alertdialog`; medium and low show a toast.
- **Warn only**: toasts, nothing veiled.
- **Off**: the component renders `null` and `/api/screen-guard` no-ops.

### Honest limits

A browser cannot stop:

- **Hardware capture** — an HDMI splitter, a capture card, a second camera
  pointed at the screen. Nothing in software can see these.
- **OS-level screen recorders that bypass `getDisplayMedia`** — macOS QuickTime
  and the Windows Xbox Game Bar capture the whole desktop, not the browser, and
  no web page is in the path. The `Permissions-Policy` header does not reach
  them.
- **A phone's built-in screen recorder** recording the phone's own display. The
  site can only detect it indirectly (a new capture device in
  `enumerateDevices()`, which mobile browsers often do not expose at all).
- **Anything the visitor can already hear.** A preview that plays is a preview
  that can be re-recorded through the speaker.

What the guard genuinely buys: casual capture is blocked or deterred, every
attempt is attributed to an account or visitor id, and a leaked video carries a
watermark that identifies its source. Admin → Protection shows the attempts from
the last 7 days, split into "blocked outright" and "detected and traced, not
blocked" — the second panel exists so nobody mistakes detection for prevention.

### The reporting endpoint

`POST /api/screen-guard` is deliberately unauthenticated: an anonymous visitor is
exactly who needs reporting. It is therefore rate-limited at three levels so it
cannot be used as a write-amplification attack:

- 2 KB body cap (413 above it);
- a sliding budget of 12 reports per 60 s per visitor id, falling back to the
  forwarded IP for anonymous traffic, with silent drops past it;
- a 20 s client-side cooldown per `kind|detail` and a 40-report cap per session.

The email is read from the session, never from the request body, so a report
cannot be forged to blame another account. The visitor id is stripped to
`[A-Za-z0-9_-]{0,40}`.

---

## Uploads

Files are stored as bytea chunks in PostgreSQL (`stored_files`,
`stored_file_chunks`) because the target host's filesystem is read-only and its
request-body limit is around 4.5 MB. `src/lib/client-upload.ts` splits a file,
POSTs a session, PUTs the parts and halves the chunk size on a 413, remembering
it for the session.

There are two upload APIs over the same storage, and the separation is
deliberate:

- `/api/admin/uploads[/*]` — admin session, every slot.
- `/api/uploads[/*]` — **customer** session, and only the slots an artist fills:
  `artwork`, `masters`, `takes` (`CUSTOMER_UPLOAD_KINDS` in
  `src/lib/upload-rules.ts`). Admin-only slots (`wav`, `mp3`, `stems`, `covers`,
  `previews`, `videos`, `sound-kits`) are refused, so the public route can never
  write into the store's own catalogue.

Upload ids are sequential, so `PUT`/`POST`/`DELETE` on `/api/uploads/[id]` check
the session's kind through `getUploadKind()` and return 403 for anything else —
without that, a signed-in artist could write parts into, or cancel, an admin's
half-finished beat master by guessing the next id.

Extensions are validated per slot in `ALLOWED_EXT`, and `masters`/`takes` accept
only formats a distributor or a mixing engineer can ingest (no `webm`/`ogg`:
`MediaRecorder` output would be stored with `video/webm`, which is why the
browser studio encodes WAV itself).

`collectGarbage()` in `src/lib/files.ts` deletes complete files older than
`ORPHAN_TTL_DAYS` (7) that nothing references. **Every table that can own a file
must appear in its `NOT EXISTS` list** — a slot missing from it has its files
silently deleted a week after upload, which for a distribution master means an
artist's finished song disappears while the release is still in review.
`distribution_releases.artwork_path`, `distribution_releases.audio_path` and
`remote_sessions.take_path` are all covered.

## Serving artist files

`/api/artist-files/[...path]` serves the three artist slots. `artwork/` is public
(it is about to be printed on every store). `masters/` and `takes/` are
**unreleased music**, so they are streamed only to an admin session or to the
customer whose `distribution_releases`/`remote_sessions` row references that
exact path. Everything else returns 404 rather than 403, because confirming that
a path exists is itself a leak. `/api/media/[...path]` stays limited to
`covers/`.

Paths are validated to exactly two non-empty segments with no `..`, matching the
`kind/filename` shape the uploader writes.

## Sessions

Two independent JWT cookies (`mb_admin_session`, `mb_customer_session`), both
HS256 over `SESSION_SECRET`, both `httpOnly` and `sameSite=lax`. The customer
token carries a `role: "customer"` claim that the admin token does not, so one
can never be replayed as the other. Checkout endpoints reject a payload email
that differs from the session email, so a release or booking cannot be moved onto
somebody else's account.

## Payments

Nothing financial is trusted from the client. Totals are recomputed server-side
from the catalogue (`computeTotals`), Paystack responses are verified against the
webhook signature, and `finalizeOrder()` is idempotent — a repeated webhook
returns early and cannot double-issue a license or drag a release that is already
in review back to `submitted`. With no `PAYSTACK_SECRET_KEY`, the whole store
runs in simulation mode, which is what the tests above exercise.
