"use client";

import { useState } from "react";

const DEFAULT_CLASSES =
  "inline-flex items-center justify-center rounded-full bg-gold px-8 py-3.5 font-semibold text-black transition hover:bg-gold-light disabled:opacity-60";

export function CheckoutButton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/checkout", { method: "POST" });
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
    <div>
      <button onClick={handleClick} disabled={loading} className={className ?? DEFAULT_CLASSES}>
        {loading ? "Redirigiendo..." : children}
      </button>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
