import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { createCustomerSession, findOrCreateSocialCustomer } from "@/lib/customer-auth";
import {
  buildAuthorizationUrl,
  exchangeCodeForTokens,
  fetchOAuthUser,
  getOAuthConfig,
  getRedirectUri,
  type OAuthProvider,
} from "@/lib/oauth";
import { ensureSeeded } from "@/lib/seed";

export const dynamic = "force-dynamic";

const VALID_PROVIDERS: OAuthProvider[] = ["google", "facebook", "apple"];
const STATE_COOKIE = "mb_oauth_state";
const STATE_MAX_AGE = 10 * 60; // 10 minutes

function isValidProvider(value: string): value is OAuthProvider {
  return (VALID_PROVIDERS as string[]).includes(value);
}

function getBaseUrl(req: NextRequest): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, "");
  const host = req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") || (host?.includes("localhost") ? "http" : "https");
  if (host) return `${proto}://${host}`;
  return "http://localhost:3000";
}

function generateState(): string {
  const { randomBytes } = require("crypto") as typeof import("crypto");
  return randomBytes(16).toString("hex");
}

export async function GET(req: NextRequest, { params }: { params: { provider: string } }) {
  const providerRaw = params.provider?.toLowerCase();
  if (!isValidProvider(providerRaw)) {
    return NextResponse.json({ error: `Unknown provider ${params.provider}. Use google, facebook or apple.` }, { status: 400 });
  }
  const provider = providerRaw;

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  const baseUrl = getBaseUrl(req);

  if (error) {
    return NextResponse.redirect(`${baseUrl}/account/login?error=${encodeURIComponent(`Social login cancelled: ${error}`)}`);
  }

  const config = getOAuthConfig(provider);
  const redirectUri = getRedirectUri(baseUrl, provider);

  // Callback phase: we have a code from provider
  if (code) {
    const cookieStore = cookies();
    const savedState = cookieStore.get(STATE_COOKIE)?.value;
    if (savedState && state && savedState !== state) {
      return NextResponse.redirect(`${baseUrl}/account/login?error=${encodeURIComponent("Invalid OAuth state. Please try again.")}`);
    }

    // Mock fallback when no credentials: treat code as mock
    if (!config) {
      await ensureSeeded();
      const mockMap: Record<OAuthProvider, { email: string; name: string; providerAccountId: string }> = {
        google: { email: "google.demo@meetbeatz.local", name: "Google Demo Student", providerAccountId: `mock-google-${code.slice(0, 8)}` },
        facebook: { email: "facebook.demo@meetbeatz.local", name: "Facebook Demo Student", providerAccountId: `mock-facebook-${code.slice(0, 8)}` },
        apple: { email: "apple.demo@meetbeatz.local", name: "Apple Demo Student", providerAccountId: `mock-apple-${code.slice(0, 8)}` },
      };
      const mock = mockMap[provider];
      const customer = await findOrCreateSocialCustomer({
        provider,
        providerAccountId: mock.providerAccountId,
        email: mock.email,
        name: mock.name,
        avatarUrl: null,
      });
      await createCustomerSession(customer);
      const res = NextResponse.redirect(`${baseUrl}/account`);
      res.cookies.delete(STATE_COOKIE);
      return res;
    }

    try {
      await ensureSeeded();
      const tokens = await exchangeCodeForTokens(provider, code, redirectUri);
      const oauthUser = await fetchOAuthUser(provider, tokens);
      const customer = await findOrCreateSocialCustomer({
        provider,
        providerAccountId: oauthUser.providerAccountId,
        email: oauthUser.email,
        name: oauthUser.name,
        avatarUrl: oauthUser.avatarUrl ?? null,
      });
      await createCustomerSession(customer);
      const res = NextResponse.redirect(`${baseUrl}/account`);
      res.cookies.delete(STATE_COOKIE);
      return res;
    } catch (err) {
      console.error(`[oauth/${provider}] callback error`, err);
      const msg = err instanceof Error ? err.message : "Social login failed. Please try again.";
      return NextResponse.redirect(`${baseUrl}/account/login?error=${encodeURIComponent(msg)}`);
    }
  }

  // Initiation phase: no code -> redirect to provider, or mock if not configured
  if (!config) {
    await ensureSeeded();
    const mockMap: Record<OAuthProvider, { email: string; name: string; providerAccountId: string }> = {
      google: { email: "google.demo@meetbeatz.local", name: "Google Demo Student", providerAccountId: "mock-google-001" },
      facebook: { email: "facebook.demo@meetbeatz.local", name: "Facebook Demo Student", providerAccountId: "mock-facebook-001" },
      apple: { email: "apple.demo@meetbeatz.local", name: "Apple Demo Student", providerAccountId: "mock-apple-001" },
    };
    const mock = mockMap[provider];
    const customer = await findOrCreateSocialCustomer({
      provider,
      providerAccountId: mock.providerAccountId,
      email: mock.email,
      name: mock.name,
      avatarUrl: null,
    });
    await createCustomerSession(customer);
    return NextResponse.redirect(`${baseUrl}/account`);
  }

  const newState = generateState();
  const authUrl = buildAuthorizationUrl(provider, redirectUri, newState);
  const res = NextResponse.redirect(authUrl);
  res.cookies.set(STATE_COOKIE, newState, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: STATE_MAX_AGE,
    path: "/",
  });
  return res;
}

export async function POST(req: NextRequest, { params }: { params: { provider: string } }) {
  const providerRaw = params.provider?.toLowerCase();
  if (!isValidProvider(providerRaw)) {
    return NextResponse.json({ error: `Unknown provider ${params.provider}` }, { status: 400 });
  }
  let bodyText = "";
  try {
    bodyText = await req.text();
  } catch {}
  const body = new URLSearchParams(bodyText);
  const code = body.get("code");
  const state = body.get("state");
  if (code) {
    const url = new URL(req.url);
    if (state) url.searchParams.set("state", state);
    url.searchParams.set("code", code);
    const newReq = new NextRequest(url.toString(), { headers: req.headers });
    return GET(newReq, { params });
  }
  return NextResponse.json({ error: "Missing code" }, { status: 400 });
}
