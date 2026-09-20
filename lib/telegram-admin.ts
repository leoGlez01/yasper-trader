import { supabase } from "./supabase";
import { sendMessage, type TelegramMessage } from "./telegram";

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
  return person.email || (person.telegram_username ? `@${person.telegram_username}` : person.id.slice(0, 8));
}

export async function notifyPaymentReceived(name: string, recurring: boolean): Promise<void> {
  const chatId = clientChatId();
  if (!chatId) return;
  try {
    await sendMessage(
      chatId,
      `💳 <b>Pago recibido</b>\nCliente: ${name}\nTipo: ${recurring ? "suscripción mensual" : "pago"}\nClase: ⏳ pendiente`,
    );
  } catch (error) {
    console.error("No se pudo avisar al cliente sobre el pago", error);
  }
}

async function loadCustomers() {
  const [{ data: people, error: peopleError }, { data: purchases, error: purchasesError }] = await Promise.all([
    supabase.from("people").select("id, email, telegram_username, class_completed_at, class_completed_by").order("created_at", { ascending: true }),
    supabase.from("purchases").select("person_id, status, next_payment_at, created_at").order("created_at", { ascending: false }),
  ]);
  if (peopleError) throw peopleError;
  if (purchasesError) throw purchasesError;

  const latestPurchase = new Map<string, Purchase>();
  for (const purchase of (purchases ?? []) as Purchase[]) {
    if (!latestPurchase.has(purchase.person_id)) latestPurchase.set(purchase.person_id, purchase);
  }

  return ((people ?? []) as Person[]).map((person) => ({
    person,
    purchase: latestPurchase.get(person.id) ?? null,
    paid: latestPurchase.has(person.id) && isPaid(latestPurchase.get(person.id)!),
  }));
}

function formatCustomer(customer: Awaited<ReturnType<typeof loadCustomers>>[number], index: number): string {
  const classStatus = customer.person.class_completed_at ? "✅ clase impartida" : "⏳ clase pendiente";
  return `${index}. ${displayName(customer.person)} — ${classStatus}`;
}

export async function handleAdminCommand(message: TelegramMessage): Promise<boolean> {
  const authorizedChatId = clientChatId();
  if (!authorizedChatId || String(message.chat.id) !== authorizedChatId || !message.text) return false;

  const [rawCommand, argument] = message.text.trim().split(/\s+/, 2);
  const command = rawCommand.toLowerCase().split("@")[0];
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
    await sendMessage(message.chat.id, `<b>Resumen</b>\nPagados y vigentes: ${paid.length}\nPendientes o vencidos: ${pending.length}\nClase impartida: ${paid.filter((customer) => customer.person.class_completed_at).length}\nClase pendiente: ${paid.filter((customer) => !customer.person.class_completed_at).length}`);
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

  return false;
}