export type CartItem = {
  /** Stable browser-side key: one license tier for one beat. */
  key: string;
  beatSlug: string;
  beatTitle: string;
  licenseTypeId: number;
  licenseName: string;
  price: number;
  currency: string;
  cover: string | null;
  deliverables: string;
  terms?: string;
};

export function cartItemKey(beatSlug: string, licenseTypeId: number): string {
  return `${beatSlug}:${licenseTypeId}`;
}

export type CartOrderItem = Pick<CartItem, "beatSlug" | "licenseTypeId">;
