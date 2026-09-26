import { supabase } from "./supabase";
import { isTestSession } from "./stripe";
import { approveChatJoinRequest } from "./telegram";

function chatIds(): number[] {
  const curso = process.env.TELEGRAM_CURSO_CHAT_ID;
  const vip = process.env.TELEGRAM_VIP_CHAT_ID;
  if (!curso || !vip) throw new Error("Faltan los chat ids de Telegram (curso/vip)");
  return [Number(curso), Number(vip)];
}

export async function hasPaid(personId: string): Promise<boolean> {
  const { data } = await supabase
    .from("purchases")
    .select("id, next_payment_at, stripe_checkout_session_id")
    .eq("person_id", personId)
    .eq("status", "paid")
    .limit(50);
  // Una compra pagada en modo prueba (`cs_test_`) no da acceso a los grupos de
  // pago: son sesiones que nunca movieron dinero. Es el mismo criterio que
  // aplica a las estadísticas del bot, para que ambos coincidan.
  return (data ?? []).some(
    (purchase) =>
      !isTestSession(purchase.stripe_checkout_session_id) &&
      (!purchase.next_payment_at || new Date(purchase.next_payment_at) > new Date()),
  );
}

// Punto único donde se decide si alguien entra a un grupo. Se llama tras
// cualquier evento que pueda cambiar la elegibilidad de una persona: un pago
// confirmado, la vinculación de su Telegram vía /start, o una nueva
// chat_join_request. Un solo pago da acceso a AMBOS grupos (Curso y VIP), así
// que se intenta aprobar los dos en el mismo paso, sin importar en qué orden
// ocurrieron el pago y la solicitud de unión.
export async function tryApproveIfEligible(telegramUserId: number): Promise<void> {
  const { data: person } = await supabase
    .from("people")
    .select("id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  if (!person) return;

  if (!(await hasPaid(person.id))) return;

  for (const chatId of chatIds()) {
    const { data: pendingRequest } = await supabase
      .from("telegram_join_requests")
      .select("id")
      .eq("telegram_user_id", telegramUserId)
      .eq("chat_id", chatId)
      .eq("status", "pending")
      .maybeSingle();
    if (!pendingRequest) continue;

    if (await approveChatJoinRequest(chatId, telegramUserId)) {
      await supabase
        .from("telegram_join_requests")
        .update({ status: "approved", resolved_at: new Date().toISOString() })
        .eq("id", pendingRequest.id);
    }
  }
}
