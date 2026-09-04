import { createHmac, timingSafeEqual } from "crypto";

const BASE_URL = "https://api.paystack.co";

export function paystackSecretKey(): string | null {
  return process.env.PAYSTACK_SECRET_KEY?.trim() || null;
}

export function isPaystackConfigured(): boolean {
  return !!paystackSecretKey();
}

type PaystackEnvelope<T> = { status: boolean; message: string; data: T };

async function paystackFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const key = paystackSecretKey();
  if (!key) throw new Error("PAYSTACK_SECRET_KEY is not configured");
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });
  const json = (await res.json().catch(() => null)) as PaystackEnvelope<T> | null;
  if (!res.ok || !json || !json.status) {
    throw new Error(json?.message || `Paystack request failed (${res.status})`);
  }
  return json.data;
}

export type InitializeParams = {
  email: string;
  amountMinor: number;
  currency: string;
  reference: string;
  callbackUrl: string;
  metadata?: Record<string, unknown>;
  subaccount?: string | null;
  transactionChargeMinor?: number | null;
  bearer?: "account" | "subaccount";
  channels?: string[];
};

export type InitializeResult = {
  authorization_url: string;
  access_code: string;
  reference: string;
};

export async function initializeTransaction(params: InitializeParams): Promise<InitializeResult> {
  const body: Record<string, unknown> = {
    email: params.email,
    amount: params.amountMinor,
    currency: params.currency,
    reference: params.reference,
    callback_url: params.callbackUrl,
    channels: params.channels ?? ["mobile_money", "card"],
    metadata: params.metadata ?? {},
  };
  if (params.subaccount) {
    body.subaccount = params.subaccount;
    if (params.transactionChargeMinor && params.transactionChargeMinor > 0) {
      body.transaction_charge = params.transactionChargeMinor;
    }
    body.bearer = params.bearer ?? "account";
  }
  return paystackFetch<InitializeResult>("/transaction/initialize", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export type VerifyResult = {
  id: number;
  status: "success" | "failed" | "abandoned" | "pending" | string;
  reference: string;
  amount: number;
  currency: string;
  channel: string;
  paid_at: string | null;
  gateway_response: string;
  fees: number | null;
  fees_split?: unknown;
  subaccount?: unknown;
  customer?: { email?: string };
  authorization?: {
    channel?: string;
    mobile_money_number?: string;
    bank?: string;
    brand?: string;
    last4?: string;
  };
};

export async function verifyTransaction(reference: string): Promise<VerifyResult> {
  return paystackFetch<VerifyResult>(`/transaction/verify/${encodeURIComponent(reference)}`, {
    method: "GET",
  });
}

export function verifyWebhookSignature(rawBody: string, signature: string | null): boolean {
  const key = paystackSecretKey();
  if (!key || !signature) return false;
  const digest = createHmac("sha512", key).update(rawBody).digest("hex");
  const a = Buffer.from(digest);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

export type PaystackBank = { name: string; code: string; type?: string; currency?: string };

export async function listGhanaBanks(type: "mobile_money" | "ghipss"): Promise<PaystackBank[]> {
  return paystackFetch<PaystackBank[]>(`/bank?country=ghana&type=${type}&currency=GHS`, { method: "GET" });
}

export type SubaccountResult = {
  subaccount_code: string;
  business_name: string;
  account_number: string;
  settlement_bank: string;
  percentage_charge: number;
};

export async function createSubaccount(params: {
  businessName: string;
  settlementBank: string;
  accountNumber: string;
  percentageCharge: number;
  description?: string;
}): Promise<SubaccountResult> {
  return paystackFetch<SubaccountResult>("/subaccount", {
    method: "POST",
    body: JSON.stringify({
      business_name: params.businessName,
      settlement_bank: params.settlementBank,
      account_number: params.accountNumber,
      percentage_charge: params.percentageCharge,
      description: params.description ?? "Meetbeatz beat sales & studio bookings payout",
    }),
  });
}
