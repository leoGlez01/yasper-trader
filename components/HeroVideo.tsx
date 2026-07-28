"use client";

import { useEffect, useRef, useState } from "react";

export function HeroVideo({ src }: { src?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(false);

  // Intenta reproducir con sonido. La mayoría de navegadores bloquean el
  // autoplay con audio la primera vez que alguien visita el sitio — si eso
  // pasa, reintenta silenciado (siempre permitido) para que el video nunca
  // se quede pausado esperando un clic.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !src) return;

    video.muted = false;
    setMuted(false);

    const playPromise = video.play();
    if (playPromise) {
      playPromise.catch(() => {
        video.muted = true;
        setMuted(true);
        video.play().catch(() => {});
      });
    }
  }, [src]);

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setMuted(video.muted);
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl border border-white/10 bg-black shadow-2xl shadow-black/50">
      {src ? (
        <video
          ref={videoRef}
          src={src}
          loop
          playsInline
          poster="/brand/yasper-isotipo.jpg"
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-white/40">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.2} className="h-10 w-10">
            <path d="M15 10l4.55-2.28A1 1 0 0121 8.62v6.76a1 1 0 01-1.45.9L15 14M5 6h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2z" />
          </svg>
          <p className="text-sm">Video próximamente</p>
        </div>
      )}

      {src && (
        <button
          type="button"
          aria-label={muted ? "Activar sonido" : "Silenciar"}
          onClick={toggleMute}
          className="absolute bottom-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-black/60 text-white backdrop-blur transition hover:bg-black/80"
        >
          {muted ? (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
              <path d="M11 5 6 9H3v6h3l5 4V5z" />
              <path d="M16 9l5 6M21 9l-5 6" />
            </svg>
          ) : (
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.75} className="h-5 w-5">
              <path d="M11 5 6 9H3v6h3l5 4V5z" />
              <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 6a9 9 0 0 1 0 12" />
            </svg>
          )}
        </button>
      )}
    </div>
  );
}
