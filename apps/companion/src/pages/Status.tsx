import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { LivingLogo } from '../components/LivingLogo';
import { SyncStatusRow } from '../components/SyncStatusRow';

type SyncResult = {
  eventId: string;
  eventTitle: string;
  eventDate: string;
  matchedCount: number;
  totalCount: number;
  unmatchedSongs: string[];
  syncedAt: string;
};

type AppStatus = {
  authenticated: boolean;
  syncEnabled: boolean;
  libraryTrackCount: number;
  lastSync: string | null;
  recentSyncs: SyncResult[];
};

type ScanStatus = {
  scanning: boolean;
  scannedCount: number;
  currentFolder: string;
};

export function Status() {
  const [status, setStatus] = useState<AppStatus | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [scanStatus, setScanStatus] = useState<ScanStatus | null>(null);

  const fetchScanProgress = async () => {
    try {
      const s = await invoke<ScanStatus>('get_scan_progress');
      setScanStatus(s);
    } catch {
      setScanStatus(null);
    }
  };

  const fetchStatus = async () => {
    try {
      const s = await invoke<AppStatus>('get_app_status');
      setStatus(s);
    } catch {
      setStatus({
        authenticated: false,
        syncEnabled: false,
        libraryTrackCount: 0,
        lastSync: null,
        recentSyncs: [],
      });
    }
  };

  useEffect(() => {
    fetchStatus();
    fetchScanProgress();
    const statusInterval = setInterval(fetchStatus, 5000);
    const scanInterval = setInterval(fetchScanProgress, 500); // poll faster during scans
    return () => {
      clearInterval(statusInterval);
      clearInterval(scanInterval);
    };
  }, []);

  const handleSyncNow = async () => {
    setSyncing(true);
    try {
      await invoke('trigger_sync');
      await fetchStatus();
    } catch (e) {
      console.error('Sync failed:', e);
    }
    setSyncing(false);
  };

  if (!status) {
    return (
      <div className="empty-state">
        <LivingLogo size="lg" status="loading" />
      </div>
    );
  }

  return (
    <div className="stack">
      {/* Connection status card */}
      <div className="card row between">
        <div className="row" style={{ gap: '10px' }}>
          <LivingLogo
            size="sm"
            status={syncing ? 'syncing' : status.authenticated ? 'idle' : 'error'}
          />
          <div>
            <div className="row" style={{ gap: '6px' }}>
              <span className="status-dot" data-status={status.authenticated ? 'connected' : 'idle'} />
              <span style={{ fontSize: '13px', fontWeight: 500 }}>
                {status.authenticated ? 'Connected' : 'Not paired'}
              </span>
            </div>
            {status.lastSync && (
              <span className="text-xxs text-tertiary" style={{ marginTop: '2px', display: 'block' }}>
                Last sync {formatRelative(status.lastSync)}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Library stats */}
      <div className="card">
        <span className="section-label">Library</span>
        <div className="data-hero" style={{ marginTop: '6px' }}>
          {scanStatus?.scanning
            ? scanStatus.scannedCount.toLocaleString()
            : status.libraryTrackCount.toLocaleString()
          }
        </div>
        {scanStatus?.scanning ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '2px' }}>
            <div className="row" style={{ gap: '6px' }}>
              <div className="scan-pulse" />
              <span className="text-xs" style={{ color: 'var(--stage-accent)' }}>
                Scanning...
              </span>
            </div>
            <span className="text-xxs text-tertiary truncate">
              {scanStatus.currentFolder.split('/').slice(-2).join('/')}
            </span>
          </div>
        ) : (
          <span className="text-xs text-tertiary">tracks indexed</span>
        )}
      </div>

      {/* Sync button */}
      {status.authenticated && (
        <button
          className="btn btn-accent"
          onClick={handleSyncNow}
          disabled={syncing}
          style={{ width: '100%' }}
        >
          {syncing ? 'Syncing...' : 'Sync now'}
        </button>
      )}

      {/* Recent syncs */}
      {status.recentSyncs.length > 0 && (
        <div className="stack-tight">
          <span className="section-label">Recent syncs</span>
          {status.recentSyncs.map((sync) => (
            <SyncStatusRow key={sync.eventId} sync={sync} />
          ))}
        </div>
      )}

      {/* Empty state */}
      {status.authenticated && status.recentSyncs.length === 0 && (
        <div className="empty-state">
          Programs will sync automatically when available.
        </div>
      )}

      {/* Not paired state */}
      {!status.authenticated && (
        <div className="empty-state">
          Open Settings to pair with your Unusonic account.
        </div>
      )}
    </div>
  );
}

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}
