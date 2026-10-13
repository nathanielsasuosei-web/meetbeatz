import Link from "next/link";
import { PageHeader } from "@/components/admin/flash";
import { formatDateTime } from "@/lib/format";
import { listSecurityEvents, securityEventStats } from "@/lib/security-events";
import { SCREEN_GUARD_LABELS } from "@/lib/screen-guard";
import { getSettings } from "@/lib/settings";

export const metadata = { title: "Content protection" };
export const dynamic = "force-dynamic";

const SEVERITY_TONE: Record<string, string> = {
  high: "badge !border-danger/40 !text-danger",
  medium: "badge !border-amber-500/40 !text-amber-300",
  low: "badge",
};

/**
 * Every screen-recording, screenshot and rip attempt the storefront guard
 * reported. The rows are the forensic half of the protection: the browser can
 * refuse the easy capture paths, and this is where the ones it could not stop
 * are written down, named by account.
 */
export default async function AdminSecurityPage() {
  const [settings, events, stats] = await Promise.all([getSettings(), listSecurityEvents(200), securityEventStats(7)]);

  return (
    <>
      <PageHeader eyebrow="Content protection" title="Recording attempts">
        <Link href="/admin/settings" className="btn-ghost">
          Change protection level
        </Link>
      </PageHeader>

      <div className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="eyebrow">Current level</p>
            <p className="mt-1 text-lg font-bold">{SCREEN_GUARD_LABELS[settings.screenGuard].name}</p>
            <p className="mt-1 max-w-2xl text-xs leading-relaxed text-muted">
              {SCREEN_GUARD_LABELS[settings.screenGuard].hint}
            </p>
          </div>
          <dl className="grid shrink-0 grid-cols-3 gap-3 text-center">
            {[
              { label: "Events · 7d", value: stats.total },
              { label: "Visitors · 7d", value: stats.visitors },
              { label: "High · 7d", value: stats.high },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-line bg-white/[0.02] px-3 py-2">
                <dd className="display text-2xl text-acid">{stat.value}</dd>
                <dt className="mt-0.5 text-[10px] uppercase tracking-wider text-muted">{stat.label}</dt>
              </div>
            ))}
          </dl>
        </div>
      </div>

      <div className="card mt-6 p-5">
        <h2 className="font-bold">What is actually being stopped</h2>
        <div className="mt-3 grid gap-3 text-xs leading-relaxed sm:grid-cols-2">
          <div className="rounded-xl border border-ok/30 bg-ok/5 p-3">
            <p className="font-bold text-ok">Blocked outright</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-muted">
              <li>In-browser screen, tab and window sharing — denied by the <code>display-capture</code> permission policy and again in page script.</li>
              <li>Right-click save, drag-to-desktop and Print Screen on artwork and players.</li>
              <li>Print-to-PDF of the storefront, and the download button on video previews.</li>
              <li>Picture-in-picture, which would let a preview be filmed on a second device.</li>
            </ul>
          </div>
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
            <p className="font-bold text-amber-300">Detected and traced, not blocked</p>
            <ul className="mt-2 list-disc space-y-1 pl-4 text-muted">
              <li>Operating-system recorders — a phone screen recorder, OBS, QuickTime, the Windows Game Bar. They run outside the browser; Safari exposes them and is caught, Chrome and Firefox never report them to a web page.</li>
              <li>A phone pointed at the screen. Nothing on the internet can see that — the watermark exists so the copy that surfaces names the account it came from.</li>
            </ul>
          </div>
        </div>
        <p className="mt-3 text-[11px] text-muted">
          Playback that a recorder genuinely cannot capture needs DRM (Widevine/FairPlay with an EME licence server) and
          hardware-backed output protection. See <code>SECURITY.md</code>.
        </p>
      </div>

      <h2 className="mt-8 font-bold">Recent events</h2>
      {events.length === 0 ? (
        <div className="card mt-3 p-10 text-center">
          <p className="text-3xl">◈</p>
          <p className="mt-3 font-bold">No attempts recorded</p>
          <p className="mt-1 text-sm text-muted">
            When a visitor tries to record, screenshot or save the store, it shows up here with the page, the account and
            the browser.
          </p>
        </div>
      ) : (
        <div className="card mt-3 overflow-x-auto p-0">
          <table className="table-base w-full min-w-[46rem]">
            <thead>
              <tr>
                <th>When</th>
                <th>Event</th>
                <th>Detail</th>
                <th>Page</th>
                <th>Account</th>
                <th>Visitor</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td className="whitespace-nowrap text-muted">{formatDateTime(event.createdAt)}</td>
                  <td>
                    <span className={SEVERITY_TONE[event.severity] ?? "badge"}>{event.severity}</span>
                    <span className="ml-2 font-semibold">{event.label}</span>
                  </td>
                  <td className="max-w-[22rem]">
                    <span className="block truncate font-mono text-[11px] text-muted" title={event.detail}>
                      {event.detail || "—"}
                    </span>
                  </td>
                  <td className="font-mono text-[11px] text-muted">{event.path || "—"}</td>
                  <td className="text-[11px]">
                    {event.customerEmail ? (
                      <span className="font-semibold text-cream">{event.customerEmail}</span>
                    ) : (
                      <span className="text-muted">anonymous</span>
                    )}
                  </td>
                  <td className="font-mono text-[11px] text-muted">{event.visitorId || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
