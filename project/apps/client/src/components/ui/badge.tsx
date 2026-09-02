import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// eslint-disable-next-line react-refresh/only-export-components
export const badgeVariants = cva(
  "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default:
          "border-transparent bg-[#72e2c6]/15 text-[#72e2c6] shadow-sm",
        secondary:
          "border-white/10 bg-white/[0.05] text-zinc-300",
        destructive:
          "border-rose-500/20 bg-rose-500/10 text-rose-400",
        outline:
          "border-white/10 text-zinc-300",
        violet:
          "border-purple-500/20 bg-purple-500/10 text-[#9b8cff]",
        blue:
          "border-blue-500/20 bg-blue-500/10 text-[#4d8dff]",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export type BadgeProps = React.HTMLAttributes<HTMLDivElement> &
  VariantProps<typeof badgeVariants>

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

export { Badge }
