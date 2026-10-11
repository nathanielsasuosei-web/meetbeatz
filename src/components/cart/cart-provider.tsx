"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { cartItemKey, type CartItem } from "@/lib/cart";

const STORAGE_KEY = "meetbeatz-cart-v1";

type CartContextValue = {
  items: CartItem[];
  ready: boolean;
  count: number;
  addItem: (item: CartItem) => void;
  removeItem: (key: string) => void;
  clear: () => void;
  hasItem: (beatSlug: string, licenseTypeId: number) => boolean;
};

const CartContext = createContext<CartContextValue | null>(null);

function safeItems(value: unknown): CartItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is CartItem => {
    if (!item || typeof item !== "object") return false;
    const candidate = item as Partial<CartItem>;
    return (
      typeof candidate.key === "string" &&
      typeof candidate.beatSlug === "string" &&
      typeof candidate.beatTitle === "string" &&
      Number.isInteger(candidate.licenseTypeId) &&
      typeof candidate.licenseName === "string" &&
      Number.isFinite(candidate.price) &&
      typeof candidate.currency === "string"
    );
  });
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) setItems(safeItems(JSON.parse(stored)));
    } catch {
      // A blocked or corrupt localStorage should leave the cart usable in memory.
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // The checkout still works for this tab if storage is unavailable.
    }
  }, [items, ready]);

  const value = useMemo<CartContextValue>(
    () => ({
      items,
      ready,
      count: items.length,
      addItem: (item) => {
        setItems((current) => [...current.filter((existing) => existing.key !== item.key), item]);
      },
      removeItem: (key) => setItems((current) => current.filter((item) => item.key !== key)),
      clear: () => setItems([]),
      hasItem: (beatSlug, licenseTypeId) => currentHasItem(items, beatSlug, licenseTypeId),
    }),
    [items, ready],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

function currentHasItem(items: CartItem[], beatSlug: string, licenseTypeId: number): boolean {
  return items.some((item) => item.key === cartItemKey(beatSlug, licenseTypeId));
}

export function useCart(): CartContextValue {
  const context = useContext(CartContext);
  if (!context) throw new Error("useCart must be used inside CartProvider");
  return context;
}
