'use client';

/**
 * Row 0 of the deal header strip — Title, Date, Time. The date popover
 * is rendered inline; opening it is delegated up to the parent so the
 * outside-click handler stays in one place.
 */

import { useRef } from 'react';
import { Plus } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { TimePicker } from '@/shared/ui/time-picker';
import { formatTime12h } from '@/shared/lib/parse-time';
import { DatePickerPortal } from './deal-header-strip-scalar-pickers';
import {
  EMPTY_VALUE_CLASS,
  FIELD_BLOCK_CLASS,
  FIELD_BLOCK_INTERACTIVE_CLASS,
  FIELD_LABEL_CLASS,
  formatDate,
} from './deal-header-strip-shared';
import type { DealDetail } from '../actions/get-deal';

export type DealHeaderIdentityRowProps = {
  title: string | null;
  proposedDate: string | null;
  deal: DealDetail;
  readOnly: boolean;
  saving: boolean;
  isEditable: boolean;
  onTitleChange?: (value: string) => void;
  onSaveScalar?: (patch: {
    proposed_date?: string | null;
    event_start_time?: string | null;
    event_end_time?: string | null;
  }) => void;
  datePickerOpen: boolean;
  scalarPickerPos: { top: number; left: number };
  onOpenDatePicker: () => void;
  onCloseDatePicker: () => void;
  /** Forwarded so parent can measure the trigger when positioning the popover. */
  dateTriggerRef: React.RefObject<HTMLButtonElement | null>;
};

export function DealHeaderIdentityRow({
  title,
  proposedDate,
  deal,
  readOnly,
  saving,
  isEditable,
  onTitleChange,
  onSaveScalar,
  datePickerOpen,
  scalarPickerPos,
  onOpenDatePicker,
  onCloseDatePicker,
  dateTriggerRef,
}: DealHeaderIdentityRowProps) {
  // Local fallback ref so the component still works if the parent passes
  // an unattached ref. The parent path always supplies one in practice.
  const localRef = useRef<HTMLButtonElement>(null);
  const triggerRef = dateTriggerRef ?? localRef;

  return (
    <div className="flex items-start gap-2 min-w-0">
      {/* Title */}
      <div className={cn(FIELD_BLOCK_CLASS, 'flex-1 group', isEditable && FIELD_BLOCK_INTERACTIVE_CLASS)}>
        <p className={FIELD_LABEL_CLASS}>Deal</p>
        {isEditable ? (
          <input
            type="text"
            value={title ?? ''}
            onChange={(e) => onTitleChange!(e.target.value)}
            placeholder="Untitled deal"
            className="bg-transparent stage-readout focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] min-w-0 w-full placeholder:text-[var(--stage-text-secondary)]"
          />
        ) : (
          <p className="stage-readout text-[var(--stage-text-secondary)] truncate">
            {title || 'Untitled deal'}
          </p>
        )}
        {saving && (
          <span className="text-micro text-[var(--stage-text-tertiary)] tracking-wide mt-1 block">
            Saving…
          </span>
        )}
      </div>

      {/* Date */}
      <div className="relative" data-header-picker>
        <button
          ref={triggerRef}
          type="button"
          onClick={!readOnly ? onOpenDatePicker : undefined}
          disabled={readOnly}
          className={cn(FIELD_BLOCK_CLASS, 'text-left shrink-0', !readOnly && FIELD_BLOCK_INTERACTIVE_CLASS)}
        >
          <p className={FIELD_LABEL_CLASS}>Date</p>
          {proposedDate ? (
            <span className="stage-readout whitespace-nowrap">{formatDate(proposedDate)}</span>
          ) : (
            <span className={cn(EMPTY_VALUE_CLASS, 'whitespace-nowrap')}>
              {!readOnly ? (
                <>
                  <Plus size={9} />
                  add
                </>
              ) : (
                '—'
              )}
            </span>
          )}
        </button>
        {datePickerOpen && (
          <DatePickerPortal
            position={scalarPickerPos}
            proposedDate={proposedDate}
            onChange={(val) => onSaveScalar?.({ proposed_date: val })}
            onClose={onCloseDatePicker}
          />
        )}
      </div>

      {/* Time */}
      <div className={cn(FIELD_BLOCK_CLASS, 'shrink-0')}>
        <p className={FIELD_LABEL_CLASS}>Time</p>
        {isEditable ? (
          <div className="flex items-center gap-2 min-w-0">
            <TimePicker
              value={deal.event_start_time ?? null}
              onChange={(v) => onSaveScalar?.({ event_start_time: v })}
              placeholder="Start"
              context="evening"
              variant="ghost"
              className="w-[90px]"
            />
            <span className="text-[var(--stage-text-tertiary)] text-xs select-none px-0.5">–</span>
            <TimePicker
              value={deal.event_end_time ?? null}
              onChange={(v) => onSaveScalar?.({ event_end_time: v })}
              placeholder="End"
              context="evening"
              variant="ghost"
              className="w-[90px]"
            />
          </div>
        ) : (
          <span className="stage-readout text-[var(--stage-text-secondary)] whitespace-nowrap">
            {deal.event_start_time
              ? `${formatTime12h(deal.event_start_time)}${
                  deal.event_end_time ? ` – ${formatTime12h(deal.event_end_time)}` : ''
                }`
              : '—'}
          </span>
        )}
      </div>
    </div>
  );
}
