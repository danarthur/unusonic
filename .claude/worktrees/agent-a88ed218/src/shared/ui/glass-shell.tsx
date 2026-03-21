import React from 'react';
import { cn } from "@/shared/lib/utils";

interface GlassShellProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  header?: React.ReactNode;
  footer?: React.ReactNode;
}

export function GlassShell({ 
  children, 
  header, 
  footer, 
  className,
  ...props 
}: GlassShellProps) {
  return (
    /* THE FRAME: 
      - Uses absolute positioning or flex-1 to fill the parent container.
      - Handles the "Liquid Glass" visual style.
    */
    <div 
      className={cn(
        "flex flex-col relative overflow-hidden",
        "rounded-[2.5rem] border border-[var(--glass-border)]",
        "bg-[var(--glass-bg)]/30 backdrop-blur-3xl",
        "h-full w-full", 
        className
      )} 
      {...props}
    >
      {/* HEADER SLOT: Anchored to top, separate glass layer */}
      {header && (
        <div className="shrink-0 z-10 border-b border-[var(--glass-border)] bg-[var(--glass-bg)]/50 backdrop-blur-md">
          {header}
        </div>
      )}

      {/* SCROLL AREA: The "Physics" layer. min-h-0 is crucial for nested scrolling. */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6 pb-32 [mask-image:linear-gradient(to_bottom,black_85%,transparent_100%)]">
        {children}
      </div>

      {/* FOOTER SLOT: Floating HUD elements */}
      {footer && (
        <div className="absolute bottom-6 left-6 right-6 pointer-events-none z-20">
          {footer}
        </div>
      )}
    </div>
  );
}