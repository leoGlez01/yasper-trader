import { supabase } from "./supabase";
import { escapeCommunityHtml, sendCommunityTelegramMessage } from "./community-telegram";

export async function sendCommunityAccessLink(personId: string): Promise<void> {
  const { data: person, error } = await supabase
    .from("people")
    .select("telegram_user_id")
    .eq("id", personId)
    .maybeSingle();
  if (error) throw error;
  if (!person?.telegram_user_id) return;

  const joinLink = process.env.COMMUNITY_TELEGRAM_JOIN_LINK;
  if (!joinLink) throw new Error("Falta COMMUNITY_TELEGRAM_JOIN_LINK");

  try {
    await sendCommunityTelegramMessage(
      person.telegram_user_id,
      `✅ <b>Tu suscripción está activa.</b>\n\nSolicita unirte al grupo privado:\n${escapeCommunityHtml(joinLink)}`,
    );
  } catch (sendError) {
    console.error("No se pudo enviar el acceso mensual por Telegram", sendError);
  }
}
