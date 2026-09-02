import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

// eslint-disable-next-line react-refresh/only-export-components
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-medium transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-[#72e2c6] text-[#07090e] font-semibold hover:bg-[#5fd4b7] shadow-[0_0_20px_-3px_rgba(114,226,198,0.35)] hover:shadow-[0_0_25px_0px_rgba(114,226,198,0.5)] border border-transparent",
        destructive:
          "bg-rose-600/90 text-white hover:bg-rose-600 shadow-sm border border-rose-500/30",
        outline:
          "border border-white/10 bg-white/[0.03] text-zinc-100 hover:bg-white/[0.08] hover:border-white/20 shadow-sm backdrop-blur-sm",
        secondary:
          "bg-zinc-800/80 text-zinc-100 hover:bg-zinc-700/80 border border-white/5 shadow-sm",
        ghost:
          "text-zinc-300 hover:text-white hover:bg-white/[0.06]",
        link:
          "text-[#72e2c6] underline-offset-4 hover:underline",
        glow:
          "bg-gradient-to-r from-[#72e2c6] to-[#9b8cff] text-[#07090e] font-semibold hover:opacity-95 shadow-[0_0_25px_-4px_rgba(114,226,198,0.4)] border border-white/10",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-8 rounded-lg px-3 text-xs",
        lg: "h-12 rounded-xl px-8 text-base",
        icon: "h-9 w-9 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => {
    return (
      <button
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button }
