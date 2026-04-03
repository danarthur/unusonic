'use client';

import { useState, useTransition } from 'react';
import { motion } from 'framer-motion';
import { User, Phone, Mail, Briefcase, Shield, AlertCircle, Calendar, Copy, Check } from 'lucide-react';
import { getOrCreateIcalToken } from '@/features/ops/actions/get-ical-token';
import type { PersonAttrs } from '@/shared/lib/entity-attrs';
import { updateMyProfile } from './actions';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

interface ProfileViewProps {
  entityId: string;
  displayName: string;
  avatarUrl: string | null;
  attrs: PersonAttrs;
  employmentContext: {
    jobTitle: string | null;
    role: string | null;
    employmentStatus: string | null;
    defaultHourlyRate: number | null;
  };
  skills: Array<{ tag: string; proficiency: string | null }>;
}

function Field({
  label,
  value,
  icon: Icon,
  readOnly,
  name,
  onChange,
}: {
  label: string;
  value: string | null | undefined;
  icon: typeof User;
  readOnly?: boolean;
  name?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <div className="flex items-start gap-3 py-3 border-b border-[oklch(1_0_0/0.04)] last:border-0">
      <Icon className="size-4 mt-0.5 text-[var(--stage-text-tertiary)] shrink-0" />
      <div className="flex-1 min-w-0">
        <dt className="text-xs text-[var(--stage-text-tertiary)]">{label}</dt>
        {readOnly || !onChange ? (
          <dd className="text-sm text-[var(--stage-text-primary)] mt-0.5">
            {value || <span className="text-[var(--stage-text-tertiary)]">Not set</span>}
          </dd>
        ) : (
          <input
            name={name}
            type="text"
            defaultValue={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            className="mt-0.5 w-full bg-transparent text-sm text-[var(--stage-text-primary)] outline-none border-b border-[oklch(1_0_0/0.1)] focus:border-[oklch(1_0_0/0.3)] transition-colors py-0.5"
          />
        )}
      </div>
    </div>
  );
}

export function ProfileView({
  entityId,
  displayName,
  avatarUrl,
  attrs,
  employmentContext,
  skills,
}: ProfileViewProps) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [phone, setPhone] = useState(attrs.phone ?? '');
  const ecObj = attrs.emergency_contact as { name?: string | null; phone?: string | null } | null | undefined;
  const ecDisplay = ecObj ? [ecObj.name, ecObj.phone].filter(Boolean).join(' — ') : '';
  const [emergencyContact, setEmergencyContact] = useState(ecDisplay);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);
    // emergency_contact is stored as {name, phone} object
    const ecParts = emergencyContact.split('—').map(s => s.trim());
    const ecPatch = emergencyContact
      ? { name: ecParts[0] || null, phone: ecParts[1] || null }
      : null;
    const result = await updateMyProfile(entityId, {
      phone: phone || null,
      emergency_contact: ecPatch as unknown as string | null,
    });
    setSaving(false);
    if (result.ok) {
      setEditing(false);
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } else {
      setError(result.error);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="flex flex-col gap-6"
    >
      {/* Identity header */}
      <div className="flex items-center gap-4">
        <div className="size-14 rounded-full bg-[oklch(1_0_0/0.08)] flex items-center justify-center overflow-hidden shrink-0">
          {avatarUrl ? (
            <img src={avatarUrl} alt="" className="size-full object-cover" />
          ) : (
            <User className="size-6 text-[var(--stage-text-tertiary)]" />
          )}
        </div>
        <div>
          <h2 className="text-lg font-medium tracking-tight text-[var(--stage-text-primary)]">
            {displayName}
          </h2>
          {employmentContext.jobTitle && (
            <p className="text-sm text-[var(--stage-text-secondary)]">
              {employmentContext.jobTitle}
            </p>
          )}
        </div>
      </div>

      {/* Info card */}
      <div className="rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)] p-4">
        <dl className="flex flex-col">
          <Field label="Email" value={attrs.email} icon={Mail} readOnly />
          <Field
            label="Phone"
            value={editing ? phone : attrs.phone}
            icon={Phone}
            readOnly={!editing}
            name="phone"
            onChange={editing ? setPhone : undefined}
          />
          <Field label="Job title" value={employmentContext.jobTitle} icon={Briefcase} readOnly />
          <Field
            label="Emergency contact"
            value={editing ? emergencyContact : ecDisplay}
            icon={AlertCircle}
            readOnly={!editing}
            name="emergency_contact"
            onChange={editing ? setEmergencyContact : undefined}
          />
          <Field
            label="Employment"
            value={employmentContext.employmentStatus === 'external_contractor' ? 'Contractor' : 'Employee'}
            icon={Shield}
            readOnly
          />
        </dl>
      </div>

      {/* Edit / Save controls */}
      <div className="flex items-center gap-3">
        {!editing ? (
          <button
            onClick={() => setEditing(true)}
            className="text-sm font-medium text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
          >
            Edit profile
          </button>
        ) : (
          <>
            <button
              onClick={handleSave}
              disabled={saving}
              className="text-sm font-medium text-[var(--stage-text-primary)] bg-[oklch(1_0_0/0.08)] hover:bg-[oklch(1_0_0/0.12)] px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => {
                setEditing(false);
                setPhone(attrs.phone ?? '');
                setEmergencyContact(ecDisplay);
              }}
              className="text-sm text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
            >
              Cancel
            </button>
          </>
        )}
        {error && <p className="text-xs text-[var(--color-unusonic-error)]">{error}</p>}
        {success && <p className="text-xs text-[oklch(0.75_0.15_145)]">Saved</p>}
      </div>

      {/* Skills */}
      {skills.length > 0 && (
        <div className="flex flex-col gap-3">
          <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
            Skills
          </h3>
          <div className="flex flex-wrap gap-2">
            {skills.map((s) => (
              <span
                key={s.tag}
                className="text-xs px-2.5 py-1 rounded-full bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)]"
              >
                {s.tag}
                {s.proficiency ? ` · ${s.proficiency}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Calendar sync */}
      <CalendarSyncSection />
    </motion.div>
  );
}

/* ── Calendar Sync Section ───────────────────────────────────────── */

function CalendarSyncSection() {
  const [icalUrl, setIcalUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [isPending, startTransition] = useTransition();

  const generateLink = () => {
    startTransition(async () => {
      const token = await getOrCreateIcalToken();
      if (token) {
        const base = typeof window !== 'undefined' ? window.location.origin : '';
        setIcalUrl(`${base}/api/portal/ical/${token}`);
      }
    });
  };

  const copyUrl = async () => {
    if (!icalUrl) return;
    await navigator.clipboard.writeText(icalUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
        Calendar sync
      </h3>
      <div className="rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)] p-4">
        <div className="flex items-start gap-3">
          <Calendar className="size-5 text-[var(--stage-text-tertiary)] mt-0.5 shrink-0" />
          <div className="flex flex-col gap-2 min-w-0">
            <p className="text-sm text-[var(--stage-text-secondary)]">
              Subscribe to your show schedule in Apple Calendar, Google Calendar, or Outlook. Updates automatically when gigs change.
            </p>
            {!icalUrl ? (
              <button
                onClick={generateLink}
                disabled={isPending}
                className="text-sm font-medium text-[var(--stage-text-primary)] bg-[oklch(1_0_0/0.08)] hover:bg-[oklch(1_0_0/0.12)] px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50 w-fit"
              >
                {isPending ? 'Generating...' : 'Get calendar link'}
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <input
                  readOnly
                  value={icalUrl}
                  className="flex-1 text-xs font-mono bg-[var(--stage-well)] rounded-lg px-3 py-1.5 text-[var(--stage-text-secondary)] border border-[oklch(1_0_0/0.06)] outline-none truncate"
                />
                <button
                  onClick={copyUrl}
                  className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.12)] transition-colors shrink-0"
                >
                  {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                  {copied ? 'Copied' : 'Copy'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
