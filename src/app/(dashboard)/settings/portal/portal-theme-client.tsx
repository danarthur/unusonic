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
  PORTAL_THEME_LABELS,
  PORTAL_THEME_DESCRIPTIONS,
} from '@/shared/lib/portal-theme';
import { updatePortalTheme } from './actions';

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
  const isRowLayout = tokens.itemLayout === 'row';
  const isMinimalLayout = tokens.itemLayout === 'minimal';
  const isCardLayout = !isRowLayout && !isMinimalLayout;
  const showTrim = tokens.sectionTrim !== 'none';
  const showBandTop = tokens.accentBand === 'top';
  const showBandBottom = tokens.accentBand === 'bottom';

  // Scale the preview title relative to the actual token (preview is ~40% scale)
  const titleSize = `calc(${tokens.heroTitleSize} * 0.55)`;
  const totalSize = `calc(${tokens.totalScale} * 0.7)`;

  return (
    <motion.div
      key={tokens.accent + tokens.bg + tokens.radius + tokens.shadow + tokens.itemLayout + tokens.heroTitleSize}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
      className="w-full rounded-xl overflow-hidden p-5 sm:p-6 flex flex-col"
      style={{
        ...vars,
        backgroundColor: 'var(--portal-bg)',
        fontFamily: 'var(--portal-font-body)',
        gap: 'var(--portal-gap)',
      } as React.CSSProperties}
    >
      {/* Hero */}
      <div
        className="rounded-[var(--portal-radius)] relative overflow-hidden"
        style={{
          backgroundColor: 'var(--portal-hero-surface, var(--portal-surface))',
          border: 'var(--portal-border-width) solid var(--portal-border)',
          boxShadow: 'var(--portal-shadow-strong)',
          padding: `calc(${tokens.heroPadding} * 0.6) var(--portal-card-padding)`,
          textAlign: tokens.heroAlign as React.CSSProperties['textAlign'],
        }}
      >
        {showBandTop && (
          <div className="absolute top-0 left-0 right-0" style={{ height: '3px', backgroundColor: 'var(--portal-accent)' }} />
        )}
        <p
          style={{
            color: 'var(--portal-text-secondary)',
            fontSize: 'var(--portal-label-size)',
            fontWeight: 'var(--portal-label-weight)',
            letterSpacing: 'var(--portal-label-tracking)',
            textTransform: tokens.labelTransform as React.CSSProperties['textTransform'],
          }}
        >
          Your Company
        </p>
        <p
          className="text-xs mt-1.5"
          style={{ color: 'var(--portal-text-secondary)' }}
        >
          Prepared for Alex Rivera
        </p>
        <p
          className="mt-0.5 leading-tight"
          style={{
            color: 'var(--portal-text)',
            fontFamily: 'var(--portal-font-heading)',
            fontWeight: 'var(--portal-heading-weight)',
            letterSpacing: 'var(--portal-heading-tracking)',
            fontSize: titleSize,
          }}
        >
          Summer Festival 2026
        </p>
        <div className="flex flex-wrap gap-1.5 mt-2.5">
          <span
            className="text-micro px-2 py-0.5"
            style={{
              border: 'var(--portal-border-width) solid var(--portal-border)',
              backgroundColor: 'var(--portal-accent-subtle)',
              color: 'var(--portal-text)',
              borderRadius: 'var(--portal-btn-radius)',
            }}
          >
            Sat, June 14
          </span>
        </div>
        {showBandBottom && (
          <div className="absolute bottom-0 left-0 right-0" style={{ height: '3px', backgroundColor: 'var(--portal-accent)' }} />
        )}
      </div>

      {/* Section trim preview */}
      {showTrim && (
        <div className="flex items-center justify-center" style={{ height: '6px' }}>
          {tokens.sectionTrim === 'wave' && (
            <svg viewBox="0 0 200 8" preserveAspectRatio="none" className="w-full h-full" fill="none">
              <path d="M0 4 Q25 0 50 4 Q75 8 100 4 Q125 0 150 4 Q175 8 200 4" stroke="var(--portal-border)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
          {tokens.sectionTrim === 'angle' && (
            <svg viewBox="0 0 200 6" preserveAspectRatio="none" className="w-full h-full" fill="none">
              <path d="M0 6 L100 0 L200 6" stroke="var(--portal-accent)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
            </svg>
          )}
          {tokens.sectionTrim === 'dots' && (
            <svg viewBox="0 0 200 4" className="w-full h-full">
              {Array.from({ length: 15 }, (_, i) => <circle key={i} cx={6 + i * 13} cy="2" r="1" fill="var(--portal-border)" />)}
            </svg>
          )}
          {tokens.sectionTrim === 'straight' && (
            <div className="w-full" style={{ height: '1px', backgroundColor: 'var(--portal-border)' }} />
          )}
        </div>
      )}

      {/* Line items — layout-aware */}
      {isCardLayout && (
        <div className="grid grid-cols-3 gap-2">
          {['Stage + Sound', 'Lighting', 'Crew'].map((name) => (
            <div
              key={name}
              className="rounded-[var(--portal-radius)] flex flex-col gap-1"
              style={{
                backgroundColor: 'var(--portal-surface)',
                border: 'var(--portal-border-width) solid var(--portal-border)',
                boxShadow: 'var(--portal-shadow)',
                padding: `calc(${tokens.cardPadding} * 0.6)`,
              }}
            >
              <p className="text-label font-medium leading-tight" style={{ color: 'var(--portal-text)' }}>{name}</p>
              <p className="text-micro" style={{ color: 'var(--portal-text-secondary)' }}>1 × $2,400</p>
              <p className="text-label font-medium tabular-nums mt-auto" style={{ color: 'var(--portal-text)' }}>$2,400</p>
            </div>
          ))}
        </div>
      )}

      {isRowLayout && (
        <div className="flex flex-col">
          <div className="flex justify-between pb-1 mb-1" style={{ borderBottom: '1px solid var(--portal-border)' }}>
            <span className="text-micro uppercase tracking-wider" style={{ color: 'var(--portal-text-secondary)' }}>Item</span>
            <span className="text-micro uppercase tracking-wider" style={{ color: 'var(--portal-text-secondary)' }}>Total</span>
          </div>
          {['Stage + Sound', 'Lighting', 'Crew'].map((name) => (
            <div key={name} className="flex justify-between py-1.5" style={{ borderBottom: 'var(--portal-border-width) solid var(--portal-border-subtle)' }}>
              <span className="text-label" style={{ color: 'var(--portal-text)' }}>{name}</span>
              <span className="text-label font-medium tabular-nums" style={{ color: 'var(--portal-text)' }}>$2,400</span>
            </div>
          ))}
        </div>
      )}

      {isMinimalLayout && (
        <div className="flex flex-col">
          {['Stage + Sound', 'Lighting', 'Crew'].map((name) => (
            <div key={name} className="flex justify-between py-1.5" style={{ borderBottom: '1px solid var(--portal-border-subtle)' }}>
              <span className="text-label" style={{ color: 'var(--portal-text)' }}>{name}</span>
              <span className="text-label tabular-nums" style={{ color: 'var(--portal-text)' }}>$2,400</span>
            </div>
          ))}
        </div>
      )}

      {/* CTA bar */}
      <div
        className="rounded-[var(--portal-radius)] p-3 flex items-center justify-between"
        style={{
          backgroundColor: 'var(--portal-surface)',
          border: 'var(--portal-border-width) solid var(--portal-border)',
          boxShadow: 'var(--portal-shadow)',
        }}
      >
        <div className="flex items-baseline gap-1.5">
          <span
            className="text-micro font-medium uppercase tracking-wider"
            style={{ color: 'var(--portal-text-secondary)' }}
          >
            Total
          </span>
          <span
            className="font-semibold tabular-nums"
            style={{ color: 'var(--portal-text)', fontSize: totalSize }}
          >
            $7,200
          </span>
        </div>
        <span
          className="text-label font-medium px-3 py-1"
          style={{
            backgroundColor: 'var(--portal-accent)',
            color: tokens.accentText,
            borderRadius: 'var(--portal-btn-radius)',
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
        <h2 className="stage-label text-field-label mb-4">
          Presets
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {selectablePresets.map((preset) => {
            const meta = { label: PORTAL_THEME_LABELS[preset], description: PORTAL_THEME_DESCRIPTIONS[preset] };
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
            {PORTAL_THEME_DESCRIPTIONS[selected]}
          </motion.p>
        </AnimatePresence>
      </section>

      {/* Live preview */}
      <section>
        <h2 className="stage-label text-field-label mb-4">
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
                  'hover:bg-[oklch(1_0_0_/_0.08)] transition-colors',
                  'disabled:opacity-45 disabled:pointer-events-none',
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
