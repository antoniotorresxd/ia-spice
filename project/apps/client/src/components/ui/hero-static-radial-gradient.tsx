// Adapted from the 21st.dev Static Radial Gradient compound hero.

import * as React from "react"
import { StaticRadialGradient } from "@paper-design/shaders-react"

import { cn } from "@/lib/utils"
import { buttonVariants } from "@/components/ui/button"

const MemoizedStaticRadialGradient = React.memo(StaticRadialGradient)

type StaticRadialGradientProps = React.ComponentProps<
  typeof StaticRadialGradient
>

function supportsWebGL2(attributes?: WebGLContextAttributes): boolean {
  try {
    // Paper requires WebGL 2; WebGL 1 alone cannot render this shader.
    // Check the constructor first to avoid unsupported canvas calls in jsdom.
    if (typeof window === "undefined" ||
        typeof window.WebGL2RenderingContext === "undefined") {
      return false
    }

    const context = document.createElement("canvas").getContext("webgl2", attributes)
    if (!context) return false

    // The probe must not consume a context needed by the actual shader.
    context.getExtension("WEBGL_lose_context")?.loseContext()
    return true
  } catch {
    return false
  }
}

function SupportedStaticRadialGradient(props: StaticRadialGradientProps) {
  const [supported] = React.useState(() => supportsWebGL2(props.webGlContextAttributes))

  if (supported) {
    // Paper accepts literal colors only; resolve the shared palette at the WebGL boundary.
    const tokens = getComputedStyle(document.documentElement)
    const colors = props.colors?.map((color) =>
      typeof color === "string" && color.startsWith("var(")
        ? tokens.getPropertyValue(color.slice(4, -1)).trim()
        : color
    )
    return <MemoizedStaticRadialGradient {...props} colors={colors} />
  }

  return (
    <div
      aria-hidden="true"
      data-slot="hero-static-radial-gradient-fallback"
      className={props.className}
      style={{
        width: props.width ?? "100%",
        height: props.height ?? "100%",
        ...props.style,
        background: "radial-gradient(ellipse at 35% 35%, var(--color-mint), var(--color-mint) 50%, var(--color-surface) 80%)",
      }}
    />
  )
}

export interface HeroStaticRadialGradientCTAProps {
  label: React.ReactNode
  href: string
  target?: React.HTMLAttributeAnchorTarget
  rel?: string
  onClick?: React.MouseEventHandler<HTMLAnchorElement>
  className?: string
  buttonClassName?: string
}

export interface HeroStaticRadialGradientRootProps
  extends Omit<React.ComponentPropsWithoutRef<"section">, "title"> {
  srTitle?: string
  title?: React.ReactNode
  subtitle?: React.ReactNode
  description?: React.ReactNode
  showCta?: boolean
  ctaProps?: Partial<HeroStaticRadialGradientCTAProps>
  renderCta?: (defaultCta: React.ReactNode) => React.ReactNode
  desktopShaderProps?: Partial<StaticRadialGradientProps>
  mobileShaderProps?: Partial<StaticRadialGradientProps>
}

export interface HeroStaticRadialGradientHeadingProps
  extends Omit<React.ComponentPropsWithoutRef<"div">, "title"> {
  title?: React.ReactNode
  subtitle?: React.ReactNode
  headingClassName?: string
}

export interface HeroStaticRadialGradientDescriptionProps
  extends React.ComponentPropsWithoutRef<"div"> {
  description?: React.ReactNode
  descriptionClassName?: string
}

export interface HeroStaticRadialGradientActionsProps
  extends React.ComponentPropsWithoutRef<"div"> {
  showCta?: boolean
  ctaProps?: Partial<HeroStaticRadialGradientCTAProps>
  renderCta?: (defaultCta: React.ReactNode) => React.ReactNode
}

export interface HeroStaticRadialGradientVisualProps
  extends React.ComponentPropsWithoutRef<"div"> {
  desktopShaderProps?: Partial<StaticRadialGradientProps>
  desktopClassName?: string
}

export interface HeroStaticRadialGradientMobileVisualProps
  extends React.ComponentPropsWithoutRef<"div"> {
  mobileShaderProps?: Partial<StaticRadialGradientProps>
}

export interface HeroStaticRadialGradientProps
  extends HeroStaticRadialGradientRootProps {
  containerClassName?: string
  contentClassName?: string
  headingWrapClassName?: string
  headingClassName?: string
  descriptionWrapClassName?: string
  descriptionClassName?: string
  ctaWrapClassName?: string
  visualClassName?: string
  mobileVisualClassName?: string
}

interface HeroStaticRadialGradientContextValue {
  srTitle?: string
  title: React.ReactNode
  subtitle: React.ReactNode
  description: React.ReactNode
  showCta: boolean
  mergedCtaProps: HeroStaticRadialGradientCTAProps
  renderCta?: (defaultCta: React.ReactNode) => React.ReactNode
  mergedDesktopShaderProps: Partial<StaticRadialGradientProps>
  mergedMobileShaderProps: Partial<StaticRadialGradientProps>
}

const defaultDesktopShaderProps: Partial<StaticRadialGradientProps> = {
  style: { height: "100%", width: "100%" },
  speed: 0,
  colors: ["var(--color-mint)", "var(--color-mint)", "var(--color-surface)"],
  colorBack: "#ffffff00",
  radius: 0.98,
  focalDistance: 0,
  focalAngle: 0,
  falloff: 0.9,
  mixing: 0.7,
  distortion: 0,
  distortionShift: 0,
  distortionFreq: 12,
  grainMixer: 0.35,
  grainOverlay: 0.12,
}

const defaultMobileShaderProps: Partial<StaticRadialGradientProps> = {
  colors: ["var(--color-mint)", "var(--color-mint)", "var(--color-surface)"],
  colorBack: "#ffffff00",
  radius: 0.98,
  focalDistance: 0,
  focalAngle: 0,
  falloff: 0.9,
  mixing: 0.7,
  distortion: 0,
  distortionShift: 0,
  distortionFreq: 12,
  grainMixer: 0.35,
  grainOverlay: 0.12,
  style: { height: "100%", width: "100%" },
}

const defaultCtaProps: HeroStaticRadialGradientCTAProps = {
  label: "Ver proyectos",
  href: "/projects",
}

const defaultDescription =
  "Revisa tu actividad o inicia una nueva solicitud desde lenguaje natural."

const HeroStaticRadialGradientContext = React.createContext<
  HeroStaticRadialGradientContextValue | undefined
>(undefined)

function useHeroStaticRadialGradientContext() {
  const context = React.useContext(HeroStaticRadialGradientContext)
  if (!context) {
    throw new Error(
      "HeroStaticRadialGradient components must be used within HeroStaticRadialGradientRoot"
    )
  }
  return context
}

// eslint-disable-next-line react-refresh/only-export-components
export function useHeroStaticRadialGradient() {
  return useHeroStaticRadialGradientContext()
}

export const HeroStaticRadialGradientRoot = React.forwardRef<
  HTMLElement,
  HeroStaticRadialGradientRootProps
>(({
  className, children, srTitle, title = "Tu espacio de trabajo",
  subtitle, description = defaultDescription, showCta = true,
  ctaProps, renderCta, desktopShaderProps, mobileShaderProps, ...props
}, ref) => {
  const mergedCtaProps = React.useMemo(
    () => ({
      ...defaultCtaProps,
      ...ctaProps,
    }),
    [ctaProps]
  )

  const mergedDesktopShaderProps = React.useMemo(
    () => ({
      ...defaultDesktopShaderProps,
      ...desktopShaderProps,
    }),
    [desktopShaderProps]
  )

  const mergedMobileShaderProps = React.useMemo(
    () => ({
      ...defaultMobileShaderProps,
      ...mobileShaderProps,
      style: {
        ...(defaultMobileShaderProps.style as React.CSSProperties),
        ...(mobileShaderProps?.style as React.CSSProperties | undefined),
      },
    }),
    [mobileShaderProps]
  )

  const contextValue = React.useMemo<HeroStaticRadialGradientContextValue>(
    () => ({
      srTitle,
      title,
      subtitle,
      description,
      showCta,
      mergedCtaProps,
      renderCta,
      mergedDesktopShaderProps,
      mergedMobileShaderProps,
    }),
    [
      srTitle,
      title,
      subtitle,
      description,
      showCta,
      mergedCtaProps,
      renderCta,
      mergedDesktopShaderProps,
      mergedMobileShaderProps,
    ]
  )

  return (
    <HeroStaticRadialGradientContext.Provider value={contextValue}>
      <section
        className={cn("@container relative isolate w-full overflow-hidden rounded-[var(--radius-panel)] border border-border bg-card text-card-foreground shadow-[var(--shadow-sm)]", className)}
        aria-label={srTitle}
        data-slot="hero-static-radial-gradient-root"
        ref={ref}
        {...props}
      >
        {children}
      </section>
    </HeroStaticRadialGradientContext.Provider>
  )
})
HeroStaticRadialGradientRoot.displayName = "HeroStaticRadialGradientRoot"

export function HeroStaticRadialGradientContainer({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "relative z-10 grid min-h-80 items-center gap-8 p-6 @lg:p-10 @3xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] @3xl:gap-4",
        className
      )}
      data-slot="hero-static-radial-gradient-container"
      {...props}
    />
  )
}

export function HeroStaticRadialGradientContent({
  className,
  ...props
}: React.ComponentPropsWithoutRef<"div">) {
  return (
    <div
      className={cn(
        "relative z-10 flex min-w-0 flex-col justify-center gap-5",
        className
      )}
      data-slot="hero-static-radial-gradient-content"
      {...props}
    />
  )
}

export function HeroStaticRadialGradientHeading({
  className,
  title,
  subtitle,
  headingClassName,
  children,
  ...props
}: HeroStaticRadialGradientHeadingProps) {
  const context = useHeroStaticRadialGradientContext()
  const resolvedTitle = title ?? context.title
  const resolvedSubtitle = subtitle ?? context.subtitle

  return (
    <div
      className={cn("text-left", className)}
      data-slot="hero-static-radial-gradient-heading-wrap"
      {...props}
    >
      {children ?? (
        <div className="relative">
          <h1
            className={cn(
              "relative m-0 text-balance text-[clamp(1.9rem,5cqi,3.5rem)] leading-[1.08] font-semibold tracking-[-0.055em] text-foreground [overflow-wrap:anywhere]",
              headingClassName
            )}
            data-slot="hero-static-radial-gradient-heading"
          >
            {resolvedTitle}
            {resolvedSubtitle && <><br />{resolvedSubtitle}</>}
          </h1>
        </div>
      )}
    </div>
  )
}

export function HeroStaticRadialGradientDescription({
  className,
  description,
  descriptionClassName,
  children,
  ...props
}: HeroStaticRadialGradientDescriptionProps) {
  const context = useHeroStaticRadialGradientContext()
  const resolvedDescription = description ?? context.description

  return (
    <div
      className={cn(
        "max-w-[52ch] text-left",
        className
      )}
      data-slot="hero-static-radial-gradient-description-wrap"
      {...props}
    >
      {children ?? (
        <p
          className={cn(
            "m-0 text-sm leading-relaxed text-muted-foreground @lg:text-base",
            descriptionClassName
          )}
          data-slot="hero-static-radial-gradient-description"
        >
          {resolvedDescription}
        </p>
      )}
    </div>
  )
}

export function HeroStaticRadialGradientActions({
  className,
  showCta,
  ctaProps,
  renderCta,
  children,
  ...props
}: HeroStaticRadialGradientActionsProps) {
  const context = useHeroStaticRadialGradientContext()
  const shouldShowCta = showCta ?? context.showCta
  const resolvedCtaProps = { ...context.mergedCtaProps, ...ctaProps }
  const resolvedRenderCta = renderCta ?? context.renderCta

  if (!shouldShowCta) {
    return null
  }

  const defaultCta = <HeroStaticRadialGradientCTA {...resolvedCtaProps} />

  return (
    <div
      className={cn("flex flex-wrap items-center justify-start gap-3 pt-3", className)}
      data-slot="hero-static-radial-gradient-cta-wrap"
      {...props}
    >
      {children ??
        (resolvedRenderCta ? resolvedRenderCta(defaultCta) : defaultCta)}
    </div>
  )
}

export function HeroStaticRadialGradientCTA({
  label,
  href,
  target,
  rel,
  onClick,
  className,
  buttonClassName,
}: HeroStaticRadialGradientCTAProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-center gap-4 pb-4 md:pb-0",
        className
      )}
      data-slot="hero-static-radial-gradient-cta"
    >
      <a
        className={cn(buttonVariants({ size: "lg" }), buttonClassName)}
        href={href}
        onClick={onClick}
        rel={rel ?? (target === "_blank" ? "noopener noreferrer" : undefined)}
        target={target}
      >
        {label}
      </a>
    </div>
  )
}

export function HeroStaticRadialGradientVisual({
  className,
  desktopClassName,
  desktopShaderProps,
  ...props
}: HeroStaticRadialGradientVisualProps) {
  const context = useHeroStaticRadialGradientContext()
  const resolvedDesktopShaderProps = {
    ...context.mergedDesktopShaderProps,
    ...desktopShaderProps,
  }

  return (
    <div
      className={cn(
        "pointer-events-none relative hidden h-72 @3xl:block",
        className
      )}
      aria-hidden="true"
      data-slot="hero-static-radial-gradient-visual"
      {...props}
    >
      <div
        className={cn(
          "absolute -inset-8 overflow-hidden rounded-full bg-[radial-gradient(ellipse_at_center,var(--color-mint-dim),transparent_65%)] [mask-image:radial-gradient(ellipse_at_center,black_25%,transparent_70%)]",
          desktopClassName
        )}
        data-slot="hero-static-radial-gradient-desktop"
      >
        <SupportedStaticRadialGradient {...resolvedDesktopShaderProps} />
      </div>
    </div>
  )
}

export function HeroStaticRadialGradientMobileVisual({
  className,
  mobileShaderProps,
  ...props
}: HeroStaticRadialGradientMobileVisualProps) {
  const context = useHeroStaticRadialGradientContext()
  const resolvedMobileShaderProps = {
    ...context.mergedMobileShaderProps,
    ...mobileShaderProps,
    style: {
      ...(context.mergedMobileShaderProps.style as React.CSSProperties),
      ...(mobileShaderProps?.style as React.CSSProperties | undefined),
    },
  }

  return (
    <div
      className={cn(
        "pointer-events-none absolute -right-32 -bottom-44 z-0 h-96 w-96 overflow-hidden opacity-25 @3xl:hidden [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]",
        className
      )}
      aria-hidden="true"
      data-slot="hero-static-radial-gradient-mobile"
      {...props}
    >
      <SupportedStaticRadialGradient {...resolvedMobileShaderProps} />
    </div>
  )
}

export function HeroStaticRadialGradient({
  containerClassName,
  contentClassName,
  headingWrapClassName,
  headingClassName,
  descriptionWrapClassName,
  descriptionClassName,
  ctaWrapClassName,
  visualClassName,
  mobileVisualClassName,
  ...props
}: HeroStaticRadialGradientProps) {
  return (
    <HeroStaticRadialGradientRoot {...props}>
      <HeroStaticRadialGradientContainer className={containerClassName}>
        <HeroStaticRadialGradientContent className={contentClassName}>
          <HeroStaticRadialGradientHeading
            className={headingWrapClassName}
            headingClassName={headingClassName}
          />
          <HeroStaticRadialGradientDescription
            className={descriptionWrapClassName}
            descriptionClassName={descriptionClassName}
          />
          <HeroStaticRadialGradientActions className={ctaWrapClassName} />
        </HeroStaticRadialGradientContent>
        <HeroStaticRadialGradientVisual className={visualClassName} />
      </HeroStaticRadialGradientContainer>
      <HeroStaticRadialGradientMobileVisual className={mobileVisualClassName} />
    </HeroStaticRadialGradientRoot>
  )
}

export default HeroStaticRadialGradient
