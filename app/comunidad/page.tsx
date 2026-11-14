import { CheckoutButton } from "@/components/CheckoutButton";
import { Reveal } from "@/components/Reveal";
import { formatPrice } from "@/lib/pricing";

export default async function CommunityPage() {
  const price = await formatPrice(process.env.STRIPE_MONTHLY_PRICE_ID);

  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <Reveal>
        <div className="rounded-3xl border border-panel-border bg-panel p-8 sm:p-12">
          <div className="text-center">
            <span className="inline-flex rounded-full bg-gold/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-gold">
              Membresía independiente
            </span>
            <h1 className="mt-5 text-3xl font-bold text-gold-light sm:text-4xl">
              Comunidad privada mensual
            </h1>
            <p className="mx-auto mt-4 max-w-xl text-foreground/70">
              Suscríbete para acceder al nuevo grupo privado de Telegram. El acceso se mantiene
              mientras tu suscripción esté al día.
            </p>
          </div>

          <div className="mt-10 rounded-2xl border border-panel-border bg-background/50 p-6 text-center">
            <p className="text-3xl font-bold text-gold-light">{price ?? "Ver precio al pagar"}</p>
            <p className="mt-1 text-xs text-foreground/50">Suscripción recurrente mensual</p>
            <div className="mt-6 flex justify-center">
              <CheckoutButton endpoint="/api/checkout/community">Suscribirme</CheckoutButton>
            </div>
            <p className="mt-4 text-xs text-foreground/50">
              El pago se procesa de forma segura en Stripe. Tras pagar, conecta tu Telegram desde el
              bot nuevo para recibir el acceso.
            </p>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
