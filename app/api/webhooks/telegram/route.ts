import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { sendMessage, type TelegramChatJoinRequest, type TelegramMessage } from "@/lib/telegram";
import { tryApproveIfEligible } from "@/lib/access";

// Único chequeo de autenticidad del webhook de Telegram: un header secreto
// compartido (Telegram no firma el body). Sin esto, cualquiera podría
// simular una chat_join_request.
function isAuthentic(req: NextRequest): boolean {
  const header = req.headers.get("x-telegram-bot-api-secret-token");
  return header === process.env.TELEGRAM_WEBHOOK_SECRET;
}

export async function POST(req: NextRequest) {
  if (!isAuthentic(req)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const update: {
    chat_join_request?: TelegramChatJoinRequest;
    message?: TelegramMessage;
  } = await req.json();

  try {
    if (update.chat_join_request) {
      await handleJoinRequest(update.chat_join_request);
    } else if (typeof update.message?.text === "string" && update.message.text.startsWith("/start")) {
      await handleStart(update.message);
    }
  } catch (error) {
    console.error("Error procesando update de Telegram", error);
  }

  // Siempre 200: Telegram reintenta agresivamente cualquier respuesta que no sea 2xx,
  // y ya manejamos nuestros propios errores/idempotencia internamente.
  return NextResponse.json({ ok: true });
}

const DUPLICATE_KEY = "23505";

async function handleJoinRequest(joinRequest: TelegramChatJoinRequest) {
  const telegramUserId: number = joinRequest.from.id;
  const telegramUsername: string | null = joinRequest.from.username ?? null;
  const chatId: number = joinRequest.chat.id;
  const requestDate = new Date(joinRequest.date * 1000).toISOString();

  const { data: existingPending } = await supabase
    .from("telegram_join_requests")
    .select("id")
    .eq("telegram_user_id", telegramUserId)
    .eq("chat_id", chatId)
    .eq("status", "pending")
    .maybeSingle();

  if (!existingPending) {
    const { error } = await supabase.from("telegram_join_requests").insert({
      telegram_user_id: telegramUserId,
      telegram_username: telegramUsername,
      chat_id: chatId,
      invite_link: joinRequest.invite_link?.invite_link ?? null,
      request_date: requestDate,
      raw_update: joinRequest,
    });
    // Una entrega duplicada concurrente del mismo webhook puede chocar con el
    // índice único parcial — es benigno, la fila ya quedó registrada.
    if (error && error.code !== DUPLICATE_KEY) throw error;
  }

  await tryApproveIfEligible(telegramUserId);
}

async function handleStart(message: TelegramMessage) {
  const telegramUserId: number = message.from.id;
  const telegramUsername: string | null = message.from.username ?? null;
  const token = (message.text as string).split(" ")[1];

  if (!token) {
    await sendMessage(telegramUserId, "Hola 👋 Usa el enlace que recibiste tras tu compra para conectar tu cuenta.");
    return;
  }

  const { data: linkToken } = await supabase
    .from("link_tokens")
    .select("person_id, status")
    .eq("token", token)
    .maybeSingle();

  if (!linkToken || linkToken.status === "used") {
    await sendMessage(telegramUserId, "Ese enlace no es válido o ya fue usado. Si acabas de comprar, contáctanos para ayudarte.");
    return;
  }

  const { error: linkError } = await supabase
    .from("people")
    .update({ telegram_user_id: telegramUserId, telegram_username: telegramUsername })
    .eq("id", linkToken.person_id);

  if (linkError) {
    if (linkError.code === DUPLICATE_KEY) {
      await sendMessage(
        telegramUserId,
        "Esta cuenta de Telegram ya está vinculada a otra compra. Si crees que es un error, contáctanos.",
      );
    } else {
      console.error("Error vinculando Telegram a la persona", linkError);
    }
    return;
  }

  await supabase
    .from("link_tokens")
    .update({ status: "used", used_at: new Date().toISOString() })
    .eq("token", token);

  const cursoLink = process.env.NEXT_PUBLIC_TELEGRAM_CURSO_JOIN_LINK;
  const vipLink = process.env.NEXT_PUBLIC_TELEGRAM_VIP_JOIN_LINK;

  await sendMessage(
    telegramUserId,
    `✅ ¡Cuenta conectada! Tu compra te da acceso a los dos grupos. Abre cada enlace y toca "Solicitar unirse" — te aprobaremos automáticamente en cuanto confirmemos tu pago:\n\nGrupo Curso: ${cursoLink}\nGrupo VIP: ${vipLink}`,
  );

  await tryApproveIfEligible(telegramUserId);
}
