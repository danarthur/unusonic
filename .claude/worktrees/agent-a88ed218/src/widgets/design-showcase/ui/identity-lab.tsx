"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { LivingLogo, type LivingLogoStatus } from "@/shared/ui/branding/living-logo";
import { cn } from "@/shared/lib/utils";

const STATUS_OPTIONS: { value: LivingLogoStatus; label: string }[] = [
  { value: "idle", label: "Idle" },
  { value: "loading", label: "Think" },
  { value: "error", label: "Glitch" },
  { value: "success", label: "Flow" },
];

export function IdentityLab() {
  const [status, setStatus] = useState<LivingLogoStatus>("idle");

  return (
    <div className="liquid-card p-6 flex flex-col gap-6">
      <h3 className="text-ceramic font-medium tracking-tight text-lg">
        Identity Lab
      </h3>

      <div className="flex flex-col items-center justify-center gap-8 min-h-[180px]">
        <LivingLogo status={status} size="lg" />
      </div>

      <div className="flex flex-wrap justify-center gap-2">
        {STATUS_OPTIONS.map(({ value, label }) => (
          <motion.button
            key={value}
            type="button"
            onClick={() => setStatus(value)}
            whileTap={{ scale: 0.98 }}
            transition={{
              type: "spring",
              stiffness: 180,
              damping: 24,
              mass: 1.2,
            }}
            className={cn(
              "px-4 py-2 rounded-xl text-sm font-medium tracking-tight transition-all duration-300",
              "border border-[var(--color-mercury)]",
              "bg-obsidian/40 backdrop-blur-sm",
              "text-ink-muted hover:text-ceramic hover:border-[var(--color-mercury)] hover:bg-[var(--color-glass-surface)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-neon-blue)]/50 focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian",
              status === value &&
                "text-ceramic border-ceramic/30 bg-[var(--color-glass-surface)]"
            )}
          >
            {label}
          </motion.button>
        ))}
      </div>
    </div>
  );
}
