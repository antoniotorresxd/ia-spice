// Source: https://21st.dev/@chowlol202/components/globe-hero
// install: npx shadcn@latest add "https://21st.dev/r/chowlol202/globe-hero"
// React Three Fiber wireframe sphere behind a headline. Full-screen hero pattern: badge pill
// (ping dot + uppercase label) -> two-line headline (light weight lead-in + bold gradient
// bg-clip-text word + animated underline sweep) -> supporting paragraph -> two CTA buttons
// (solid gradient primary w/ sheen sweep on hover, outline secondary). Uses framer-motion for
// staggered entrance. This demo composition (badge/headline/CTA layout) is reusable even without
// the 3D globe mesh.

"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { PerspectiveCamera } from "@react-three/drei";
import React, { useRef } from "react";
import * as THREE from "three";
import { cn } from "@/lib/utils";

interface DotGlobeHeroProps {
  rotationSpeed?: number;
  globeRadius?: number;
  className?: string;
  children?: React.ReactNode;
}

const Globe: React.FC<{ rotationSpeed: number; radius: number }> = ({ rotationSpeed, radius }) => {
  const groupRef = useRef<THREE.Group>(null!);
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.rotation.y += rotationSpeed;
      groupRef.current.rotation.x += rotationSpeed * 0.3;
      groupRef.current.rotation.z += rotationSpeed * 0.1;
    }
  });
  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[radius, 64, 64]} />
        <meshBasicMaterial color="hsl(var(--foreground))" transparent opacity={0.15} wireframe />
      </mesh>
    </group>
  );
};

export const DotGlobeHero = React.forwardRef<HTMLDivElement, DotGlobeHeroProps>(
  ({ rotationSpeed = 0.005, globeRadius = 1, className, children, ...props }, ref) => (
    <div ref={ref} className={cn("relative w-full h-screen bg-background overflow-hidden", className)} {...props}>
      <div className="relative z-10 flex flex-col items-center justify-center h-full">{children}</div>
      <div className="absolute inset-0 z-0 pointer-events-none">
        <Canvas>
          <PerspectiveCamera makeDefault position={[0, 0, 3]} fov={75} />
          <ambientLight intensity={0.5} />
          <pointLight position={[10, 10, 10]} intensity={1} />
          <Globe rotationSpeed={rotationSpeed} radius={globeRadius} />
        </Canvas>
      </div>
    </div>
  ),
);
DotGlobeHero.displayName = "DotGlobeHero";

// ---- demo composition worth reusing (badge / headline / CTA layout) ----
// <div badge pill> ping dot + "GLOBAL NETWORK" label + ping dot </div>
// <h1> "Connect" (light, muted, smaller) / "the World" (bold gradient bg-clip-text, blurred
//   duplicate behind for glow, animated underline bar sweeping in width: 0 -> 100%) </h1>
// <p> supporting copy, one phrase highlighted with a soft pill background </p>
// <div CTAs> primary: gradient bg, hover sheen sweep (translateX -100% -> 100%), scale+shadow
//   on hover; secondary: outline, backdrop-blur, icon rotates+scales on hover </div>
// All staggered in with framer-motion initial/animate + delay increments.
