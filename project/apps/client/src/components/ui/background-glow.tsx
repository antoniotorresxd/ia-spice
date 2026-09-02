import * as React from "react"
import { cn } from "@/lib/utils"

export function BackgroundGlow({
  children,
  className,
}: {
  children?: React.ReactNode
  className?: string
}) {
  return (
    <div className={cn("relative overflow-hidden", className)}>
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[500px] w-[700px] -translate-x-1/2 rounded-full bg-gradient-to-tr from-[#72e2c6]/10 via-[#9b8cff]/10 to-transparent blur-3xl"
        aria-hidden="true"
      />
      <div
        className="pointer-events-none absolute -bottom-40 right-10 -z-10 h-[400px] w-[500px] rounded-full bg-gradient-to-tl from-[#4d8dff]/8 via-[#72e2c6]/5 to-transparent blur-3xl"
        aria-hidden="true"
      />
      {children}
    </div>
  )
}

export function GridPattern({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute inset-0 -z-10 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)]",
        className
      )}
      aria-hidden="true"
    />
  )
}
