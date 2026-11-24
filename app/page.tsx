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

      <div className="relative z-10 mx-auto grid max-w-7xl gap-8 px-6 pb-16 pt-20 sm:gap-12 sm:pt-28 lg:grid-cols-2 lg:items-start lg:gap-16 lg:px-10 lg:pb-24 lg:pt-28">
        <Reveal delay={0} className="order-1 flex justify-center lg:order-2 lg:mt-12 lg:justify-end">
          <HeroVideo src={process.env.NEXT_PUBLIC_HERO_VIDEO_URL} />
        </Reveal>

        <div className="order-2 text-left lg:order-1">
          <Reveal delay={80}>
            <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-gold-light">
              Curso + Grupo VIP en un solo pago
            </span>
          </Reveal>

          <Reveal delay={140}>
            <h1 className="mt-6 text-4xl font-bold tracking-tight text-white sm:text-6xl lg:text-5xl">
              Conviértete en un trader consistente
            </h1>
          </Reveal>
          <Reveal delay={200}>
            <div className="mt-5 max-w-xl text-lg text-white/70">
              <p className="font-medium text-white/85">¿Qué incluye tu acceso?</p>
              <ul className="mt-3 space-y-3 lg:grid lg:grid-cols-2 lg:gap-3 lg:space-y-0 lg:text-base">
                <li className="lg:rounded-xl lg:border lg:border-white/10 lg:bg-white/4 lg:p-4 lg:text-sm lg:leading-relaxed">• Grupo VIP: mis análisis y las zonas exactas donde voy a operar cada día en Oro, Nasdaq y Dow Jones, además de información sobre acciones que puede que compre.</li>
                <li className="lg:rounded-xl lg:border lg:border-white/10 lg:bg-white/4 lg:p-4 lg:text-sm lg:leading-relaxed">• 2 reuniones VIP al mes: para revisar operativa, contexto de mercado y resolver dudas.</li>
                <li className="lg:rounded-xl lg:border lg:border-white/10 lg:bg-white/4 lg:p-4 lg:text-sm lg:leading-relaxed">• Clases en vivo “De Cero a Trader”: participas directamente en las clases del mes en el que entras al grupo.</li>
                <li className="lg:rounded-xl lg:border lg:border-white/10 lg:bg-white/4 lg:p-4 lg:text-sm lg:leading-relaxed">• Biblioteca “De Cero a Trader” (actualización constante): acceso a todas las clases grabadas y ordenadas paso a paso, explicadas de forma tan clara que lo entiende hasta un niño.</li>
              </ul>
            </div>
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
              🔥 Un Solo Pago 🔥
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
