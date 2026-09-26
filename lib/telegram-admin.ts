import { supabase } from "./supabase";
import { isTestSession } from "./stripe";
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
  amount_total: number | null;
  currency: string | null;
  stripe_subscription_id: string | null;
  stripe_checkout_session_id: string | null;
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
  // Importes ya cobrados en dinero real, indexados por moneda en unidad mínima
  // (centavos). Vacío cuando ningún evento trajo `amount_total`: se distingue de
  // "cobró 0". Las compras `cs_test_` ya fueron filtradas y nunca llegan aquí.
  paidAmounts: Record<string, number>;
  subscriber: boolean;
  lastPurchaseAt: string | null;
  // Un mismo cliente puede tener varias filas en `people` y el Telegram atado solo
  // a una de ellas. Se guarda el username de cualquiera del grupo: si no, el
  // detalle informaría "sin Telegram" de alguien que sí lo tiene vinculado.
  telegramUsername: string | null;
};

export async function loadCustomers(): Promise<Customer[]> {
  const [{ data: people, error: peopleError }, { data: purchases, error: purchasesError }] = await Promise.all([
    supabase.from("people").select("id, email, telegram_username, class_completed_at, class_completed_by").order("created_at", { ascending: true }),
    supabase
      .from("purchases")
      .select("person_id, status, next_payment_at, created_at, amount_total, currency, stripe_subscription_id, stripe_checkout_session_id")
      .order("created_at", { ascending: false }),
  ]);
  if (peopleError) throw peopleError;
  if (purchasesError) throw purchasesError;

  // Se agrega por persona antes de agrupar por cliente: una fila de `people` puede
  // tener varias compras y el detalle del /resumen necesita el acumulado.
  //
  // Las compras `cs_test_` se descartan AQUÍ, en el punto de lectura, para que no
  // contaminen ningún cálculo aguas abajo: ni conteos, ni ingresos, ni
  // suscripciones, ni aparición en la lista. Una persona que solo pagó en modo
  // prueba deja de existir como cliente y no sale en /pagados, /pendientes ni
  // /resumen.
  type PersonSummary = {
    latest: Purchase;
    count: number;
    paidAmounts: Record<string, number>;
    subscriber: boolean;
  };
  const summaries = new Map<string, PersonSummary>();
  for (const purchase of (purchases ?? []) as Purchase[]) {
    if (isTestSession(purchase.stripe_checkout_session_id)) continue;
    let summary = summaries.get(purchase.person_id);
    if (!summary) {
      summary = { latest: purchase, count: 0, paidAmounts: {}, subscriber: false };
      summaries.set(purchase.person_id, summary);
    }
    summary.count += 1;
    // `amount_total` llega en la unidad mínima de la moneda (centavos), y puede
    // venir null si el evento no lo trae: se distingue "no registrado" de 0 para
    // no reportar ingresos de $0 cuando en realidad es dato faltante.
    if (isPaid(purchase) && typeof purchase.amount_total === "number") {
      const currency = (purchase.currency || "").trim().toUpperCase();
      if (currency) {
        summary.paidAmounts[currency] = (summary.paidAmounts[currency] ?? 0) + purchase.amount_total;
      }
    }
    if (isPaid(purchase) && (purchase.stripe_subscription_id || purchase.next_payment_at)) {
      summary.subscriber = true;
    }
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
    const summary = summaries.get(person.id);
    if (!summary) continue;

    const key = person.email?.trim().toLowerCase()
      || (person.telegram_username ? `@${person.telegram_username.toLowerCase()}` : person.id);
    const nowPaid = isPaid(summary.latest);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        person,
        paid: nowPaid,
        purchases: summary.count,
        classCompletedAt: person.class_completed_at,
        paidAmounts: { ...summary.paidAmounts },
        subscriber: summary.subscriber,
        lastPurchaseAt: summary.latest.created_at,
        telegramUsername: person.telegram_username,
      });
      continue;
    }

    existing.purchases += summary.count;
    existing.subscriber ||= summary.subscriber;
    existing.telegramUsername ??= person.telegram_username;
    for (const [currency, amount] of Object.entries(summary.paidAmounts)) {
      existing.paidAmounts[currency] = (existing.paidAmounts[currency] ?? 0) + amount;
    }
    // `purchases` viene ordenado de más reciente a más antigua, así que la
    // primera fila del grupo es la compra más nueva del cliente.
    if (!existing.lastPurchaseAt || summary.latest.created_at > existing.lastPurchaseAt) {
      existing.lastPurchaseAt = summary.latest.created_at;
    }
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

// Límite duro de Telegram: un mensaje más largo se rechaza con 400 y el comando
// aparenta no responder. El recorte es explícito para que el usuario sepa que
// falta información en vez de creer que vio el total.
const TELEGRAM_MESSAGE_LIMIT = 4096;
const MAX_DETAIL_ROWS = 40;

function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat("es-MX", { style: "currency", currency }).format(amount / 100);
  } catch {
    return `${(amount / 100).toFixed(2)} ${currency}`;
  }
}

function moneyList(amounts: Record<string, number>): string {
  const entries = Object.entries(amounts);
  if (!entries.length) return "";
  return entries.map(([currency, amount]) => formatMoney(amount, currency)).join(" + ");
}

// Línea de detalle por cliente. Muestra el correo porque es el dato con el que se
// reconcilia contra Stripe, y deja explícito lo que falta: un cliente sin correo o
// sin Telegram vinculado es justamente el que hay que perseguir.
function customerDetail(customer: Customer, index: number): string {
  const state = customer.paid ? "✅" : "⏳";
  const identity = customer.person.email
    ? escapeHtml(customer.person.email)
    : `<b>sin correo</b> (${escapeHtml(customer.person.id.slice(0, 8))})`;
  const username = customer.person.telegram_username ?? customer.telegramUsername;
  const telegram = username ? `@${escapeHtml(username)}` : "<i>sin Telegram</i>";
  const purchases = `${customer.purchases} ${customer.purchases === 1 ? "compra" : "compras"}`;
  const classStatus = customer.classCompletedAt ? "clase hecha" : "clase pendiente";
  const parts = [identity, telegram, purchases, moneyList(customer.paidAmounts), classStatus];
  if (customer.subscriber) parts.push("suscripción");
  return `${index}. ${state} ${parts.filter(Boolean).join(" · ")}`;
}

export function buildSummary(all: Customer[], paid: Customer[], pending: Customer[]): string {
  // Los ingresos se suman por moneda: sumar MXN con USD daría un total falso. Las
  // compras de prueba ya fueron filtradas en `loadCustomers`, así que solo
  // entran aquí sesiones reales.
  const revenue: Record<string, number> = {};
  for (const customer of all) {
    for (const [currency, amount] of Object.entries(customer.paidAmounts)) {
      revenue[currency] = (revenue[currency] ?? 0) + amount;
    }
  }
  const classDone = paid.filter((customer) => customer.classCompletedAt).length;
  const subscribers = paid.filter((customer) => customer.subscriber).length;
  const withoutTelegram = all.filter(
    (customer) => !(customer.person.telegram_username ?? customer.telegramUsername),
  ).length;
  const revenueList = moneyList(revenue);

  const header = [
    "<b>📊 Resumen</b>",
    `Clientes: ${all.length}`,
    `💳 Pagados y vigentes: ${paid.length}`,
    `⏳ Pendientes o vencidos: ${pending.length}`,
    `💰 Ingresos cobrados: ${revenueList || "sin dato de importe"}`,
    `🔁 Suscripciones activas: ${subscribers}`,
    `🎓 Clase hecha: ${classDone} · pendiente: ${paid.length - classDone}`,
    `🔗 Sin Telegram vinculado: ${withoutTelegram}`,
  ];

  // Pagados primero: son los que dan acceso y los que hay que impartir clase.
  const ordered = [...paid, ...pending];
  const rows = ordered
    .slice(0, MAX_DETAIL_ROWS)
    .map((customer, index) => customerDetail(customer, index + 1));
  const hidden = ordered.length - rows.length;

  const headerText = header.join("\n");
  let message = `${headerText}\n\n<b>Detalle</b>\n${rows.join("\n")}`;
  if (hidden > 0) message += `\n<i>+${hidden} más (usa /pagados y /pendientes)</i>`;
  // Recorte final: si aun así se pasa del límite, se sacrifican las líneas de
  // detalle antes que la cabecera, que es la parte con los totales.
  if (message.length > TELEGRAM_MESSAGE_LIMIT) {
    const lines = message.split("\n");
    const headerLines = header.length;
    while (lines.length > headerLines && lines.join("\n").length > TELEGRAM_MESSAGE_LIMIT) lines.pop();
    message = `${lines.join("\n")}\n<i>…recortado por límite de Telegram</i>`;
  }
  return message;
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
    await sendMessage(message.chat.id, buildSummary(customers, paid, pending));
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