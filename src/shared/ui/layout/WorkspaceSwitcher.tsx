'use client';

import { useTransition } from 'react';
import { Check, ChevronsUpDown } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/shared/ui/popover';
import { switchWorkspaceAction } from '@/shared/api/workspace/switch-workspace';
import { cn } from '@/shared/lib/utils';

export interface WorkspaceEntry {
  id: string;
  name: string;
  role: string;
}

interface WorkspaceSwitcherProps {
  workspaces: WorkspaceEntry[];
  activeWorkspaceId: string | null;
  collapsed?: boolean;
}

export function WorkspaceSwitcher({
  workspaces,
  activeWorkspaceId,
  collapsed = false,
}: WorkspaceSwitcherProps) {
  const [isPending, startTransition] = useTransition();
  const active = workspaces.find((w) => w.id === activeWorkspaceId) ?? workspaces[0];

  if (!active) return null;

  // Single workspace — static display, no switcher
  if (workspaces.length < 2) {
    return (
      <div className={cn('flex items-center rounded-xl p-2', collapsed ? 'justify-center' : 'gap-2.5')}>
        <div className="size-7 rounded-lg bg-[oklch(1_0_0/0.08)] flex items-center justify-center shrink-0">
          <span className="text-xs font-medium text-[var(--stage-text-primary)]">
            {active.name[0]?.toUpperCase() ?? 'U'}
          </span>
        </div>
        {!collapsed && (
          <span className="text-sm font-medium text-[var(--stage-text-primary)] tracking-tight truncate">
            {active.name}
          </span>
        )}
      </div>
    );
  }

  function handleSwitch(workspaceId: string) {
    if (workspaceId === activeWorkspaceId) return;
    startTransition(() => {
      switchWorkspaceAction(workspaceId);
    });
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(
            'flex items-center rounded-xl p-2 w-full cursor-pointer transition-colors stage-hover',
            collapsed ? 'justify-center' : 'gap-2.5',
            isPending && 'opacity-60 pointer-events-none'
          )}
          aria-label="Switch workspace"
        >
          <div className="size-7 rounded-lg bg-[oklch(1_0_0/0.08)] flex items-center justify-center shrink-0">
            <span className="text-xs font-medium text-[var(--stage-text-primary)]">
              {active.name[0]?.toUpperCase() ?? 'U'}
            </span>
          </div>
          {!collapsed && (
            <>
              <span className="text-sm font-medium text-[var(--stage-text-primary)] tracking-tight truncate flex-1 text-left">
                {active.name}
              </span>
              <ChevronsUpDown className="size-3.5 text-[var(--stage-text-tertiary)] shrink-0" />
            </>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={collapsed ? 'right' : 'bottom'}
        align="start"
        className="w-56 p-1.5"
      >
        <div className="flex flex-col gap-0.5">
          <p className="stage-label text-[var(--stage-text-tertiary)] px-2 py-1">
            Workspaces
          </p>
          {workspaces.map((ws) => (
            <button
              key={ws.id}
              type="button"
              onClick={() => handleSwitch(ws.id)}
              className={cn(
                'flex items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors stage-hover w-full',
                ws.id === activeWorkspaceId && 'bg-[oklch(1_0_0/0.06)]'
              )}
            >
              <div className="size-6 rounded-md bg-[oklch(1_0_0/0.08)] flex items-center justify-center shrink-0">
                <span className="text-[10px] font-medium text-[var(--stage-text-primary)]">
                  {ws.name[0]?.toUpperCase() ?? 'U'}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
                  {ws.name}
                </p>
                <p className="text-xs text-[var(--stage-text-tertiary)] capitalize">
                  {ws.role}
                </p>
              </div>
              {ws.id === activeWorkspaceId && (
                <Check className="size-3.5 text-[var(--stage-text-secondary)] shrink-0" />
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
