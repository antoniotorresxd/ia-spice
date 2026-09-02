import * as React from "react"
import { cn } from "@/lib/utils"

export type TextareaProps = React.TextareaHTMLAttributes<HTMLTextAreaElement>

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[80px] w-full rounded-xl border border-white/10 bg-[#070a10]/70 px-3.5 py-2.5 text-sm text-zinc-100 placeholder:text-zinc-500 shadow-inner transition-all duration-200 focus-visible:border-[#72e2c6]/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#72e2c6]/20 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Textarea.displayName = "Textarea"

export { Textarea }
