import { Flash, PageHeader } from "@/components/admin/flash";
import { SubaccountCreator } from "@/components/admin/subaccount-creator";
import { UploadMemory } from "@/components/admin/upload-memory";
import { AdsTxtEditor } from "@/components/admin/ads-txt-editor";
import { isPaystackConfigured } from "@/lib/paystack";
import { emailProvider, getPaymentMode, getSettings } from "@/lib/settings";
import { getAdsTxt } from "@/lib/ads-txt";
import { configuredAdSensePublisherId, configuredAdSenseSlotId } from "@/lib/adsense-config";
import { getBaseUrl } from "@/lib/url";
import { isWhatsAppConfigured } from "@/lib/whatsapp";
import { listPromoCodes } from "@/lib/promos";
import { changePasswordAction, createPromoCodeAction, generatePromoCodeAction, saveSettingsAction, sendTestEmailAction, sendTestWhatsAppAction, togglePromoCodeAction } from "../actions";

function promoExpiryInput(value: string): string {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function promoExpiryLabel(value: string | null): string {
  if (!value) return "No expiry";
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString("en-GH", { dateStyle: "medium", timeStyle: "short" }) : "Invalid expiry";
}

export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  const { msg, err } = await searchParams;
  const [settings, baseUrl, adsTxt, promoCodes] = await Promise.all([getSettings(), getBaseUrl(), getAdsTxt(), listPromoCodes()]);
  const paystack = isPaystackConfigured();
  const mode = getPaymentMode();
  const email = emailProvider();
  const publisherConfigured = Boolean(configuredAdSensePublisherId(process.env.NEXT_PUBLIC_ADSENSE_PUBLISHER_ID));
  const beatDetailSlotConfigured = Boolean(configuredAdSenseSlotId(process.env.NEXT_PUBLIC_ADSENSE_SLOT_BEAT_DETAIL));
  const autoAdsEnabled = process.env.NEXT_PUBLIC_ADSENSE_AUTO_ADS === "1";

  return (
    <>
      <PageHeader eyebrow="Configuration" title="Settings" />
      <Flash msg={msg} err={err} />

      <div className="grid gap-8 xl:grid-cols-[1.3fr_1fr]">
        <form action={saveSettingsAction} className="space-y-6">
          <section className="card p-5">
            <h2 className="font-bold">Payments & split</h2>
            <p className="mt-1 text-xs text-muted">
              Customers pay the beat price + service fee. With a payout subaccount configured, Paystack sends the <strong className="text-cream">beat price</strong> to
              the subaccount (Meetbeatz&apos;s bank or MoMo) and keeps the <strong className="text-cream">fee</strong> in the main Paystack account — two separate
              settlements automatically.
            </p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <div>
                <label className="label">Service fee %</label>
                <input name="feePercent" type="number" min={0} max={50} step="0.5" className="field" defaultValue={settings.feePercent} />
              </div>
              <div>
                <label className="label">Currency</label>
                <input name="currency" className="field" defaultValue={settings.currency} maxLength={3} />
              </div>
              <div>
                <label className="label">Paystack fees paid by</label>
                <select name="feeBearer" className="field" defaultValue={settings.feeBearer}>
                  <option value="account">Main account (fee account)</option>
                  <option value="subaccount">Subaccount (Meetbeatz)</option>
                </select>
              </div>
              <div className="sm:col-span-3">
                <label className="label">Paystack split code or subaccount code</label>
                <input name="paystackSubaccount" className="field font-mono" defaultValue={settings.paystackSubaccount} placeholder="SPL_xxx or ACCT_xxx" />
                <p className="mt-1 text-[11px] text-muted">
                  Paste a <strong>Split code</strong> (SPL_xxx) from Paystack → Splits, or a <strong>subaccount code</strong> (ACCT_xxx) from Paystack → Subaccounts. Split codes are recommended — they handle recipients and percentages automatically.
                </p>
              </div>
            </div>
            <div className="mt-4 grid gap-2 text-xs sm:grid-cols-3">
              <div className={`rounded-lg border px-3 py-2 ${paystack ? "border-ok/30 text-ok" : "border-amber-500/30 text-amber-300"}`}>
                Paystack key: {paystack ? "configured" : "missing"} ({mode} mode)
              </div>
              <div className={`rounded-lg border px-3 py-2 ${settings.paystackSubaccount ? "border-ok/30 text-ok" : "border-amber-500/30 text-amber-300"}`}>
                Split: {settings.paystackSubaccount ? "active" : "not set"}
              </div>
              <div className={`rounded-lg border px-3 py-2 ${email !== "none" ? "border-ok/30 text-ok" : "border-amber-500/30 text-amber-300"}`}>
                Email: {email === "none" ? "not configured" : email.toUpperCase()}
              </div>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="font-bold">Promo Code</h2>
            <p className="mt-1 text-xs text-muted">Create your own code or generate a secure one. One active code can be used by unlimited customers until its end date.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label className="label" htmlFor="promoCode">Promo code</label>
                <div className="flex flex-wrap gap-2">
                  <input id="promoCode" name="promoCode" className="field min-w-0 flex-1 font-mono uppercase" defaultValue={settings.promoCode} placeholder="Enter your own code" />
                  <button type="submit" formAction={createPromoCodeAction} className="btn-ghost shrink-0">Add code</button>
                  <button type="submit" formAction={generatePromoCodeAction} className="btn-primary shrink-0">Generate</button>
                </div>
                <p className="mt-1 text-[11px] text-muted">Use at least 10 letters and numbers. Each new code can be used by unlimited customers and keeps the selected end date.</p>
              </div>
              <div>
                <label className="label" htmlFor="promoPercent">Discount % (fixed)</label>
                <input id="promoPercent" name="promoPercent" type="number" min={5} max={5} step="1" className="field" value="5" readOnly />
                <p className="mt-1 text-[11px] text-muted">This campaign always gives exactly 5% off.</p>
              </div>
              <div>
                <label className="label" htmlFor="promoExpiresAt">Promo ends</label>
                <input id="promoExpiresAt" name="promoExpiresAt" type="datetime-local" className="field" defaultValue={promoExpiryInput(settings.promoExpiresAt)} />
                <p className="mt-1 text-[11px] text-muted">Leave blank for no expiry. Customers see the end date when they apply it.</p>
              </div>
            </div>
            {promoCodes.length > 0 && (
              <div className="mt-6">
                <p className="label">Generated promo codes</p>
                <div className="mt-2 divide-y divide-white/10 overflow-hidden rounded-xl border border-white/10">
                  {promoCodes.map((promo) => {
                    const expired = Boolean(promo.expiresAt && new Date(promo.expiresAt).getTime() <= Date.now());
                    return (
                      <div key={promo.id} className="flex flex-wrap items-center justify-between gap-3 bg-white/[0.02] px-4 py-3">
                        <div className="min-w-0">
                          <p className={`font-mono text-sm font-bold ${promo.isActive && !expired ? "text-acid" : "text-muted line-through"}`}>{promo.code}</p>
                          <p className="text-[11px] text-muted">5% off · {expired ? "Expired" : promo.isActive ? `Ends ${promoExpiryLabel(promo.expiresAt)}` : "Disabled"}</p>
                        </div>
                        <button type="submit" name="promoCodeId" value={promo.id} formAction={togglePromoCodeAction} className="btn-ghost !px-3 !py-2 text-[11px]">
                          {promo.isActive ? "Disable" : "Enable"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          <section className="card p-5">
            <h2 className="font-bold">Brand & contact</h2>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">Site name</label>
                <input name="siteName" className="field" defaultValue={settings.siteName} />
              </div>
              <div>
                <label className="label">Location</label>
                <input name="location" className="field" defaultValue={settings.location} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Tagline</label>
                <input name="tagline" className="field" defaultValue={settings.tagline} />
              </div>
              <div className="sm:col-span-2">
                <label className="label" htmlFor="accentColor">Store accent colour</label>
                <div className="flex items-center gap-3">
                  <input id="accentColor" name="accentColor" type="color" defaultValue={settings.accentColor} className="h-11 w-16 cursor-pointer rounded-xl border border-white/15 bg-ink-2 p-1" />
                  <div>
                    <p className="text-sm font-semibold">Glass + wave highlight</p>
                    <p className="text-xs text-muted">Changes the neon accent across the storefront, navbar and hero.</p>
                  </div>
                </div>
              </div>
              <div>
                <label className="label">Contact email</label>
                <input name="contactEmail" type="email" className="field" defaultValue={settings.contactEmail} />
              </div>
              <div>
                <label className="label">Contact phone</label>
                <input name="contactPhone" className="field" defaultValue={settings.contactPhone} />
              </div>
              <div>
                <label className="label">WhatsApp number</label>
                <input name="whatsapp" className="field" defaultValue={settings.whatsapp} placeholder="+233 24 000 0000" />
              </div>
              <div>
                <label className="label">Instagram</label>
                <input name="instagram" className="field" defaultValue={settings.instagram} />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Order notification email (where you get notified of sales)</label>
                <input name="notifyEmail" type="email" className="field" defaultValue={settings.notifyEmail} placeholder="Defaults to your login email" />
              </div>
              <div className="sm:col-span-2">
                <label className="label">Booking policy (shown to customers)</label>
                <textarea name="bookingPolicy" className="field min-h-24" defaultValue={settings.bookingPolicy} />
              </div>
            </div>
          </section>

          <section className="card p-5">
            <h2 className="font-bold">Booking alerts</h2>
            <p className="mt-1 text-xs text-muted">
              When a customer books a studio session, you get a message in the Notifications inbox straight away — and
              on your WhatsApp too when a number is set below.
            </p>
            <div className="mt-4">
              <label className="label" htmlFor="whatsappAlerts">
                Your WhatsApp number for booking alerts
              </label>
              <input
                id="whatsappAlerts"
                name="whatsappAlerts"
                className="field"
                defaultValue={settings.whatsappAlerts}
                placeholder="+233 24 000 0000"
              />
            </div>
            <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
              <div
                className={`rounded-lg border px-3 py-2 ${
                  isWhatsAppConfigured() ? "border-ok/30 text-ok" : "border-amber-500/30 text-amber-300"
                }`}
              >
                WhatsApp API: {isWhatsAppConfigured() ? "connected" : "not connected"}
              </div>
              <div
                className={`rounded-lg border px-3 py-2 ${
                  settings.whatsappAlerts ? "border-ok/30 text-ok" : "border-amber-500/30 text-amber-300"
                }`}
              >
                Alert number: {settings.whatsappAlerts ? "set" : "not set"}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button type="submit" formAction={sendTestWhatsAppAction} className="btn-ghost !px-4 !py-2 text-xs">
                Send WhatsApp test
              </button>
              <span className="text-[11px] text-muted">Save the settings after changing the number.</span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-muted">
              Set <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px]">WHATSAPP_ACCESS_TOKEN</code> and{" "}
              <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px]">WHATSAPP_PHONE_NUMBER_ID</code> in your
              environment variables. The API sends from the business-verified number, so it must be different from the
              alert number above (for example, the producer&apos;s personal WhatsApp). For alerts outside an active WhatsApp
              conversation, also set an approved one-variable template in{" "}
              <code className="rounded bg-white/10 px-1 py-0.5 font-mono text-[11px]">WHATSAPP_ALERT_TEMPLATE</code>. Until the API is
              connected, booking alerts still appear in the Notifications inbox.
            </p>
          </section>

          <section className="card p-5">
            <h2 className="font-bold">Live Recording Studio Access</h2>
            <p className="mt-1 text-xs text-muted">
              Control whether artists see <strong>Coming soon</strong> or can enter the online Live Recording Studio. As the producer, you always have full access at <a href="/admin/live-recording" className="text-acid hover:underline">/admin/live-recording</a>.
            </p>
            <div className="mt-4">
              <label className="label" htmlFor="liveRecordingOpen">
                Artist access status
              </label>
              <select
                id="liveRecordingOpen"
                name="liveRecordingOpen"
                className="field"
                defaultValue={settings.liveRecordingOpen === "1" ? "1" : "0"}
              >
                <option value="0">Coming soon — Locked for artists (Producer access only)</option>
                <option value="1">Open — Live Recording Studio open to artists</option>
              </select>
            </div>
          </section>

          <button type="submit" className="btn-primary !px-8 !py-3">
            Save settings
          </button>
        </form>

        <div className="space-y-6">
          <AdsTxtEditor
            initialContents={adsTxt}
            publisherConfigured={publisherConfigured}
            autoAdsEnabled={autoAdsEnabled}
            beatDetailSlotConfigured={beatDetailSlotConfigured}
            liveUrl={`${baseUrl}/ads.txt`}
          />

          <section className="card p-5">
            <h2 className="font-bold">Create payout subaccount</h2>
            <p className="mb-4 mt-1 text-xs text-muted">Registers Meetbeatz&apos;s bank account or MoMo wallet with Paystack and saves the code automatically.</p>
            <SubaccountCreator enabled={paystack} />
          </section>

          <section className="card p-5">
            <h2 className="font-bold">Environment variables</h2>
            <p className="mt-1 text-xs text-muted">Set these on your hosting platform, then restart the app.</p>
            <dl className="mt-3 space-y-2 font-mono text-[11px] text-cream/80">
              {[
                ["PAYSTACK_SECRET_KEY", "sk_live_… from Paystack → Settings → API Keys"],
                ["NEXT_PUBLIC_APP_URL", `${baseUrl} (used in emails & Paystack callback)`],
                ["SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS", "any SMTP provider (Gmail app password, Zoho, Brevo…)"],
                ["RESEND_API_KEY", "alternative to SMTP"],
                ["EMAIL_FROM", `"Meetbeatz <no-reply@yourdomain.com>"`],
                ["WHATSAPP_ACCESS_TOKEN", "Meta WhatsApp Business Cloud API token (server-side only)"],
                ["WHATSAPP_PHONE_NUMBER_ID", "verified Meta number that sends alerts"],
                ["WHATSAPP_ALERT_TEMPLATE", "approved one-variable template for proactive alerts"],
                ["SESSION_SECRET", "long random string for admin sessions"],
                ["ADMIN_EMAIL / ADMIN_PASSWORD", "initial login (first run only)"],
                ["NEXT_PUBLIC_ADSENSE_PUBLISHER_ID", "optional override; configured publisher ID is used by default"],
                ["NEXT_PUBLIC_ADSENSE_SLOT_BEAT_DETAIL", "optional override for the manual beat-detail unit"],
                ["NEXT_PUBLIC_ADSENSE_AUTO_ADS", "set to 1 to let AdSense place its own ads"],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-acid">{k}</dt>
                  <dd className="font-sans text-muted">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-[11px] text-muted">
              Paystack webhook URL: <span className="font-mono text-cream/80">{baseUrl}/api/paystack/webhook</span>
            </p>
          </section>

          <UploadMemory />

          <form action={sendTestEmailAction} className="card p-5">
            <h2 className="font-bold">Send a test email</h2>
            <div className="mt-3 flex gap-2">
              <input name="to" type="email" className="field" placeholder="you@example.com" />
              <button type="submit" className="btn-ghost shrink-0 !px-4 text-xs">
                Send test
              </button>
            </div>
          </form>

          <form action={changePasswordAction} className="card space-y-3 p-5">
            <h2 className="font-bold">Change password</h2>
            <div>
              <label className="label">Current password</label>
              <input name="currentPassword" type="password" className="field" required autoComplete="current-password" />
            </div>
            <div>
              <label className="label">New password</label>
              <input name="newPassword" type="password" className="field" required minLength={8} autoComplete="new-password" />
            </div>
            <div>
              <label className="label">Confirm new password</label>
              <input name="confirmPassword" type="password" className="field" required minLength={8} autoComplete="new-password" />
            </div>
            <button type="submit" className="btn-ghost w-full">
              Update password
            </button>
          </form>
        </div>
      </div>
    </>
  );
}
