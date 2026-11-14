// Configura el bot y el enlace con solicitud de unión del nuevo grupo mensual.
// Ejecutar con: npx tsx scripts/setup-community-telegram.ts
import dotenv from "dotenv";
import {
  createCommunityJoinRequestLink,
  getCommunityWebhookInfo,
  setCommunityWebhook,
} from "../lib/community-telegram";

dotenv.config({ path: ".env.local" });

async function main(): Promise<void> {
  const chatId = requireEnv("COMMUNITY_TELEGRAM_CHAT_ID");
  const siteUrl = requireEnv("NEXT_PUBLIC_SITE_URL");
  const webhookSecret = requireEnv("COMMUNITY_TELEGRAM_WEBHOOK_SECRET");
  const joinLink = await createCommunityJoinRequestLink(chatId, "Membresía mensual");

  console.log("Guarda este enlace de solicitud en .env.local:");
  console.log(`COMMUNITY_TELEGRAM_JOIN_LINK=${joinLink.invite_link}`);

  const webhookUrl = `${siteUrl.replace(/\/+$/, "")}/api/webhooks/telegram-community`;
  console.log(`\nRegistrando webhook independiente en ${webhookUrl}...`);
  await assertWebhookReachable(webhookUrl);
  await setCommunityWebhook(webhookUrl, webhookSecret);
  console.log("Webhook registrado:", await getCommunityWebhookInfo());
}

async function assertWebhookReachable(url: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, { method: "GET", redirect: "manual" });
  } catch (error) {
    throw new Error(`No se pudo alcanzar ${url}: ${(error as Error).message}`);
  }
  if (response.status >= 300 && response.status < 400) {
    throw new Error(`${url} redirige; configura NEXT_PUBLIC_SITE_URL con el dominio final sin redirección.`);
  }
  if (response.status !== 405 && response.status < 500) {
    console.warn(`La ruta respondió ${response.status}; verifica el despliegue antes de usar el bot.`);
  }
}

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

main().catch((error) => {
  console.error("No se pudo configurar el bot mensual", error);
  process.exit(1);
});
