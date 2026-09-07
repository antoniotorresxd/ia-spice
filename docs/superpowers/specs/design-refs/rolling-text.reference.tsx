// Source: https://21st.dev/@hyperiux/components/rolling-text
// install: npx shadcn@latest add "https://21st.dev/r/hyperiux/rolling-text"
// GSAP-based, deterministic PRNG per-character "slot machine" reveal. Theme-aware, respects
// prefers-reduced-motion. Good candidate for headline/hero text and section titles.

"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";

gsap.registerPlugin(useGSAP);

const FONT_FAMILY = "Helvetica Neue, Arial Narrow, system-ui, sans-serif";

interface RollingTextProps {
  text?: string;
  textColor?: string;
  minCycles?: number;
  cycleVariance?: number;
  duration?: number;
  durationVariance?: number;
}

const mulberry32 = (seed: number) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

type Reel = { copies: number; to: number; duration: number };
type ReelConfig = { minCycles: number; cycleVariance: number; duration: number; durationVariance: number };

const buildReel = (charIndex: number, config: ReelConfig): Reel => {
  const rand = mulberry32(charIndex * 1013 + 7);
  const cycles = config.minCycles + Math.floor(rand() * config.cycleVariance);
  return { copies: cycles + 1, to: cycles, duration: config.duration + rand() * config.durationVariance };
};

const RollingText = ({
  text = "HYPERIUX",
  textColor,
  minCycles = 3,
  cycleVariance = 3,
  duration = 2.4,
  durationVariance = 1.2,
}: RollingTextProps) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const reels = gsap.utils.toArray<HTMLElement>("[data-reel]", containerRef.current);

      if (reduced) {
        reels.forEach((reel) => reel.style.setProperty("--k", reel.dataset.to ?? "0"));
        const heading = containerRef.current?.querySelector("h3");
        if (heading) gsap.fromTo(heading, { opacity: 0 }, { opacity: 1, duration: 0.6, ease: "power1.out" });
        return;
      }

      reels.forEach((reel) => {
        const to = Number(reel.dataset.to);
        const scroll = { k: 0 };
        reel.style.setProperty("--k", "0");
        gsap.to(scroll, {
          k: to,
          duration: Number(reel.dataset.duration),
          ease: "expo.out",
          onUpdate: () => reel.style.setProperty("--k", String(scroll.k)),
        });
      });
    },
    { scope: containerRef, dependencies: [minCycles, cycleVariance, duration, durationVariance] },
  );

  return (
    <div ref={containerRef} className="relative grid place-items-center min-h-dvh bg-background">
      <h3
        aria-label={text}
        style={{ ...(textColor ? { color: textColor } : {}), fontFamily: FONT_FAMILY }}
        className={`relative z-10 m-0 text-9xl max-[1025px]:text-6xl max-md:text-5xl font-light! leading-[0.8]! tracking-[0.02em] whitespace-nowrap select-none ${textColor ? "" : "text-foreground"}`}
      >
        {text.split("").map((char, charIndex) => {
          if (char === " ") return <span key={charIndex} className="inline-block" aria-hidden>&nbsp;</span>;

          const reel = buildReel(charIndex, { minCycles, cycleVariance, duration, durationVariance });

          return (
            <span key={charIndex} className="relative inline-block align-top" aria-hidden>
              <span className="block invisible">{char}</span>
              <span className="absolute inset-0 overflow-hidden">
                <span
                  data-reel=""
                  data-to={reel.to}
                  data-duration={reel.duration}
                  className="block will-change-transform [transform:translate3d(0,calc(-1em*0.8*var(--k,0)),0)]"
                >
                  {Array.from({ length: reel.copies }, (_, copy) => (
                    <span key={copy} className="block w-full h-[0.8em] text-center">{char}</span>
                  ))}
                </span>
              </span>
            </span>
          );
        })}
      </h3>
    </div>
  );
};

export default RollingText;
