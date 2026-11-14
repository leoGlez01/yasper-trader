import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabase } from "@/lib/supabase";
import { generateLinkToken } from "@/lib/tokens";

const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const COMMUNITY_FLOW = "community_telegram_v1";

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH || /\s/.test(email) || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

export async function POST(request: Request) {
  const priceId = process.env.STRIPE_MONTHLY_PRICE_ID;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!priceId || !siteUrl) {
    return NextResponse.json({ error: "La membresía mensual no está configurada" }, { status: 500 });
  }

  const email = normalizeEmail((await request.json().catch(() => null))?.email);
  if (!email) {
    return NextResponse.json({ error: "Necesitamos un correo válido para continuar" }, { status: 400 });
  }

  let price;
  try {
    price = await stripe.prices.retrieve(priceId);
  } catch (error) {
    console.error("No se pudo obtener el precio mensual de Stripe", error);
    return NextResponse.json({ error: "El precio mensual de Stripe no es válido" }, { status: 500 });
  }
  if (price.type !== "recurring" || price.recurring?.interval !== "month" || price.recurring.interval_count !== 1) {
    return NextResponse.json({ error: "STRIPE_MONTHLY_PRICE_ID debe ser un precio mensual recurrente" }, { status: 500 });
  }

  const { data: existingPerson, error: personLookupError } = await supabase
    .from("people")
    .select("id")
    .ilike("email", email.replace(/[\\%_]/g, "\\$&"))
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (personLookupError) {
    console.error("No se pudo buscar la persona para la membresía", personLookupError);
    return NextResponse.json({ error: "No se pudo iniciar la suscripción" }, { status: 500 });
  }

  let personId = existingPerson?.id;
  let createdPerson = false;
  if (personId) {
    const { data: existingSubscriptions, error } = await supabase
      .from("community_subscriptions")
      .select("status")
      .eq("person_id", personId)
      .in("status", ["active", "trialing", "past_due", "unpaid"]);
    if (error) {
      console.error("No se pudo comprobar la suscripción mensual existente", error);
      return NextResponse.json({ error: "No se pudo iniciar la suscripción" }, { status: 500 });
    }
    if (existingSubscriptions?.length) {
      return NextResponse.json(
        { error: "Ya existe una suscripción activa o con un pago pendiente para este correo." },
        { status: 409 },
      );
    }
  } else {
    const { data: person, error } = await supabase
      .from("people")
      .insert({ email })
      .select("id")
      .single();
    if (error || !person) {
      console.error("No se pudo crear la persona para la membresía", error);
      return NextResponse.json({ error: "No se pudo iniciar la suscripción" }, { status: 500 });
    }
    personId = person.id;
    createdPerson = true;
  }

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: "subscription",
      managed_payments: { enabled: false },
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: personId,
      customer_email: email,
      metadata: { product_flow: COMMUNITY_FLOW, person_id: personId },
      subscription_data: { metadata: { product_flow: COMMUNITY_FLOW, person_id: personId } },
      success_url: `${siteUrl}/comunidad/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/comunidad/checkout/cancel`,
    });
  } catch (error) {
    console.error("Stripe rechazó la creación de la suscripción de la comunidad", error);
    await discardNewPerson(personId, createdPerson);
    return NextResponse.json({ error: "No se pudo iniciar el pago con Stripe" }, { status: 500 });
  }

  if (!session.url) {
    await discardNewPerson(personId, createdPerson);
    return NextResponse.json({ error: "Stripe no devolvió el enlace de pago" }, { status: 500 });
  }

  const { error: tokenError } = await supabase.from("community_link_tokens").insert({
    token: generateLinkToken(),
    person_id: personId,
    stripe_checkout_session_id: session.id,
  });
  if (tokenError) {
    console.error("No se pudo crear el enlace de vinculación de Telegram", tokenError);
    await stripe.checkout.sessions.expire(session.id);
    await discardNewPerson(personId, createdPerson);
    return NextResponse.json({ error: "No se pudo preparar la vinculación con Telegram" }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}

async function discardNewPerson(personId: string, createdPerson: boolean): Promise<void> {
  if (!createdPerson) return;
  const { error } = await supabase.from("people").delete().eq("id", personId);
  if (error) console.error("No se pudo borrar la persona creada para el checkout fallido", error);
}
