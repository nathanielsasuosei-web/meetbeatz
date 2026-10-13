/** @type {import("next").NextConfig} */
const nextConfig = {
  experimental: {
    // Server Actions (admin login, most admin buttons) reject a request whose
    // Origin does not match the host they were rendered on. That is the right
    // default, but it breaks a dev server reached through a tunnel or a hosted
    // preview proxy, where the browser's origin is the proxy's domain. The
    // allowance is development-only: a production deployment keeps the strict
    // same-origin check.
    ...(process.env.NODE_ENV === "development"
      ? { serverActions: { allowedOrigins: ["localhost:3000", "127.0.0.1:3000", "*.e2b.app"] } }
      : {}),
  },
  // Beat files live in PostgreSQL (see src/lib/files.ts) and are uploaded in
  // ~4 MB parts to stay under serverless request-body limits, so no body size
  // override is needed here.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          {
            // `display-capture=()` is the one part of screen-recording
            // protection a browser genuinely enforces: it removes
            // getDisplayMedia() from this origin, so tab/window/screen sharing —
            // including from extensions and "record this tab" tools — is denied
            // before a picker ever opens. Chromium honours it; Safari and
            // Firefox ignore it, which is why src/components/screen-guard.tsx
            // also refuses the call in-page and reports the attempt.
            //
            // camera and microphone stay limited to same-origin iframes: the
            // online recording studio needs them, and `self` is already the
            // default — they are spelled out so a future `*` cannot creep in.
            key: "Permissions-Policy",
            value: "display-capture=(), camera=(self), microphone=(self), geolocation=(), interest-cohort=()",
          },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
