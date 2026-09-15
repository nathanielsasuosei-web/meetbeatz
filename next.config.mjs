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
};

export default nextConfig;
