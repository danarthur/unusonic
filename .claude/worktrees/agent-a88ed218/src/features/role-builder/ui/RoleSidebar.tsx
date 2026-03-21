'use client';

import { motion } from 'framer-motion';
import { Copy, Users } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { M3_STAGGER_CHILDREN, M3_STAGGER_DELAY, M3_SHARED_AXIS_X_VARIANTS } from '@/shared/lib/motion-constants';
import type { RoleWithPermissions } from '../api/actions';

interface RoleSidebarProps {
  systemRoles: RoleWithPermissions[];
  customRoles: RoleWithPermissions[];
  selectedRoleId: string | null;
  onSelectRole: (role: RoleWithPermissions) => void;
  onDuplicateToCustom?: (template: RoleWithPermissions) => void;
  /** When true, only system roles are shown; Duplicate and custom roles section hidden. */
  readOnly?: boolean;
}

export function RoleSidebar({
  systemRoles,
  customRoles,
  selectedRoleId,
  onSelectRole,
  onDuplicateToCustom,
  readOnly = false,
}: RoleSidebarProps) {
  return (
    <nav className="flex flex-col gap-6">
      <section>
        <p className="text-xs uppercase tracking-widest text-ink-muted mb-2">System templates</p>
        <ul className="space-y-1">
          {systemRoles.map((role, i) => (
            <motion.li
              key={role.id}
              initial="hidden"
              animate="visible"
              variants={M3_SHARED_AXIS_X_VARIANTS}
              transition={{ delay: M3_STAGGER_DELAY + i * M3_STAGGER_CHILDREN }}
            >
              <RoleSidebarItem
                role={role}
                isSystem
                isSelected={selectedRoleId === role.id}
                onSelect={() => onSelectRole(role)}
                onDuplicate={onDuplicateToCustom ? () => onDuplicateToCustom(role) : undefined}
              />
            </motion.li>
          ))}
        </ul>
      </section>
      {!readOnly && (
      <section>
        <p className="text-xs uppercase tracking-widest text-ink-muted mb-2">Custom roles</p>
        <ul className="space-y-1">
          {customRoles.map((role, i) => (
            <motion.li
              key={role.id}
              initial="hidden"
              animate="visible"
              variants={M3_SHARED_AXIS_X_VARIANTS}
              transition={{ delay: M3_STAGGER_DELAY + (systemRoles.length + i) * M3_STAGGER_CHILDREN }}
            >
              <RoleSidebarItem
                role={role}
                isSystem={false}
                isSelected={selectedRoleId === role.id}
                onSelect={() => onSelectRole(role)}
              />
            </motion.li>
          ))}
        </ul>
      </section>
      )}
    </nav>
  );
}

interface RoleSidebarItemProps {
  role: RoleWithPermissions;
  isSystem: boolean;
  isSelected: boolean;
  onSelect: () => void;
  onDuplicate?: () => void;
}

function RoleSidebarItem({
  role,
  isSystem,
  isSelected,
  onSelect,
  onDuplicate,
}: RoleSidebarItemProps) {
  return (
    <div
      className={cn(
        'group flex items-center gap-2 rounded-lg border px-3 py-2.5 transition-colors',
        'border-[var(--glass-border)] bg-[var(--glass-bg)]',
        isSelected && 'border-[var(--color-neon-blue)]/30 bg-[var(--color-neon-blue)]/10',
        !isSelected && 'hover:border-[var(--glass-border-hover)] hover:bg-[var(--glass-bg-hover)]'
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        className="flex-1 flex items-center gap-2 min-w-0 text-left"
      >
        <Users className="size-4 text-ink-muted shrink-0" />
        <span className="text-ceramic text-sm font-medium tracking-tight truncate">{role.name}</span>
        {isSystem && (
          <Badge variant="outline" className="shrink-0 text-[10px] uppercase tracking-wider text-ink-muted border-[var(--glass-border)]">
            System
          </Badge>
        )}
      </button>
      {isSystem && onDuplicate && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity text-ink-muted hover:text-ceramic"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate();
          }}
          title="Duplicate to custom role"
        >
          <Copy className="size-3.5" />
        </Button>
      )}
    </div>
  );
}
