import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabase } from "@/lib/supabase";
import { tryApproveIfEligible } from "@/lib/access";
import { sendPaymentFailureReport } from "@/lib/payment-report";
import { notifyPaymentReceived } from "@/lib/telegram-admin";

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
    } else if (event.type === "invoice.paid") {
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
    } else if (event.type === "invoice.payment_failed") {
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
    } else if (event.type === "customer.subscription.updated") {
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
    } else if (event.type === "customer.subscription.deleted") {
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
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
  const subscriptionId = typeof session.subscription === "string" ? session.subscription : session.subscription?.id;
  const subscription = subscriptionId ? await stripe.subscriptions.retrieve(subscriptionId) : null;
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
      stripe_subscription_id: subscriptionId ?? null,
      status: "paid",
      subscription_status: subscription?.status ?? null,
      next_payment_at: subscription?.items.data[0]?.current_period_end
        ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
        : null,
      amount_total: session.amount_total ?? null,
      currency: session.currency ?? null,
      paid_at: new Date().toISOString(),
    },
    { onConflict: "stripe_checkout_session_id" },
  );

  const { data: person } = await supabase
    .from("people")
    .select("email, telegram_username, telegram_user_id")
    .eq("id", personId)
    .maybeSingle();
  await notifyPaymentReceived(
    person?.email ?? (person?.telegram_username ? `@${person.telegram_username}` : personId.slice(0, 8)),
    Boolean(subscriptionId),
  );
  if (person?.telegram_user_id) {
    await tryApproveIfEligible(person.telegram_user_id);
  }
}

function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const subscription = invoice.parent?.subscription_details?.subscription;
  return typeof subscription === "string" ? subscription : subscription?.id ?? null;
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await supabase.from("purchases").update({
    status: "paid",
    subscription_status: subscription.status,
    next_payment_at: subscription.items.data[0]?.current_period_end
      ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
      : null,
    last_payment_failed_at: null,
    paid_at: new Date().toISOString(),
  }).eq("stripe_subscription_id", subscriptionId);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (subscriptionId) {
    await supabase.from("purchases").update({
      status: "past_due",
      last_payment_failed_at: new Date().toISOString(),
    }).eq("stripe_subscription_id", subscriptionId);
  }
  await sendPaymentFailureReport();
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  await supabase.from("purchases").update({
    status: subscription.status === "active" || subscription.status === "trialing" ? "paid" : subscription.status === "canceled" ? "canceled" : "past_due",
    subscription_status: subscription.status,
    next_payment_at: subscription.items.data[0]?.current_period_end
      ? new Date(subscription.items.data[0].current_period_end * 1000).toISOString()
      : null,
  }).eq("stripe_subscription_id", subscription.id);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  await supabase.from("purchases").update({
    status: "canceled",
    subscription_status: subscription.status,
    next_payment_at: null,
  }).eq("stripe_subscription_id", subscription.id);
}
