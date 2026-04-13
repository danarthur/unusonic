"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { LivingLogo, type LivingLogoStatus } from "@/shared/ui/branding/living-logo";
import { AionMark } from "@/shared/ui/branding/aion-mark";
import { cn } from "@/shared/lib/utils";
import { STAGE_LIGHT } from "@/shared/lib/motion-constants";

const STATUS_OPTIONS: { value: LivingLogoStatus; label: string }[] = [
  { value: "idle", label: "Idle" },
  { value: "loading", label: "Think" },
  { value: "error", label: "Glitch" },
  { value: "success", label: "Flow" },
];

export function IdentityLab() {
  const [status, setStatus] = useState<LivingLogoStatus>("idle");

  return (
    <div className="flex flex-col gap-6">
      {/* Existing Phase Mark status lab */}
      <div className="stage-panel p-6 flex flex-col gap-6 border border-[oklch(1_0_0_/_0.10)]">
        <h3 className="text-[var(--stage-text-primary)] font-medium tracking-tight text-lg">
          Identity Lab
        </h3>

        <div className="flex items-center justify-center gap-12 min-h-[180px]">
          <div className="flex flex-col items-center gap-3">
            <LivingLogo status={status} size="lg" />
            <span className="text-label text-[var(--stage-text-tertiary)] font-mono">Phase Mark</span>
          </div>
          <div className="flex flex-col items-center gap-3">
            <AionMark status={status} size="lg" />
            <span className="text-label text-[var(--stage-text-tertiary)] font-mono">Aion Mark</span>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2">
          {STATUS_OPTIONS.map(({ value, label }) => (
            <motion.button
              key={value}
              type="button"
              onClick={() => setStatus(value)}
              transition={STAGE_LIGHT}
              className={cn(
                "px-4 py-2 rounded-xl text-sm font-medium tracking-tight transition-[filter,background-color,border-color] duration-300",
                "border border-[oklch(1_0_0_/_0.10)]",
                "bg-[var(--stage-surface)]",
                "stage-hover overflow-hidden text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:border-[oklch(1_0_0_/_0.14)]",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-void)]",
                status === value &&
                  "text-[var(--stage-text-primary)] border-[oklch(1_0_0_/_0.18)] bg-[var(--stage-surface-raised)]"
              )}
            >
              {label}
            </motion.button>
          ))}
        </div>
      </div>

    </div>
  );
}
