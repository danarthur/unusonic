'use client';

import { useState, useTransition } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT, STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import {
  type PortalThemePreset,
  type PortalThemeConfig,
  type PortalThemeTokens,
  getPresetTokens,
  portalThemeToCssVars,
  PORTAL_THEME_PRESETS,
} from '@/shared/lib/portal-theme';
import { updatePortalTheme } from './actions';

// =============================================================================
// Preset metadata (labels, descriptions)
// =============================================================================

const PRESET_META: Record<PortalThemePreset, { label: string; description: string }> = {
  default: {
    label: 'Default',
    description: 'Warm white paper, near-black accent. High-end print document feel.',
  },
  minimalist: {
    label: 'Minimalist',
    description: 'Swiss-inspired. Maximum white space. Sharp corners. Typography does the work.',
  },
  'dark-stage': {
    label: 'Dark Stage',
    description: 'Deep near-black, cool precision. Corporate AV, touring production, technical vendors.',
  },
  editorial: {
    label: 'Editorial',
    description: 'High-contrast, bold typography. Brand activations, experiential marketing, fashion events.',
  },
  civic: {
    label: 'Civic',
    description: 'Clean, trustworthy, warm. Nonprofit galas, government events, institutional productions.',
  },
  'tactile-warm': {
    label: 'Tactile Warm',
    description: 'Warm, textured, serif headings. Luxury events, weddings, high-end galas.',
  },
  'neo-brutalist': {
    label: 'Neo-Brutalist',
    description: 'Bold, raw, high contrast. Black borders, vivid accent. Festivals and edgy brands.',
  },
  'retro-future': {
    label: 'Retro-Future',
    description: 'Vintage palette meets digital precision. Monospace headings, muted green-gray.',
  },
  custom: {
    label: 'Custom',
    description: 'Full control over all theme tokens. Start from your brand color.',
  },
};

// =============================================================================
// Miniature proposal preview (rendered inline with preset tokens)
// =============================================================================

function PresetThumbnail({ tokens }: { tokens: PortalThemeTokens }) {
  const vars = portalThemeToCssVars(tokens);
  return (
    <div
      className="w-full aspect-[4/3] rounded-lg overflow-hidden p-3 flex flex-col gap-1.5"
      style={{ ...vars, backgroundColor: 'var(--portal-bg)' } as React.CSSProperties}
    >
      {/* Mini hero */}
      <div
        className="p-2 flex flex-col gap-0.5"
        style={{
          backgroundColor: 'var(--portal-surface)',
          border: 'var(--portal-border-width) solid var(--portal-border)',
          borderRadius: 'var(--portal-radius)',
          boxShadow: 'var(--portal-shadow)',
        }}
      >
        <div
          className="h-1 w-8"
          style={{ backgroundColor: 'var(--portal-text-secondary)', opacity: 0.4, borderRadius: 'var(--portal-radius)' }}
        />
        <div
          className="h-2 w-16"
          style={{ backgroundColor: 'var(--portal-text)', borderRadius: 'calc(var(--portal-radius) * 0.3)' }}
        />
        <div
          className="h-1 w-10 mt-0.5"
          style={{ backgroundColor: 'var(--portal-text-secondary)', opacity: 0.25, borderRadius: 'var(--portal-radius)' }}
        />
      </div>

      {/* Mini line items */}
      <div className="flex gap-1 flex-1">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex-1 p-1.5 flex flex-col justify-between"
            style={{
              backgroundColor: 'var(--portal-surface)',
              border: 'var(--portal-border-width) solid var(--portal-border)',
              borderRadius: 'var(--portal-radius)',
              boxShadow: 'var(--portal-shadow)',
            }}
          >
            <div
              className="h-0.5 w-full"
              style={{ backgroundColor: 'var(--portal-text-secondary)', opacity: 0.3, borderRadius: '1px' }}
            />
            <div
              className="h-1 w-5 self-end"
              style={{ backgroundColor: 'var(--portal-text)', borderRadius: '1px' }}
            />
          </div>
        ))}
      </div>

      {/* Mini CTA */}
      <div
        className="h-3.5 w-14 self-end"
        style={{
          backgroundColor: 'var(--portal-accent)',
          borderRadius: 'var(--portal-radius)',
        }}
      />
    </div>
  );
}

// =============================================================================
// Live preview (larger, more detailed)
// =============================================================================

function LivePreview({ tokens }: { tokens: PortalThemeTokens }) {
  const vars = portalThemeToCssVars(tokens);

  const btnTextColor = tokens.accentText;

  return (
    <motion.div
      key={tokens.accent + tokens.bg + tokens.radius + tokens.shadow}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
      className="w-full rounded-xl overflow-hidden p-5 sm:p-6 flex flex-col gap-4"
      style={{ ...vars, backgroundColor: 'var(--portal-bg)', fontFamily: 'var(--portal-font-body)' } as React.CSSProperties}
    >
      {/* Hero */}
      <div
        className="rounded-[var(--portal-radius)] p-4 sm:p-5"
        style={{
          backgroundColor: 'var(--portal-surface)',
          border: 'var(--portal-border-width) solid var(--portal-border)',
          boxShadow: 'var(--portal-shadow-strong)',
        }}
      >
        <p
          className="text-[10px] font-medium uppercase tracking-[0.15em]"
          style={{ color: 'var(--portal-text-secondary)' }}
        >
          Your Company
        </p>
        <p
          className="text-sm mt-2"
          style={{ color: 'var(--portal-text-secondary)' }}
        >
          Prepared for Alex Rivera
        </p>
        <p
          className="text-lg sm:text-xl mt-0.5"
          style={{
            color: 'var(--portal-text)',
            fontFamily: 'var(--portal-font-heading)',
            fontWeight: 'var(--portal-heading-weight)',
            letterSpacing: 'var(--portal-heading-tracking)',
          }}
        >
          Summer Festival 2026
        </p>
        <div className="flex gap-2 mt-3">
          <span
            className="text-[10px] px-2 py-1"
            style={{
              border: 'var(--portal-border-width) solid var(--portal-border)',
              backgroundColor: 'var(--portal-accent-subtle)',
              color: 'var(--portal-text)',
              borderRadius: 'var(--portal-radius)',
            }}
          >
            Sat, June 14
          </span>
        </div>
      </div>

      {/* Line items */}
      <div className="grid grid-cols-3 gap-2">
        {['Stage + Sound', 'Lighting', 'Crew'].map((name) => (
          <div
            key={name}
            className="rounded-[var(--portal-radius)] p-3 flex flex-col gap-1.5"
            style={{
              backgroundColor: 'var(--portal-surface)',
              border: 'var(--portal-border-width) solid var(--portal-border)',
              boxShadow: 'var(--portal-shadow)',
            }}
          >
            <p
              className="text-[11px] font-medium leading-tight"
              style={{ color: 'var(--portal-text)' }}
            >
              {name}
            </p>
            <p
              className="text-[10px]"
              style={{ color: 'var(--portal-text-secondary)' }}
            >
              1 × $2,400
            </p>
            <p
              className="text-xs font-semibold tabular-nums mt-auto"
              style={{ color: 'var(--portal-text)' }}
            >
              $2,400
            </p>
          </div>
        ))}
      </div>

      {/* CTA bar */}
      <div
        className="rounded-[var(--portal-radius)] p-3 flex items-center justify-between"
        style={{
          backgroundColor: 'var(--portal-surface)',
          border: 'var(--portal-border-width) solid var(--portal-border)',
          boxShadow: 'var(--portal-shadow)',
        }}
      >
        <div>
          <span
            className="text-[9px] font-medium uppercase tracking-wider"
            style={{ color: 'var(--portal-text-secondary)' }}
          >
            Total
          </span>
          <span
            className="text-sm font-semibold tabular-nums ml-2"
            style={{ color: 'var(--portal-text)' }}
          >
            $7,200
          </span>
        </div>
        <span
          className="text-[11px] font-medium px-4 py-1.5"
          style={{
            backgroundColor: 'var(--portal-accent)',
            color: btnTextColor,
            borderRadius: 'var(--portal-radius)',
          }}
        >
          Review & Sign
        </span>
      </div>
    </motion.div>
  );
}

// =============================================================================
// Main client component
// =============================================================================

interface PortalThemeClientProps {
  initialPreset: PortalThemePreset;
  initialConfig: PortalThemeConfig;
}

export function PortalThemeClient({ initialPreset, initialConfig }: PortalThemeClientProps) {
  const [selected, setSelected] = useState<PortalThemePreset>(initialPreset);
  const [saved, setSaved] = useState<PortalThemePreset>(initialPreset);
  const [isPending, startTransition] = useTransition();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // For Phase 3, we only handle preset selection (no custom config editor yet)
  const selectablePresets = PORTAL_THEME_PRESETS.filter((p) => p !== 'custom');
  const activeTokens = getPresetTokens(selected);

  const handleSave = () => {
    setSaveStatus('idle');
    startTransition(async () => {
      const result = await updatePortalTheme(selected, initialConfig);
      if (result.success) {
        setSaved(selected);
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 2000);
      } else {
        setSaveStatus('error');
      }
    });
  };

  const isDirty = selected !== saved;

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-xl font-light text-[var(--stage-text-primary)] tracking-tight">
          Client portal theme
        </h1>
        <p className="text-sm text-[var(--stage-text-secondary)] mt-1 max-w-lg">
          Choose how your proposals and invoices look to clients. The theme applies to all public pages linked from your workspace.
        </p>
      </div>

      {/* Preset grid */}
      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--stage-text-secondary)] mb-4">
          Presets
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          {selectablePresets.map((preset) => {
            const meta = PRESET_META[preset];
            const tokens = getPresetTokens(preset);
            const isSelected = selected === preset;

            return (
              <motion.button
                key={preset}
                type="button"
                onClick={() => setSelected(preset)}
                whileTap={{ scale: 0.98 }}
                className={cn(
                  'relative rounded-xl overflow-hidden text-left',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
                  isSelected
                    ? 'ring-2 ring-[var(--stage-accent)]'
                    : 'ring-1 ring-[var(--stage-border)] hover:ring-[var(--stage-border-hover)]'
                )}
              >
                {/* Thumbnail */}
                <PresetThumbnail tokens={tokens} />

                {/* Label */}
                <div className="p-2.5">
                  <p className={cn(
                    'text-xs font-medium tracking-tight',
                    isSelected ? 'text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-secondary)]'
                  )}>
                    {meta.label}
                  </p>
                </div>

                {/* Selected check */}
                <AnimatePresence>
                  {isSelected && (
                    <motion.div
                      initial={{ scale: 0, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0, opacity: 0 }}
                      transition={STAGE_LIGHT}
                      className="absolute top-2 right-2 size-5 rounded-full bg-[var(--stage-accent)] flex items-center justify-center"
                    >
                      <Check className="size-3 text-[var(--stage-text-on-accent)]" strokeWidth={2.5} />
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.button>
            );
          })}
        </div>

        {/* Description of selected preset */}
        <AnimatePresence mode="wait">
          <motion.p
            key={selected}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={STAGE_LIGHT}
            className="text-sm text-[var(--stage-text-secondary)] mt-3"
          >
            {PRESET_META[selected].description}
          </motion.p>
        </AnimatePresence>
      </section>

      {/* Live preview */}
      <section>
        <h2 className="text-[11px] font-semibold uppercase tracking-widest text-[var(--stage-text-secondary)] mb-4">
          Preview
        </h2>
        <div className="stage-panel rounded-xl p-1 border border-[var(--stage-border)]">
          <LivePreview tokens={activeTokens} />
        </div>
      </section>

      {/* Save bar */}
      <AnimatePresence>
        {isDirty && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={STAGE_MEDIUM}
            className="sticky bottom-6 z-20 flex items-center justify-between gap-4 rounded-xl px-5 py-3 stage-panel border border-[var(--stage-border)]"
            style={{
              /* TODO: tokenize as --stage-shadow-float or similar */
              boxShadow: '0 -4px 16px oklch(0 0 0 / 0.2), 0 8px 24px oklch(0 0 0 / 0.3)',
            }}
          >
            <p className="text-sm text-[var(--stage-text-secondary)]">
              Unsaved changes
            </p>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSelected(saved)}
                className="text-sm text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={handleSave}
                disabled={isPending}
                className={cn(
                  'inline-flex items-center gap-2 rounded-[var(--stage-radius-button)] px-4 py-2 text-sm font-medium',
                  'bg-[var(--stage-accent)] text-[var(--stage-text-on-accent)]',
                  'hover:brightness-[0.95] transition-[filter]',
                  'disabled:opacity-50 disabled:pointer-events-none',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]'
                )}
              >
                {isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : saveStatus === 'saved' ? (
                  <Check className="size-4" />
                ) : null}
                {isPending ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : 'Save'}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save confirmation (when bar is hidden) */}
      <AnimatePresence>
        {!isDirty && saveStatus === 'saved' && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-sm text-[var(--color-unusonic-success)] flex items-center gap-1.5"
          >
            <Check className="size-4" />
            Theme saved. New proposals and invoices will use this theme.
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
}
