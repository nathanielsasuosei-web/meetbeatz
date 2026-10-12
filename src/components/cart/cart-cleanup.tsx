"use client";

import { useEffect } from "react";
import { useCart } from "./cart-provider";

/** Clears the cart only after the order page proves the payment is paid. */
export function CartCleanup() {
  const { clear } = useCart();
  useEffect(() => {
    clear();
  }, [clear]);
  return null;
}
