import { Flash, PageHeader } from "@/components/admin/flash";
import { SubaccountCreator } from "@/components/admin/subaccount-creator";
import { isPaystackConfigured } from "@/lib/paystack";
import { emailProvider, getPaymentMode, getSettings } from "@/lib/settings";
import { getBaseUrl } from "@/lib/url";
import { changePasswordAction, saveSettingsAction, sendTestEmailAction } from "../actions";
import { ensureSeeded } from "@/lib/seed";

export default async function AdminSettingsPage({ searchParams }: { searchParams: Promise<{ msg?: string; err?: string }> }) {
  await ensureSeeded();
  const { msg, err } = await searchParams;
  const [settings, baseUrl] = await Promise.all([getSettings(), getBaseUrl()]);
  const paystack = isPaystackConfigured();
  const mode = getPaymentMode();
  const email = emailProvider();

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
                <label className="label">Meetbeatz payout subaccount code</label>
                <input name="paystackSubaccount" className="field font-mono" defaultValue={settings.paystackSubaccount} placeholder="ACCT_xxxxxxxxxxxx" />
                <p className="mt-1 text-[11px] text-muted">
                  Create one in Paystack → Settings → Subaccounts (bank account or Mobile Money wallet), or use the helper on the right.
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

          <button type="submit" className="btn-primary !px-8 !py-3">
            Save settings
          </button>
        </form>

        <div className="space-y-6">
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
                ["SESSION_SECRET", "long random string for admin sessions"],
                ["ADMIN_EMAIL / ADMIN_PASSWORD", "initial login (first run only)"],
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
