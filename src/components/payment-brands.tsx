import type { SVGProps } from "react";

export type PaymentBrand = "ghana" | "global";

type MarkProps = SVGProps<SVGSVGElement>;

function PaystackMark(props: MarkProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path d="M5 5h14v3H5zM5 10.5h14v3H5zM5 16h9v3H5z" fill="currentColor" />
    </svg>
  );
}

function GlobeMark(props: MarkProps) {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true" {...props}>
      <circle cx="16" cy="16" r="11" />
      <path d="M5.5 16h21M16 5c3 3.1 4.5 6.8 4.5 11S19 23.9 16 27M16 5c-3 3.1-4.5 6.8-4.5 11S13 23.9 16 27" />
      <path d="M8.2 9.5c2.3 1.2 5 1.8 7.8 1.8s5.5-.6 7.8-1.8M8.2 22.5c2.3-1.2 5-1.8 7.8-1.8s5.5.6 7.8 1.8" />
    </svg>
  );
}

function NetworkLogo({ name, className }: { name: "VISA" | "MTN" | "Telecel" | "AT"; className?: string }) {
  const styles = {
    VISA: "bg-[#1434cb] text-white",
    MTN: "bg-[#ffcc00] text-[#171717]",
    Telecel: "bg-[#e31d38] text-white",
    AT: "bg-[#1675d1] text-white",
  } as const;

  return (
    <span className={`inline-flex h-7 min-w-10 items-center justify-center rounded-md px-2 text-[9px] font-black tracking-tight shadow-[0_1px_0_rgba(255,255,255,0.3)_inset] ${styles[name]} ${className ?? ""}`}>
      {name === "AT" ? "AT Money" : name}
    </span>
  );
}

/** Logos for the Ghana checkout rail, rendered locally so payment cards work offline. */
export function GhanaPaymentLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex flex-wrap items-center ${compact ? "gap-1.5" : "gap-2"}`} aria-label="Paystack, Visa, MTN, Telecel and AT Money">
      <span className={`inline-flex items-center gap-1 rounded-md border border-[#00c77f]/35 bg-[#00c77f]/12 px-2 text-[#78f0bd] ${compact ? "h-7 text-[9px]" : "h-8 text-[10px]"} font-black tracking-tight`}>
        <PaystackMark className={compact ? "h-3.5 w-3.5" : "h-4 w-4"} />
        paystack
      </span>
      <NetworkLogo name="VISA" className={compact ? "h-7" : "h-8"} />
      <NetworkLogo name="MTN" className={compact ? "h-7" : "h-8"} />
      <NetworkLogo name="Telecel" className={compact ? "h-7" : "h-8"} />
      <NetworkLogo name="AT" className={compact ? "h-7" : "h-8"} />
    </div>
  );
}

/** A local wordmark for the currently UI-only worldwide payment option. */
export function GlobalPaymentLogo({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`flex items-center ${compact ? "gap-2" : "gap-3"}`} aria-label="Global Payment Worldwide by Bachs">
      <span className={`grid shrink-0 place-items-center rounded-xl border border-acid/40 bg-acid/10 text-acid ${compact ? "h-10 w-10" : "h-12 w-12"}`}>
        <GlobeMark className={compact ? "h-6 w-6" : "h-7 w-7"} />
      </span>
      <span className="leading-none">
        <span className={`block font-black tracking-tight text-cream ${compact ? "text-sm" : "text-base"}`}>Global Payment</span>
        <span className="mt-1 block text-[10px] font-bold uppercase tracking-[0.18em] text-acid">Worldwide · Bachs</span>
      </span>
    </div>
  );
}

export function PaymentMethodLogo({ method, compact = false }: { method: PaymentBrand; compact?: boolean }) {
  return method === "ghana" ? <GhanaPaymentLogo compact={compact} /> : <GlobalPaymentLogo compact={compact} />;
}
