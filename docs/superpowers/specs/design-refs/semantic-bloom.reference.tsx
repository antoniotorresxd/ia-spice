// Source: https://21st.dev/@mengto/components/semantic-bloom
// install: npx shadcn@latest add "https://21st.dev/r/mengto/semantic-bloom"
// NOTE: renders an entire self-contained HTML/canvas mini-app inside a sandboxed <iframe> via
// srcDoc (semanticExplorerSource is a big string template, omitted here — proprietary/heavy).
// The technique is the takeaway: a particle "organism" that swarms toward and illuminates
// wordmark text, theme-aware (dark/light), pauses via IntersectionObserver + visibilitychange.
// Good inspiration for an animated app/brand wordmark, NOT something to literally copy in.

import {
  useCallback, useEffect, useMemo, useRef, useState, type CSSProperties,
} from "react";

export type SemanticBloomProps = {
  text?: string;
  mode?: "dark" | "light";
  size?: number;
  opacity?: number;
  className?: string;
  style?: CSSProperties;
};

export const SEMANTIC_BLOOM_DEFAULTS = { text: "Codex", mode: "dark" as const, size: 1, opacity: 1 };

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

// buildFocusedDocument(mode) returns an HTML string (surface/text/particle/connection colors
// swapped per theme) that gets fed into the iframe's srcDoc. Omitted: semanticExplorerSource.

export function SemanticBloom({
  text = SEMANTIC_BLOOM_DEFAULTS.text,
  mode = SEMANTIC_BLOOM_DEFAULTS.mode,
  size = SEMANTIC_BLOOM_DEFAULTS.size,
  opacity = SEMANTIC_BLOOM_DEFAULTS.opacity,
  className = "",
  style,
}: SemanticBloomProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [hostVisible, setHostVisible] = useState(true);
  const [documentVisible, setDocumentVisible] = useState(() => typeof document === "undefined" || !document.hidden);
  const safeMode = mode === "light" ? "light" : "dark";
  const paused = !hostVisible || !documentVisible;

  const postControls = useCallback(() => {
    iframeRef.current?.contentWindow?.postMessage(
      { type: "semantic-bloom-controls", controls: { text: text.trim() || SEMANTIC_BLOOM_DEFAULTS.text, size: clamp(size, 0.55, 1.6), paused } },
      "*",
    );
  }, [paused, size, text]);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe || typeof IntersectionObserver === "undefined") return undefined;
    const observer = new IntersectionObserver(([entry]) => setHostVisible(entry?.isIntersecting ?? true));
    observer.observe(iframe);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return undefined;
    const update = () => setDocumentVisible(!document.hidden);
    document.addEventListener("visibilitychange", update);
    return () => document.removeEventListener("visibilitychange", update);
  }, []);

  useEffect(() => { postControls(); }, [postControls]);

  return (
    <div
      className={`threeui-background semantic-bloom semantic-bloom--${safeMode}${className ? ` ${className}` : ""}`}
      style={{ background: safeMode === "light" ? "#f4f4f2" : "#030303", pointerEvents: "auto", ...style }}
    >
      <iframe
        ref={iframeRef}
        title={`Semantic Bloom: ${text.trim() || SEMANTIC_BLOOM_DEFAULTS.text}`}
        sandbox="allow-scripts"
        onLoad={postControls}
        style={{ position: "absolute", inset: 0, display: "block", width: "100%", height: "100%", border: 0, background: "transparent", opacity: clamp(opacity, 0.1, 1) }}
      />
    </div>
  );
}

export default SemanticBloom;
