import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

// ─────────────────────────────────────────────────────────────────────────────
// Agent API keys (DECISIONS D12 / design.md "API key").
//
// Format: `ab_<prefix>_<secret>`
//   • `ab`     — fixed product marker.
//   • <prefix> — public, displayed in the UI to identify the key. NOT counted
//                toward secret strength.
//   • <secret> — carries ≥256 bits of entropy on its own (brute force infeasible).
//
// Stored at rest as a plain SHA-256 of the FULL token (no KDF): the ≥256-bit
// entropy already defeats brute force, and a per-row-salted KDF would break the
// indexed `WHERE api_key_hash = ?` lookup the MCP path needs on every call.
// Shown to the manager exactly once; only the prefix is ever displayed after.
// ─────────────────────────────────────────────────────────────────────────────

const KEY_RE = /^ab_([0-9a-z]+)_([0-9a-f]+)$/i;

/** base32-ish lowercase alphabet for the human-facing prefix (no 0/1/o/l). */
const PREFIX_ALPHABET = "23456789abcdefghjkmnpqrstuvwxyz";

function randomPrefix(len = 8): string {
  // ~5 bits/char of identifier entropy — display/collision-avoidance only, not
  // a secret. Uniqueness is ultimately guaranteed by the UNIQUE api_key_hash.
  const bytes = randomBytes(len);
  let out = "";
  for (let i = 0; i < len; i++) out += PREFIX_ALPHABET[bytes[i] % PREFIX_ALPHABET.length];
  return out;
}

export interface GeneratedKey {
  /** The full `ab_<prefix>_<secret>` token — shown to the user EXACTLY ONCE. */
  token: string;
  /** Public prefix, persisted in `api_key_prefix` for UI display. */
  prefix: string;
  /** SHA-256 of the full token, persisted in `api_key_hash`. */
  hash: string;
}

/** Generate a fresh agent key. The 32-byte secret carries 256 bits of entropy. */
export function generateApiKey(): GeneratedKey {
  const prefix = randomPrefix();
  const secret = randomBytes(32).toString("hex"); // 32 bytes = 256 bits
  const token = `ab_${prefix}_${secret}`;
  return { token, prefix, hash: hashApiKey(token) };
}

/** SHA-256 hex of the full token. Used for both storage and per-call lookup. */
export function hashApiKey(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Structural validity check (shape only — not authentication). */
export function isWellFormedKey(token: string): boolean {
  return KEY_RE.test(token);
}

/** Extract the public prefix from a token, or null if malformed. */
export function prefixOf(token: string): string | null {
  const m = token.match(KEY_RE);
  return m ? m[1] : null;
}

/**
 * Constant-time compare of two SHA-256 hex digests. (DB lookup by hash is the
 * primary path; this is for any in-code comparison so we never leak timing.)
 */
export function hashesEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
