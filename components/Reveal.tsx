"use client";

import { useEffect, useRef, useState } from "react";

// Animación de scroll minimalista y propia (sin librerías): cada bloque se
// desliza y aparece la primera vez que entra al viewport. Respeta
// prefers-reduced-motion dejando solo el fade, sin desplazamiento.
export function Reveal({
  children,
  delay = 0,
  className = "",
}: {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [animationReady, setAnimationReady] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setAnimationReady(true);
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: visible ? `${delay}ms` : "0ms" }}
      className={`transition-all duration-700 ease-out motion-reduce:transition-opacity motion-reduce:duration-300 ${
        visible || !animationReady
          ? "opacity-100 translate-y-0"
          : "opacity-0 translate-y-8 motion-reduce:translate-y-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}
