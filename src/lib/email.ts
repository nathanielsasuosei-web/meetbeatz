import nodemailer from "nodemailer";
import { db } from "@/db";
import { emailLogs } from "@/db/schema";
import { emailProvider } from "./settings";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  orderId?: number | null;
};

export type SendEmailResult = {
  status: "sent" | "failed" | "skipped";
  error?: string;
};

function fromAddress(): string {
  return process.env.EMAIL_FROM?.trim() || "Meetbeatz <no-reply@meetbeatz.com>";
}

async function log(input: SendEmailInput, result: SendEmailResult) {
  try {
    await db.insert(emailLogs).values({
      toEmail: input.to,
      subject: input.subject,
      htmlBody: input.html,
      status: result.status,
      error: result.error ?? null,
      orderId: input.orderId ?? null,
    });
  } catch (err) {
    console.error("[email] failed to write email log", err);
  }
}

async function sendViaResend(input: SendEmailInput) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: fromAddress(), to: [input.to], subject: input.subject, html: input.html }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Resend error ${res.status}: ${text.slice(0, 300)}`);
  }
}

/** Gmail app-password credentials (GMAIL_USER + GMAIL_APP_PASSWORD in .env). */
export function gmailCredentials(): { user: string; pass: string } | null {
  const user = process.env.GMAIL_USER?.trim();
  // Google shows app passwords as "abcd efgh ijkl mnop" — SMTP needs them without spaces.
  const pass = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "");
  return user && pass ? { user, pass } : null;
}

/** Resolves the SMTP connection from SMTP_* vars, falling back to Gmail. */
export function smtpConfig() {
  // A real SMTP provider is configured explicitly (SMTP_HOST and/or SMTP_USER).
  if (process.env.SMTP_HOST?.trim() || process.env.SMTP_USER?.trim()) {
    const host = process.env.SMTP_HOST?.trim() || "localhost";
    const port = parseInt(process.env.SMTP_PORT || "587", 10);
    return {
      host,
      port,
      secure: process.env.SMTP_SECURE === "true" || port === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? "" }
        : undefined,
    };
  }
  // Otherwise: Gmail app-password sending (Gmail always uses 465/SSL).
  const gmail = gmailCredentials();
  return { host: "smtp.gmail.com", port: 465, secure: true, auth: gmail ?? undefined };
}

async function sendViaSmtp(input: SendEmailInput) {
  const transporter = nodemailer.createTransport({
    ...smtpConfig(),
    // Never let a slow mail server hold up a customer's checkout.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
  await transporter.sendMail({ from: fromAddress(), to: input.to, subject: input.subject, html: input.html });
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const provider = emailProvider();
  let result: SendEmailResult;

  if (provider === "none") {
    result = {
      status: "skipped",
      error:
        "No email provider configured. Set GMAIL_USER/GMAIL_APP_PASSWORD, SMTP_HOST/SMTP_USER/SMTP_PASS or RESEND_API_KEY.",
    };
    console.warn(`[email] skipped "${input.subject}" → ${input.to} (no provider configured)`);
  } else {
    try {
      if (provider === "resend") await sendViaResend(input);
      else await sendViaSmtp(input);
      result = { status: "sent" };
    } catch (err) {
      result = { status: "failed", error: err instanceof Error ? err.message : String(err) };
      console.error("[email] send failed", result.error);
    }
  }

  await log(input, result);
  return result;
}
