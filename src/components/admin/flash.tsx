export function Flash({ msg, err }: { msg?: string; err?: string }) {
  if (!msg && !err) return null;
  return (
    <div
      className={`mb-6 rounded-xl border px-4 py-3 text-sm ${err ? "border-danger/40 bg-danger/10 text-danger" : "border-ok/30 bg-ok/10 text-ok"}`}
      role="status"
    >
      {err ?? msg}
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "paid" || status === "confirmed" || status === "completed"
      ? "badge-acid"
      : status === "failed" || status === "cancelled"
        ? "badge !border-danger/40 !text-danger"
        : "badge";
  return <span className={cls}>{status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}</span>;
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 className="display mt-1 text-3xl md:text-4xl">{title}</h1>
      </div>
      {children}
    </div>
  );
}
