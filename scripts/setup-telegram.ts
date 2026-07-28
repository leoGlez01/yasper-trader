// Script de un solo uso: crea el link "solicitar unirse" de cada grupo y
// registra el webhook del bot. Ejecutar con:
//   npx tsx scripts/setup-telegram.ts
//
// Requiere en .env.local: TELEGRAM_BOT_TOKEN, TELEGRAM_CURSO_CHAT_ID,
// TELEGRAM_VIP_CHAT_ID, NEXT_PUBLIC_SITE_URL, TELEGRAM_WEBHOOK_SECRET.
//
// Antes de correrlo: el bot debe ya ser administrador de ambos grupos con
// el permiso "Invitar usuarios" (can_invite_users).
import "dotenv/config";
import { createJoinRequestInviteLink, setWebhook, getWebhookInfo } from "../lib/telegram";

async function main() {
  const cursoChatId = requireEnv("TELEGRAM_CURSO_CHAT_ID");
  const vipChatId = requireEnv("TELEGRAM_VIP_CHAT_ID");
  const siteUrl = requireEnv("NEXT_PUBLIC_SITE_URL");
  const webhookSecret = requireEnv("TELEGRAM_WEBHOOK_SECRET");

  console.log("Creando link de solicitud de unión para el grupo Curso...");
  const cursoLink = await createJoinRequestInviteLink(cursoChatId, "Solicitud Curso");
  console.log("  →", cursoLink.invite_link);

  console.log("Creando link de solicitud de unión para el grupo VIP...");
  const vipLink = await createJoinRequestInviteLink(vipChatId, "Solicitud VIP");
  console.log("  →", vipLink.invite_link);

  console.log("\nGuarda estos valores en tu .env (son seguros de publicar en el sitio):");
  console.log(`NEXT_PUBLIC_TELEGRAM_CURSO_JOIN_LINK=${cursoLink.invite_link}`);
  console.log(`NEXT_PUBLIC_TELEGRAM_VIP_JOIN_LINK=${vipLink.invite_link}`);

  const webhookUrl = `${siteUrl}/api/webhooks/telegram`;
  console.log(`\nRegistrando webhook en ${webhookUrl}...`);
  await setWebhook(webhookUrl, webhookSecret);

  const info = await getWebhookInfo();
  console.log("Webhook registrado:", info);
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
