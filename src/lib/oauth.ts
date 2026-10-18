export type OAuthProvider = "google" | "facebook" | "apple";

type OAuthConfig = {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  tokenUrl: string;
  scopes: string[];
};

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

export function getOAuthConfig(provider: OAuthProvider): OAuthConfig | null {
  if (provider === "google") {
    const clientId = env("GOOGLE_CLIENT_ID") || env("NEXT_PUBLIC_GOOGLE_CLIENT_ID");
    const clientSecret = env("GOOGLE_CLIENT_SECRET");
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      scopes: ["openid", "email", "profile"],
    };
  }
  if (provider === "facebook") {
    const clientId = env("FACEBOOK_CLIENT_ID") || env("FACEBOOK_APP_ID");
    const clientSecret = env("FACEBOOK_CLIENT_SECRET") || env("FACEBOOK_APP_SECRET");
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      authUrl: "https://www.facebook.com/v12.0/dialog/oauth",
      tokenUrl: "https://graph.facebook.com/v12.0/oauth/access_token",
      scopes: ["email", "public_profile"],
    };
  }
  if (provider === "apple") {
    const clientId = env("APPLE_CLIENT_ID") || env("APPLE_SERVICE_ID");
    const clientSecret = env("APPLE_CLIENT_SECRET") || env("APPLE_TEAM_ID"); // may be JWT or team id
    // Apple requires more but we treat as optional - if both present we enable
    if (!clientId || !clientSecret) return null;
    return {
      clientId,
      clientSecret,
      authUrl: "https://appleid.apple.com/auth/authorize",
      tokenUrl: "https://appleid.apple.com/auth/token",
      scopes: ["name", "email"],
    };
  }
  return null;
}

export function getRedirectUri(appUrl: string, provider: OAuthProvider): string {
  const base = appUrl.replace(/\/$/, "");
  return `${base}/api/auth/${provider}`;
}

export function buildAuthorizationUrl(provider: OAuthProvider, redirectUri: string, state: string): string {
  const config = getOAuthConfig(provider);
  if (!config) throw new Error(`OAuth not configured for ${provider}`);
  const params = new URLSearchParams();
  params.set("client_id", config.clientId);
  params.set("redirect_uri", redirectUri);
  params.set("response_type", "code");
  params.set("scope", config.scopes.join(" "));
  params.set("state", state);
  if (provider === "google") {
    params.set("access_type", "offline");
    params.set("prompt", "consent");
  }
  if (provider === "apple") {
    params.set("response_mode", "form_post");
  }
  return `${config.authUrl}?${params.toString()}`;
}

export async function exchangeCodeForTokens(
  provider: OAuthProvider,
  code: string,
  redirectUri: string,
): Promise<{ access_token: string; id_token?: string }> {
  const config = getOAuthConfig(provider);
  if (!config) throw new Error(`OAuth not configured for ${provider}`);

  const body = new URLSearchParams();
  body.set("client_id", config.clientId);
  body.set("client_secret", config.clientSecret);
  body.set("code", code);
  body.set("grant_type", "authorization_code");
  body.set("redirect_uri", redirectUri);

  const res = await fetch(config.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: body.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error((data as { error_description?: string }).error_description || (data as { error?: string }).error || `Token exchange failed for ${provider}`);
  }
  const access_token = String(data.access_token ?? "");
  const id_token = data.id_token ? String(data.id_token) : undefined;
  if (!access_token && !id_token) throw new Error(`No tokens returned from ${provider}`);
  return { access_token, id_token };
}

export type OAuthUser = {
  providerAccountId: string;
  email: string;
  name: string;
  avatarUrl?: string | null;
};

function decodeJwtPayload(jwt: string): Record<string, unknown> {
  try {
    const parts = jwt.split(".");
    if (parts.length < 2) return {};
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = Buffer.from(payload, "base64").toString("utf-8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function fetchOAuthUser(provider: OAuthProvider, tokens: { access_token: string; id_token?: string }): Promise<OAuthUser> {
  if (provider === "google") {
    // Try id_token first if present
    if (tokens.id_token) {
      const payload = decodeJwtPayload(tokens.id_token);
      const sub = String(payload.sub ?? "");
      const email = String(payload.email ?? "");
      const name = String(payload.name ?? payload.given_name ?? email.split("@")[0] ?? "Google User");
      const picture = payload.picture ? String(payload.picture) : null;
      if (sub && email) return { providerAccountId: sub, email, name, avatarUrl: picture };
    }
    const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) throw new Error((data.error as string) || "Failed to fetch Google user");
    const id = String(data.id ?? data.sub ?? "");
    const email = String(data.email ?? "");
    const name = String(data.name ?? data.given_name ?? email.split("@")[0] ?? "Google User");
    const picture = data.picture ? String(data.picture) : null;
    if (!id || !email) throw new Error("Google did not return email");
    return { providerAccountId: id, email, name, avatarUrl: picture };
  }

  if (provider === "facebook") {
    const res = await fetch(`https://graph.facebook.com/me?fields=id,name,email,picture.type(large)&access_token=${encodeURIComponent(tokens.access_token)}`);
    const data = (await res.json()) as Record<string, unknown>;
    if (!res.ok) throw new Error((data.error as string) || "Failed to fetch Facebook user");
    const id = String(data.id ?? "");
    const email = String(data.email ?? "");
    const name = String(data.name ?? email.split("@")[0] ?? "Facebook User");
    const picture = (data.picture as { data?: { url?: string } } | undefined)?.data?.url ?? null;
    if (!id) throw new Error("Facebook did not return id");
    // Facebook may not return email if not verified - fallback to id@facebook.local
    const safeEmail = email || `${id}@facebook.meetbeatz.local`;
    return { providerAccountId: id, email: safeEmail, name, avatarUrl: picture };
  }

  if (provider === "apple") {
    if (tokens.id_token) {
      const payload = decodeJwtPayload(tokens.id_token);
      const sub = String(payload.sub ?? "");
      const email = String(payload.email ?? `${sub}@apple.meetbeatz.local`);
      const name = String(payload.name ?? email.split("@")[0] ?? "Apple User");
      if (!sub) throw new Error("Apple did not return sub");
      return { providerAccountId: sub, email, name, avatarUrl: null };
    }
    throw new Error("Apple login requires id_token");
  }

  throw new Error(`Unknown provider ${provider}`);
}

export function getAppUrl(req?: Request): string {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim();
  if (envUrl) return envUrl.replace(/\/$/, "");
  if (req) {
    const url = new URL(req.url);
    return `${url.protocol}//${url.host}`;
  }
  // Fallback for build time
  return "http://localhost:3000";
}
