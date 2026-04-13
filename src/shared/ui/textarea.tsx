import * as React from "react"

import { cn } from "@/shared/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-[oklch(1_0_0_/_0.08)] placeholder:text-[var(--stage-text-secondary)] focus-visible:border-[var(--stage-accent)] focus-visible:ring-[var(--stage-accent)]/50 aria-invalid:ring-[var(--color-unusonic-error)]/20 aria-invalid:border-[var(--color-unusonic-error)] flex field-sizing-content min-h-16 w-full rounded-md border bg-transparent px-3 py-2 text-base shadow-xs transition-[color,box-shadow] outline-none focus-visible:ring-[3px] disabled:cursor-not-allowed disabled:opacity-45 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
