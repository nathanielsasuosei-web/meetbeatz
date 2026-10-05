"use client";

import { useState } from "react";
import { CheckIcon } from "./icons";

/**
 * Public contact form. Posts to /api/contact, which stores the enquiry in the
 * database and emails the studio. Shown on /contact and reusable anywhere a
 * "message us" box is useful (pass a different `source`).
 */

export type ContactFormTopic = { value: string; label: string };

export function ContactForm({
  topics,
  source = "contact",
  compact = false,
}: {
  topics: readonly ContactFormTopic[];
  source?: string;
  compact?: boolean;
}) {
  const [state, setState] = useState<"idle" | "sending" | "sent">("idle");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (state === "sending") return;
    const form = e.currentTarget;
    const data = new FormData(form);
    setState("sending");
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: data.get("name"),
          email: data.get("email"),
          phone: data.get("phone"),
          topic: data.get("topic"),
          orderReference: data.get("orderReference"),
          body: data.get("body"),
          company: data.get("company"),
          source,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Could not send that message.");
      form.reset();
      setState("sent");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send that message.");
      setState("idle");
    }
  }

  if (state === "sent") {
    return (
      <div className="glass-acid rounded-2xl p-6 text-center sm:p-8">
        <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-acid text-ink shadow-[0_1px_0_0_rgba(255,255,255,0.4)_inset,0_8px_24px_-6px_rgba(198,241,53,0.6)]">
          <CheckIcon className="h-6 w-6" />
        </span>
        <h3 className="display mt-4 text-2xl">Message sent</h3>
        <p className="mx-auto mt-2 max-w-sm text-sm text-cream/80">
          Thanks — your message is with the studio, and a copy is on its way to your inbox. We usually reply within one business day.
        </p>
        <button type="button" onClick={() => setState("idle")} className="btn-ghost mt-6">
          Send another message
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={compact ? "space-y-3" : "space-y-4"}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="contact-name">
            Your name
          </label>
          <input id="contact-name" name="name" required minLength={2} autoComplete="name" className="field" placeholder="Kwame Mensah" />
        </div>
        <div>
          <label className="label" htmlFor="contact-email">
            Email
          </label>
          <input
            id="contact-email"
            name="email"
            type="email"
            required
            autoComplete="email"
            inputMode="email"
            className="field"
            placeholder="you@example.com"
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="contact-phone">
            Phone <span className="font-normal normal-case tracking-normal text-muted/70">(optional)</span>
          </label>
          <input id="contact-phone" name="phone" type="tel" autoComplete="tel" inputMode="tel" className="field" placeholder="+233 …" />
        </div>
        <div>
          <label className="label" htmlFor="contact-topic">
            What is it about?
          </label>
          <select id="contact-topic" name="topic" className="field" defaultValue={topics[0]?.value ?? "other"}>
            {topics.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label className="label" htmlFor="contact-order">
          Order reference <span className="font-normal normal-case tracking-normal text-muted/70">(optional — e.g. MB-8F3KQ2)</span>
        </label>
        <input id="contact-order" name="orderReference" className="field" placeholder="From your receipt email" />
      </div>

      <div>
        <label className="label" htmlFor="contact-body">
          Message
        </label>
        <textarea
          id="contact-body"
          name="body"
          required
          minLength={10}
          rows={compact ? 4 : 6}
          className="field resize-y"
          placeholder="Tell us what you need — the beat, the license and your release plans help us answer faster."
        />
      </div>

      {/* Honeypot: hidden from people, tempting to bots. */}
      <input type="text" name="company" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />

      {error && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={state === "sending"} className="btn-primary !px-6 !py-3 text-base">
          {state === "sending" ? "Sending…" : "Send message"}
        </button>
        <p className="text-xs text-muted">We never share your details. See the privacy policy.</p>
      </div>
    </form>
  );
}
