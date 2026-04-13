'use client';

/**
 * Portaled popovers for the scalar fields on the deal header strip:
 * date, archetype, owner. All share the `data-header-picker` marker
 * so the parent's outside-click handler dismisses them cleanly.
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import type { WorkspaceMemberOption } from '../actions/get-workspace-members';

const ARCHETYPES = [
  'wedding',
  'corporate_gala',
  'product_launch',
  'private_dinner',
  'concert',
  'festival',
  'awards_show',
  'conference',
  'birthday',
  'charity_gala',
] as const;

/** Controlled date input that avoids the uncontrolled→controlled React warning. */
export function DateInputControlled({
  initialValue,
  onChangeDate,
  onEscape,
}: {
  initialValue: string | null;
  onChangeDate: (val: string | null) => void;
  onEscape: () => void;
}) {
  const [val, setVal] = useState(initialValue ?? '');
  return (
    <input
      type="date"
      value={val}
      className="stage-input"
      style={{
        background: 'var(--stage-surface-elevated)',
        boxShadow: 'inset 0 1px 0 0 var(--stage-edge-top)',
        border: '1px solid var(--stage-edge-subtle)',
      }}
      autoFocus
      onChange={(e) => {
        setVal(e.target.value);
        onChangeDate(e.target.value || null);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') onEscape();
      }}
    />
  );
}

export function DatePickerPortal({
  position,
  proposedDate,
  onChange,
  onClose,
}: {
  position: { top: number; left: number };
  proposedDate: string | null;
  onChange: (val: string | null) => void;
  onClose: () => void;
}) {
  return createPortal(
    <motion.div
      data-header-picker
      initial={{ opacity: 0, y: -4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      transition={STAGE_LIGHT}
      className="fixed z-50"
      style={{
        top: position.top,
        left: position.left,
        background: 'var(--stage-surface-raised)',
        borderRadius: 'var(--stage-radius-panel, 12px)',
        boxShadow:
          'inset 0 1px 0 0 var(--stage-edge-top), inset 1px 0 0 0 var(--stage-edge-left), 0 16px 48px oklch(0 0 0 / 0.7)',
        padding: 'var(--stage-padding, 16px)',
      }}
    >
      <p
        className="stage-label"
        style={{ color: 'var(--stage-text-secondary)', marginBottom: 'var(--stage-gap, 6px)' }}
      >
        Show date
      </p>
      <DateInputControlled initialValue={proposedDate} onChangeDate={onChange} onEscape={onClose} />
      <div
        className="flex items-center justify-between"
        style={{ marginTop: 'var(--stage-gap-wide, 12px)', gap: 'var(--stage-gap, 6px)' }}
      >
        {proposedDate && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              onClose();
            }}
            className="stage-label transition-colors"
            style={{ color: 'var(--stage-text-tertiary)' }}
          >
            Clear
          </button>
        )}
        <button type="button" onClick={onClose} className="stage-btn stage-btn-ghost ml-auto">
          Done
        </button>
      </div>
    </motion.div>,
    document.body,
  );
}

export function ArchetypePickerPortal({
  position,
  eventArchetype,
  onChange,
  onClose,
}: {
  position: { top: number; left: number };
  eventArchetype: string | null;
  onChange: (val: string | null) => void;
  onClose: () => void;
}) {
  return createPortal(
    <motion.div
      data-header-picker
      initial={{ opacity: 0, y: -4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      transition={STAGE_LIGHT}
      className="fixed z-50 overflow-hidden max-h-[320px] overflow-y-auto"
      style={{
        top: position.top,
        left: position.left,
        background: 'var(--stage-surface-raised)',
        borderRadius: 'var(--stage-radius-panel, 12px)',
        boxShadow:
          'inset 0 1px 0 0 var(--stage-edge-top), inset 1px 0 0 0 var(--stage-edge-left), 0 16px 48px oklch(0 0 0 / 0.7)',
        padding: 'var(--stage-padding, 16px)',
        minWidth: 200,
        scrollbarWidth: 'thin',
        scrollbarColor: 'oklch(1 0 0 / 0.10) transparent',
      }}
    >
      <p
        className="stage-label"
        style={{ color: 'var(--stage-text-secondary)', marginBottom: 'var(--stage-gap, 6px)' }}
      >
        Show type
      </p>
      <div className="flex flex-col" style={{ gap: '2px' }}>
        {ARCHETYPES.map((a) => (
          <button
            key={a}
            type="button"
            onClick={() => {
              onChange(a);
              onClose();
            }}
            className={cn(
              'w-full text-left px-3 py-1.5 text-sm capitalize transition-colors',
              eventArchetype === a
                ? 'text-[var(--stage-text-primary)]'
                : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]',
            )}
            style={{
              borderRadius: 'var(--stage-radius-input, 6px)',
              background:
                eventArchetype === a
                  ? 'color-mix(in oklch, var(--stage-accent) 8%, transparent)'
                  : 'transparent',
            }}
          >
            {a.replace(/_/g, ' ')}
          </button>
        ))}
        {eventArchetype && (
          <button
            type="button"
            onClick={() => {
              onChange(null);
              onClose();
            }}
            className="w-full text-left px-3 py-1.5 stage-label transition-colors"
            style={{
              color: 'var(--stage-text-tertiary)',
              marginTop: 'var(--stage-gap, 6px)',
              paddingTop: 'var(--stage-gap, 6px)',
              borderTop: '1px solid var(--stage-edge-subtle)',
            }}
          >
            Clear
          </button>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}

export function OwnerPickerPortal({
  position,
  ownerEntityId,
  members,
  visibleMembers,
  hasSalesMembers,
  showAllMembers,
  onShowAll,
  onAssign,
}: {
  position: { top: number; left: number };
  ownerEntityId: string | null;
  members: WorkspaceMemberOption[];
  visibleMembers: WorkspaceMemberOption[];
  hasSalesMembers: boolean;
  showAllMembers: boolean;
  onShowAll: () => void;
  onAssign: (entityId: string | null) => void;
}) {
  return createPortal(
    <motion.div
      key="owner-picker"
      data-header-picker
      initial={{ opacity: 0, y: -4, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -4, scale: 0.97 }}
      transition={STAGE_LIGHT}
      className="fixed z-50 min-w-[200px] overflow-hidden"
      style={{
        top: position.top,
        left: position.left,
        background: 'var(--stage-surface-raised)',
        borderRadius: 'var(--stage-radius-panel, 12px)',
        boxShadow: 'inset 0 1px 0 0 var(--stage-edge-top), 0 16px 48px oklch(0 0 0 / 0.7)',
      }}
    >
      {ownerEntityId && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAssign(null);
          }}
          className="w-full text-left px-4 py-2 stage-label text-[var(--stage-text-tertiary)] hover:bg-[var(--stage-accent-muted)] transition-colors border-b border-[oklch(1_0_0_/_0.06)]"
        >
          Remove
        </button>
      )}
      {visibleMembers.map((m) => (
        <button
          key={m.entity_id}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onAssign(m.entity_id);
          }}
          className={cn(
            'w-full text-left px-4 py-2.5 text-sm tracking-tight transition-colors flex items-center gap-2.5',
            m.entity_id === ownerEntityId
              ? 'text-[var(--stage-text-primary)] bg-[oklch(1_0_0_/_0.04)]'
              : 'text-[var(--stage-text-secondary)] hover:bg-[var(--stage-accent-muted)]',
          )}
        >
          {m.display_name}
          {m.entity_id === ownerEntityId && (
            <span
              className="stage-label ml-auto shrink-0"
              style={{ color: 'var(--stage-text-tertiary)' }}
            >
              current
            </span>
          )}
        </button>
      ))}
      {hasSalesMembers &&
        !showAllMembers &&
        members.length > visibleMembers.length && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onShowAll();
            }}
            className="w-full text-left px-4 py-2 stage-label text-field-label text-[var(--stage-text-tertiary)] hover:bg-[var(--stage-accent-muted)] transition-colors border-t border-[oklch(1_0_0_/_0.06)]"
          >
            Show all team
          </button>
        )}
    </motion.div>,
    document.body,
  );
}
