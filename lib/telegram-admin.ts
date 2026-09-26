import { supabase } from "./supabase";
import { escapeHtml, sendMessage, type TelegramMessage } from "./telegram";

type Person = {
  id: string;
  email: string | null;
  telegram_username: string | null;
  class_completed_at: string | null;
  class_completed_by: number | null;
};

type Purchase = {
  person_id: string;
  status: string;
  next_payment_at: string | null;
  created_at: string;
};

function clientChatId(): string | null {
  return process.env.TELEGRAM_CLIENT_CHAT_ID?.trim() || null;
}

function isPaid(purchase: Purchase): boolean {
  return purchase.status === "paid" &&
    (!purchase.next_payment_at || new Date(purchase.next_payment_at) > new Date());
}

function displayName(person: Person): string {
  const name = person.email || (person.telegram_username ? `@${person.telegram_username}` : person.id.slice(0, 8));
  return escapeHtml(name);
}

export async function notifyPaymentReceived(name: string, recurring: boolean): Promise<void> {
  const chatId = clientChatId();
  if (!chatId) return;
  try {
    await sendMessage(
      chatId,
      `💳 <b>Pago recibido</b>\nCliente: ${escapeHtml(name)}\nTipo: ${recurring ? "suscripción mensual" : "pago"}\nClase: ⏳ pendiente`,
    );
  } catch (error) {
    console.error("No se pudo avisar al cliente sobre el pago", error);
  }
}

export type Customer = {
  person: Person;
  paid: boolean;
  purchases: number;
  classCompletedAt: string | null;
};

export async function loadCustomers(): Promise<Customer[]> {
  const [{ data: people, error: peopleError }, { data: purchases, error: purchasesError }] = await Promise.all([
    supabase.from("people").select("id, email, telegram_username, class_completed_at, class_completed_by").order("created_at", { ascending: true }),
    supabase.from("purchases").select("person_id, status, next_payment_at, created_at").order("created_at", { ascending: false }),
  ]);
  if (peopleError) throw peopleError;
  if (purchasesError) throw purchasesError;

  const latestPurchase = new Map<string, Purchase>();
  const purchaseCount = new Map<string, number>();
  for (const purchase of (purchases ?? []) as Purchase[]) {
    if (!latestPurchase.has(purchase.person_id)) latestPurchase.set(purchase.person_id, purchase);
    purchaseCount.set(purchase.person_id, (purchaseCount.get(purchase.person_id) ?? 0) + 1);
  }

  // Dos reglas de negocio que la base por sí sola no resuelve:
  //
  // 1. `people` se inserta al *iniciar* el checkout (app/api/checkout/route.ts)
  //    y `purchases` solo al completarlo. Sin fila en `purchases` el carrito
  //    quedó abandonado: no es un cliente pendiente y no se lista.
  // 2. Cada intento de compra crea una fila nueva en `people`, así que un
  //    cliente que compró varias veces aparece como N personas distintas. Se
  //    agrupan por email normalizado (con caída a @username y luego al id).
  const groups = new Map<string, Customer>();
  for (const person of (people ?? []) as Person[]) {
    const purchase = latestPurchase.get(person.id);
    if (!purchase) continue;

    const key = person.email?.trim().toLowerCase()
      || (person.telegram_username ? `@${person.telegram_username.toLowerCase()}` : person.id);
    const nowPaid = isPaid(purchase);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        person,
        paid: nowPaid,
        purchases: purchaseCount.get(person.id) ?? 1,
        classCompletedAt: person.class_completed_at,
      });
      continue;
    }

    existing.purchases += purchaseCount.get(person.id) ?? 1;
    // La fila representativa debe ser la que concede acceso: si el grupo tiene
    // alguna compra vigente, /marcar_clase tiene que caer sobre esa fila y no
    // sobre una cancelada, o el cliente perdería el grupo de Telegram.
    if (nowPaid && !existing.paid) {
      existing.paid = true;
      existing.person = person;
    }
    // La clase se impartió una sola vez: se conserva la fecha real más temprana.
    const classAt = person.class_completed_at;
    if (classAt && (!existing.classCompletedAt || classAt < existing.classCompletedAt)) {
      existing.classCompletedAt = classAt;
    }
  }

  return [...groups.values()];
}

export function formatCustomer(customer: Customer, index: number): string {
  const classStatus = customer.classCompletedAt ? "✅ clase impartida" : "⏳ clase pendiente";
  const repeated = customer.purchases > 1 ? ` (${customer.purchases} compras)` : "";
  return `${index}. ${displayName(customer.person)} — ${classStatus}${repeated}`;
}

const ADMIN_COMMANDS = ["/pagados", "/pendientes", "/resumen", "/marcar_clase"] as const;

export async function handleAdminCommand(message: TelegramMessage): Promise<boolean> {
  const authorizedChatId = clientChatId();
  if (!authorizedChatId || String(message.chat.id) !== authorizedChatId || !message.text) return false;

  const [rawCommand, argument] = message.text.trim().split(/\s+/, 2);
  const command = rawCommand.toLowerCase().split("@")[0];

  // Se valida el comando antes de tocar la base: un typo no debe costar dos
  // lecturas completas de `people` + `purchases`, y siempre debe responder algo
  // (el silencio en Telegram es imposible de depurar).
  if (!(ADMIN_COMMANDS as readonly string[]).includes(command)) {
    await sendMessage(message.chat.id, `Comando desconocido: ${escapeHtml(command)}\nDisponibles: ${ADMIN_COMMANDS.join(", ")}`);
    return true;
  }

  const customers = await loadCustomers();
  const paid = customers.filter((customer) => customer.paid);
  const pending = customers.filter((customer) => !customer.paid);

  if (command === "/pagados") {
    await sendMessage(message.chat.id, paid.length ? `<b>Pagados (${paid.length})</b>\n${paid.map((customer, index) => formatCustomer(customer, index + 1)).join("\n")}` : "No hay clientes pagados.");
    return true;
  }

  if (command === "/pendientes") {
    await sendMessage(message.chat.id, pending.length ? `<b>Pendientes (${pending.length})</b>\n${pending.map((customer, index) => formatCustomer(customer, index + 1)).join("\n")}` : "No hay pagos pendientes.");
    return true;
  }

  if (command === "/resumen") {
    await sendMessage(message.chat.id, `<b>Resumen</b>\nPagados y vigentes: ${paid.length}\nPendientes o vencidos: ${pending.length}\nClase impartida: ${paid.filter((customer) => customer.classCompletedAt).length}\nClase pendiente: ${paid.filter((customer) => !customer.classCompletedAt).length}`);
    return true;
  }

  if (command === "/marcar_clase") {
    const index = Number(argument);
    const customer = Number.isInteger(index) && index > 0 ? paid[index - 1] : undefined;
    if (!customer) {
      await sendMessage(message.chat.id, "Uso: /marcar_clase <numero de /pagados>");
      return true;
    }

    const { error } = await supabase.from("people").update({
      class_completed_at: new Date().toISOString(),
      class_completed_by: message.from.id,
    }).eq("id", customer.person.id);
    if (error) throw error;
    await sendMessage(message.chat.id, `✅ Clase marcada para ${displayName(customer.person)}.`);
    return true;
  }

  return true;
}