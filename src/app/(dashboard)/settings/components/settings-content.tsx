/**
 * Settings Content Component
 * Main settings interface with profile, team, and integrations management
 * @module app/(dashboard)/settings/components/settings-content
 */

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { STAGE_MEDIUM, STAGE_HEAVY } from '@/shared/lib/motion-constants';
import Link from 'next/link';
import {
  User,
  Building2,
  Plug2,
  Camera,
  Check,
  X,
  Loader2,
  ExternalLink,
  Sparkles,
  Copy,
  RefreshCw,
  MapPin,
  Plus,
  Clock,
  Palette,
  Shield,
  Volume2,
  VolumeX,
  Play,
} from 'lucide-react';
import { updateProfile } from '@/features/identity-hydration';
import { ProfileAvatarUpload } from '@/features/identity-hydration/ui/ProfileAvatarUpload';
import { QboConnectCard } from '@/features/auth/qbo-connect/ui/connect-card';
import { TeamManagement } from './team-management';
import { RoleBuilderShell } from '@/features/role-builder';
import { usePreferences } from '@/shared/ui/providers/PreferencesContext';
import { CeramicSwitch } from '@/shared/ui/switch';
import { useSoundStore } from '@/shared/lib/sound/sound-store';
import { SoundEngine } from '@/shared/lib/sound/sound-engine';
import type { SoundName } from '@/shared/lib/sound/sounds';
import type { WorkspaceMemberData, LocationData } from '@/app/actions/workspace';
import { updateWorkspacePaymentDefaults, type WorkspacePaymentDefaults } from '@/features/org-management/api/payment-defaults-actions';

interface SettingsData {
  user: {
    id: string;
    email: string;
  };
  profile: {
    fullName: string;
    avatarUrl: string | null;
  };
  workspace: {
    id: string;
    name: string;
    role: 'owner' | 'admin' | 'member' | 'viewer';
    inviteCode: string | null;
    subscriptionTier?: 'foundation' | 'growth' | 'venue_os' | 'autonomous';
  } | null;
  integrations: {
    quickbooks: boolean;
    qboRealmId?: string | null;
  };
  members: WorkspaceMemberData[];
  locations: LocationData[];
  paymentDefaults: WorkspacePaymentDefaults | null;
}

interface SettingsContentProps {
  data: SettingsData;
  searchParams?: { success?: string; error?: string };
}

export function SettingsContent({ data, searchParams }: SettingsContentProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { militaryTime, setMilitaryTime } = usePreferences();
  const { enabled: soundEnabled, volume, studioMode, setEnabled: setSoundEnabled, setVolume, setStudioMode } = useSoundStore();

  // Profile state
  const [fullName, setFullName] = useState(data.profile.fullName);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(data.profile.avatarUrl);
  const [profileSaved, setProfileSaved] = useState(false);
  const [error, setError] = useState<string | null>(
    searchParams?.error === 'qbo_auth_failed' ? 'QuickBooks authorization failed. Try again.' : null
  );
  
  const springConfig = STAGE_MEDIUM;
  
  const handleSaveProfile = () => {
    setError(null);
    setProfileSaved(false);
    
    startTransition(async () => {
      const result = await updateProfile({ fullName: fullName.trim() });
      
      if (result.success) {
        setProfileSaved(true);
        setTimeout(() => setProfileSaved(false), 3000);
      } else {
        setError(result.error || 'Failed to save profile');
      }
    });
  };
  
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.1 }}
      >
        <h1 className="text-2xl font-medium tracking-tight text-[var(--stage-text-primary)]">Settings</h1>
        <p className="text-sm text-[var(--stage-text-secondary)] font-light mt-1">
          Tune your account and integrations
        </p>
</motion.div>

      {/* Preferences Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.12 }}
        className="stage-panel p-6 space-y-6"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--ctx-well)] flex items-center justify-center">
            <Clock className="w-5 h-5 text-[var(--stage-text-secondary)]" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-[var(--stage-text-primary)]">Preferences</h2>
            <p className="text-xs text-[var(--stage-text-secondary)]">Site-wide display and time options</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-[var(--stage-surface-elevated)] border border-[var(--stage-border)]">
          <div>
            <p className="text-sm font-medium text-[var(--stage-text-primary)]">Use 24-hour time</p>
            <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">Show times as 14:30 instead of 2:30 PM across the app</p>
          </div>
          <CeramicSwitch
            checked={militaryTime}
            onCheckedChange={setMilitaryTime}
            aria-label="Use 24-hour time"
          />
        </div>
      </motion.section>

      {/* Sound & Notifications */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.13 }}
        className="stage-panel p-6 space-y-6"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--ctx-well)] flex items-center justify-center">
            {soundEnabled ? (
              <Volume2 className="w-5 h-5 text-[var(--stage-text-secondary)]" />
            ) : (
              <VolumeX className="w-5 h-5 text-[var(--stage-text-secondary)]" />
            )}
          </div>
          <div>
            <h2 className="text-lg font-medium text-[var(--stage-text-primary)]">Sound</h2>
            <p className="text-xs text-[var(--stage-text-secondary)]">Audio feedback for interactions and notifications</p>
          </div>
        </div>

        <div className="space-y-3">
          {/* Master toggle */}
          <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-[var(--stage-surface-elevated)] border border-[var(--stage-border)]">
            <div>
              <p className="text-sm font-medium text-[var(--stage-text-primary)]">Enable sounds</p>
              <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">Play audio feedback for actions and notifications</p>
            </div>
            <CeramicSwitch
              checked={soundEnabled}
              onCheckedChange={setSoundEnabled}
              aria-label="Enable sounds"
            />
          </div>

          {soundEnabled && (
            <>
              {/* Volume */}
              <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-[var(--stage-surface-elevated)] border border-[var(--stage-border)]">
                <div>
                  <p className="text-sm font-medium text-[var(--stage-text-primary)]">Volume</p>
                  <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">{Math.round(volume * 100)}%</p>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  className="w-28 accent-[var(--stage-accent)]"
                  aria-label="Sound volume"
                />
              </div>

              {/* Studio Mode */}
              <div className="flex items-center justify-between gap-4 p-4 rounded-xl bg-[var(--stage-surface-elevated)] border border-[var(--stage-border)]">
                <div>
                  <p className="text-sm font-medium text-[var(--stage-text-primary)]">Studio Mode</p>
                  <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">Suppress all sounds except critical alerts</p>
                </div>
                <CeramicSwitch
                  checked={studioMode}
                  onCheckedChange={setStudioMode}
                  aria-label="Studio Mode"
                />
              </div>

              {/* Preview sounds */}
              <div className="p-4 rounded-xl bg-[var(--stage-surface-elevated)] border border-[var(--stage-border)] space-y-3">
                <p className="text-sm font-medium text-[var(--stage-text-primary)]">Preview</p>
                <div className="flex flex-wrap gap-2">
                  {(['resolve', 'confirm', 'arrive', 'alert', 'tap', 'close'] as SoundName[]).map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => SoundEngine.play(name)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-[var(--stage-text-secondary)] bg-[var(--ctx-well)] hover:text-[var(--stage-text-primary)] hover:bg-[var(--stage-surface)] transition-colors"
                    >
                      <Play size={10} />
                      {name}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </motion.section>

      {/* Profile Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.15 }}
        className="stage-panel p-6 space-y-6"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--ctx-well)] flex items-center justify-center">
            <User className="w-5 h-5 text-[var(--stage-text-secondary)]" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-[var(--stage-text-primary)]">Profile</h2>
            <p className="text-xs text-[var(--stage-text-secondary)]">Your personal information</p>
          </div>
        </div>
        
        <div className="grid md:grid-cols-[auto,1fr] gap-6 items-start">
          {/* Avatar — upload, crop/zoom, save (same UX as add employee) */}
          <ProfileAvatarUpload
            value={avatarUrl}
            onChange={(url) => setAvatarUrl(url || null)}
            onUploadComplete={() => router.refresh()}
            className="mx-auto md:mx-0"
          />
          
          {/* Profile Form */}
          <div className="space-y-4 flex-1">
            <div>
              <label className="block stage-field-label mb-2">
                Full Name
              </label>
              <input
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Enter your full name"
                className="w-full px-4 py-3 rounded-xl
                  bg-[var(--ctx-well)] border border-[var(--stage-border)]
                  text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)]/40
                  focus:outline-none focus-visible:border-[var(--stage-accent)] focus-visible:ring-2 focus-visible:ring-[var(--stage-accent-muted)]
                  transition-colors duration-100"
              />
            </div>
            
            <div>
              <label className="block stage-field-label mb-2">
                Email
              </label>
              <div className="px-4 py-3 rounded-xl bg-[var(--stage-surface-elevated)] border border-[var(--stage-border)]
                text-[var(--stage-text-secondary)] text-sm">
                {data.user.email}
              </div>
            </div>
            
            <div className="flex items-center gap-3 pt-2">
              <motion.button
                onClick={handleSaveProfile}
                disabled={isPending || fullName === data.profile.fullName}
                transition={springConfig}
                className="px-5 py-2.5 rounded-xl bg-[var(--stage-accent)] text-[var(--stage-text-on-accent)] text-sm font-medium
                  hover:bg-[oklch(1_0_0_/_0.08)] disabled:opacity-45 disabled:cursor-not-allowed
                  transition-colors flex items-center gap-2"
              >
                {isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Locking...
                  </>
                ) : (
                  'Lock'
                )}
              </motion.button>
              
              <AnimatePresence>
                {profileSaved && (
                  <motion.span
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -10 }}
                    transition={springConfig}
                    className="flex items-center gap-1.5 text-[var(--color-unusonic-success)] text-sm"
                  >
                    <Check className="w-4 h-4" />
                    Saved
                  </motion.span>

                )}
              </AnimatePresence>
            </div>
          </div>
        </div>
      </motion.section>
      
      {/* Organization Identity – The Mirror */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.18 }}
        className="stage-panel p-6 space-y-6"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--ctx-well)] flex items-center justify-center">
            <Palette className="w-5 h-5 text-[var(--stage-text-secondary)]" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-[var(--stage-text-primary)]">Establish Identity</h2>
            <p className="text-xs text-[var(--stage-text-secondary)]">Brand, logo, and how you appear to partners</p>
          </div>
        </div>
        <Link
          href="/settings/identity"
          className="flex items-center justify-between w-full p-4 rounded-xl bg-[var(--stage-surface-elevated)] border border-[var(--stage-border)] stage-hover overflow-hidden hover:border-[var(--stage-border-hover)] transition-colors text-left"
        >
          <span className="text-sm font-medium text-[var(--stage-text-primary)]">Open Identity Architect</span>
          <ExternalLink className="w-4 h-4 text-[var(--stage-text-secondary)]" />
        </Link>
      </motion.section>

      {/* Workspace Section */}
      {data.workspace && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.2 }}
          className="stage-panel p-6 space-y-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--ctx-well)] flex items-center justify-center">
              <Building2 className="w-5 h-5 text-[var(--stage-text-secondary)]" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-[var(--stage-text-primary)]">Workspace</h2>
              <p className="text-xs text-[var(--stage-text-secondary)]">Your current workspace</p>
            </div>
          </div>
          
          <div className="p-4 rounded-xl bg-[var(--stage-surface-elevated)] border border-[var(--stage-border)]">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[var(--stage-text-primary)] font-medium">{data.workspace.name}</p>
                <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5 capitalize">
                  Role: {data.workspace.role}
                </p>
              </div>
              <div className="px-3 py-1 rounded-full bg-[var(--color-unusonic-success)]/10 border border-[var(--color-unusonic-success)]/20">
                <span className="text-xs text-[var(--color-unusonic-success)] font-medium">
                  Active
                </span>
              </div>
            </div>
          </div>
          
          {/* Invite Code - Owners/Admins Only */}
          {(data.workspace.role === 'owner' || data.workspace.role === 'admin') && data.workspace.inviteCode && (
            <div className="p-4 rounded-xl bg-[var(--stage-surface-elevated)] border border-[var(--stage-border)]">
              <div className="flex items-center justify-between">
                <div>
                  <p className="stage-field-label mb-1">
                    Invite Code
                  </p>
                  <p className="text-lg font-mono font-medium text-[var(--stage-text-secondary)] tracking-widest">
                    {data.workspace.inviteCode}
                  </p>
                </div>
                <button
                  onClick={() => {
                    navigator.clipboard.writeText(data.workspace!.inviteCode!);
                  }}
                  className="stage-hover overflow-hidden p-2.5 rounded-xl bg-[var(--ctx-well)] text-[var(--stage-text-secondary)] transition-colors"
                  title="Copy invite code"
                >
                  <Copy className="w-4 h-4" />
                </button>
              </div>
              <p className="text-xs text-[var(--stage-text-secondary)] mt-2">
                Share this code with team members to invite them
              </p>
            </div>
          )}
          
          {/* Locations */}
          {data.locations.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <MapPin className="w-4 h-4 text-[var(--stage-text-secondary)]" />
                <span className="text-xs font-medium text-[var(--stage-text-secondary)] uppercase tracking-wider">
                  Locations
                </span>
              </div>
              <div className="space-y-2">
                {data.locations.map((location) => (
                  <div 
                    key={location.id}
                    className="flex items-center gap-3 p-3 rounded-xl bg-[var(--stage-surface-elevated)] border border-[var(--stage-border)]"
                  >
                    <div className={`w-2 h-2 rounded-full ${location.isPrimary ? 'bg-[var(--color-unusonic-success)]' : 'bg-[var(--stage-border-hover)]'}`} />
                    <div className="flex-1">
                      <p className="text-sm text-[var(--stage-text-primary)]">{location.name}</p>
                      {location.address && (
                        <p className="text-xs text-[var(--stage-text-secondary)]">{location.address}</p>
                      )}
                    </div>
                    {location.isPrimary && (
                      <span className="stage-label text-[var(--color-unusonic-success)]">
                        Primary
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </motion.section>
      )}

      {/* Roles (owner/admin only): Role Builder — placed right after Workspace so it’s visible without scrolling past Team */}
      {data.workspace && (data.workspace.role === 'owner' || data.workspace.role === 'admin') && (
        <motion.section
          id="roles"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.21 }}
          className="stage-panel p-6 space-y-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[var(--ctx-well)] flex items-center justify-center">
              <Shield className="w-5 h-5 text-[var(--stage-text-secondary)]" />
            </div>
            <div>
              <h2 className="text-lg font-medium text-[var(--stage-text-primary)]">Roles</h2>
              <p className="text-xs text-[var(--stage-text-secondary)]">Custom roles and permission bundles</p>
            </div>
          </div>
          <RoleBuilderShell
            workspaceId={data.workspace.id}
            subscriptionTier={data.workspace.subscriptionTier ?? 'foundation'}
          />
        </motion.section>
      )}

      {/* Team Management Section */}
      {data.workspace && (data.workspace.role === 'owner' || data.workspace.role === 'admin') && (
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...springConfig, delay: 0.22 }}
          className="stage-panel p-6"
        >
          <TeamManagement 
            workspaceId={data.workspace.id}
            members={data.members}
            currentUserRole={data.workspace.role}
          />
        </motion.section>
      )}
      
      {/* Payment Terms Section — owner/admin only */}
      {data.paymentDefaults && data.workspace && (data.workspace.role === 'owner' || data.workspace.role === 'admin') && (
        <PaymentTermsSection defaults={data.paymentDefaults} />
      )}

      {/* Integrations Section */}
      <motion.section
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...springConfig, delay: 0.25 }}
        className="stage-panel p-6 space-y-6"
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[var(--ctx-well)] flex items-center justify-center">
            <Plug2 className="w-5 h-5 text-[var(--stage-text-secondary)]" />
          </div>
          <div>
            <h2 className="text-lg font-medium text-[var(--stage-text-primary)]">Integrations</h2>
            <p className="text-xs text-[var(--stage-text-secondary)]">Connect external services</p>
          </div>
        </div>
        
        {searchParams?.success === 'true' && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={springConfig}
            className="flex items-center gap-2 p-3 rounded-xl bg-[var(--color-unusonic-success)]/10 border border-[var(--color-unusonic-success)]/20 text-sm text-[var(--color-unusonic-success)]"
          >
            <Check className="w-4 h-4" />
            QuickBooks connected successfully
          </motion.div>
        )}
        <div className="space-y-4">
          {/* QuickBooks Integration (QBO Connect) */}
          {data.workspace ? (
            <QboConnectCard
              workspaceId={data.workspace.id}
              isConnected={data.integrations.quickbooks}
              realmId={data.integrations.qboRealmId ?? null}
            />
          ) : (
            <div className="p-4 rounded-xl bg-[var(--color-unusonic-warning)]/5 border border-[var(--color-unusonic-warning)]/20">
              <p className="text-sm text-[var(--color-unusonic-warning)]">
                Set up a workspace first to enable integrations
              </p>
            </div>
          )}
          
          {/* Placeholder for future integrations */}
          <div className="p-4 rounded-xl bg-[var(--ctx-well)] border border-dashed border-[var(--stage-border)]">
            <div className="flex items-center gap-4 opacity-40">
              <div className="w-10 h-10 rounded-xl bg-[var(--ctx-well)] flex items-center justify-center">
                <Sparkles className="w-5 h-5 text-[var(--stage-text-secondary)]" />
              </div>
              <div>
                <p className="text-sm font-medium text-[var(--stage-text-primary)]">More Integrations</p>
                <p className="text-xs text-[var(--stage-text-secondary)]">Coming soon</p>
              </div>
            </div>
          </div>
        </div>
      </motion.section>
      
      {/* Error Message */}
      <AnimatePresence>
        {error && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={springConfig}
            className="p-4 rounded-xl bg-[var(--color-unusonic-error)]/5 border border-[var(--color-unusonic-error)]/15"
          >
            <p className="text-sm text-[var(--color-unusonic-error)] text-center font-light">
              {error}
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// =============================================================================
// PaymentTermsSection
// =============================================================================

function PaymentTermsSection({ defaults }: { defaults: WorkspacePaymentDefaults }) {
  const [depositPercent, setDepositPercent] = useState(defaults.default_deposit_percent);
  const [depositDeadline, setDepositDeadline] = useState(defaults.default_deposit_deadline_days);
  const [balanceDue, setBalanceDue] = useState(defaults.default_balance_due_days_before_event);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  const hasChanges =
    depositPercent !== defaults.default_deposit_percent ||
    depositDeadline !== defaults.default_deposit_deadline_days ||
    balanceDue !== defaults.default_balance_due_days_before_event;

  const handleSave = async () => {
    setSaving(true);
    setSaved(false);
    const result = await updateWorkspacePaymentDefaults({
      default_deposit_percent: depositPercent,
      default_deposit_deadline_days: depositDeadline,
      default_balance_due_days_before_event: balanceDue,
    });
    setSaving(false);
    if (result.success) {
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }
  };

  const fieldLabel = 'text-sm text-[var(--stage-text-secondary)] tracking-tight';
  const fieldHint = 'text-xs text-[var(--stage-text-secondary)]/40 mt-0.5';
  const inputClass =
    'w-20 bg-[var(--ctx-well)] border border-[var(--stage-border)] rounded-[var(--stage-radius-input)] px-3 py-2 text-sm text-[var(--stage-text-primary)] text-right focus:outline-none focus-visible:border-[var(--stage-border-focus)] tabular-nums';

  return (
    <motion.section
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...STAGE_HEAVY, delay: 0.2 }}
      className="stage-panel p-6 space-y-6"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-[var(--ctx-well)] flex items-center justify-center">
          <Clock className="w-5 h-5 text-[var(--stage-text-secondary)]" />
        </div>
        <div>
          <h2 className="text-lg font-medium text-[var(--stage-text-primary)]">Payment terms</h2>
          <p className="text-xs text-[var(--stage-text-secondary)]">Default terms applied to new proposals</p>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        {/* Deposit % */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={fieldLabel}>Default deposit</p>
            <p className={fieldHint}>Percentage of total due at signing</p>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              max={100}
              value={depositPercent}
              onChange={(e) => setDepositPercent(Math.max(0, Math.min(100, Number(e.target.value) || 0)))}
              className={inputClass}
            />
            <span className="text-sm text-[var(--stage-text-secondary)]">%</span>
          </div>
        </div>

        {/* Deposit deadline */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={fieldLabel}>Deposit deadline</p>
            <p className={fieldHint}>Days after contract acceptance</p>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              max={90}
              value={depositDeadline}
              onChange={(e) => setDepositDeadline(Math.max(0, Math.min(90, Number(e.target.value) || 0)))}
              className={inputClass}
            />
            <span className="text-sm text-[var(--stage-text-secondary)]">days</span>
          </div>
        </div>

        {/* Balance due before event */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className={fieldLabel}>Balance due</p>
            <p className={fieldHint}>Days before event date</p>
          </div>
          <div className="flex items-center gap-1.5">
            <input
              type="number"
              min={0}
              max={180}
              value={balanceDue}
              onChange={(e) => setBalanceDue(Math.max(0, Math.min(180, Number(e.target.value) || 0)))}
              className={inputClass}
            />
            <span className="text-sm text-[var(--stage-text-secondary)]">days</span>
          </div>
        </div>
      </div>

      {/* Save */}
      <AnimatePresence>
        {hasChanges && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={STAGE_MEDIUM}
            className="overflow-hidden"
          >
            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="stage-hover overflow-hidden px-4 py-2 rounded-xl text-sm font-medium text-[var(--stage-text-primary)] border border-[var(--stage-border)] bg-[var(--stage-surface)] transition-colors focus:outline-none disabled:opacity-45"
            >
              {saving ? 'Saving…' : saved ? 'Saved' : 'Save defaults'}
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.section>
  );
}
