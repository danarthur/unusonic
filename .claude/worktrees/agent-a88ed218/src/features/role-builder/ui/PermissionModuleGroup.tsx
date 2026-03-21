'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { FLUID_SPRING } from '@/shared/lib/motion-constants';
import { PermissionRow } from './PermissionRow';
import { MODULE_LABELS, type PermissionDefinition, type PermissionModuleId } from '../model/permission-metadata';

interface PermissionModuleGroupProps {
  moduleId: PermissionModuleId;
  permissions: PermissionDefinition[];
  defaultOpen?: boolean;
}

export function PermissionModuleGroup({
  moduleId,
  permissions,
  defaultOpen = true,
}: PermissionModuleGroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  const label = MODULE_LABELS[moduleId];

  return (
    <div className="liquid-card overflow-hidden border border-[var(--glass-border)]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          'flex w-full items-center justify-between gap-3 px-4 py-3 text-left',
          'text-ceramic tracking-tight font-medium',
          'border-b border-[var(--glass-border)]',
          'hover:bg-[var(--glass-bg)] transition-colors'
        )}
      >
        <span>{label}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          transition={FLUID_SPRING}
          className="text-ink-muted"
          aria-hidden
        >
          <ChevronDown className="size-4" />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={FLUID_SPRING}
            className="overflow-hidden"
          >
            <div className="px-4 py-2">
              {permissions.map((def) => (
                <PermissionRow key={def.key} definition={def} />
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
