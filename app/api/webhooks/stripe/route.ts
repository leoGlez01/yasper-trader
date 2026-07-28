import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabase } from "@/lib/supabase";
import { tryApproveIfEligible } from "@/lib/access";

const DUPLICATE_KEY = "23505";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature ?? "", process.env.STRIPE_WEBHOOK_SECRET!);
  } catch (error) {
    console.error("Firma de webhook de Stripe inválida", error);
    return NextResponse.json({ error: "firma inválida" }, { status: 400 });
  }

  // Stripe entrega eventos al menos una vez y reintenta ante timeouts — este
  // guardia de idempotencia evita reprocesar el mismo evento dos veces.
  const { error: dedupeError } = await supabase
    .from("stripe_webhook_events")
    .insert({ id: event.id, type: event.type });
  if (dedupeError) {
    if (dedupeError.code === DUPLICATE_KEY) return NextResponse.json({ ok: true });
    console.error("No se pudo registrar el evento de Stripe", dedupeError);
    return NextResponse.json({ error: "error interno" }, { status: 500 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
    }
  } catch (error) {
    console.error(`Error procesando evento de Stripe ${event.type}`, error);
    return NextResponse.json({ error: "error interno" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const personId = session.client_reference_id;
  if (!personId) return;

  const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
  await supabase
    .from("people")
    .update({
      ...(session.customer_details?.email ? { email: session.customer_details.email } : {}),
      ...(customerId ? { stripe_customer_id: customerId } : {}),
    })
    .eq("id", personId);

  await supabase.from("purchases").upsert(
    {
      person_id: personId,
      stripe_checkout_session_id: session.id,
      stripe_payment_intent_id:
        typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent?.id,
      status: "paid",
      amount_total: session.amount_total ?? null,
      currency: session.currency ?? null,
      paid_at: new Date().toISOString(),
    },
    { onConflict: "stripe_checkout_session_id" },
  );

  const { data: person } = await supabase
    .from("people")
    .select("telegram_user_id")
    .eq("id", personId)
    .maybeSingle();
  if (person?.telegram_user_id) {
    await tryApproveIfEligible(person.telegram_user_id);
  }
}
