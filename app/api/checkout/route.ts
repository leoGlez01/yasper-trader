import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabase } from "@/lib/supabase";
import { generateLinkToken } from "@/lib/tokens";

const MAX_EMAIL_LENGTH = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const email = value.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH) return null;
  if (/\s/.test(email) || !EMAIL_PATTERN.test(email)) return null;
  return email;
}

// `link_tokens.person_id` tiene FK a `people`, así que el token va primero.
async function discardPerson(personId: string): Promise<void> {
  const { error: tokenError } = await supabase.from("link_tokens").delete().eq("person_id", personId);
  if (tokenError) console.error("No se pudo borrar el link_token huérfano", tokenError);
  const { error: personError } = await supabase.from("people").delete().eq("id", personId);
  if (personError) console.error("No se pudo borrar la persona huérfana", personError);
}

export async function POST(req: Request) {
  const priceId = process.env.STRIPE_PRICE_ID;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!priceId || !siteUrl) {
    return NextResponse.json({ error: "El producto no está configurado" }, { status: 500 });
  }

  // El correo se pide ANTES de redirigir a Stripe. Si solo se recogiera tras
  // `checkout.session.completed`, todo comprador que abandona el pago quedaría
  // como una persona sin identificar en `people`, imposible de distinguir de un
  // cliente real en /pendientes.
  const email = normalizeEmail((await req.json().catch(() => null))?.email);
  if (!email) {
    return NextResponse.json(
      { error: "Necesitamos un correo válido para enviarte el acceso a Telegram" },
      { status: 400 },
    );
  }

  let price;
  try {
    price = await stripe.prices.retrieve(priceId);
  } catch (error) {
    console.error("No se pudo obtener el precio de Stripe", error);
    return NextResponse.json({ error: "El precio de Stripe no es válido" }, { status: 500 });
  }

  const { data: person, error: personError } = await supabase
    .from("people")
    .insert({ email })
    .select("id")
    .single();
  if (personError || !person) {
    console.error("No se pudo crear el registro de persona", personError);
    return NextResponse.json({ error: "No se pudo iniciar la compra" }, { status: 500 });
  }

  // Desde aquí la persona ya existe en la base: cualquier fallo posterior tiene
  // que deshacerla o cada intento fallido deja una persona fantasma inflando
  // /pendientes para siempre.
  const { error: tokenError } = await supabase
    .from("link_tokens")
    .insert({ token: generateLinkToken(), person_id: person.id });
  if (tokenError) {
    console.error("No se pudo generar el link_token", tokenError);
    await discardPerson(person.id);
    return NextResponse.json({ error: "No se pudo iniciar la compra" }, { status: 500 });
  }

  let session;
  try {
    const mode = price.type === "recurring" ? "subscription" : "payment";
    session = await stripe.checkout.sessions.create({
      mode,
      managed_payments: { enabled: false },
      line_items: [{ price: priceId, quantity: 1 }],
      client_reference_id: person.id,
      // Prefill en la página de Stripe: el comprador no lo vuelve a escribir.
      customer_email: email,
      ...(mode === "payment" ? { customer_creation: "always" as const } : {}),
      success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/checkout/cancel`,
    });
  } catch (error) {
    console.error("Stripe rechazó la creación de la sesión de checkout", error);
    await discardPerson(person.id);
    return NextResponse.json({ error: "Stripe todavía no está configurado" }, { status: 500 });
  }

  if (!session.url) {
    await discardPerson(person.id);
    return NextResponse.json({ error: "No se pudo crear la sesión de pago" }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
