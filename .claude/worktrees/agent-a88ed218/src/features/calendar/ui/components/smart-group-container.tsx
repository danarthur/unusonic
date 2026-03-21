'use client';

/**
 * Wrapper for Stack Mode (2+ overlapping events).
 * List of event pills only — no header, no label bar.
 * Uses liquid-panel styling to match site cards (Liquid Japandi).
 */

export interface SmartGroupContainerProps {
  top: number;
  height: number;
  labelStart?: string;
  labelEnd?: string;
  children: React.ReactNode;
}

export function SmartGroupContainer({
  top,
  height,
  children,
}: SmartGroupContainerProps) {
  return (
    <div
      className="absolute left-[3px] right-[3px] rounded-xl overflow-hidden flex flex-col z-20 smart-group-container"
      style={{
        top: `${top}%`,
        height: `${height}%`,
        minHeight: 72,
      }}
    >
      <div
        className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden flex flex-col gap-2.5 p-2.5 smart-group-scroll"
        style={{ overscrollBehavior: 'contain' }}
      >
        {children}
      </div>
    </div>
  );
}

/** Block variant for month view: same liquid glass stack look, no absolute positioning. */
export function SmartGroupContainerBlock({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl overflow-hidden flex flex-col smart-group-container min-h-0">
      <div
        className="flex flex-col gap-2 p-2.5 smart-group-scroll overflow-y-auto overflow-x-hidden min-h-0"
        style={{ overscrollBehavior: 'contain' }}
      >
        {children}
      </div>
    </div>
  );
}
