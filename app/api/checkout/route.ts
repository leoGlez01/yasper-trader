import { NextResponse } from "next/server";
import { stripe } from "@/lib/stripe";
import { supabase } from "@/lib/supabase";
import { generateLinkToken } from "@/lib/tokens";

export async function POST() {
  const priceId = process.env.STRIPE_PRICE_ID;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!priceId || !siteUrl) {
    return NextResponse.json({ error: "El producto no está configurado" }, { status: 500 });
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
    .insert({})
    .select("id")
    .single();
  if (personError || !person) {
    console.error("No se pudo crear el registro de persona", personError);
    return NextResponse.json({ error: "No se pudo iniciar la compra" }, { status: 500 });
  }

  const { error: tokenError } = await supabase.from("link_tokens").insert({
    token: generateLinkToken(),
    person_id: person.id,
  });
  if (tokenError) {
    console.error("No se pudo generar el link_token", tokenError);
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
      ...(mode === "payment" ? { customer_creation: "always" as const } : {}),
      success_url: `${siteUrl}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${siteUrl}/checkout/cancel`,
    });
  } catch (error) {
    console.error("Stripe rechazó la creación de la sesión de checkout", error);
    return NextResponse.json({ error: "Stripe todavía no está configurado" }, { status: 500 });
  }

  if (!session.url) {
    return NextResponse.json({ error: "No se pudo crear la sesión de pago" }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
