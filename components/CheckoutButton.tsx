"use client";

import { useEffect, useRef, useState } from "react";

const DEFAULT_CLASSES =
  "inline-flex items-center justify-center rounded-full bg-gold px-8 py-3.5 font-semibold text-black transition hover:bg-gold-light disabled:opacity-60";

const INPUT_CLASSES =
  "w-full rounded-full border border-panel-border bg-background px-4 py-2.5 text-sm text-white placeholder:text-foreground/40 focus:border-gold focus:outline-none disabled:opacity-60";

// Espejo de la validación del servidor (app/api/checkout/route.ts). El servidor
// sigue siendo la autoridad: esto solo evita un viaje de ida y vuelta.
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function CheckoutButton({
  children,
  className,
  menuAlign = "left",
}: {
  children: React.ReactNode;
  className?: string;
  // Por qué no "centrado": centrar el popover sobre el botón lo empuja fuera de
  // la pantalla cuando el botón está cerca de un borde, que es justo el caso del
  // hero (columna de texto a la izquierda) en móvil. Alineado a la izquierda
  // siempre cae dentro del viewport; el navbar usa "right" por estar al borde
  // derecho.
  menuAlign?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = email.trim();
    if (!EMAIL_PATTERN.test(trimmed)) {
      setError("Escribe un correo válido para continuar.");
      return;
    }

    setError(null);
    setLoading(true);
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = await response.json();
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "No se pudo iniciar el pago");
      }
      window.location.href = data.url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar el pago");
      setLoading(false);
    }
  }

  return (
    <div className="relative inline-block" ref={rootRef}>
      {!open ? (
        <button type="button" onClick={() => setOpen(true)} className={className ?? DEFAULT_CLASSES}>
          {children}
        </button>
      ) : (
        <form
          onSubmit={handleSubmit}
          className={`absolute top-full z-50 mt-2 flex w-72 flex-col gap-2 rounded-2xl border border-panel-border bg-panel p-3 shadow-xl sm:w-80 ${
            menuAlign === "right" ? "right-0" : "left-0"
          } max-w-[calc(100vw-2rem)]`}
        >
          <input
            ref={inputRef}
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="tucorreo@ejemplo.com"
            disabled={loading}
            aria-label="Correo electrónico"
            className={INPUT_CLASSES}
          />
          <button type="submit" disabled={loading} className={`${className ?? DEFAULT_CLASSES} w-full !py-2.5 text-sm`}>
            {loading ? "Redirigiendo..." : "Continuar al pago"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-xs text-foreground/50 transition hover:text-foreground/80"
          >
            Cancelar
          </button>
          {error && <p className="text-sm text-red-400">{error}</p>}
        </form>
      )}
    </div>
  );
}
