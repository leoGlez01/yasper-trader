// Reenvía un checkout.session.completed real al webhook de producción con firma
// válida, para que se ejecute el código real del handler (actualizar persona,
// registrar compra, avisar al cliente, reevaluar elegibilidad) en vez de
// escribir filas a mano por la API de Supabase.
//
// Uso: npx tsx scripts/replay-stripe-event.ts <session_id>
import crypto from "node:crypto";
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

const SECRET_HEADER = "stripe-signature";

async function main() {
  const sessionId = process.argv[2];
  if (!sessionId) throw new Error("Uso: npx tsx scripts/replay-stripe-event.ts <session_id>");

  const { stripe } = await import("../lib/stripe");
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
  if (!webhookSecret) throw new Error("Falta STRIPE_WEBHOOK_SECRET");
  if (!siteUrl) throw new Error("Falta NEXT_PUBLIC_SITE_URL");

  const session = await stripe.checkout.sessions.retrieve(sessionId);
  if (!session.client_reference_id) {
    console.log(`La sesión ${sessionId} no tiene client_reference_id: no se puede atribuir a ninguna persona.`);
    return;
  }
  console.log(`Sesion  : ${session.id}`);
  console.log(`Persona : ${session.client_reference_id}`);
  console.log(`Email   : ${session.customer_details?.email ?? "(null)"}`);
  console.log(`Importe : ${session.amount_total} ${session.currency}`);

  const event = {
    id: `evt_replay_${session.id}`,
    object: "event",
    api_version: "2026-09-01",
    created: Math.floor(Date.now() / 1000),
    livemode: true,
    type: "checkout.session.completed",
    pending_webhooks: 1,
    request: { id: null, idempotency_key: null },
    data: { object: session },
  };

  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac("sha256", webhookSecret)
    .update(`${timestamp}.${payload}`)
    .digest("hex");

  const target = `${siteUrl.replace(/\/+$/, "")}/api/webhooks/stripe`;
  console.log(`\nEnviando a ${target} ...`);
  const response = await fetch(target, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      [SECRET_HEADER]: `t=${timestamp},v1=${signature}`,
    },
    body: payload,
  });
  console.log(`Respuesta: ${response.status} ${await response.text()}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
