import { Reveal } from "@/components/Reveal";
import { ChartBackground } from "@/components/ChartBackground";
import { HeroVideo } from "@/components/HeroVideo";
import { CheckoutButton } from "@/components/CheckoutButton";
import { formatPrice } from "@/lib/pricing";

const BENEFITS = [
  "Zonas donde opero todos los días.",
  "Análisis de activos: Oro, Nasdaq y Dow Jones.",
  "Reuniones 2 veces al mes.",
  "Temas: psicología, índices, experiencias del grupo.",
  "Soporte y clases desde cero.",
  "Todas las reuniones y análisis hechos anteriormente, para estudio.",
];

export default async function HomePage() {
  const price = await formatPrice(process.env.STRIPE_PRICE_ID);

  return (
    <div>
      <Hero />
      <OfferSection price={price} />
    </div>
  );
}

function Hero() {
  return (
    // Sin `overflow-hidden`: el popover de correo del botón "Comprar ahora" es
    // hijo de esta sección y quedaba recortado. `ChartBackground` ya recorta su
    // propio contenido, así que el gráfico sigue sin desbordar.
    <section className="relative isolate">
      <ChartBackground />

      <div className="relative z-10 mx-auto grid max-w-5xl gap-8 px-6 pb-16 pt-20 sm:gap-12 sm:pt-28 lg:grid-cols-2 lg:items-center lg:gap-16 lg:pb-20 lg:pt-40">
        <Reveal delay={0} className="order-1 flex justify-center lg:order-2 lg:justify-end">
          <HeroVideo src={process.env.NEXT_PUBLIC_HERO_VIDEO_URL} />
        </Reveal>

        <div className="order-2 text-left lg:order-1">
          <Reveal delay={80}>
            <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-gold-light">
              Curso + Grupo VIP en un solo pago
            </span>
          </Reveal>

          <Reveal delay={140}>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-6xl">
              Conviértete en un trader consistente
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <p className="mt-5 max-w-xl text-lg text-white/70">
              Aprende a operar Oro, Nasdaq y Dow Jones directamente conmigo, y entra de una vez al
              grupo VIP donde comparto análisis.
            </p>
          </Reveal>

          <Reveal delay={260}>
            <div className="mt-10">
              <CheckoutButton className="inline-flex items-center justify-center rounded-full bg-gold px-8 py-3.5 font-semibold text-black transition hover:bg-gold-light">
                Comprar ahora
              </CheckoutButton>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}

function OfferSection({ price }: { price: string | null }) {
  return (
    <section className="mx-auto max-w-3xl px-6 py-20">
      <Reveal>
        <div className="rounded-3xl border border-panel-border bg-panel p-8 sm:p-12">
          <div className="text-center">
            <span className="inline-flex items-center gap-2 rounded-full bg-gold/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-gold">
              🔥 Dos clases 1 a 1 conmigo 🔥
            </span>
            <h2 className="mt-5 text-3xl font-bold text-gold-light sm:text-4xl">Curso Cero a Trader</h2>
            <p className="mt-3 text-foreground/70">
              Incluye acceso a la comunidad VIP —{" "}
              <span className="font-semibold text-bull">6 meses gratis</span>.
            </p>
          </div>

          <ul className="mt-10 divide-y divide-panel-border">
            {BENEFITS.map((benefit, i) => (
              <li key={benefit} className="flex items-center gap-4 py-3">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/50 text-sm font-semibold text-gold">
                  {i + 1}
                </span>
                <span className="text-foreground/85">{benefit}</span>
              </li>
            ))}
          </ul>

          <div className="mt-10 text-center">
            <p className="text-3xl font-bold text-gold-light">{price ?? "Ver precio al pagar"}</p>
            <p className="mt-1 text-xs text-foreground/50">Pago único · acceso a los dos grupos de Telegram</p>
            <div className="mt-6 flex justify-center">
              <CheckoutButton>Comprar ahora</CheckoutButton>
            </div>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
