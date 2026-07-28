import Link from "next/link";

export default function CheckoutCancelPage() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="text-3xl font-bold text-gold-light">Pago cancelado</h1>
      <p className="mt-4 text-foreground/70">
        No se realizó ningún cargo. Puedes intentarlo de nuevo cuando quieras.
      </p>
      <div className="mt-8 flex justify-center">
        <Link href="/" className="text-gold hover:text-gold-light">Volver al inicio</Link>
      </div>
    </section>
  );
}
