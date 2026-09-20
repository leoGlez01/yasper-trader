# Bot de Telegram

Esta aplicación ya trae la lógica del bot integrada. El siguiente paso es solo dejarla conectada
con tus credenciales y los dos grupos privados.

## Lo que ya está implementado

- Webhook en `/api/webhooks/telegram`.
- Enlace profundo `t.me/<bot>?start=<token>` para conectar la compra con el Telegram del usuario.
- Aprobación automática de solicitudes de ingreso cuando la persona ya pagó.
- Script de alta `npm run setup:telegram` para crear los links de "solicitar unirse" y registrar
  el webhook.

## Lo que necesitas reunir

- `TELEGRAM_BOT_TOKEN` de @BotFather.
- `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME` sin `@`.
- `TELEGRAM_CURSO_CHAT_ID` y `TELEGRAM_VIP_CHAT_ID`.
- `TELEGRAM_WEBHOOK_SECRET` aleatorio y largo.
- `TELEGRAM_CLIENT_CHAT_ID` del chat privado donde el cliente recibira avisos.
- `NEXT_PUBLIC_SITE_URL` público por HTTPS.

## Orden recomendado

1. Crea el bot en @BotFather.
2. Añade el bot como administrador en ambos grupos, con permiso de invitar usuarios.
3. Obtén los `chat_id` de los grupos.
4. El cliente debe abrir el bot y enviar `/start` una vez; un bot no puede iniciar una conversacion por si mismo.
5. Completa `.env.local` con los valores anteriores. `TELEGRAM_WEBHOOK_SECRET` no puede estar vacio.
6. Ejecuta `npm run setup:telegram`.
7. Copia los dos links que imprime la consola a:
   - `NEXT_PUBLIC_TELEGRAM_CURSO_JOIN_LINK`
   - `NEXT_PUBLIC_TELEGRAM_VIP_JOIN_LINK`
8. Ejecuta la migracion `supabase/migrations/0002_monthly_subscriptions.sql` en Supabase y haz una prueba completa con Stripe en modo test.
9. Ejecuta tambien `supabase/migrations/0003_class_tracking.sql` para activar el seguimiento de la clase.

## Prueba rápida

1. Compra con una tarjeta de prueba.
2. En la página de éxito, toca "Conectar mi Telegram".
3. Abre el bot, envía `/start`, y confirma que recibe los links.
4. Entra a ambos grupos con "Solicitar unirse".
5. Verifica que el bot aprueba automáticamente.

## Comandos del cliente

El cliente debe escribir al bot desde el chat cuyo ID está en `TELEGRAM_CLIENT_CHAT_ID`:

- `/resumen`: totales de pagos y clases.
- `/pagados`: lista numerada de clientes pagados y estado de su clase.
- `/pendientes`: clientes sin pago vigente.
- `/marcar_clase 1`: marca la clase del cliente número 1 de la lista `/pagados`.

## Si algo falla

- Si el bot no responde, revisa que `TELEGRAM_WEBHOOK_SECRET` y el webhook registrado coincidan.
- Para desarrollo, Telegram debe apuntar a `NEXT_PUBLIC_SITE_URL` (ngrok), mientras Stripe CLI debe reenviar a `localhost:3000/api/webhooks/stripe`.
- Si no aprueba grupos, revisa que el bot siga siendo admin y que los `chat_id` sean correctos.
- Si el enlace de conexión no aparece, revisa `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`.