import { cn } from "@/shared/lib/utils"

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="skeleton"
      role="status"
      aria-busy="true"
      className={cn("stage-skeleton", className)}
      {...props}
    />
  )
}

export { Skeleton }
