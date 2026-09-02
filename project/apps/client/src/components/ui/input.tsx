import * as React from "react"
import { cn } from "@/lib/utils"

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "flex h-10 w-full rounded-xl border border-white/10 bg-[#070a10]/70 px-3.5 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 shadow-inner transition-all duration-200 file:border-0 file:bg-transparent file:text-sm file:font-medium focus-visible:border-[#72e2c6]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#72e2c6]/20 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = "Input"

export { Input }
