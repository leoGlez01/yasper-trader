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
- `NEXT_PUBLIC_SITE_URL` público por HTTPS.

## Orden recomendado

1. Crea el bot en @BotFather.
2. Añade el bot como administrador en ambos grupos, con permiso de invitar usuarios.
3. Obtén los `chat_id` de los grupos.
4. Completa `.env.local` con los valores anteriores.
5. Ejecuta `npm run setup:telegram`.
6. Copia los dos links que imprime la consola a:
   - `NEXT_PUBLIC_TELEGRAM_CURSO_JOIN_LINK`
   - `NEXT_PUBLIC_TELEGRAM_VIP_JOIN_LINK`
7. Haz una prueba completa con Stripe en modo test.

## Prueba rápida

1. Compra con una tarjeta de prueba.
2. En la página de éxito, toca "Conectar mi Telegram".
3. Abre el bot, envía `/start`, y confirma que recibe los links.
4. Entra a ambos grupos con "Solicitar unirse".
5. Verifica que el bot aprueba automáticamente.

## Si algo falla

- Si el bot no responde, revisa que `TELEGRAM_WEBHOOK_SECRET` y el webhook registrado coincidan.
- Si no aprueba grupos, revisa que el bot siga siendo admin y que los `chat_id` sean correctos.
- Si el enlace de conexión no aparece, revisa `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`.