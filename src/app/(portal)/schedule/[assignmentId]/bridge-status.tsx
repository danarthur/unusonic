'use client';

import { useState, useEffect } from 'react';
import { Monitor, Check, AlertCircle, RefreshCw, Loader2 } from 'lucide-react';
import { detectBridge, resetBridgeDetection, fetchBridgeSyncStatus } from '@/shared/api/bridge/detect';
import { getLoopbackNonce } from '@/features/bridge/actions';

interface BridgeStatusProps {
  eventId: string;
}

export function BridgeStatus({ eventId }: BridgeStatusProps) {
  const [bridgeAvailable, setBridgeAvailable] = useState<boolean | null>(null);
  const [syncStatus, setSyncStatus] = useState<{
    matchedCount: number;
    totalCount: number;
    unmatchedSongs: string[];
    syncedAt: string;
  } | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Detect Bridge + fetch sync status on mount
  useEffect(() => {
    detectBridge().then((status) => {
      setBridgeAvailable(status !== null);
    });

    fetchBridgeSyncStatus(eventId).then(setSyncStatus);
  }, [eventId]);

  // If Bridge is not detected and no sync history, don't show anything
  if (bridgeAvailable === null) return null;
  if (!bridgeAvailable && !syncStatus) return null;

  const handleTriggerSync = async () => {
    setIsSyncing(true);
    try {
      // The loopback API requires a per-launch nonce Bridge posted on
      // startup. Without it we can't authenticate; fall through and let
      // Bridge's own 60s poll eventually pick up the change.
      const nonce = await getLoopbackNonce();
      if (!nonce) {
        setIsSyncing(false);
        return;
      }
      await fetch(`http://127.0.0.1:19433/sync/trigger/${eventId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${nonce}` },
      });
      // Refresh sync status after a short delay
      setTimeout(async () => {
        const updated = await fetchBridgeSyncStatus(eventId);
        if (updated) setSyncStatus(updated);
        setIsSyncing(false);
      }, 3000);
    } catch {
      setIsSyncing(false);
    }
  };

  const handleRetryDetect = () => {
    resetBridgeDetection();
    setBridgeAvailable(null);
    detectBridge().then((status) => {
      setBridgeAvailable(status !== null);
    });
  };

  return (
    <div className="flex flex-col gap-2">
      {/* Connection status */}
      <div className="flex items-center justify-between gap-2 p-3 rounded-xl bg-[var(--stage-surface-elevated)]">
        <div className="flex items-center gap-2 min-w-0">
          <Monitor className="size-4 text-[var(--stage-text-secondary)] shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-medium text-[var(--stage-text-primary)]">
                Bridge
              </span>
              {bridgeAvailable ? (
                <span className="flex items-center gap-1 text-[10px] text-[oklch(0.75_0.15_145)]">
                  <span className="size-1.5 rounded-full bg-[oklch(0.75_0.15_145)]" />
                  Connected
                </span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] text-[var(--stage-text-tertiary)]">
                  <span className="size-1.5 rounded-full bg-[var(--stage-text-tertiary)]" />
                  Not running
                </span>
              )}
            </div>
            {syncStatus && (
              <p className="text-[10px] text-[var(--stage-text-tertiary)] mt-0.5">
                Synced {formatRelativeTime(syncStatus.syncedAt)}
                {syncStatus.totalCount > 0 && (
                  <> — {syncStatus.matchedCount}/{syncStatus.totalCount} tracks matched</>
                )}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {bridgeAvailable && (
            <button
              onClick={handleTriggerSync}
              disabled={isSyncing}
              className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.1)] transition-colors disabled:opacity-[0.45]"
            >
              {isSyncing ? (
                <Loader2 className="size-2.5 animate-spin" />
              ) : (
                <RefreshCw className="size-2.5" />
              )}
              Sync
            </button>
          )}
          {!bridgeAvailable && (
            <button
              onClick={handleRetryDetect}
              className="text-[10px] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
            >
              <RefreshCw className="size-3" />
            </button>
          )}
        </div>
      </div>

      {/* Unmatched songs warning */}
      {syncStatus && syncStatus.unmatchedSongs.length > 0 && (
        <div className="flex flex-col gap-1.5 p-3 rounded-lg bg-[oklch(0.75_0.15_70/0.06)]">
          <div className="flex items-center gap-2 text-xs text-[oklch(0.75_0.12_70)]">
            <AlertCircle className="size-3.5 shrink-0" />
            <span className="font-medium">
              {syncStatus.unmatchedSongs.length} track{syncStatus.unmatchedSongs.length !== 1 ? 's' : ''} not in your library
            </span>
          </div>
          <div className="flex flex-col gap-0.5 ml-5.5">
            {(syncStatus.unmatchedSongs as string[]).slice(0, 5).map((name, i) => (
              <span key={i} className="text-[10px] text-[var(--stage-text-secondary)] truncate">
                {name}
              </span>
            ))}
            {syncStatus.unmatchedSongs.length > 5 && (
              <span className="text-[10px] text-[var(--stage-text-tertiary)]">
                +{syncStatus.unmatchedSongs.length - 5} more
              </span>
            )}
          </div>
        </div>
      )}

      {/* Matched confirmation */}
      {syncStatus && syncStatus.unmatchedSongs.length === 0 && syncStatus.totalCount > 0 && (
        <div className="flex items-center gap-2 p-2.5 rounded-lg bg-[oklch(0.75_0.15_145/0.06)]">
          <Check className="size-3.5 text-[oklch(0.75_0.15_145)] shrink-0" />
          <span className="text-xs text-[oklch(0.75_0.15_145)]">
            All {syncStatus.totalCount} tracks matched and synced
          </span>
        </div>
      )}
    </div>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
