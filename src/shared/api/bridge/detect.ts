/**
 * Bridge companion app detection — browser-side.
 * Probes the local HTTP API at localhost:19433 to check if Bridge is running.
 * Same pattern as the Lexicon detection in shared/api/lexicon/client.ts.
 * @module shared/api/bridge/detect
 */

const BRIDGE_BASE = 'http://127.0.0.1:19433';
const DETECT_TIMEOUT_MS = 2000;

export type BridgeStatus = {
  version: string;
  authenticated: boolean;
  syncEnabled: boolean;
  lastSync: string | null;
};

let cachedStatus: BridgeStatus | null | undefined;

/**
 * Probe whether Bridge is running and accessible.
 * Returns the status object, or null if not available.
 * Caches the result for the browser session.
 */
export async function detectBridge(): Promise<BridgeStatus | null> {
  if (cachedStatus !== undefined) return cachedStatus;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DETECT_TIMEOUT_MS);

    const res = await fetch(`${BRIDGE_BASE}/status`, {
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) {
      cachedStatus = null;
      return null;
    }

    const data = await res.json();
    cachedStatus = data as BridgeStatus;
    return cachedStatus;
  } catch {
    cachedStatus = null;
    return null;
  }
}

/** Reset cached detection (useful after user installs/starts Bridge). */
export function resetBridgeDetection() {
  cachedStatus = undefined;
}

/**
 * Fetch sync status for a specific event from the web API.
 * This calls the Unusonic server, not the Bridge local API.
 */
export async function fetchBridgeSyncStatus(eventId: string): Promise<{
  matchedCount: number;
  totalCount: number;
  unmatchedSongs: string[];
  bridgeVersion: string | null;
  syncedAt: string;
} | null> {
  try {
    const res = await fetch(`/api/bridge/sync-status?eventId=${eventId}`);
    if (!res.ok) return null;
    const data = await res.json();
    return data.syncStatus ?? null;
  } catch {
    return null;
  }
}
