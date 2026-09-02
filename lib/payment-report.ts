import { supabase } from "./supabase";
import { sendMessage } from "./telegram";

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}

export async function sendPaymentFailureReport(): Promise<void> {
  const clientChatId = process.env.TELEGRAM_CLIENT_CHAT_ID;
  if (!clientChatId) return;

  const { data: purchases, error } = await supabase
    .from("purchases")
    .select("person_id, status, next_payment_at");
  if (error) throw error;

  const personIds = [...new Set((purchases ?? []).map((purchase) => purchase.person_id))];
  const { data: people } = personIds.length
    ? await supabase.from("people").select("id, email, telegram_username").in("id", personIds)
    : { data: [] };
  const peopleById = new Map((people ?? []).map((person) => [person.id, person]));
  const now = Date.now();
  const paid = (purchases ?? []).filter(
    (purchase) => purchase.status === "paid" && (!purchase.next_payment_at || Date.parse(purchase.next_payment_at) > now),
  );
  const pending = (purchases ?? []).filter((purchase) => !paid.includes(purchase));
  const formatList = (items: typeof purchases) =>
    items.length
      ? items.map((purchase) => {
          const person = peopleById.get(purchase.person_id);
          return `- ${escapeHtml(person?.email ?? person?.telegram_username ?? purchase.person_id)}`;
        }).join("\n")
      : "- Ninguno";

  await sendMessage(
    clientChatId,
    `⚠️ <b>Fallo de cobro mensual</b>\n\n<b>Pagados y vigentes (${paid.length}):</b>\n${formatList(paid)}\n\n<b>Pendientes o vencidos (${pending.length}):</b>\n${formatList(pending)}`,
  );
}