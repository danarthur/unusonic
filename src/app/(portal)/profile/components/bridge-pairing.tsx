'use client';

import { useState, useEffect, useTransition } from 'react';
import { Monitor, Loader2, Copy, Check, Unplug, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { generateBridgePairingCode, getPairedBridgeDevices, revokeBridgeDevice } from '@/features/bridge/actions';

/* ── Phase Mark Icon ───────────────────────────────────────────── */

function BridgeIcon({ className }: { className?: string }) {
  return <Monitor className={className} />;
}

/* ── Types ──────────────────────────────────────────────────────── */

type PairedDevice = {
  id: string;
  deviceName: string;
  lastSyncAt: string | null;
  createdAt: string;
};

/* ── Component ──────────────────────────────────────────────────── */

export function BridgePairing() {
  const [isPending, startTransition] = useTransition();
  const [devices, setDevices] = useState<PairedDevice[]>([]);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [codeExpiresAt, setCodeExpiresAt] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // Fetch paired devices on mount
  useEffect(() => {
    getPairedBridgeDevices().then((d) => {
      setDevices(d);
      setLoaded(true);
    });
  }, []);

  const handleGenerateCode = () => {
    startTransition(async () => {
      const result = await generateBridgePairingCode();
      if (result.ok) {
        setPairingCode(result.code);
        setCodeExpiresAt(Date.now() + 5 * 60 * 1000); // 5 minutes
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleCopyCode = async () => {
    if (!pairingCode) return;
    // Copy with the visual hyphen so pasted output is readable; the server
    // strips separators before validation.
    const formatted = `${pairingCode.slice(0, 4)}-${pairingCode.slice(4)}`;
    await navigator.clipboard.writeText(formatted);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleRevoke = (tokenId: string) => {
    startTransition(async () => {
      const result = await revokeBridgeDevice(tokenId);
      if (result.ok) {
        setDevices((prev) => prev.filter((d) => d.id !== tokenId));
        toast.success('Device unpaired');
      } else {
        toast.error('Failed to unpair device');
      }
    });
  };

  // Check if code has expired
  const codeExpired = codeExpiresAt !== null && Date.now() > codeExpiresAt;
  const activeCode = pairingCode && !codeExpired ? pairingCode : null;

  if (!loaded) return null;

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BridgeIcon className="size-4 text-[var(--stage-text-secondary)]" />
        <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
          Unusonic Bridge
        </h3>
      </div>

      {/* Paired devices */}
      {devices.length > 0 && (
        <div className="flex flex-col gap-2">
          {devices.map((device) => (
            <div
              key={device.id}
              className="flex items-center justify-between gap-3 p-3 rounded-xl bg-[var(--stage-surface-elevated)]"
            >
              <div className="flex items-center gap-3 min-w-0">
                <Monitor className="size-5 text-[var(--stage-text-secondary)] shrink-0" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--stage-text-primary)]">
                    {device.deviceName}
                  </p>
                  <p className="text-xs text-[var(--stage-text-tertiary)]">
                    {device.lastSyncAt
                      ? `Last sync ${formatRelativeTime(device.lastSyncAt)}`
                      : `Paired ${formatRelativeTime(device.createdAt)}`}
                  </p>
                </div>
              </div>
              <button
                onClick={() => handleRevoke(device.id)}
                disabled={isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-[var(--stage-text-secondary)] bg-[oklch(1_0_0/0.06)] hover:bg-[oklch(1_0_0/0.1)] transition-colors disabled:opacity-[0.45]"
              >
                <Unplug className="size-3" />
                Unpair
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Pairing flow */}
      <div className="flex flex-col gap-2 p-3 rounded-xl bg-[var(--stage-surface-elevated)]">
        <div className="flex items-center gap-2">
          <Monitor className="size-4 text-[var(--stage-text-secondary)]" />
          <p className="text-sm font-medium text-[var(--stage-text-primary)]">
            {devices.length > 0 ? 'Connect another laptop' : 'Connect my laptop'}
          </p>
        </div>
        <p className="text-xs text-[var(--stage-text-tertiary)]">
          Bridge builds your show crate in Serato automatically. Install it on your laptop, then enter the code below.
        </p>

        {activeCode ? (
          <div className="flex flex-col gap-2 mt-1">
            <div className="flex items-center gap-3">
              <div className="flex-1 flex items-center justify-center py-3 rounded-lg bg-[var(--ctx-well)] border border-[oklch(1_0_0/0.06)]">
                <span className="text-lg font-mono font-semibold tracking-[0.2em] text-[var(--stage-text-primary)]">
                  {activeCode.slice(0, 4)}
                  <span className="mx-2 text-[var(--stage-text-tertiary)]">-</span>
                  {activeCode.slice(4)}
                </span>
              </div>
              <button
                onClick={handleCopyCode}
                className="flex items-center gap-1 px-2.5 py-2.5 text-xs font-medium rounded-lg bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.12)] transition-colors shrink-0"
              >
                {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              </button>
            </div>
            <div className="flex items-center justify-between">
              <p className="text-[10px] text-[var(--stage-text-tertiary)]">
                Expires in 5 minutes
              </p>
              <button
                onClick={handleGenerateCode}
                disabled={isPending}
                className="flex items-center gap-1 text-[10px] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors disabled:opacity-[0.45]"
              >
                <RefreshCw className="size-2.5" />
                New code
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={handleGenerateCode}
            disabled={isPending}
            className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl text-xs font-medium bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.12)] transition-colors disabled:opacity-[0.45] mt-1"
          >
            {isPending ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Monitor className="size-3.5" />
            )}
            {pairingCode && codeExpired ? 'Code expired — get a new one' : 'Get pairing code'}
          </button>
        )}
      </div>
    </div>
  );
}

/* ── Helpers ────────────────────────────────────────────────────── */

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
