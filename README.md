# Yasper Trader

Sitio web de Yasper — Mentoría de Traders. Un producto vía Stripe con cobro mensual: **Curso Cero a Trader**, que desbloquea a la vez los dos grupos privados de
Telegram (Curso y VIP).

El acceso a ambos grupos se protege sin exponer nunca un link "secreto": los grupos exigen
aprobación para unirse, y un bot de Telegram aprueba automáticamente solo a quienes tienen un
pago válido registrado. Ver el detalle completo del diseño en
`C:\Users\Leo\.claude\plans\mossy-hugging-treasure.md`.

## Puesta en marcha

### 1. Instalar dependencias

```bash
npm install
```

### 2. Crear el proyecto de Supabase

1. Crea un proyecto en [supabase.com](https://supabase.com).
2. Corre la migración `supabase/migrations/0001_init.sql` (desde el SQL Editor del panel, o con la
   CLI de Supabase).
3. Copia `SUPABASE_URL` y la `service_role` key (Project Settings → API) a tu `.env.local`.

### 3. Crear el bot de Telegram

1. Habla con [@BotFather](https://t.me/BotFather) → `/newbot` → guarda el `TELEGRAM_BOT_TOKEN`.
2. Crea (o usa) los dos grupos privados (Curso y VIP). Para obtener el `chat_id` de cada uno,
   añade temporalmente el bot [@RawDataBot](https://t.me/RawDataBot) al grupo, o revisa los logs
   del webhook tras el primer mensaje.
3. Añade tu bot como **administrador** de ambos grupos, con el permiso "Invitar usuarios"
   (`can_invite_users`). No necesita ningún otro permiso.
4. Completa en `.env.local`: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CURSO_CHAT_ID`, `TELEGRAM_VIP_CHAT_ID`,
   `TELEGRAM_WEBHOOK_SECRET` (invéntate una cadena aleatoria larga), `TELEGRAM_CLIENT_CHAT_ID` (chat privado del cliente para avisos), `NEXT_PUBLIC_SITE_URL` (debe
   ser una URL HTTPS pública para que Telegram pueda llamarla — usa tu dominio de Vercel o un
   túnel como ngrok en desarrollo) y `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` (sin el `@`).
5. Corre `npm run setup:telegram` — esto crea el link de "solicitar unirse" de cada grupo y
   registra el webhook del bot. Copia los dos links que imprime a `NEXT_PUBLIC_TELEGRAM_CURSO_JOIN_LINK`
   y `NEXT_PUBLIC_TELEGRAM_VIP_JOIN_LINK` en tu `.env.local`.

Si quieres la guía operativa paso a paso para este flujo, revisa [telegram_bot.md](telegram_bot.md).

### 4. Configurar Stripe

1. En modo de prueba, crea un producto con un Price recurrente mensual (`recurring/month`).
2. Copia el ID del Price a `STRIPE_PRICE_ID`, y tu clave secreta a `STRIPE_SECRET_KEY`.
3. En desarrollo, usa la [Stripe CLI](https://docs.stripe.com/stripe-cli) para reenviar webhooks:
   ```bash
   stripe listen --forward-to localhost:3000/api/webhooks/stripe
   ```
   La CLI te da un `whsec_...` — pégalo en `STRIPE_WEBHOOK_SECRET`. Escucha también `invoice.paid`,
   `invoice.payment_failed`, `customer.subscription.updated` y `customer.subscription.deleted`.
   En producción, crea el
   webhook endpoint desde el Dashboard de Stripe apuntando a
   `https://tudominio.com/api/webhooks/stripe`, suscrito a esos cinco eventos.

   Para que el bot pueda escribir al cliente, el cliente debe abrir el bot y enviar `/start` una
   vez. Un bot no puede iniciar conversaciones por sí mismo.

### 5. Video del header

El componente `HeroVideo` lee la URL pública del video desde `NEXT_PUBLIC_HERO_VIDEO_URL` — no se
bundlea ningún archivo de video en el repo. Sube el video a un bucket público de **Supabase
Storage** (recomendado, ya usamos Supabase) o a **Cloudinary**, y pega la URL resultante en esa
variable. Ver el detalle en `next_step.md`. Sin esta variable, el sitio muestra un placeholder en
vez de romperse.

### 6. Correr el sitio

```bash
npm run dev
```

## Probar el flujo completo

1. Compra con una [tarjeta de prueba de Stripe](https://docs.stripe.com/testing).
2. En la página de éxito, toca "Conectar mi Telegram" (abre un chat con el bot).
3. El bot te da los links de **ambos** grupos — toca "Solicitar unirse" en cada uno.
4. Deberías quedar aprobado automáticamente en los dos, en unos segundos. Prueba también el orden
   inverso: solicita unirte a un grupo *antes* de pagar — la aprobación debe llegar en cuanto el
   pago se confirme, sin tener que solicitar de nuevo.

## Notas de seguridad

- Los únicos links de Telegram que se publican en el sitio son los de "solicitar unirse"
  (`creates_join_request: true`) — no otorgan acceso por sí mismos, solo permiten pedirlo.
- Nunca se usa `@username` de Telegram para decisiones de acceso, solo el `telegram_user_id`
  numérico obtenido de forma verificada vía el handshake `/start <token>`.
- Todas las tablas de Supabase se acceden únicamente server-side con la service-role key.


npm run setup:telegram

stripe listen --forward-to https://tu-nueva-url.ngrok-free.dev/api/webhooks/stripe