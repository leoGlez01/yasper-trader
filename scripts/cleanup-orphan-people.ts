// Limpia las personas que dejó app/api/checkout/route.ts cuando la creación de
// la sesión de Stripe fallaba: quedaban filas sin email, sin telegram_user_id y
// sin stripe_customer_id, imposibles de identificar y que inflaban /pendientes.
//
// Ejecutar en modo simulación (solo informa):
//   npm run cleanup:orphans
// Ejecutar de verdad (borra):
//   npm run cleanup:orphans -- --confirm
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

type Person = {
  id: string;
  email: string | null;
  telegram_user_id: number | null;
  stripe_customer_id: string | null;
  created_at: string;
};

async function main() {
  const confirm = process.argv.includes("--confirm");
  const { supabase } = await import("../lib/supabase");
  const { stripe } = await import("../lib/stripe");

  const [{ data: people, error: peopleError }, { data: purchases, error: purchasesError }] = await Promise.all([
    supabase.from("people").select("id, email, telegram_user_id, stripe_customer_id, created_at").order("created_at", { ascending: true }),
    supabase.from("purchases").select("person_id"),
  ]);
  if (peopleError) throw peopleError;
  if (purchasesError) throw purchasesError;

  // Una sesión de Stripe `open` todavía puede pagarse. Si se borrara su persona,
  // al completarse el pago el `person_id` quedaría colgando y el registro de la
  // compra fallaría por FK. Esas personas se conservan siempre.
  const openSessions = await stripe.checkout.sessions.list({ status: "open", limit: 100 });
  const withOpenSession = new Set(
    openSessions.data.map((session) => session.client_reference_id).filter((id): id is string => Boolean(id)),
  );
  if (withOpenSession.size) {
    console.log(`Personas con sesion de Stripe abierta (se conservan): ${withOpenSession.size}`);
  }

  const withPurchase = new Set((purchases ?? []).map((purchase) => purchase.person_id));

  // Criterio conservadora: se borra solo lo que no aporta nada. Cualquier persona
  // con compra, con email, con Telegram vinculado, con customer de Stripe o con
  // una sesión abierta se conserva, porque es un cliente real o un pago posible.
  const orphans = ((people ?? []) as Person[]).filter(
    (person) =>
      !withPurchase.has(person.id) &&
      !withOpenSession.has(person.id) &&
      !person.email &&
      person.telegram_user_id === null &&
      person.stripe_customer_id === null,
  );

  console.log(`Personas totales          : ${(people ?? []).length}`);
  console.log(`Con compra                : ${withPurchase.size}`);
  console.log(`Huérfanas a eliminar      : ${orphans.length}`);
  console.log(`Se conservan              : ${(people ?? []).length - orphans.length}`);

  if (!orphans.length) {
    console.log("\nNo hay nada que limpiar.");
    return;
  }

  for (const orphan of orphans) {
    console.log(`  - ${orphan.id}  creado ${orphan.created_at}`);
  }

  if (!confirm) {
    console.log("\nSimulación: no se borró nada. Reejecuta con --confirm para aplicar.");
    return;
  }

  const ids = orphans.map((orphan) => orphan.id);
  // El token va primero: link_tokens.person_id tiene FK a people.
  const { error: tokenDeleteError } = await supabase.from("link_tokens").delete().in("person_id", ids);
  if (tokenDeleteError) throw tokenDeleteError;
  const { error: peopleDeleteError } = await supabase.from("people").delete().in("id", ids);
  if (peopleDeleteError) throw peopleDeleteError;

  console.log(`\nEliminadas ${ids.length} personas huérfanas y sus link_tokens.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
