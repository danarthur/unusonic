/**
 * Aion admin perimeter — Phase 3 §3.10 C9.
 *
 * Reads `AION_ADMIN_USER_IDS` env var (comma-separated uuids) and exposes
 * a single boolean check for admin-only routes. Rotating the allowlist
 * doesn't require a redeploy because env vars are runtime-resolved.
 *
 * Usage at any admin route handler:
 *
 *   const supabase = await createClient();
 *   const { data: { user } } = await supabase.auth.getUser();
 *   if (!user || !isAionAdmin(user.id)) {
 *     return NextResponse.json({ ok: false, error: 'forbidden' }, { status: 403 });
 *   }
 *
 * Tiny on purpose — anything more elaborate (role hierarchies, scoped
 * permissions) lives in workspace_members + member_has_permission. This
 * perimeter is a coarse "is this person allowed to see cross-workspace
 * Aion telemetry?" gate, nothing more.
 */

/**
 * True iff the caller is on the cross-workspace Aion-admin allowlist.
 * Reads AION_ADMIN_USER_IDS (comma-separated uuids) on every call so a
 * rotation flows through without a redeploy.
 *
 * Empty / missing env var → returns false for everyone (lock-fail-closed).
 */
export function isAionAdmin(userId: string | null | undefined): boolean {
  if (!userId) return false;
  const raw = process.env.AION_ADMIN_USER_IDS;
  if (!raw) return false;
  const allowlist = raw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return allowlist.includes(userId);
}

/**
 * Parse the env var into a Set for callers that need to enumerate / count.
 * Returns an empty Set when the env var is missing or empty.
 */
export function getAionAdminUserIds(): Set<string> {
  const raw = process.env.AION_ADMIN_USER_IDS;
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim())
      .filter((s) => s.length > 0),
  );
}
