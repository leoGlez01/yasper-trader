import { supabase } from "./supabase";
import {
  COMMUNITY_GRACE_PERIOD_MS,
  CommunitySubscription,
  isCommunityRemovalDue,
} from "./community-access";
import {
  banCommunityChatMember,
  escapeCommunityHtml,
  getCommunityChatMember,
  sendCommunityTelegramMessage,
  unbanCommunityChatMember,
} from "./community-telegram";

type Person = {
  id: string;
  email: string | null;
  telegram_username: string | null;
  telegram_user_id: number | null;
};

type Membership = {
  person_id: string | null;
  telegram_user_id: number;
  telegram_username: string | null;
  chat_id: string;
  status: string;
  joined_at: string | null;
};

async function loadCommunityData(): Promise<{
  subscriptions: CommunitySubscription[];
  people: Person[];
  memberships: Membership[];
}> {
  const [
    { data: subscriptions, error: subscriptionsError },
    { data: people, error: peopleError },
    { data: memberships, error: membershipsError },
  ] =
    await Promise.all([
      supabase
        .from("community_subscriptions")
        .select("person_id, stripe_subscription_id, status, livemode, current_period_end, last_payment_failed_at"),
      supabase.from("people").select("id, email, telegram_username, telegram_user_id"),
      supabase
        .from("community_memberships")
        .select("person_id, telegram_user_id, telegram_username, chat_id, status, joined_at"),
    ]);
  if (subscriptionsError) throw subscriptionsError;
  if (peopleError) throw peopleError;
  if (membershipsError) throw membershipsError;
  return {
    subscriptions: (subscriptions ?? []) as CommunitySubscription[],
    people: (people ?? []) as Person[],
    memberships: (memberships ?? []) as Membership[],
  };
}

function groupByPerson(subscriptions: CommunitySubscription[]): Map<string, CommunitySubscription[]> {
  const grouped = new Map<string, CommunitySubscription[]>();
  for (const subscription of subscriptions) {
    const rows = grouped.get(subscription.person_id) ?? [];
    rows.push(subscription);
    grouped.set(subscription.person_id, rows);
  }
  return grouped;
}

export function isCommunityPaymentOutstanding(rows: CommunitySubscription[], now: number): boolean {
  if (!rows.some((row) => row.livemode)) return true;
  const active = rows.some((row) =>
    row.livemode
    && (row.status === "active" || row.status === "trialing")
    && (!row.current_period_end || Date.parse(row.current_period_end) > now),
  );
  if (active) return false;
  return rows.some((row) =>
    row.livemode && (
      ["past_due", "unpaid", "canceled", "paused", "incomplete_expired"].includes(row.status)
      || (row.status === "active" && Boolean(
        row.current_period_end && Date.parse(row.current_period_end) <= now,
      ))
    ),
  );
}

export async function sendCommunityPaymentReport(): Promise<void> {
  const adminChatId = process.env.COMMUNITY_TELEGRAM_ADMIN_CHAT_ID;
  if (!adminChatId) throw new Error("Falta COMMUNITY_TELEGRAM_ADMIN_CHAT_ID");

  const { subscriptions, people, memberships } = await loadCommunityData();
  const peopleById = new Map(people.map((person) => [person.id, person]));
  const grouped = groupByPerson(subscriptions);
  const now = Date.now();
  const owing = memberships
    .filter((membership) => membership.status === "member")
    .filter((membership) => isCommunityPaymentOutstanding(
      membership.person_id ? grouped.get(membership.person_id) ?? [] : [],
      now,
    ))
    .map((membership) => {
      const person = membership.person_id ? peopleById.get(membership.person_id) : undefined;
      const identity = person?.email
        || (person?.telegram_username ? `@${person.telegram_username}` : null)
        || (membership.telegram_username ? `@${membership.telegram_username}` : String(membership.telegram_user_id));
      const rows = membership.person_id ? grouped.get(membership.person_id) ?? [] : [];
      const latestFailure = rows
        .map((row) => row.last_payment_failed_at)
        .filter((value): value is string => Boolean(value))
        .sort()
        .at(-1);
      const failedDays = latestFailure
        ? Math.max(0, Math.floor((now - Date.parse(latestFailure)) / (24 * 60 * 60 * 1000)))
        : null;
      return `• ${escapeCommunityHtml(identity)}${failedDays === null ? "" : ` — ${failedDays} día(s) de impago`}`;
    });

  const title = `📋 <b>Suscripciones con pago pendiente (${owing.length})</b>`;
  const lines = owing.length ? owing : ["• No hay pagos pendientes."];
  const chunks: string[] = [];
  let chunk = title;
  for (const line of lines) {
    if (chunk.length + line.length + 1 > 3500) {
      chunks.push(chunk);
      chunk = "<b>Pagos pendientes (continuación)</b>";
    }
    chunk += `\n${line}`;
  }
  chunks.push(chunk);

  for (const message of chunks) {
    await sendCommunityTelegramMessage(adminChatId, message);
  }
}

export async function enforceCommunityPaymentExpiry(): Promise<void> {
  const chatId = process.env.COMMUNITY_TELEGRAM_CHAT_ID;
  if (!chatId) throw new Error("Falta COMMUNITY_TELEGRAM_CHAT_ID");

  const { subscriptions, memberships } = await loadCommunityData();
  const subscriptionsByPerson = groupByPerson(subscriptions);
  const now = Date.now();
  const failures: string[] = [];

  for (const membership of memberships) {
    const personId = membership.person_id;
    if (membership.status !== "member") continue;
    const rows = personId ? subscriptionsByPerson.get(personId) ?? [] : [];
    const hasLiveSubscription = rows.some((row) => row.livemode);
    const removalDue = hasLiveSubscription
      ? isCommunityRemovalDue(rows, now)
      : Boolean(membership.joined_at && now - Date.parse(membership.joined_at) >= COMMUNITY_GRACE_PERIOD_MS);
    if (!removalDue) continue;
    const telegramUserId = membership.telegram_user_id;

    try {
      const member = await getCommunityChatMember(chatId, telegramUserId);
      if (member.status === "creator" || member.status === "administrator") continue;
      if (member.status === "kicked") {
        await unbanCommunityChatMember(chatId, telegramUserId);
        await saveMembershipAsLeft(membership);
        continue;
      }
      if (member.status === "left") {
        await saveMembershipAsLeft(membership);
        continue;
      }
      await banCommunityChatMember(chatId, telegramUserId);
      await unbanCommunityChatMember(chatId, telegramUserId);
      await saveMembershipAsLeft(membership);
    } catch (error) {
      console.error(`No se pudo retirar del grupo al Telegram ${telegramUserId}`, error);
      failures.push(String(telegramUserId));
    }
  }

  async function saveMembershipAsLeft(membership: Membership): Promise<void> {
    const { error } = await supabase
      .from("community_memberships")
      .update({ status: "left", removed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("telegram_user_id", membership.telegram_user_id)
      .eq("chat_id", membership.chat_id);
    if (error) throw error;
  }

  if (failures.length) {
    throw new Error(`Falló la retirada de acceso para ${failures.length} miembro(s): ${failures.join(", ")}`);
  }
}
