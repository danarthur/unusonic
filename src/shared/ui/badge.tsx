import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/shared/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border border-transparent px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:outline-2 focus-visible:outline-[var(--stage-accent)] focus-visible:outline-offset-2 transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        default:
          "bg-[var(--stage-accent-muted)] text-[var(--stage-text-primary)] [a&]:hover:bg-[oklch(1_0_0_/_0.15)]",
        secondary:
          "bg-[var(--stage-surface-raised)] text-[var(--stage-text-primary)]",
        destructive:
          "bg-[oklch(0.65_0.18_20_/_0.2)] text-[var(--color-unusonic-error)] [a&]:hover:bg-[oklch(0.65_0.18_20_/_0.3)]",
        outline:
          "bg-[var(--stage-surface-elevated)] text-[var(--stage-text-secondary)]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
