import * as React from "react"

import { cn } from "@/shared/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "stage-input w-full min-w-0 transition-[color,box-shadow] file:text-[var(--stage-text-primary)] file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium selection:bg-[var(--stage-accent)] selection:text-[oklch(0.10_0_0)] aria-invalid:border-[var(--color-unusonic-error)] [&_svg]:pointer-events-none [&_svg]:shrink-0",
        className
      )}
      {...props}
    />
  )
}

export { Input }
