import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  CommunitySubscription,
  hasCommunityAccess,
  tryApproveCommunityIfEligible,
} from "@/lib/community-access";
import {
  CommunityChatMemberUpdate,
  CommunityJoinRequest,
  CommunityTelegramMessage,
  sendCommunityTelegramMessage,
} from "@/lib/community-telegram";
import { sendCommunityAccessLink } from "@/lib/community-notifications";
import { saveCommunityMembership } from "@/lib/community-access";

const DUPLICATE_KEY = "23505";

function isAuthentic(request: NextRequest): boolean {
  const secret = process.env.COMMUNITY_TELEGRAM_WEBHOOK_SECRET;
  return Boolean(secret) && request.headers.get("x-telegram-bot-api-secret-token") === secret;
}

export async function POST(request: NextRequest) {
  if (!isAuthentic(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let update: {
    chat_join_request?: CommunityJoinRequest;
    chat_member?: CommunityChatMemberUpdate;
    message?: CommunityTelegramMessage;
  };
  try {
    update = await request.json();
  } catch (error) {
    console.error("Update de Telegram mensual con JSON inválido", error);
    return NextResponse.json({ error: "invalid update" }, { status: 400 });
  }

  try {
    if (update.chat_join_request) {
      await handleJoinRequest(update.chat_join_request);
    } else if (update.chat_member) {
      await handleChatMemberUpdate(update.chat_member);
    } else if (update.message?.text?.startsWith("/start")) {
      await handleStart(update.message);
    }
  } catch (error) {
    console.error("Error procesando update del bot mensual", error);
    return NextResponse.json({ error: "internal error" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

async function handleJoinRequest(joinRequest: CommunityJoinRequest): Promise<void> {
  const expectedChatId = process.env.COMMUNITY_TELEGRAM_CHAT_ID;
  if (!expectedChatId) throw new Error("Falta COMMUNITY_TELEGRAM_CHAT_ID");
  if (String(joinRequest.chat.id) !== expectedChatId) return;

  const telegramUserId = joinRequest.from.id;
  const { data: existing, error: lookupError } = await supabase
    .from("community_join_requests")
    .select("id")
    .eq("telegram_user_id", telegramUserId)
    .eq("chat_id", expectedChatId)
    .eq("status", "pending")
    .maybeSingle();
  if (lookupError) throw lookupError;

  if (!existing) {
    const { error } = await supabase.from("community_join_requests").insert({
      telegram_user_id: telegramUserId,
      telegram_username: joinRequest.from.username ?? null,
      chat_id: expectedChatId,
      invite_link: joinRequest.invite_link?.invite_link ?? null,
      request_date: new Date(joinRequest.date * 1000).toISOString(),
      raw_update: joinRequest,
    });
    if (error && error.code !== DUPLICATE_KEY) throw error;
  }

  const { data: person, error: personError } = await supabase
    .from("people")
    .select("id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  if (personError) throw personError;
  await saveCommunityMembership(
    person?.id ?? null,
    telegramUserId,
    expectedChatId,
    "pending",
    joinRequest.from.username ?? null,
  );
  await tryApproveCommunityIfEligible(telegramUserId);
}

async function handleChatMemberUpdate(update: CommunityChatMemberUpdate): Promise<void> {
  const chatId = process.env.COMMUNITY_TELEGRAM_CHAT_ID;
  if (!chatId) throw new Error("Falta COMMUNITY_TELEGRAM_CHAT_ID");
  if (String(update.chat.id) !== chatId) return;

  const telegramUserId = update.new_chat_member.user.id;
  const { data: person, error } = await supabase
    .from("people")
    .select("id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  if (error) throw error;

  const member = update.new_chat_member.status === "member"
    || (update.new_chat_member.status === "restricted" && update.new_chat_member.is_member === true);
  await saveCommunityMembership(
    person?.id ?? null,
    telegramUserId,
    chatId,
    member ? "member" : "left",
    update.new_chat_member.user.username ?? null,
  );
}

async function handleStart(message: CommunityTelegramMessage): Promise<void> {
  const telegramUserId = message.from.id;
  const token = message.text?.trim().split(/\s+/)[1];
  if (!token) {
    const linked = await findLinkedPerson(telegramUserId);
    if (linked && await personHasAccess(linked.id)) {
      await sendCommunityAccessLink(linked.id);
    } else {
      const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;
      await sendCommunityTelegramMessage(
        telegramUserId,
        siteUrl
          ? `Hola 👋 Para vincular tu cuenta, inicia la membresía desde <a href="${siteUrl}/comunidad">la web</a>.`
          : "Hola 👋 Usa el enlace de conexión que aparece después de completar tu pago.",
      );
    }
    return;
  }

  const { data: linkToken, error: tokenError } = await supabase
    .from("community_link_tokens")
    .select("person_id, status, telegram_user_id")
    .eq("token", token)
    .maybeSingle();
  if (tokenError) throw tokenError;

  if (!linkToken || (linkToken.status === "used" && linkToken.telegram_user_id !== telegramUserId)) {
    const linked = await findLinkedPerson(telegramUserId);
    if (linked && await personHasAccess(linked.id)) {
      await sendCommunityAccessLink(linked.id);
      return;
    }
    await sendCommunityTelegramMessage(
      telegramUserId,
      "Ese enlace ya se usó o no es válido. Si acabas de pagar, vuelve a la página de confirmación o contáctanos.",
    );
    return;
  }

  const { data: linkedPerson, error: linkedPersonError } = await supabase
    .from("people")
    .select("telegram_user_id")
    .eq("id", linkToken.person_id)
    .maybeSingle();
  if (linkedPersonError) throw linkedPersonError;
  if (linkedPerson?.telegram_user_id && linkedPerson.telegram_user_id !== telegramUserId) {
    await sendCommunityTelegramMessage(
      telegramUserId,
      "Esta compra ya está vinculada a otra cuenta de Telegram. Escríbenos para verificar el cambio.",
    );
    return;
  }

  if (linkToken.status === "pending") {
    const { data: claimedToken, error: claimError } = await supabase
      .from("community_link_tokens")
      .update({ status: "used", used_at: new Date().toISOString(), telegram_user_id: telegramUserId })
      .eq("token", token)
      .eq("status", "pending")
      .select("person_id")
      .maybeSingle();
    if (claimError) throw claimError;
    if (!claimedToken) {
      await sendCommunityTelegramMessage(
        telegramUserId,
        "Ese enlace ya se usó. Si acabas de pagar, vuelve a la página de confirmación o contáctanos.",
      );
      return;
    }
  }

  const { data: updatedPerson, error: linkError } = await supabase
    .from("people")
    .update({ telegram_user_id: telegramUserId, telegram_username: message.from.username ?? null })
    .eq("id", linkToken.person_id)
    .is("telegram_user_id", null)
    .select("id")
    .maybeSingle();
  if (linkError) {
    if (linkError.code === DUPLICATE_KEY) {
      await sendCommunityTelegramMessage(
        telegramUserId,
        "Esta cuenta de Telegram ya está vinculada a otra ficha. Escríbenos para ayudarte a conectarla.",
      );
      return;
    }
    throw linkError;
  }
  if (!updatedPerson) {
    const { data: currentPerson, error: currentPersonError } = await supabase
      .from("people")
      .select("telegram_user_id")
      .eq("id", linkToken.person_id)
      .maybeSingle();
    if (currentPersonError) throw currentPersonError;
    if (currentPerson?.telegram_user_id !== telegramUserId) {
      await sendCommunityTelegramMessage(
        telegramUserId,
        "Esta compra ya está vinculada a otra cuenta de Telegram. Escríbenos para verificar el cambio.",
      );
      return;
    }

    const { error: usernameError } = await supabase
      .from("people")
      .update({ telegram_username: message.from.username ?? null })
      .eq("id", linkToken.person_id)
      .eq("telegram_user_id", telegramUserId);
    if (usernameError) throw usernameError;
  }

  const chatId = process.env.COMMUNITY_TELEGRAM_CHAT_ID;
  if (!chatId) throw new Error("Falta COMMUNITY_TELEGRAM_CHAT_ID");
  const { error: membershipError } = await supabase
    .from("community_memberships")
    .update({
      person_id: linkToken.person_id,
      telegram_username: message.from.username ?? null,
      updated_at: new Date().toISOString(),
    })
    .eq("telegram_user_id", telegramUserId)
    .eq("chat_id", chatId);
  if (membershipError) throw membershipError;

  await tryApproveCommunityIfEligible(telegramUserId);
  if (await personHasAccess(linkToken.person_id)) {
    await sendCommunityAccessLink(linkToken.person_id);
  } else {
    await sendCommunityTelegramMessage(
      telegramUserId,
      "✅ Cuenta de Telegram vinculada. En cuanto Stripe confirme tu suscripción, te enviaremos el enlace del grupo.",
    );
  }
}

async function findLinkedPerson(telegramUserId: number): Promise<{ id: string } | null> {
  const { data, error } = await supabase
    .from("people")
    .select("id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

async function personHasAccess(personId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from("community_subscriptions")
    .select("person_id, stripe_subscription_id, status, livemode, current_period_end, last_payment_failed_at")
    .eq("person_id", personId);
  if (error) throw error;
  return hasCommunityAccess((data ?? []) as CommunitySubscription[]);
}
