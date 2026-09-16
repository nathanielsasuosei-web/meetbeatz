import Image from "next/image";

/**
 * The supplied Meetbeatz artwork is the single source for every brand mark.
 * Keeping the path here prevents the site, dashboard, and metadata from
 * drifting onto different versions of the logo.
 */
export const BRAND_MARK_SRC = "/images/logo.png";

type BrandMarkProps = {
  siteName?: string;
  size: number;
  className?: string;
  priority?: boolean;
};

export function BrandMark({ siteName = "Meetbeatz", size, className, priority = false }: BrandMarkProps) {
  return <Image src={BRAND_MARK_SRC} alt={`${siteName} logo`} width={size} height={size} priority={priority} className={className} />;
}
