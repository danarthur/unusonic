import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/shared/lib/utils"

const buttonVariants = cva(
  "stage-btn whitespace-nowrap shrink-0 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "stage-btn-primary",
        destructive:
          "bg-[var(--color-unusonic-error)] text-[oklch(1_0_0)] hover:bg-[oklch(0.55_0.20_25)]",
        outline:
          "stage-btn-secondary border border-[oklch(1_0_0_/_0.08)]",
        secondary:
          "stage-btn-secondary",
        ghost:
          "stage-btn-ghost",
        link: "!bg-transparent !h-auto !p-0 text-[var(--stage-text-primary)] underline-offset-4 hover:underline",
        silk: "stage-btn-primary",
      },
      size: {
        default: "px-4 py-2 has-[>svg]:px-3",
        sm: "h-[calc(var(--stage-input-height,34px)-6px)] gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-[calc(var(--stage-input-height,34px)+6px)] px-6 has-[>svg]:px-4",
        icon: "!px-0 aspect-square",
        "icon-sm": "!px-0 h-[calc(var(--stage-input-height,34px)-6px)] aspect-square",
        "icon-lg": "!px-0 h-[calc(var(--stage-input-height,34px)+6px)] aspect-square",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
