import { supabase } from "./supabase";
import {
  approveCommunityJoinRequest,
  getCommunityChatMember,
} from "./community-telegram";

export const COMMUNITY_GRACE_PERIOD_MS = 3 * 24 * 60 * 60 * 1000;

export type CommunitySubscription = {
  person_id: string;
  stripe_subscription_id: string;
  status: string;
  livemode: boolean;
  current_period_end: string | null;
  last_payment_failed_at: string | null;
};

export function hasCommunityAccess(
  subscriptions: CommunitySubscription[],
  now = Date.now(),
): boolean {
  return subscriptions.some((subscription) => {
    if (!subscription.livemode) return false;

    if (subscription.status === "active" || subscription.status === "trialing") {
      return !subscription.current_period_end || Date.parse(subscription.current_period_end) > now;
    }

    if (
      (subscription.status === "past_due" || subscription.status === "unpaid")
      && subscription.last_payment_failed_at
    ) {
      const failedAt = Date.parse(subscription.last_payment_failed_at);
      return Number.isFinite(failedAt) && now - failedAt < COMMUNITY_GRACE_PERIOD_MS;
    }

    return false;
  });
}

export function isCommunityRemovalDue(
  subscriptions: CommunitySubscription[],
  now = Date.now(),
): boolean {
  if (!subscriptions.some((subscription) => subscription.livemode) || hasCommunityAccess(subscriptions, now)) {
    return false;
  }

  return subscriptions.some((subscription) => {
    if (!subscription.livemode) return false;
    if (
      (subscription.status === "past_due" || subscription.status === "unpaid")
      && subscription.last_payment_failed_at
    ) {
      const failedAt = Date.parse(subscription.last_payment_failed_at);
      return Number.isFinite(failedAt) && now - failedAt >= COMMUNITY_GRACE_PERIOD_MS;
    }
    return ["canceled", "unpaid", "paused", "incomplete_expired"].includes(subscription.status)
      || (subscription.status === "active" && Boolean(
        subscription.current_period_end && Date.parse(subscription.current_period_end) <= now,
      ));
  });
}

export async function tryApproveCommunityIfEligible(telegramUserId: number): Promise<void> {
  const chatId = process.env.COMMUNITY_TELEGRAM_CHAT_ID;
  if (!chatId) throw new Error("Falta COMMUNITY_TELEGRAM_CHAT_ID");

  const { data: person, error: personError } = await supabase
    .from("people")
    .select("id")
    .eq("telegram_user_id", telegramUserId)
    .maybeSingle();
  if (personError) throw personError;
  if (!person) return;

  const { data: subscriptions, error: subscriptionError } = await supabase
    .from("community_subscriptions")
    .select("person_id, stripe_subscription_id, status, livemode, current_period_end, last_payment_failed_at")
    .eq("person_id", person.id);
  if (subscriptionError) throw subscriptionError;
  if (!hasCommunityAccess((subscriptions ?? []) as CommunitySubscription[])) return;

  const { data: requests, error: requestsError } = await supabase
    .from("community_join_requests")
    .select("id, telegram_username")
    .eq("telegram_user_id", telegramUserId)
    .eq("chat_id", chatId)
    .eq("status", "pending");
  if (requestsError) throw requestsError;

  for (const request of requests ?? []) {
    const member = await getCommunityChatMember(chatId, telegramUserId);
    const alreadyMember = ["creator", "administrator", "member"].includes(member.status)
      || (member.status === "restricted" && member.is_member === true);
    if (!alreadyMember) {
      await approveCommunityJoinRequest(chatId, telegramUserId);
    }
    const { error } = await supabase
      .from("community_join_requests")
      .update({ status: "approved", resolved_at: new Date().toISOString() })
      .eq("id", request.id)
      .eq("status", "pending");
    if (error) throw error;

    await saveCommunityMembership(person.id, telegramUserId, chatId, "member", request.telegram_username);
  }
}

export async function saveCommunityMembership(
  personId: string | null,
  telegramUserId: number,
  chatId: string,
  status: "pending" | "member" | "left",
  telegramUsername: string | null = null,
): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from("community_memberships").upsert(
    {
      person_id: personId,
      telegram_user_id: telegramUserId,
      telegram_username: telegramUsername,
      chat_id: chatId,
      status,
      joined_at: status === "member" ? now : null,
      removed_at: status === "left" ? now : null,
      updated_at: now,
    },
    { onConflict: "telegram_user_id,chat_id" },
  );
  if (error) throw error;
}
