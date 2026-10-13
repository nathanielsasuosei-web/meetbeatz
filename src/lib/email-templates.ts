import type { Booking, DistributionRelease, License, Order, OrderItem } from "@/db/schema";
import type { SiteSettings } from "./settings";
import {
  DELIVERABLE_LABELS,
  deliverableList,
  formatDate,
  formatTime12,
  money,
  networkLabel,
} from "./format";
import { RELEASE_STATUS_LABELS, releaseStatusOf, storeList } from "./release";

function esc(s: string | null | undefined): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function button(href: string, label: string, primary = true) {
  const bg = primary ? "#c6f135" : "#1f1f24";
  const color = primary ? "#0a0a0b" : "#f4f1ea";
  return `<a href="${href}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:${bg};color:${color};font-weight:700;text-decoration:none;font-size:14px;margin:4px 6px 4px 0">${esc(label)}</a>`;
}

export function emailLayout(opts: {
  title: string;
  preheader?: string;
  body: string;
  settings: SiteSettings;
  baseUrl: string;
}): string {
  const { title, preheader = "", body, settings, baseUrl } = opts;
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:#0a0a0b;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#f4f1ea">
<span style="display:none;max-height:0;overflow:hidden">${esc(preheader)}</span>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0a0a0b"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="600" cellspacing="0" cellpadding="0" style="max-width:600px;width:100%">
<tr><td style="padding:0 0 20px 0">
  <a href="${baseUrl}" style="text-decoration:none;color:#f4f1ea;font-size:22px;font-weight:900;letter-spacing:0.18em">MEET<span style="color:#c81e22">BEATZ</span></a>
</td></tr>
<tr><td style="background:#141417;border:1px solid #26262c;border-radius:20px;padding:32px">
${body}
</td></tr>
<tr><td style="padding:24px 8px 0 8px;color:#8b8b95;font-size:12px;line-height:1.6">
  ${esc(settings.siteName)} · ${esc(settings.location)}<br>
  ${esc(settings.contactEmail)} · ${esc(settings.contactPhone)}<br>
  <a href="${baseUrl}" style="color:#c6f135">${baseUrl.replace(/^https?:\/\//, "")}</a>
</td></tr>
</table></td></tr></table></body></html>`;
}

function summaryRow(label: string, value: string, strong = false) {
  const weight = strong ? "700" : "400";
  const color = strong ? "#f4f1ea" : "#c8c8d0";
  return `<tr><td style="padding:6px 0;color:#8b8b95;font-size:14px">${esc(label)}</td><td align="right" style="padding:6px 0;color:${color};font-size:14px;font-weight:${weight}">${value}</td></tr>`;
}

export function purchaseEmailHtml(opts: {
  order: Order;
  licenses: License[];
  baseUrl: string;
  settings: SiteSettings;
}): string {
  const { order, licenses, baseUrl, settings } = opts;
  const currency = order.currency;

  const licenseBlocks = licenses
    .map((lic) => {
      const files = deliverableList(lic.deliverables);
      const downloadButtons = files
        .map((f) =>
          button(`${baseUrl}/api/download/${lic.downloadToken}?file=${f}`, `Download ${DELIVERABLE_LABELS[f] ?? f.toUpperCase()}`),
        )
        .join("");
      return `<div style="border:1px solid #26262c;border-radius:14px;padding:18px;margin:0 0 14px 0;background:#0f0f12">
  <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#c6f135;font-weight:700">${esc(lic.licenseName)}</div>
  <div style="font-size:20px;font-weight:800;margin:6px 0 2px 0;color:#f4f1ea">${esc(lic.beatTitle)}</div>
  <div style="font-size:13px;color:#8b8b95;margin-bottom:12px">License key: <span style="font-family:Menlo,Consolas,monospace;color:#f4f1ea">${esc(lic.licenseKey)}</span></div>
  <div>${downloadButtons}</div>
  <div style="margin-top:10px">${button(`${baseUrl}/license/${lic.licenseKey}`, "View license certificate", false)}</div>
</div>`;
    })
    .join("");

  const body = `
<h1 style="margin:0 0 8px 0;font-size:26px;line-height:1.2;color:#f4f1ea">Your beats are ready, ${esc(order.customerName.split(" ")[0])} 🎧</h1>
<p style="margin:0 0 22px 0;color:#c8c8d0;font-size:15px;line-height:1.6">Payment received via ${esc(networkLabel(order.network))}. Your files and license are below — this email is your proof of purchase, so keep it safe.</p>
${licenseBlocks}
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0 0 0;border-top:1px solid #26262c;padding-top:12px">
${summaryRow("Order reference", `<span style="font-family:Menlo,Consolas,monospace">${esc(order.reference)}</span>`)}
${summaryRow("Beat price", money(order.subtotal, currency))}
${Number(order.discount) > 0 ? summaryRow(`Promo discount${order.promoCode ? ` (${esc(order.promoCode)})` : ""}`, `−${money(order.discount, currency)}`) : ""}
${summaryRow(`Service fee (${Number(order.feePercent)}%)`, money(order.fee, currency))}
${summaryRow("Total paid", money(order.total, currency), true)}
</table>
<p style="margin:22px 0 0 0;color:#8b8b95;font-size:13px;line-height:1.6">Download links are personal to you. You can always come back to your order page: <a href="${baseUrl}/orders/${order.reference}" style="color:#c6f135">${baseUrl}/orders/${order.reference}</a></p>
<p style="margin:12px 0 0 0;color:#8b8b95;font-size:13px;line-height:1.6">Credit the producer as <strong style="color:#f4f1ea">"Prod. by ${esc(settings.siteName)}"</strong> wherever the beat is used.</p>`;

  return emailLayout({
    title: `Your ${settings.siteName} order ${order.reference}`,
    preheader: `Download links + license for ${licenses.map((l) => l.beatTitle).join(", ")}`,
    body,
    settings,
    baseUrl,
  });
}

export function bookingEmailHtml(opts: {
  order: Order;
  booking: Booking;
  baseUrl: string;
  settings: SiteSettings;
}): string {
  const { order, booking, baseUrl, settings } = opts;
  const currency = order.currency;
  const balance = Math.max(0, Number(booking.sessionPrice) - Number(booking.amountPaid));

  const body = `
<h1 style="margin:0 0 8px 0;font-size:26px;line-height:1.2;color:#f4f1ea">Session confirmed 🎙️</h1>
<p style="margin:0 0 22px 0;color:#c8c8d0;font-size:15px;line-height:1.6">Hi ${esc(order.customerName.split(" ")[0])}, your ${esc(booking.serviceName)} session at ${esc(settings.siteName)} is locked in.</p>
<div style="border:1px solid #26262c;border-radius:14px;padding:18px;background:#0f0f12">
  <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#c6f135;font-weight:700">${esc(booking.serviceName)}</div>
  <div style="font-size:22px;font-weight:800;margin:6px 0 2px 0;color:#f4f1ea">${esc(formatDate(booking.bookingDate))}</div>
  <div style="font-size:16px;color:#f4f1ea">${esc(formatTime12(booking.startTime))} – ${esc(formatTime12(booking.endTime))} (${booking.hours} hr${booking.hours > 1 ? "s" : ""})</div>
  <div style="font-size:13px;color:#8b8b95;margin-top:8px">${esc(settings.location)}</div>
</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0 0 0;border-top:1px solid #26262c;padding-top:12px">
${summaryRow("Booking reference", `<span style="font-family:Menlo,Consolas,monospace">${esc(order.reference)}</span>`)}
${summaryRow("Session price", money(booking.sessionPrice, currency))}
${summaryRow("Paid online (deposit)", money(booking.amountPaid, currency))}
${summaryRow(`Service fee (${Number(order.feePercent)}%)`, money(order.fee, currency))}
${summaryRow("Total charged", money(order.total, currency), true)}
${summaryRow("Balance due at studio", money(balance, currency), true)}
</table>
${booking.notes ? `<p style="margin:18px 0 0 0;color:#8b8b95;font-size:13px"><strong style="color:#f4f1ea">Your notes:</strong> ${esc(booking.notes)}</p>` : ""}
<p style="margin:18px 0 0 0;color:#c8c8d0;font-size:13px;line-height:1.6">${esc(settings.bookingPolicy)}</p>
<div style="margin-top:18px">${button(`${baseUrl}/orders/${order.reference}`, "View booking")}</div>`;

  return emailLayout({
    title: `Studio session confirmed — ${formatDate(booking.bookingDate)}`,
    preheader: `${booking.serviceName} on ${formatDate(booking.bookingDate)} at ${formatTime12(booking.startTime)}`,
    body,
    settings,
    baseUrl,
  });
}

/**
 * Sent to the artist when a distribution submission is paid: what they sent,
 * where it is going, and what happens next.
 */
export function distributionEmailHtml(opts: {
  order: Order;
  release: DistributionRelease;
  baseUrl: string;
  settings: SiteSettings;
}): string {
  const { order, release, baseUrl, settings } = opts;
  const currency = order.currency;
  const stores = storeList(release.stores);

  const body = `
<h1 style="margin:0 0 8px 0;font-size:26px;line-height:1.2;color:#f4f1ea">Release received 📀</h1>
<p style="margin:0 0 22px 0;color:#c8c8d0;font-size:15px;line-height:1.6">Hi ${esc(order.customerName.split(" ")[0])}, ${esc(settings.siteName)} has "${esc(release.releaseTitle)}" and is preparing it for delivery.</p>
<div style="border:1px solid #26262c;border-radius:14px;padding:18px;background:#0f0f12">
  <div style="font-size:11px;letter-spacing:0.16em;text-transform:uppercase;color:#c6f135;font-weight:700">${esc(release.planName)} release</div>
  <div style="font-size:22px;font-weight:800;margin:6px 0 2px 0;color:#f4f1ea">${esc(release.releaseTitle)}</div>
  <div style="font-size:15px;color:#f4f1ea">${esc(release.artistName)}${release.genre ? ` · ${esc(release.genre)}` : ""}${release.explicit ? " · explicit" : ""}</div>
  <div style="font-size:13px;color:#8b8b95;margin-top:8px">${stores.map(esc).join(" · ")}</div>
</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:18px 0 0 0;border-top:1px solid #26262c;padding-top:12px">
${summaryRow("Release reference", `<span style="font-family:Menlo,Consolas,monospace">${esc(release.reference)}</span>`)}
${summaryRow("Order reference", `<span style="font-family:Menlo,Consolas,monospace">${esc(order.reference)}</span>`)}
${release.releaseDate ? summaryRow("Requested release date", formatDate(release.releaseDate)) : summaryRow("Release date", "As soon as it is ready")}
${release.isrc ? summaryRow("ISRC", esc(release.isrc)) : summaryRow("ISRC", "To be assigned")}
${release.upc ? summaryRow("UPC / EAN", esc(release.upc)) : summaryRow("UPC / EAN", "To be assigned")}
${summaryRow(`Distribution (${release.planName})`, money(order.subtotal, currency))}
${summaryRow(`Service fee (${Number(order.feePercent)}%)`, money(order.fee, currency))}
${summaryRow("Paid", money(order.total, currency), true)}
${summaryRow("Status", RELEASE_STATUS_LABELS[releaseStatusOf(release.status)])}
</table>
<p style="margin:18px 0 0 0;color:#c8c8d0;font-size:13px;line-height:1.7">
  <strong style="color:#f4f1ea">What happens next:</strong> the artwork and audio are checked against each store's
  specification — square artwork at 3000 × 3000, a clean master with no clipping, correct credits. If something needs
  fixing you will get an email saying exactly what, and nothing is delivered until you approve the change. Once it is
  accepted, delivery takes a few working days and the stores need a little longer to index it.
</p>
<div style="margin-top:18px">${button(`${baseUrl}/account`, "Track this release")}${button(`${baseUrl}/orders/${order.reference}`, "View receipt", false)}</div>`;

  return emailLayout({
    title: `Release received — ${release.releaseTitle}`,
    preheader: `${release.planName} distribution for ${release.releaseTitle}, going to ${stores.slice(0, 3).join(", ")}${stores.length > 3 ? " and more" : ""}`,
    body,
    settings,
    baseUrl,
  });
}

export function adminNewOrderHtml(opts: {
  order: Order;
  items: OrderItem[];
  booking: Booking | null;
  /** Present when `order.kind === "distribution"`. */
  release?: DistributionRelease | null;
  baseUrl: string;
  settings: SiteSettings;
}): string {
  const { order, items, booking, release, baseUrl, settings } = opts;
  const currency = order.currency;
  const lines =
    order.kind === "beat"
      ? items.map((i) => `<li>${esc(i.beatTitle)} — ${esc(i.licenseName)} (${money(i.price, currency)})</li>`).join("")
      : order.kind === "distribution" && release
        ? `<li>${esc(release.releaseTitle)} · ${esc(release.planName)} · ${esc(storeList(release.stores).join(", "))}</li>`
        : booking
          ? `<li>${esc(booking.serviceName)} · ${esc(formatDate(booking.bookingDate))} · ${esc(formatTime12(booking.startTime))}–${esc(formatTime12(booking.endTime))}</li>`
          : "";

  const heading =
    order.kind === "beat" ? "beat sale" : order.kind === "distribution" ? "release submission" : "studio booking";
  const adminLink =
    order.kind === "beat" ? "orders" : order.kind === "distribution" ? "distribution" : "bookings";

  const body = `
<h1 style="margin:0 0 8px 0;font-size:22px;color:#f4f1ea">New ${heading} 💸</h1>
<p style="margin:0 0 14px 0;color:#c8c8d0;font-size:14px">${esc(order.customerName)} · ${esc(order.customerEmail)} · ${esc(order.customerPhone)} · ${esc(networkLabel(order.network))}</p>
<ul style="color:#f4f1ea;font-size:14px;line-height:1.7;padding-left:18px">${lines}</ul>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:8px 0 0 0;border-top:1px solid #26262c;padding-top:12px">
${summaryRow("Reference", esc(order.reference))}
${summaryRow("Goes to Meetbeatz", money(order.subtotal, currency), true)}
${Number(order.discount) > 0 ? summaryRow(`Promo discount${order.promoCode ? ` (${esc(order.promoCode)})` : ""}`, `−${money(order.discount, currency)}`) : ""}
${summaryRow(`Fee account (${Number(order.feePercent)}%)`, money(order.fee, currency))}
${summaryRow("Customer paid", money(order.total, currency), true)}
</table>
<div style="margin-top:18px">${button(`${baseUrl}/admin/${adminLink}`, "Open admin")}</div>`;

  return emailLayout({ title: `New order ${order.reference}`, body, settings, baseUrl });
}
