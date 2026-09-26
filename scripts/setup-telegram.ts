// Script de un solo uso: crea el link "solicitar unirse" de cada grupo y
// registra el webhook del bot. Ejecutar con:
//   npx tsx scripts/setup-telegram.ts
//
// Requiere en .env.local: TELEGRAM_BOT_TOKEN, TELEGRAM_CURSO_CHAT_ID,
// TELEGRAM_VIP_CHAT_ID, NEXT_PUBLIC_SITE_URL, TELEGRAM_WEBHOOK_SECRET.
//
// Antes de correrlo: el bot debe ya ser administrador de ambos grupos con
// el permiso "Invitar usuarios" (can_invite_users).
import dotenv from "dotenv";
import { createJoinRequestInviteLink, setWebhook, getWebhookInfo } from "../lib/telegram";

dotenv.config({ path: ".env.local" });

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

  const webhookUrl = `${siteUrl.replace(/\/+$/, "")}/api/webhooks/telegram`;
  console.log(`\nRegistrando webhook en ${webhookUrl}...`);
  await assertWebhookReachable(webhookUrl);
  await setWebhook(webhookUrl, webhookSecret);

  const info = await getWebhookInfo();
  console.log("Webhook registrado:", info);
}

// Telegram NO sigue redirecciones al entregar un webhook: si la URL responde
// 3xx, cada update falla con 404/3xx y el bot queda mudo sin error visible.
// Esta comprobación evita registrar un dominio que redirige (p. ej. sin `www`).
async function assertWebhookReachable(url: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(url, { method: "GET", redirect: "manual" });
  } catch (error) {
    throw new Error(`No se pudo alcanzar ${url}: ${(error as Error).message}`);
  }
  if (response.status >= 300 && response.status < 400) {
    const location = response.headers.get("location") ?? "(sin cabecera Location)";
    throw new Error(
      `${url} responde ${response.status} y redirige a ${location}. ` +
        "Telegram no sigue redirecciones: pon en NEXT_PUBLIC_SITE_URL la URL final, la que no redirige.",
    );
  }
  // 405 es lo esperado: la ruta existe pero solo acepta POST. Cualquier otro
  // código significa que la ruta no está desplegada y los updates se perderían.
  if (response.status !== 405 && response.status < 500) {
    console.warn(`  ⚠ La ruta respondió ${response.status} (se esperaba 405). Verifica el despliegue.`);
  }
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
