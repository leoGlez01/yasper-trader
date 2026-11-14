import { stripe } from "@/lib/stripe";
import { supabase } from "@/lib/supabase";

export default async function CommunityCheckoutSuccessPage({
  searchParams,
}: {
  searchParams: Promise<{ session_id?: string }>;
}) {
  const { session_id: sessionId } = await searchParams;
  const deepLink = sessionId ? await getCommunityDeepLink(sessionId) : null;

  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold text-gold-light">¡Gracias por suscribirte! 🎉</h1>
      <p className="mt-4 text-foreground/70">
        Conecta Telegram con el bot nuevo para recibir el enlace del grupo privado.
      </p>

      <div className="mt-10 rounded-2xl border border-panel-border bg-panel p-8">
        {deepLink ? (
          <a
            href={deepLink}
            className="inline-flex items-center justify-center rounded-lg bg-gold px-6 py-3 font-semibold text-black transition hover:bg-gold-light"
          >
            Conectar mi Telegram
          </a>
        ) : (
          <p className="text-sm text-red-400">
            No pudimos generar tu enlace. Comprueba el pago y contáctanos con el correo usado en Stripe.
          </p>
        )}
        <p className="mt-4 text-sm text-foreground/70">
          Una vez conectado, el bot te enviará un enlace para solicitar unirte. El acceso se aprueba
          únicamente mientras tu suscripción esté vigente.
        </p>
      </div>
    </section>
  );
}

async function getCommunityDeepLink(sessionId: string): Promise<string | null> {
  const botUsername = process.env.COMMUNITY_TELEGRAM_BOT_USERNAME;
  if (!botUsername) return null;

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);
    if (
      session.mode !== "subscription"
      || session.metadata?.product_flow !== "community_telegram_v1"
      || !session.client_reference_id
      || (session.payment_status !== "paid" && session.payment_status !== "no_payment_required")
    ) {
      return null;
    }

    const { data: linkToken, error } = await supabase
      .from("community_link_tokens")
      .select("token")
      .eq("stripe_checkout_session_id", sessionId)
      .eq("person_id", session.client_reference_id)
      .maybeSingle();
    if (error) throw error;
    if (!linkToken) return null;
    return `https://t.me/${botUsername}?start=${linkToken.token}`;
  } catch (error) {
    console.error("No se pudo generar el enlace de Telegram de la membresía", error);
    return null;
  }
}
