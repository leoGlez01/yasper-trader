import Link from "next/link";

export default function CommunityCheckoutCancelPage() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-16 text-center">
      <h1 className="text-3xl font-bold text-gold-light">Suscripción no completada</h1>
      <p className="mt-4 text-foreground/70">
        No se confirmó ningún pago. Puedes volver a intentarlo cuando quieras.
      </p>
      <div className="mt-8">
        <Link href="/comunidad" className="text-gold hover:text-gold-light">
          Volver a la membresía
        </Link>
      </div>
    </section>
  );
}
