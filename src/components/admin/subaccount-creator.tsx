"use client";

import { useEffect, useState } from "react";

type Bank = { name: string; code: string };

export function SubaccountCreator({ enabled }: { enabled: boolean }) {
  const [type, setType] = useState<"mobile_money" | "ghipss">("mobile_money");
  const [banks, setBanks] = useState<Bank[]>([]);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [form, setForm] = useState({ businessName: "Meetbeatz", bankCode: "", accountNumber: "" });

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/admin/paystack/banks?type=${type}`)
      .then(async (r) => {
        const json = (await r.json()) as { banks?: Bank[]; error?: string };
        if (!r.ok) throw new Error(json.error ?? "Could not load banks");
        if (!cancelled) {
          setBanks(json.banks ?? []);
          setForm((f) => ({ ...f, bankCode: json.banks?.[0]?.code ?? "" }));
        }
      })
      .catch((e: Error) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [type, enabled]);

  async function create() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/admin/paystack/subaccount", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const json = (await res.json()) as { subaccountCode?: string; error?: string };
      if (!res.ok || !json.subaccountCode) throw new Error(json.error ?? "Could not create subaccount");
      setResult(json.subaccountCode);
      window.location.assign(`/admin/settings?msg=${encodeURIComponent(`Payout subaccount ${json.subaccountCode} created and saved.`)}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) {
    return (
      <p className="text-xs text-muted">
        Add <code>PAYSTACK_SECRET_KEY</code> to create the payout subaccount from here, or paste a subaccount code created in your Paystack dashboard above.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {(["mobile_money", "ghipss"] as const).map((t) => (
          <button key={t} type="button" onClick={() => setType(t)} className={`badge !px-3 !py-1.5 !text-xs ${type === t ? "!border-acid !bg-acid !text-ink" : ""}`}>
            {t === "mobile_money" ? "Mobile Money wallet" : "Bank account"}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label">Business name</label>
          <input className="field" value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} />
        </div>
        <div>
          <label className="label">{type === "mobile_money" ? "Network" : "Bank"}</label>
          <select className="field" value={form.bankCode} onChange={(e) => setForm({ ...form, bankCode: e.target.value })} disabled={loading}>
            {banks.map((b) => (
              <option key={b.code} value={b.code}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label">{type === "mobile_money" ? "MoMo number" : "Account number"}</label>
          <input className="field" value={form.accountNumber} onChange={(e) => setForm({ ...form, accountNumber: e.target.value })} placeholder={type === "mobile_money" ? "0241234567" : "0123456789"} />
        </div>
      </div>
      {error && <p className="text-xs text-danger">{error}</p>}
      {result && <p className="text-xs text-ok">Created {result}</p>}
      <button type="button" className="btn-ghost !px-4 !py-2 text-xs" onClick={create} disabled={busy || !form.bankCode || !form.accountNumber}>
        {busy ? "Creating…" : "Create payout subaccount"}
      </button>
    </div>
  );
}
