import { randomBytes, randomInt } from "crypto";

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function randomCode(length: number): string {
  let out = "";
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(0, ALPHABET.length)];
  return out;
}

export function makeReference(prefix = "MB"): string {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${randomCode(5)}`;
}

export function makeLicenseKey(): string {
  const year = new Date().getUTCFullYear();
  return `MBL-${year}-${randomCode(4)}-${randomCode(4)}`;
}

export function randomToken(bytes = 24): string {
  return randomBytes(bytes).toString("hex");
}

export function randomFileName(ext: string): string {
  return `${Date.now().toString(36)}-${randomBytes(8).toString("hex")}${ext}`;
}
