'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, Eye, EyeOff, Copy } from 'lucide-react';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { VENUE_ATTR } from '@/entities/directory/model/attribute-keys';
import { CeramicSwitch } from '@/shared/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/shared/ui/select';
import { patchVenueAttribute } from './venue-specs-actions';
import type { VenueAttrs } from '@/shared/lib/entity-attrs';

// ─── Types ──────────────────────────────────────────────────────────────────

type FieldType = 'text' | 'textarea' | 'number' | 'toggle' | 'toggle_notes' | 'select' | 'masked' | 'readonly';

interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  placeholder?: string;
  options?: { value: string; label: string }[];
}

interface SectionDef {
  id: string;
  title: string;
  fields: FieldDef[];
}

// ─── Section definitions ────────────────────────────────────────────────────

const SECTIONS: SectionDef[] = [
  {
    id: 'loading',
    title: 'Loading and Access',
    fields: [
      { key: VENUE_ATTR.dock_address, label: 'Dock address', type: 'text', placeholder: 'Loading dock address' },
      { key: VENUE_ATTR.dock_hours, label: 'Dock hours', type: 'text', placeholder: 'e.g. 8am-6pm Mon-Fri' },
      { key: VENUE_ATTR.dock_door_height, label: 'Dock door height', type: 'text', placeholder: 'e.g. 14ft' },
      { key: VENUE_ATTR.dock_door_width, label: 'Dock door width', type: 'text', placeholder: 'e.g. 12ft' },
      { key: VENUE_ATTR.load_in_window, label: 'Load-in window', type: 'text', placeholder: 'e.g. 8:00 AM - 2:00 PM' },
      { key: VENUE_ATTR.load_out_window, label: 'Load-out window', type: 'text', placeholder: 'e.g. 11:00 PM - 2:00 AM' },
      { key: VENUE_ATTR.freight_elevator, label: 'Freight elevator', type: 'text', placeholder: 'e.g. max 4000 lbs, key from security' },
      { key: VENUE_ATTR.forklift_available, label: 'Forklift available', type: 'toggle_notes', placeholder: 'Forklift details' },
      { key: VENUE_ATTR.access_notes, label: 'Access notes', type: 'textarea', placeholder: 'Gate codes, security contacts, special instructions...' },
    ],
  },
  {
    id: 'parking',
    title: 'Parking',
    fields: [
      { key: VENUE_ATTR.parking_notes, label: 'Parking notes', type: 'textarea', placeholder: 'Production vehicle parking instructions...' },
      { key: VENUE_ATTR.crew_parking_notes, label: 'Crew parking notes', type: 'textarea', placeholder: 'Crew personal vehicle parking...' },
    ],
  },
  {
    id: 'stage',
    title: 'Stage and Technical',
    fields: [
      { key: VENUE_ATTR.capacity, label: 'Capacity', type: 'number', placeholder: 'e.g. 500' },
      { key: VENUE_ATTR.stage_width, label: 'Stage width', type: 'text', placeholder: 'e.g. 40ft' },
      { key: VENUE_ATTR.stage_depth, label: 'Stage depth', type: 'text', placeholder: 'e.g. 30ft' },
      { key: VENUE_ATTR.trim_height, label: 'Trim height', type: 'text', placeholder: 'e.g. 20ft' },
      { key: VENUE_ATTR.ceiling_height, label: 'Ceiling height', type: 'text', placeholder: 'e.g. 35ft' },
      {
        key: VENUE_ATTR.rigging_type, label: 'Rigging type', type: 'select',
        options: [
          { value: 'fly_system', label: 'Fly system' },
          { value: 'grid', label: 'Grid' },
          { value: 'ground_support', label: 'Ground support' },
          { value: 'none', label: 'None' },
        ],
      },
      { key: VENUE_ATTR.rigging_points_count, label: 'Rigging points', type: 'number', placeholder: 'Count' },
      { key: VENUE_ATTR.rigging_weight_per_point, label: 'Weight per point (lbs)', type: 'number', placeholder: 'e.g. 2000' },
      { key: VENUE_ATTR.house_power_amps, label: 'House power (amps)', type: 'text', placeholder: 'e.g. 200A' },
      { key: VENUE_ATTR.power_voltage, label: 'Power voltage', type: 'text', placeholder: 'e.g. 208V' },
      {
        key: VENUE_ATTR.power_phase, label: 'Power phase', type: 'select',
        options: [
          { value: 'single', label: 'Single phase' },
          { value: '3-phase', label: '3-phase' },
        ],
      },
      { key: VENUE_ATTR.power_notes, label: 'Power notes', type: 'textarea', placeholder: 'Additional power details...' },
      { key: VENUE_ATTR.house_pa_included, label: 'House PA included', type: 'toggle' },
      { key: VENUE_ATTR.house_lighting_included, label: 'House lighting included', type: 'toggle' },
    ],
  },
  {
    id: 'backstage',
    title: 'Backstage and Facilities',
    fields: [
      { key: VENUE_ATTR.green_room_count, label: 'Green rooms', type: 'number', placeholder: 'Count' },
      { key: VENUE_ATTR.green_room_notes, label: 'Green room notes', type: 'textarea', placeholder: 'Amenities, location, access...' },
      { key: VENUE_ATTR.dressing_room_count, label: 'Dressing rooms', type: 'number', placeholder: 'Count' },
      { key: VENUE_ATTR.production_office, label: 'Production office', type: 'toggle_notes', placeholder: 'Location, setup details...' },
      { key: VENUE_ATTR.catering_kitchen, label: 'Catering kitchen', type: 'toggle_notes', placeholder: 'Kitchen details, equipment...' },
      { key: VENUE_ATTR.wifi_credentials, label: 'WiFi credentials', type: 'masked', placeholder: 'Network / password' },
    ],
  },
  {
    id: 'compliance',
    title: 'Compliance and Safety',
    fields: [
      { key: VENUE_ATTR.curfew, label: 'Curfew', type: 'text', placeholder: 'e.g. 11:00 PM' },
      { key: VENUE_ATTR.noise_ordinance, label: 'Noise ordinance', type: 'textarea', placeholder: 'Decibel limits, quiet hours...' },
      { key: VENUE_ATTR.union_local, label: 'Union local', type: 'text', placeholder: 'e.g. IATSE Local 33' },
      {
        key: VENUE_ATTR.weather_exposure, label: 'Weather exposure', type: 'select',
        options: [
          { value: 'indoor', label: 'Indoor' },
          { value: 'outdoor', label: 'Outdoor' },
          { value: 'covered', label: 'Covered' },
          { value: 'tent', label: 'Tent' },
        ],
      },
      { key: VENUE_ATTR.nearest_hospital, label: 'Nearest hospital', type: 'text', placeholder: 'Name and address' },
      { key: VENUE_ATTR.last_verified_at, label: 'Last verified', type: 'readonly' },
    ],
  },
];

// ─── State helpers ──────────────────────────────────────────────────────────

type FieldValues = Record<string, string | number | boolean | null | undefined>;

type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

type FieldAction =
  | { type: 'SET_VALUE'; key: string; value: string | number | boolean | null }
  | { type: 'SET_SAVE_STATUS'; key: string; status: SaveStatus }
  | { type: 'TOGGLE_SECTION'; sectionId: string }
  | { type: 'INIT'; values: FieldValues };

interface EditorState {
  values: FieldValues;
  saveStatuses: Record<string, SaveStatus>;
  expandedSections: Set<string>;
}

function editorReducer(state: EditorState, action: FieldAction): EditorState {
  switch (action.type) {
    case 'SET_VALUE':
      return { ...state, values: { ...state.values, [action.key]: action.value } };
    case 'SET_SAVE_STATUS':
      return { ...state, saveStatuses: { ...state.saveStatuses, [action.key]: action.status } };
    case 'TOGGLE_SECTION': {
      const next = new Set(state.expandedSections);
      if (next.has(action.sectionId)) next.delete(action.sectionId);
      else next.add(action.sectionId);
      return { ...state, expandedSections: next };
    }
    case 'INIT':
      return { ...state, values: action.values };
    default:
      return state;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Get a string representation of a field value for display. */
function displayValue(val: string | number | boolean | null | undefined): string {
  if (val === null || val === undefined || val === '') return '';
  if (typeof val === 'boolean') return val ? 'Yes' : 'No';
  return String(val);
}

/** Count how many fields in a section have a non-empty value. */
function countFilled(values: FieldValues, fields: FieldDef[]): number {
  return fields.filter((f) => {
    const v = values[f.key];
    if (v === null || v === undefined || v === '' || v === false) return false;
    return true;
  }).length;
}

/** Build a comma-separated summary of filled field labels. */
function filledSummary(values: FieldValues, fields: FieldDef[]): string {
  return fields
    .filter((f) => {
      const v = values[f.key];
      return v !== null && v !== undefined && v !== '' && v !== false;
    })
    .map((f) => f.label)
    .join(', ');
}

/** Coerce the raw attribute value to a usable form state value. */
function coerceAttrValue(val: unknown): string | number | boolean | null {
  if (val === null || val === undefined) return null;
  if (typeof val === 'boolean') return val;
  if (typeof val === 'number') return val;
  if (typeof val === 'string') return val;
  return String(val);
}

// ─── Component ──────────────────────────────────────────────────────────────

interface VenueSpecsEditorProps {
  entityId: string;
  initialAttributes: VenueAttrs;
}

export function VenueSpecsEditor({ entityId, initialAttributes }: VenueSpecsEditorProps) {
  // Build initial values from all section field keys
  const initialValues = React.useMemo(() => {
    const vals: FieldValues = {};
    for (const section of SECTIONS) {
      for (const field of section.fields) {
        vals[field.key] = coerceAttrValue((initialAttributes as Record<string, unknown>)[field.key]);
      }
    }
    return vals;
  }, [initialAttributes]);

  const [state, dispatch] = React.useReducer(editorReducer, {
    values: initialValues,
    saveStatuses: {},
    expandedSections: new Set<string>(),
  });

  // Debounce timers ref
  const timersRef = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  // Fade timers for save indicators
  const fadeTimersRef = React.useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  // Cleanup on unmount
  React.useEffect(() => {
    return () => {
      for (const t of Object.values(timersRef.current)) clearTimeout(t);
      for (const t of Object.values(fadeTimersRef.current)) clearTimeout(t);
    };
  }, []);

  const handleFieldChange = React.useCallback(
    (key: string, value: string | number | boolean | null) => {
      dispatch({ type: 'SET_VALUE', key, value });

      // Clear any existing debounce for this field
      if (timersRef.current[key]) clearTimeout(timersRef.current[key]);

      timersRef.current[key] = setTimeout(async () => {
        dispatch({ type: 'SET_SAVE_STATUS', key, status: 'saving' });
        const result = await patchVenueAttribute(entityId, key, value);
        if (result.ok) {
          dispatch({ type: 'SET_SAVE_STATUS', key, status: 'saved' });
          // Clear the saved indicator after 1.5s
          if (fadeTimersRef.current[key]) clearTimeout(fadeTimersRef.current[key]);
          fadeTimersRef.current[key] = setTimeout(() => {
            dispatch({ type: 'SET_SAVE_STATUS', key, status: 'idle' });
          }, 1500);
        } else {
          dispatch({ type: 'SET_SAVE_STATUS', key, status: 'error' });
        }
      }, 500);
    },
    [entityId],
  );

  return (
    <div className="rounded-xl bg-[var(--stage-surface-elevated)] p-5" data-surface="elevated">
      <h3 className="mb-4 text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
        Venue specs
      </h3>
      <div className="space-y-1">
        {SECTIONS.map((section) => (
          <SpecSection
            key={section.id}
            section={section}
            values={state.values}
            saveStatuses={state.saveStatuses}
            isExpanded={state.expandedSections.has(section.id)}
            onToggle={() => dispatch({ type: 'TOGGLE_SECTION', sectionId: section.id })}
            onFieldChange={handleFieldChange}
          />
        ))}
      </div>
    </div>
  );
}

// ─── Section component ──────────────────────────────────────────────────────

interface SpecSectionProps {
  section: SectionDef;
  values: FieldValues;
  saveStatuses: Record<string, SaveStatus>;
  isExpanded: boolean;
  onToggle: () => void;
  onFieldChange: (key: string, value: string | number | boolean | null) => void;
}

function SpecSection({ section, values, saveStatuses, isExpanded, onToggle, onFieldChange }: SpecSectionProps) {
  const filled = countFilled(values, section.fields);
  const total = section.fields.filter((f) => f.type !== 'readonly').length;
  const summary = filledSummary(values, section.fields);

  return (
    <div className="rounded-xl bg-[var(--stage-surface-nested)] overflow-hidden">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[oklch(1_0_0_/_0.04)]"
      >
        <motion.span
          animate={{ rotate: isExpanded ? 180 : 0 }}
          transition={STAGE_MEDIUM}
          className="flex shrink-0"
        >
          <ChevronDown className="size-4 text-[var(--stage-text-secondary)]" />
        </motion.span>
        <span className="flex-1 text-sm font-medium text-[var(--stage-text-primary)]">
          {section.title}
        </span>
        <span className="shrink-0 rounded-full bg-[oklch(1_0_0_/_0.08)] px-2 py-0.5 text-[10px] font-medium tabular-nums text-[var(--stage-text-secondary)]">
          {filled}/{total}
        </span>
      </button>

      <AnimatePresence initial={false}>
        {!isExpanded && summary && (
          <motion.div
            key="summary"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={STAGE_MEDIUM}
            className="overflow-hidden"
          >
            <p className="px-4 pb-3 text-xs leading-relaxed text-[var(--stage-text-secondary)] line-clamp-2">
              {summary}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="content"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={STAGE_MEDIUM}
            className="overflow-hidden"
          >
            <div className="space-y-3 px-4 pb-4">
              {section.fields.map((field) => (
                <FieldRenderer
                  key={field.key}
                  field={field}
                  value={values[field.key]}
                  saveStatus={saveStatuses[field.key] ?? 'idle'}
                  onChange={(v) => onFieldChange(field.key, v)}
                />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Field renderer ─────────────────────────────────────────────────────────

interface FieldRendererProps {
  field: FieldDef;
  value: string | number | boolean | null | undefined;
  saveStatus: SaveStatus;
  onChange: (value: string | number | boolean | null) => void;
}

function FieldRenderer({ field, value, saveStatus, onChange }: FieldRendererProps) {
  return (
    <div>
      <div className="mb-1 flex items-center gap-2">
        <label className="block text-[10px] font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
          {field.label}
        </label>
        <SaveIndicator status={saveStatus} />
      </div>
      <FieldInput field={field} value={value} onChange={onChange} />
    </div>
  );
}

// ─── Save indicator ─────────────────────────────────────────────────────────

function SaveIndicator({ status }: { status: SaveStatus }) {
  return (
    <AnimatePresence mode="wait">
      {status === 'saving' && (
        <motion.span
          key="saving"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="text-[10px] text-[var(--stage-text-tertiary)]"
        >
          Saving...
        </motion.span>
      )}
      {status === 'saved' && (
        <motion.span
          key="saved"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          className="flex items-center gap-0.5 text-[10px] text-[var(--color-unusonic-success)]"
        >
          <Check className="size-3" />
        </motion.span>
      )}
      {status === 'error' && (
        <motion.span
          key="error"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="text-[10px] text-[var(--color-unusonic-error)]"
        >
          Error
        </motion.span>
      )}
    </AnimatePresence>
  );
}

// ─── Field inputs ───────────────────────────────────────────────────────────

const INPUT_CLASS =
  'w-full rounded-lg bg-[var(--ctx-well)] border border-[oklch(1_0_0/0.08)] px-3 py-2 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] ring-offset-2 ring-offset-[var(--stage-void)]';

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FieldDef;
  value: string | number | boolean | null | undefined;
  onChange: (v: string | number | boolean | null) => void;
}) {
  switch (field.type) {
    case 'text':
      return (
        <input
          type="text"
          value={displayValue(value)}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder={field.placeholder}
          className={INPUT_CLASS}
        />
      );

    case 'textarea':
      return (
        <textarea
          value={displayValue(value)}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder={field.placeholder}
          rows={3}
          className={`${INPUT_CLASS} resize-none`}
        />
      );

    case 'number':
      return (
        <input
          type="number"
          value={value != null && value !== '' ? String(value) : ''}
          onChange={(e) => {
            const raw = e.target.value;
            if (raw === '') { onChange(null); return; }
            const num = parseFloat(raw);
            onChange(isNaN(num) ? null : num);
          }}
          placeholder={field.placeholder}
          className={INPUT_CLASS}
        />
      );

    case 'toggle':
      return (
        <CeramicSwitch
          checked={value === true}
          onCheckedChange={(checked) => onChange(checked)}
        />
      );

    case 'toggle_notes':
      return <ToggleWithNotes value={value} onChange={onChange} placeholder={field.placeholder} />;

    case 'select':
      return <SelectField value={value} options={field.options ?? []} onChange={onChange} />;

    case 'masked':
      return <MaskedField value={value} onChange={onChange} placeholder={field.placeholder} />;

    case 'readonly':
      return (
        <p className="px-1 text-sm text-[var(--stage-text-secondary)]">
          {displayValue(value) || 'Not verified'}
        </p>
      );

    default:
      return null;
  }
}

// ─── Toggle with notes ──────────────────────────────────────────────────────

/**
 * Toggle with notes: stores a string value. Empty/null = off. Non-empty = on.
 * The toggle flips between null and the current notes (or a placeholder 'yes').
 */
function ToggleWithNotes({
  value,
  onChange,
  placeholder,
}: {
  value: string | number | boolean | null | undefined;
  onChange: (v: string | null) => void;
  placeholder?: string;
}) {
  const strVal = typeof value === 'string' ? value : null;
  const isOn = strVal !== null && strVal !== '';

  return (
    <div className="space-y-2">
      <CeramicSwitch
        checked={isOn}
        onCheckedChange={(checked) => {
          if (checked) onChange(strVal || 'Yes');
          else onChange(null);
        }}
      />
      {isOn && (
        <textarea
          value={strVal ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          placeholder={placeholder}
          rows={2}
          className={`${INPUT_CLASS} resize-none`}
        />
      )}
    </div>
  );
}

// ─── Select field ───────────────────────────────────────────────────────────

function SelectField({
  value,
  options,
  onChange,
}: {
  value: string | number | boolean | null | undefined;
  options: { value: string; label: string }[];
  onChange: (v: string | null) => void;
}) {
  const strVal = value != null ? String(value) : '';

  return (
    <Select
      value={strVal || undefined}
      onValueChange={(v) => onChange(v || null)}
    >
      <SelectTrigger className={INPUT_CLASS}>
        <SelectValue placeholder="Select..." />
      </SelectTrigger>
      <SelectContent>
        {options.map((opt) => (
          <SelectItem key={opt.value} value={opt.value}>
            {opt.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ─── Masked field (WiFi credentials) ────────────────────────────────────────

function MaskedField({
  value,
  onChange,
  placeholder,
}: {
  value: string | number | boolean | null | undefined;
  onChange: (v: string | null) => void;
  placeholder?: string;
}) {
  const [revealed, setRevealed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const strVal = typeof value === 'string' ? value : '';

  const handleCopy = React.useCallback(async () => {
    if (!strVal) return;
    try {
      await navigator.clipboard.writeText(strVal);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API may fail in some contexts
    }
  }, [strVal]);

  return (
    <div className="flex items-center gap-2">
      <input
        type={revealed ? 'text' : 'password'}
        value={strVal}
        onChange={(e) => onChange(e.target.value || null)}
        placeholder={placeholder}
        className={`${INPUT_CLASS} flex-1`}
        autoComplete="off"
      />
      <button
        type="button"
        onClick={() => setRevealed((r) => !r)}
        className="flex shrink-0 items-center justify-center rounded-lg p-2 text-[var(--stage-text-tertiary)] transition-colors hover:bg-[oklch(1_0_0_/_0.06)] hover:text-[var(--stage-text-secondary)]"
        aria-label={revealed ? 'Hide credentials' : 'Reveal credentials'}
      >
        {revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
      <button
        type="button"
        onClick={handleCopy}
        className="flex shrink-0 items-center justify-center rounded-lg p-2 text-[var(--stage-text-tertiary)] transition-colors hover:bg-[oklch(1_0_0_/_0.06)] hover:text-[var(--stage-text-secondary)]"
        aria-label="Copy credentials"
      >
        {copied ? <Check className="size-3.5 text-[var(--color-unusonic-success)]" /> : <Copy className="size-3.5" />}
      </button>
    </div>
  );
}
