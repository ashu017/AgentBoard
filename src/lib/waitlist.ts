// Pure waitlist logic, extracted from WaitlistForm so it's testable without React
// or a live DB (DECISIONS D-WAITLIST). The component owns the Supabase call and
// UI state; these functions own the rules that decide what happens.

/** Minimal email shape — mirrors the DB CHECK on waitlist_signups.email. */
export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_RE.test(email.trim());
}

/**
 * What the form should do with a submission, before touching the network.
 *   • "invalid"  → bad email, show a validation error, don't insert.
 *   • "honeypot" → hidden field was filled (a bot) → silently report success,
 *                  never insert, give the bot no signal.
 *   • "insert"   → a real, valid signup → perform the insert.
 */
export function classifySubmission(email: string, honeypot: string): "invalid" | "honeypot" | "insert" {
  if (honeypot) return "honeypot";
  if (!isValidEmail(email)) return "invalid";
  return "insert";
}

/**
 * Map a Supabase insert error code to whether it's actually a failure. A unique
 * violation (23505) means the email is already on the list — a no-op we surface
 * as success, not an error. Any other code is a real failure.
 */
export function isInsertSuccess(errorCode: string | null | undefined): boolean {
  return !errorCode || errorCode === "23505";
}
