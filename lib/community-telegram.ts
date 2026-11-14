const TELEGRAM_API_BASE = "https://api.telegram.org";

type TelegramApiResponse<T> = {
  ok: boolean;
  result: T;
  description?: string;
};

function botToken(): string {
  const token = process.env.COMMUNITY_TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Falta COMMUNITY_TELEGRAM_BOT_TOKEN");
  return token;
}

async function callTelegramApi<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = (await response.json()) as TelegramApiResponse<T>;
  if (!response.ok || !data.ok) {
    throw new Error(`Telegram API ${method} falló: ${data.description ?? response.statusText}`);
  }
  return data.result;
}

export interface CommunityTelegramMessage {
  from: { id: number; username?: string };
  chat: { id: number };
  text?: string;
}

export interface CommunityJoinRequest {
  from: { id: number; username?: string };
  chat: { id: number };
  date: number;
  invite_link?: { invite_link: string };
}

export interface CommunityChatMemberUpdate {
  chat: { id: number };
  new_chat_member: {
    user: { id: number; username?: string };
    status: "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";
    is_member?: boolean;
  };
}

export function setCommunityWebhook(url: string, secretToken: string) {
  return callTelegramApi("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message", "chat_join_request", "chat_member"],
  });
}

export function getCommunityWebhookInfo() {
  return callTelegramApi<{
    url: string;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
  }>("getWebhookInfo", {});
}

export function createCommunityJoinRequestLink(chatId: string, name: string) {
  return callTelegramApi<{ invite_link: string }>("createChatInviteLink", {
    chat_id: chatId,
    name,
    creates_join_request: true,
  });
}

export function approveCommunityJoinRequest(chatId: string, userId: number) {
  return callTelegramApi<boolean>("approveChatJoinRequest", { chat_id: chatId, user_id: userId });
}

export function declineCommunityJoinRequest(chatId: string, userId: number) {
  return callTelegramApi<boolean>("declineChatJoinRequest", { chat_id: chatId, user_id: userId });
}

export function sendCommunityTelegramMessage(chatId: string | number, text: string) {
  return callTelegramApi("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
}

export function getCommunityChatMember(chatId: string, userId: number) {
  return callTelegramApi<{
    status: "creator" | "administrator" | "member" | "restricted" | "left" | "kicked";
    is_member?: boolean;
  }>(
    "getChatMember",
    { chat_id: chatId, user_id: userId },
  );
}

export function banCommunityChatMember(chatId: string, userId: number) {
  return callTelegramApi<boolean>("banChatMember", { chat_id: chatId, user_id: userId });
}

export function unbanCommunityChatMember(chatId: string, userId: number) {
  return callTelegramApi<boolean>("unbanChatMember", {
    chat_id: chatId,
    user_id: userId,
    only_if_banned: true,
  });
}

export function escapeCommunityHtml(value: string): string {
  return value.replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[character] ?? character);
}
