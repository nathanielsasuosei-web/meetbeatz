import Link from "next/link";
import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { LoginForm } from "@/components/admin/login-form";
import { getAdminSession } from "@/lib/auth";
import { DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD, ensureSeeded } from "@/lib/seed";

export const metadata: Metadata = { title: "Producer login" };
export const dynamic = "force-dynamic";

export default async function LoginPage() {
  await ensureSeeded();
  const session = await getAdminSession();
  if (session) redirect("/admin");
  const usingDefaults = !process.env.ADMIN_PASSWORD;

  return (
    <div className="grid min-h-screen place-items-center px-4 py-12">
      <div className="w-full max-w-md">
        <Link href="/" className="display block text-center text-2xl tracking-[0.18em]">
          MEET<span className="text-acid">BEATZ</span>
        </Link>
        <div className="card mt-8 p-8">
          <p className="eyebrow">Producer area</p>
          <h1 className="mt-2 text-2xl font-bold">Sign in to upload beats</h1>
          <p className="mt-1 text-sm text-muted">Only Meetbeatz can access this dashboard.</p>
          <div className="mt-6">
            <LoginForm />
          </div>
        </div>
        {usingDefaults && (
          <div className="mt-4 rounded-xl border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-xs leading-relaxed text-amber-200">
            <strong>First login:</strong> use <code className="font-mono">{DEFAULT_ADMIN_EMAIL}</code> / <code className="font-mono">{DEFAULT_ADMIN_PASSWORD}</code>, then change your
            password under Settings. You can also set <code className="font-mono">ADMIN_EMAIL</code> and <code className="font-mono">ADMIN_PASSWORD</code> as environment variables
            before first run.
          </div>
        )}
        <p className="mt-6 text-center text-xs text-muted">
          <Link href="/" className="hover:text-cream">← Back to the store</Link>
        </p>
      </div>
    </div>
  );
}
