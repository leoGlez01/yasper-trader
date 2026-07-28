import { stripe } from "@/lib/stripe";
import { supabase } from "@/lib/supabase";

export default async function CheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id } = await searchParams;
  const botUsername = process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME;

  const deepLink = session_id ? await getDeepLink(session_id, botUsername) : null;

  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold text-gold-light">¡Pago confirmado! 🎉</h1>
      <p className="mt-4 text-foreground/70">
        Solo falta un paso para desbloquear tu acceso al grupo de Telegram.
      </p>

      <div className="mt-10 rounded-2xl border border-panel-border bg-panel p-8 space-y-6">
        <Step
          number={1}
          title="Conecta tu Telegram"
          description="Toca el botón para abrir un chat privado con nuestro bot — así sabremos que fuiste tú quien pagó."
        >
          {deepLink ? (
            <a
              href={deepLink}
              className="inline-flex items-center justify-center rounded-lg bg-gold px-6 py-3 font-semibold text-black transition hover:bg-gold-light"
            >
              Conectar mi Telegram
            </a>
          ) : (
            <p className="text-sm text-red-400">
              No pudimos generar tu enlace. Contáctanos con el correo que usaste para pagar.
            </p>
          )}
        </Step>

        <Step
          number={2}
          title="Solicita unirte a los dos grupos"
          description="El bot te enviará los enlaces del grupo del Curso y del grupo VIP. Ábrelos y toca &quot;Solicitar unirse&quot; en cada uno — te aprobaremos automáticamente en cuanto confirmemos tu pago."
        />
      </div>
    </section>
  );
}

async function getDeepLink(sessionId: string, botUsername: string | undefined): Promise<string | null> {
  if (!botUsername) return null;
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    const personId = session.client_reference_id;
    if (!personId) return null;

    const { data: linkToken } = await supabase
      .from("link_tokens")
      .select("token")
      .eq("person_id", personId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!linkToken) return null;
    return `https://t.me/${botUsername}?start=${linkToken.token}`;
  } catch (error) {
    console.error("No se pudo generar el deep link de Telegram", error);
    return null;
  }
}

function Step({
  number,
  title,
  description,
  children,
}: {
  number: number;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex gap-4">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gold font-bold text-black">
        {number}
      </div>
      <div>
        <h2 className="font-semibold text-gold-light">{title}</h2>
        <p className="mt-1 text-sm text-foreground/70">{description}</p>
        {children && <div className="mt-4">{children}</div>}
      </div>
    </div>
  );
}
