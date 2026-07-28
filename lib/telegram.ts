const TELEGRAM_API_BASE = "https://api.telegram.org";

// Formas mínimas de los updates de Telegram que realmente usamos — no son los
// tipos completos de la Bot API, solo los campos que leemos.
export interface TelegramChatJoinRequest {
  from: { id: number; username?: string };
  chat: { id: number };
  date: number;
  invite_link?: { invite_link: string };
}

export interface TelegramMessage {
  from: { id: number; username?: string };
  chat: { id: number };
  text?: string;
}

function botToken(): string {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Falta la variable de entorno TELEGRAM_BOT_TOKEN");
  return token;
}

async function callTelegramApi<T>(method: string, params: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${botToken()}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  const data = await response.json();
  if (!data.ok) {
    throw new Error(`Telegram API ${method} falló: ${data.description ?? response.statusText}`);
  }
  return data.result as T;
}

export function setWebhook(url: string, secretToken: string) {
  return callTelegramApi("setWebhook", {
    url,
    secret_token: secretToken,
    allowed_updates: ["message", "chat_join_request"],
  });
}

export function getWebhookInfo() {
  return callTelegramApi<{
    url: string;
    pending_update_count: number;
    last_error_date?: number;
    last_error_message?: string;
  }>("getWebhookInfo", {});
}

export function createJoinRequestInviteLink(chatId: string | number, name: string) {
  return callTelegramApi<{ invite_link: string }>("createChatInviteLink", {
    chat_id: chatId,
    name,
    creates_join_request: true,
  });
}

// Devuelve `true` si se aprobó. Si la solicitud ya no existe (ej. el usuario la
// canceló, o ya fue resuelta por un admin humano o por una entrega duplicada del
// webhook), Telegram responde con error — se trata como no-op benigno, no como fallo.
export async function approveChatJoinRequest(chatId: string | number, userId: number): Promise<boolean> {
  try {
    await callTelegramApi("approveChatJoinRequest", { chat_id: chatId, user_id: userId });
    return true;
  } catch {
    return false;
  }
}

export async function declineChatJoinRequest(chatId: string | number, userId: number): Promise<boolean> {
  try {
    await callTelegramApi("declineChatJoinRequest", { chat_id: chatId, user_id: userId });
    return true;
  } catch {
    return false;
  }
}

export function sendMessage(chatId: string | number, text: string) {
  return callTelegramApi("sendMessage", { chat_id: chatId, text, parse_mode: "HTML" });
}

export function getChat(chatId: string | number) {
  return callTelegramApi("getChat", { chat_id: chatId });
}
