import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { open } from '@tauri-apps/plugin-shell';
import { FolderPicker } from '../components/FolderPicker';
import { LivingLogo } from '../components/LivingLogo';

type BridgeSettings = {
  musicFolders: string[];
  syncIntervalSeconds: number;
  syncHorizonDays: number;
  djSoftware: 'serato' | 'rekordbox' | 'both';
  authenticated: boolean;
  deviceName: string;
};

export function Settings() {
  const [settings, setSettings] = useState<BridgeSettings | null>(null);
  const [pairingCode, setPairingCode] = useState('');
  const [pairingError, setPairingError] = useState<string | null>(null);
  const [pairing, setPairing] = useState(false);

  const fetchSettings = async () => {
    try {
      const s = await invoke<BridgeSettings>('get_settings');
      setSettings(s);
    } catch {
      setSettings({
        musicFolders: [],
        syncIntervalSeconds: 60,
        syncHorizonDays: 7,
        djSoftware: 'serato',
        authenticated: false,
        deviceName: '',
      });
    }
  };

  useEffect(() => { fetchSettings(); }, []);

  const handlePair = async () => {
    const code = pairingCode.trim().toUpperCase();
    if (code.length !== 6) {
      setPairingError('Code must be 6 characters');
      return;
    }
    setPairing(true);
    setPairingError(null);
    try {
      await invoke('pair_with_code', { code });
      await fetchSettings();
      setPairingCode('');
    } catch (e) {
      setPairingError(String(e));
    }
    setPairing(false);
  };

  const handleUnpair = async () => {
    try {
      await invoke('unpair_device');
      await fetchSettings();
    } catch (e) {
      console.error('Unpair failed:', e);
    }
  };

  const handleAddFolder = async (path: string) => {
    try {
      await invoke('add_music_folder', { path });
      await fetchSettings();
    } catch (e) {
      console.error('Add folder failed:', e);
    }
  };

  const handleRemoveFolder = async (path: string) => {
    try {
      await invoke('remove_music_folder', { path });
      await fetchSettings();
    } catch (e) {
      console.error('Remove folder failed:', e);
    }
  };

  const handleSetDjSoftware = async (value: string) => {
    try {
      await invoke('set_dj_software', { value });
      await fetchSettings();
    } catch (e) {
      console.error('Set DJ software failed:', e);
    }
  };

  if (!settings) {
    return (
      <div className="empty-state">
        <LivingLogo size="lg" status="loading" />
      </div>
    );
  }

  return (
    <div className="stack">
      {/* Account */}
      <div className="stack-tight">
        <span className="section-label">Account</span>

        {settings.authenticated ? (
          <div className="card row between">
            <div>
              <div style={{ fontSize: '13px', fontWeight: 500 }}>Paired</div>
              <span className="text-xs text-tertiary">{settings.deviceName}</span>
            </div>
            <button className="btn" onClick={handleUnpair} style={{ height: '28px', fontSize: '11px' }}>
              Unpair
            </button>
          </div>
        ) : (
          <div className="card stack-tight">
            <span className="text-sm text-secondary">
              Open your Unusonic profile and generate a pairing code.
            </span>
            <div className="row" style={{ gap: '8px' }}>
              <input
                className="input flex-1"
                value={pairingCode}
                onChange={(e) => setPairingCode(e.target.value.toUpperCase().slice(0, 6))}
                placeholder="ABC123"
                maxLength={6}
                style={{
                  textAlign: 'center',
                  letterSpacing: '0.15em',
                  fontSize: '16px',
                }}
              />
              <button
                className="btn btn-accent"
                onClick={handlePair}
                disabled={pairing || pairingCode.length < 6}
              >
                {pairing ? 'Pairing...' : 'Pair'}
              </button>
            </div>
            {pairingError && (
              <span className="text-xs" style={{ color: 'var(--color-unusonic-error)' }}>
                {pairingError}
              </span>
            )}
            <button
              className="btn-ghost text-xs"
              onClick={() => open('https://unusonic.com/portal/profile')}
              style={{ textDecoration: 'underline', textAlign: 'left' }}
            >
              Open Unusonic to get a code
            </button>
          </div>
        )}
      </div>

      {/* Music folders */}
      <div className="stack-tight">
        <span className="section-label">Music folders</span>
        <FolderPicker
          folders={settings.musicFolders}
          onAdd={handleAddFolder}
          onRemove={handleRemoveFolder}
        />
      </div>

      {/* DJ Software */}
      <div className="stack-tight">
        <span className="section-label">DJ software</span>
        <div className="row" style={{ gap: '6px' }}>
          {(['serato', 'rekordbox', 'both'] as const).map((opt) => (
            <button
              key={opt}
              className="software-option"
              data-active={settings.djSoftware === opt}
              onClick={() => handleSetDjSoftware(opt)}
            >
              {opt === 'both' ? 'Both' : opt.charAt(0).toUpperCase() + opt.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div className="version">Unusonic Bridge v0.1.0</div>
    </div>
  );
}
