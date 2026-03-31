'use client';

import React, { useState, useCallback, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Search, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { searchCrewMembers, type CrewSearchResult } from '@/app/(dashboard)/(features)/crm/actions/deal-crew';

export interface CrewRoleAssignmentRowProps {
  role: {
    role: string;
    booking_type: 'labor' | 'talent';
    quantity: number;
    entity_id?: string | null;
    assignee_name?: string | null;
  };
  roleIndex: number;
  sourceOrgId: string | null;
  onAssign: (roleIdx: number, entityId: string, name: string) => void;
  onClear: (roleIdx: number) => void;
}

export function CrewRoleAssignmentRow({
  role,
  roleIndex,
  sourceOrgId,
  onAssign,
  onClear,
}: CrewRoleAssignmentRowProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CrewSearchResult[]>([]);
  const [open, setOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputContainerRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!sourceOrgId) return;
    debounceRef.current = setTimeout(async () => {
      const res = await searchCrewMembers(sourceOrgId, value, role.role);
      setResults(res);
      setOpen(true);
    }, 200);
  }, [sourceOrgId, role.role]);

  const handleFocus = useCallback(() => {
    if (!sourceOrgId) return;
    if (results.length === 0) {
      searchCrewMembers(sourceOrgId, '', role.role).then((res) => {
        setResults(res);
        setOpen(true);
      });
    } else {
      setOpen(true);
    }
  }, [sourceOrgId, role.role, results.length]);

  // Update dropdown position when open
  useEffect(() => {
    if (!open || !inputContainerRef.current) {
      setDropdownPos(null);
      return;
    }
    const updatePos = () => {
      const rect = inputContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      setDropdownPos({
        top: rect.bottom + 4,
        left: rect.left,
        width: rect.width,
      });
    };
    updatePos();
    window.addEventListener('scroll', updatePos, true);
    window.addEventListener('resize', updatePos);
    return () => {
      window.removeEventListener('scroll', updatePos, true);
      window.removeEventListener('resize', updatePos);
    };
  }, [open]);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-[var(--stage-text-primary)]">
          {role.role}{role.quantity > 1 ? ` \u00d7 ${role.quantity}` : ''}
        </span>
        <span
          className={cn(
            'text-[10px] font-medium uppercase tracking-wider px-1.5 py-0.5 rounded-[var(--stage-radius-input)]',
            role.booking_type === 'talent'
              ? 'bg-[var(--color-unusonic-info)]/15 text-[var(--color-unusonic-info)]'
              : 'bg-[var(--ctx-well)] text-[var(--stage-text-secondary)]'
          )}
        >
          {role.booking_type}
        </span>
      </div>
      {role.entity_id && role.assignee_name ? (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-[var(--stage-radius-input)] bg-[var(--ctx-well)] border border-[var(--stage-border)] text-xs font-medium text-[var(--stage-text-primary)]">
            {role.assignee_name}
            <button
              type="button"
              onClick={() => onClear(roleIndex)}
              className="ml-0.5 p-0.5 rounded hover:bg-[oklch(1_0_0_/_0.04)] text-[var(--stage-text-secondary)] hover:text-[var(--color-unusonic-error)] transition-colors"
              aria-label={`Remove ${role.assignee_name}`}
            >
              <X className="w-3 h-3" />
            </button>
          </span>
        </div>
      ) : (
        <div ref={inputContainerRef}>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--stage-text-secondary)] pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              onFocus={handleFocus}
              onBlur={() => setTimeout(() => setOpen(false), 200)}
              placeholder="Search crew..."
              className="w-full pl-8 pr-3 py-1.5 rounded-[var(--stage-radius-input)] border border-[var(--stage-border)] bg-[var(--ctx-well)] text-xs text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-accent)]"
            />
          </div>
          {open && results.length > 0 && dropdownPos && createPortal(
            <ul
              data-surface="raised"
              className="fixed z-[9999] max-h-40 overflow-y-auto rounded-[var(--stage-radius-panel)] border border-[var(--stage-border-hover)] bg-[var(--ctx-dropdown)] shadow-lg"
              style={{
                top: dropdownPos.top,
                left: dropdownPos.left,
                width: dropdownPos.width,
              }}
            >
              {results.map((r) => (
                <li key={r.entity_id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onAssign(roleIndex, r.entity_id, r.name);
                      setQuery('');
                      setOpen(false);
                    }}
                    className="w-full text-left px-3 py-2 text-xs hover:bg-[oklch(1_0_0_/_0.04)] transition-colors flex items-center gap-2"
                  >
                    <span className="font-medium text-[var(--stage-text-primary)] truncate">{r.name}</span>
                    {r.job_title && (
                      <span className="text-[var(--stage-text-secondary)] truncate">{r.job_title}</span>
                    )}
                    <span className={cn(
                      'ml-auto text-[10px] uppercase tracking-wider shrink-0',
                      r._section === 'team' ? 'text-[var(--color-unusonic-success)]' : 'text-[var(--stage-text-secondary)]'
                    )}>
                      {r._section === 'team' ? 'Team' : 'Network'}
                    </span>
                  </button>
                </li>
              ))}
            </ul>,
            document.body
          )}
        </div>
      )}
    </div>
  );
}
