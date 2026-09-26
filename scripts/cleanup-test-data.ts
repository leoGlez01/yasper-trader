// Deja la base limpia para probar el flujo de compra de cero, sin tocar pagos
// reales.
//
// Borra las compras cuyo session de Stripe empieza por `cs_test_` (modo prueba:
// no mueven dinero real) y las personas que se quedan sin ninguna compra real.
// Para borrar también los pagos reales hay que pasar `--include-live`.
//
// Simulación (solo informa):
//   npm run cleanup:test
// Aplicar:
//   npm run cleanup:test -- --confirm
// Borrar tambien los pagos reales:
//   npm run cleanup:test -- --confirm --include-live
import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

type Person = {
  id: string;
  email: string | null;
  telegram_user_id: number | null;
  telegram_username: string | null;
  stripe_customer_id: string | null;
};

type Purchase = {
  person_id: string;
  status: string;
  stripe_checkout_session_id: string | null;
};

type LinkToken = { person_id: string };
type JoinRequest = { id: string; telegram_user_id: number; chat_id: number; status: string };

// Sesiones `cs_test_` son del modo de pruebas de Stripe: no se movió dinero real.
function isTestPurchase(purchase: Purchase): boolean {
  return purchase.stripe_checkout_session_id?.startsWith("cs_test_") ?? false;
}

async function main() {
  const args = process.argv.slice(2);
  const confirm = args.includes("--confirm");
  const includeLive = args.includes("--include-live");

  const { supabase } = await import("../lib/supabase");
  const { stripe } = await import("../lib/stripe");

  const [people, purchases, tokens, joinRequests] = await Promise.all([
    supabase.from("people").select("id, email, telegram_user_id, telegram_username, stripe_customer_id"),
    supabase.from("purchases").select("person_id, status, stripe_checkout_session_id"),
    supabase.from("link_tokens").select("person_id"),
    supabase.from("telegram_join_requests").select("id, telegram_user_id, chat_id, status"),
  ]);
  for (const result of [people, purchases, tokens, joinRequests]) {
    if (result.error) throw result.error;
  }

  const allPeople = (people.data ?? []) as Person[];
  const allPurchases = (purchases.data ?? []) as Purchase[];

  // Persona protegida = tiene al menos un pago real (sesion `cs_live_`).
  const withLivePurchase = new Set(
    allPurchases.filter((purchase) => !isTestPurchase(purchase)).map((purchase) => purchase.person_id),
  );

  const doomedPeople = includeLive
    ? allPeople
    : allPeople.filter((person) => !withLivePurchase.has(person.id));
  const doomedIds = new Set(doomedPeople.map((person) => person.id));
  const doomedPurchases = allPurchases.filter((purchase) => doomedIds.has(purchase.person_id));
  const doomedTokens = ((tokens.data ?? []) as LinkToken[]).filter((token) => doomedIds.has(token.person_id));
  // `telegram_join_requests` no tiene `person_id`: se enlaza por `telegram_user_id`.
  const doomedTelegramIds = new Set(
    doomedPeople.map((person) => person.telegram_user_id).filter((id): id is number => id !== null),
  );
  const doomedRequests = ((joinRequests.data ?? []) as JoinRequest[]).filter((request) =>
    doomedTelegramIds.has(request.telegram_user_id),
  );

  const keptPeople = allPeople.filter((person) => !doomedIds.has(person.id));
  const keptPurchases = allPurchases.filter((purchase) => !doomedIds.has(purchase.person_id));

  console.log(`Personas totales          : ${allPeople.length}`);
  console.log(`Pagos reales (cs_live_)   : ${allPurchases.filter((p) => !isTestPurchase(p)).length}`);
  console.log(`Pagos de prueba (cs_test_): ${allPurchases.filter(isTestPurchase).length}`);
  console.log(`\nA ELIMINAR  -> ${doomedPeople.length} personas, ${doomedPurchases.length} compras, ` +
    `${doomedTokens.length} link_tokens, ${doomedRequests.length} solicitudes`);
  for (const person of doomedPeople) {
    const purchasesOf = doomedPurchases.filter((purchase) => purchase.person_id === person.id);
    console.log(
      `  - ${person.id.slice(0, 8)}  email=${person.email ?? "(null)"}  ` +
        `@${person.telegram_username ?? "-"}  compras=${purchasesOf.length} ` +
        `[${purchasesOf.map((p) => p.stripe_checkout_session_id?.slice(0, 14) ?? "?").join(", ")}]`,
    );
  }

  console.log(`\nA CONSERVAR -> ${keptPeople.length} personas, ${keptPurchases.length} compras`);
  for (const purchase of keptPurchases) {
    const person = keptPeople.find((candidate) => candidate.id === purchase.person_id);
    console.log(
      `  = ${purchase.person_id.slice(0, 8)}  email=${person?.email ?? "(null)"}  ` +
        `sesion=${purchase.stripe_checkout_session_id}`,
    );
  }

  // Una sesion `open` que pertenece a una persona a borrar no debe quedar viva:
  // si se pagara despues, el person_id ya no existiria y el registro de la compra
  // fallaria por FK. Se expira antes de borrar.
  const openSessions = await stripe.checkout.sessions.list({ status: "open", limit: 100 });
  const openToExpire = openSessions.data.filter(
    (session) => session.client_reference_id && doomedIds.has(session.client_reference_id),
  );
  for (const session of openToExpire) {
    console.log(`\nExpirando sesion abierta ${session.id} (persona ${session.client_reference_id?.slice(0, 8)})`);
    if (confirm) await stripe.checkout.sessions.expire(session.id);
  }

  const orphanRequests = ((joinRequests.data ?? []) as JoinRequest[]).filter(
    (request) => !allPeople.some((person) => person.telegram_user_id === request.telegram_user_id),
  );
  if (orphanRequests.length) {
    console.log(
      `\nAviso: ${orphanRequests.length} solicitud(es) de union sin persona vinculada ` +
        `(no se borran, no se pueden identificar): ` +
        orphanRequests.map((request) => `tg:${request.telegram_user_id}`).join(", "),
    );
  }

  if (!confirm) {
    console.log("\nSimulacion: no se borro nada.");
    if (!includeLive && doomedPeople.length) {
      console.log("Los pagos reales (cs_live_) se conservan. Usa --include-live para borrarlos tambien.");
    }
    return;
  }

  if (!doomedIds.size) {
    console.log("\nNo hay nada que borrar.");
    return;
  }

  // Orden por FK: link_tokens y purchases apuntan a people.
  const ids = [...doomedIds];
  for (const [table, column] of [
    ["link_tokens", "person_id"],
    ["purchases", "person_id"],
    ["people", "id"],
  ] as const) {
    const { error } = await supabase.from(table).delete().in(column, ids);
    if (error) throw error;
    console.log(`  borrado: ${table}`);
  }
  if (doomedTelegramIds.size) {
    const { error } = await supabase
      .from("telegram_join_requests")
      .delete()
      .in("telegram_user_id", [...doomedTelegramIds]);
    if (error) throw error;
    console.log(`  borrado: telegram_join_requests (${doomedTelegramIds.size} usuarios)`);
  }

  console.log(`\nBase limpia: quedan ${keptPeople.length} personas y ${keptPurchases.length} compras.`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
