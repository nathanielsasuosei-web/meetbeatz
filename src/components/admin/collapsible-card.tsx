import type { ReactNode } from "react";

type Props = {
  /** Card heading (rendered as the clickable summary). */
  title: string;
  /** Optional one-line hint shown next to the heading while collapsed. */
  hint?: ReactNode;
  /** Optional content pinned to the right side of the summary row. */
  aside?: ReactNode;
  /** Whether the card starts expanded. Defaults to collapsed. */
  defaultOpen?: boolean;
  /** Extra classes for the <details> element. */
  className?: string;
  children: ReactNode;
};

/**
 * A `.card` that can be collapsed by clicking its heading.
 *
 * Uses native <details>/<summary> so no client-side JavaScript is needed and
 * the content still renders (and submits inside forms) while collapsed.
 */
export function CollapsibleCard({
  title,
  hint,
  aside,
  defaultOpen = false,
  className = "",
  children,
}: Props) {
  return (
    <details className={`card group ${className}`} open={defaultOpen}>
      <summary className="flex cursor-pointer list-none items-start justify-between gap-3 p-5 [&::-webkit-details-marker]:hidden">
        <div className="min-w-0">
          <h2 className="font-bold">{title}</h2>
          {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {aside}
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 text-muted transition-transform duration-200 group-open:rotate-180"
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </div>
      </summary>
      <div className="px-5 pb-5">{children}</div>
    </details>
  );
}
