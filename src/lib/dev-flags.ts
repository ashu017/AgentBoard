// Small server-readable flags. Kept out of the "use server" actions file (which
// may only export async functions).

/** DEV-ONLY login toggle. Never enable in production (real flow = GitHub OAuth). */
export function devLoginEnabled(): boolean {
  return process.env.DEV_LOGIN === "1";
}
