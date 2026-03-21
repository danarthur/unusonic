/**
 * Safe Area Shell
 * Wraps content with env(safe-area-inset-*) for notch and home bar.
 * Use on mobile/PWA to avoid content under system UI.
 * @module shared/ui/layout/safe-area-shell
 */

import { cn } from '@/shared/lib/utils';

interface SafeAreaShellProps {
  children: React.ReactNode;
  /** Extra class for the wrapper */
  className?: string;
  /** If true, only apply horizontal safe areas (for inner scroll regions) */
  horizontalOnly?: boolean;
}

export function SafeAreaShell({
  children,
  className,
  horizontalOnly = false,
}: SafeAreaShellProps) {
  return (
    <div
      className={cn(
        'min-h-screen overscroll-none',
        horizontalOnly
          ? 'pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)]'
          : [
              'pt-[env(safe-area-inset-top)]',
              'pb-[env(safe-area-inset-bottom)]',
              'pl-[env(safe-area-inset-left)]',
              'pr-[env(safe-area-inset-right)]',
            ],
        className
      )}
    >
      {children}
    </div>
  );
}
