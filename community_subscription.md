# Membresía mensual con Telegram

Este flujo es independiente del producto de pago puntual y de los bots/grupos existentes. Comparte
el sitio web, Stripe y la tabla `people` de Supabase, pero usa tablas, webhooks y un bot propios.

## Configuración

1. Aplica `supabase/migrations/0004_community_subscriptions.sql` en el mismo proyecto de Supabase.
2. En la misma cuenta de Stripe, crea un producto con un precio recurrente mensual (intervalo de un
   mes) y copia su Price ID.
3. Crea un bot nuevo con @BotFather y un grupo privado nuevo. Añade ese bot como administrador con
   permiso para aprobar solicitudes de ingreso, ver actualizaciones de miembros y expulsarlos.
4. Configura estas variables en `.env.local` y en Vercel:

   ```text
   STRIPE_MONTHLY_PRICE_ID=price_...
   STRIPE_COMMUNITY_WEBHOOK_SECRET=whsec_...
   COMMUNITY_TELEGRAM_BOT_TOKEN=...
   COMMUNITY_TELEGRAM_BOT_USERNAME=...
   COMMUNITY_TELEGRAM_CHAT_ID=...
   COMMUNITY_TELEGRAM_WEBHOOK_SECRET=...
   COMMUNITY_TELEGRAM_ADMIN_CHAT_ID=...
   CRON_SECRET=...
   ```

   También se usan `STRIPE_SECRET_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` y
   `NEXT_PUBLIC_SITE_URL`, ya existentes. El administrador debe abrir el bot nuevo y enviar `/start`
   antes de que pueda recibir mensajes. `COMMUNITY_TELEGRAM_ADMIN_CHAT_ID` es el ID del chat privado
   al que se mandará el informe; puede ser el mismo ID numérico usado para avisos anteriores.

5. Despliega la aplicación y ejecuta:

   ```bash
   npm run setup:community-telegram
   ```

   Guarda el `COMMUNITY_TELEGRAM_JOIN_LINK` impreso en Vercel y en `.env.local`.
6. Crea un endpoint nuevo en Stripe apuntando a
   `https://tu-dominio/api/webhooks/stripe-community` con los eventos:
   `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed`,
   `customer.subscription.updated`, `customer.subscription.paused`,
   `customer.subscription.resumed` y `customer.subscription.deleted`. Guarda su firma en
   `STRIPE_COMMUNITY_WEBHOOK_SECRET`. Conserva también el endpoint del producto actual; el webhook
   existente ignora los eventos marcados como `community_telegram_v1`.
7. El proyecto debe estar en Vercel Pro para la revisión horaria. `vercel.json` ejecuta la
   expulsión cada hora y envía el listado diario a las 09:00 UTC. Vercel añade la cabecera de
   autorización usando `CRON_SECRET`.

## Experiencia y reglas

- La página `/comunidad` inicia un Checkout de Stripe en modo suscripción. El servidor comprueba que
  `STRIPE_MONTHLY_PRICE_ID` sea mensual; el pago puntual existente mantiene su endpoint y precio.
- El correo de checkout se vincula a una fila de `people`; un enlace profundo de un solo uso asocia
  su `telegram_user_id`. Los pagos de prueba no conceden acceso.
- El bot nuevo envía el enlace de solicitud de ingreso y aprueba a suscriptores vigentes. Los fallos
  de cobro se incluyen en el informe privado diario.
- Tras 72 horas desde el primer fallo sin pago, la tarea horaria retira al miembro del grupo. Si
  después vuelve a pagar, el bot puede enviarle el enlace para solicitar acceso otra vez.
- El informe incluye a los miembros que siguen en el grupo y tienen una suscripción pendiente o
  vencida (o no tienen una suscripción real asociada); no mezcla compras del producto puntual ni
  clientes del bot anterior.

## Prueba antes de producción

Usa un Price de prueba y webhook de Stripe CLI dirigido a
`/api/webhooks/stripe-community`. La base de datos no dará acceso a sesiones `cs_test_`. Para validar
el recorrido de Telegram y los crons con datos reales, configura Stripe Live, el bot nuevo y el grupo
privado de producción antes de abrir la membresía a clientes.
