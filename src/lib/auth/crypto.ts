import { randomBytes, scrypt as _scrypt, timingSafeEqual, createHash } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(_scrypt) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

/**
 * Password hashing with Node's built-in scrypt.
 * Parameters follow OWASP Password Storage Cheat Sheet guidance
 * (N=2^15, r=8, p=1 => ~64 MiB per hash; min 0.5s-class cost on small VPS).
 * Format: scrypt$N$r$p$saltHex$hashHex
 */
const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await scrypt(password.normalize("NFKC"), salt, 32, PARAMS);
  return `scrypt$${PARAMS.N}$${PARAMS.r}$${PARAMS.p}$${salt.toString("hex")}$${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    const [scheme, nStr, rStr, pStr, saltHex, hashHex] = stored.split("$");
    if (scheme !== "scrypt" || !saltHex || !hashHex) return false;
    const derived = await scrypt(
      password.normalize("NFKC"),
      Buffer.from(saltHex, "hex"),
      32,
      { N: Number(nStr), r: Number(rStr), p: Number(pStr), maxmem: PARAMS.maxmem }
    );
    return timingSafeEqual(derived, Buffer.from(hashHex, "hex"));
  } catch {
    return false;
  }
}

/** Opaque session token: 32 random bytes, base64url. Only its SHA-256 is stored server-side. */
export function generateSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateResetToken(): string {
  return randomBytes(32).toString("base64url");
}
