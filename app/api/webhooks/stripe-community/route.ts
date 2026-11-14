import { NextRequest, NextResponse } from "next/server";
import type Stripe from "stripe";
import { stripe } from "@/lib/stripe";
import { supabase } from "@/lib/supabase";
import {
  hasCommunityAccess,
  tryApproveCommunityIfEligible,
  type CommunitySubscription,
} from "@/lib/community-access";
import { sendCommunityAccessLink } from "@/lib/community-notifications";

const DUPLICATE_KEY = "23505";
const COMMUNITY_FLOW = "community_telegram_v1";

export async function POST(request: NextRequest) {
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  const webhookSecret = process.env.STRIPE_COMMUNITY_WEBHOOK_SECRET;
  if (!webhookSecret) {
    console.error("Falta STRIPE_COMMUNITY_WEBHOOK_SECRET");
    return NextResponse.json({ error: "webhook no configurado" }, { status: 500 });
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature ?? "", webhookSecret);
  } catch (error) {
    console.error("Firma del webhook de la comunidad inválida", error);
    return NextResponse.json({ error: "firma inválida" }, { status: 400 });
  }

  const { error: dedupeError } = await supabase
    .from("community_stripe_webhook_events")
    .insert({ id: event.id, type: event.type });
  if (dedupeError) {
    if (dedupeError.code === DUPLICATE_KEY) return NextResponse.json({ ok: true });
    console.error("No se pudo registrar el evento Stripe de la comunidad", dedupeError);
    return NextResponse.json({ error: "error interno" }, { status: 500 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
    } else if (event.type === "invoice.paid") {
      await handleInvoicePaid(event.data.object as Stripe.Invoice);
    } else if (event.type === "invoice.payment_failed") {
      await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice, event.created);
    } else if (event.type === "customer.subscription.updated") {
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, event.created);
    } else if (event.type === "customer.subscription.paused" || event.type === "customer.subscription.resumed") {
      await handleSubscriptionUpdated(event.data.object as Stripe.Subscription, event.created);
    } else if (event.type === "customer.subscription.deleted") {
      await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
    }
  } catch (error) {
    console.error(`Error procesando evento Stripe de la comunidad ${event.type}`, error);
    await supabase.from("community_stripe_webhook_events").delete().eq("id", event.id);
    return NextResponse.json({ error: "error interno" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  if (session.metadata?.product_flow !== COMMUNITY_FLOW || session.mode !== "subscription") return;
  const subscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id;
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const personId = requiredPersonId(subscription);
  if (session.client_reference_id !== personId || session.metadata.person_id !== personId) {
    throw new Error(`La sesión ${session.id} no coincide con la persona de la suscripción`);
  }
  const previousAccess = await hadAccess(personId);
  await saveSubscription(subscription, personId, session.id);
  if (hasCommunityAccess([toCommunitySubscription(subscription, personId)])) {
    await tryApproveForPerson(personId);
  }
  if (!previousAccess && hasCommunityAccess([toCommunitySubscription(subscription, personId)])) {
    await sendCommunityAccessLink(personId);
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
  if (subscription.metadata.product_flow !== COMMUNITY_FLOW) return;

  const personId = requiredPersonId(subscription);
  const previousAccess = await hadAccess(personId);
  await saveSubscription(subscription, personId, undefined, { clearFailure: true });
  await tryApproveForPerson(personId);
  if (!previousAccess) await sendCommunityAccessLink(personId);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice, eventCreatedAt: number) {
  const subscriptionId = invoiceSubscriptionId(invoice);
  if (!subscriptionId) return;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (subscription.metadata.product_flow !== COMMUNITY_FLOW) return;
  if (["active", "trialing", "canceled", "paused"].includes(subscription.status)) return;
  await saveSubscription(subscription, requiredPersonId(subscription), undefined, {
    status: "past_due",
    lastPaymentFailedAt: new Date(eventCreatedAt * 1000).toISOString(),
  });
}

async function handleSubscriptionUpdated(subscription: Stripe.Subscription, eventCreatedAt: number) {
  if (subscription.metadata.product_flow !== COMMUNITY_FLOW) return;
  const currentSubscription = await stripe.subscriptions.retrieve(subscription.id);
  if (currentSubscription.metadata.product_flow !== COMMUNITY_FLOW) return;
  const personId = requiredPersonId(currentSubscription);
  const previousAccess = await hadAccess(personId);
  const saved = await saveSubscription(
    currentSubscription,
    personId,
    undefined,
    currentSubscription.status === "past_due" || currentSubscription.status === "unpaid"
      ? { lastPaymentFailedAt: new Date(eventCreatedAt * 1000).toISOString() }
      : {},
  );
  if (hasCommunityAccess([saved])) {
    await tryApproveForPerson(personId);
    if (!previousAccess) await sendCommunityAccessLink(personId);
  }
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  if (subscription.metadata.product_flow !== COMMUNITY_FLOW) return;
  const currentSubscription = await stripe.subscriptions.retrieve(subscription.id);
  if (currentSubscription.metadata.product_flow !== COMMUNITY_FLOW) return;
  await saveSubscription(currentSubscription, requiredPersonId(currentSubscription));
}

function requiredPersonId(subscription: Stripe.Subscription): string {
  const personId = subscription.metadata.person_id;
  if (!personId) throw new Error(`La suscripción ${subscription.id} no tiene person_id`);
  return personId;
}

function toCommunitySubscription(
  subscription: Stripe.Subscription,
  personId: string,
): CommunitySubscription {
  return {
    person_id: personId,
    stripe_subscription_id: subscription.id,
    status: subscription.status,
    livemode: subscription.livemode,
    current_period_end: periodEnd(subscription),
    last_payment_failed_at: null,
  };
}

function periodEnd(subscription: Stripe.Subscription): string | null {
  const timestamp = subscription.items.data[0]?.current_period_end;
  return timestamp ? new Date(timestamp * 1000).toISOString() : null;
}

async function hadAccess(personId: string | undefined): Promise<boolean> {
  if (!personId) return false;
  const { data, error } = await supabase
    .from("community_subscriptions")
    .select("person_id, stripe_subscription_id, status, livemode, current_period_end, last_payment_failed_at")
    .eq("person_id", personId);
  if (error) throw error;
  return hasCommunityAccess((data ?? []) as CommunitySubscription[]);
}

async function saveSubscription(
  subscription: Stripe.Subscription,
  personId: string,
  checkoutSessionId?: string,
  options: { status?: string; clearFailure?: boolean; lastPaymentFailedAt?: string } = {},
): Promise<CommunitySubscription> {
  const priceId = subscription.items.data[0]?.price.id;
  if (!priceId) throw new Error(`La suscripción ${subscription.id} no tiene precio`);
  if (!process.env.STRIPE_MONTHLY_PRICE_ID || priceId !== process.env.STRIPE_MONTHLY_PRICE_ID) {
    throw new Error(`La suscripción ${subscription.id} no usa el precio mensual configurado`);
  }

  const { data: existing, error: existingError } = await supabase
    .from("community_subscriptions")
    .select("status, last_payment_failed_at, stripe_checkout_session_id")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();
  if (existingError) throw existingError;

  const status = options.status ?? subscription.status;
  const delinquent = status === "past_due" || status === "unpaid";
  let lastPaymentFailedAt: string | null;
  if (options.clearFailure || status === "active" || status === "trialing") {
    lastPaymentFailedAt = null;
  } else if (
    (existing?.status === "past_due" || existing?.status === "unpaid")
    && existing.last_payment_failed_at
  ) {
    lastPaymentFailedAt = existing.last_payment_failed_at;
  } else {
    lastPaymentFailedAt = options.lastPaymentFailedAt
      ?? existing?.last_payment_failed_at
      ?? (delinquent ? new Date().toISOString() : null);
  }
  const customerId = typeof subscription.customer === "string"
    ? subscription.customer
    : subscription.customer.id;
  const record = {
    person_id: personId,
    stripe_subscription_id: subscription.id,
    stripe_checkout_session_id: checkoutSessionId ?? existing?.stripe_checkout_session_id ?? null,
    stripe_customer_id: customerId,
    stripe_price_id: priceId,
    status,
    livemode: subscription.livemode,
    current_period_end: periodEnd(subscription),
    last_payment_failed_at: lastPaymentFailedAt,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase
    .from("community_subscriptions")
    .upsert(record, { onConflict: "stripe_subscription_id" });
  if (error) throw error;

  return {
    person_id: personId,
    stripe_subscription_id: subscription.id,
    status,
    livemode: subscription.livemode,
    current_period_end: record.current_period_end,
    last_payment_failed_at: lastPaymentFailedAt,
  };
}

async function tryApproveForPerson(personId: string): Promise<void> {
  const { data: person, error } = await supabase
    .from("people")
    .select("telegram_user_id")
    .eq("id", personId)
    .maybeSingle();
  if (error) throw error;
  if (person?.telegram_user_id) await tryApproveCommunityIfEligible(person.telegram_user_id);
}
