Crear el precio mensual en Stripe.
En la misma cuenta de Stripe, crea un producto nuevo con un precio recurrente de cada mes. Copia el Price ID (price_...); irá en STRIPE_MONTHLY_PRICE_ID. No cambies STRIPE_PRICE_ID, que sigue siendo el del pago puntual.

Crear el bot y el grupo nuevos.
En @BotFather crea otro bot y luego crea el grupo privado para la membresía. Añade ese bot como administrador con permiso para aprobar solicitudes de ingreso y expulsar miembros. No reutilices el token ni el ID de los otros grupos.

Configurar las variables en Vercel.
Además de las variables actuales de Stripe, Supabase y NEXT_PUBLIC_SITE_URL, añade:

STRIPE_MONTHLY_PRICE_ID
COMMUNITY_TELEGRAM_BOT_TOKEN
COMMUNITY_TELEGRAM_BOT_USERNAME — sin @
COMMUNITY_TELEGRAM_CHAT_ID
COMMUNITY_TELEGRAM_WEBHOOK_SECRET
COMMUNITY_TELEGRAM_ADMIN_CHAT_ID — el ID del chat privado donde recibirás los avisos; puede ser el mismo ID numérico que usas actualmente.
CRON_SECRET
Genera secretos largos y aleatorios para COMMUNITY_TELEGRAM_WEBHOOK_SECRET y CRON_SECRET; no reutilices el secreto del bot actual. El nuevo bot también debe recibir un /start tuyo para poder enviarte mensajes.

Desplegar la aplicación.
Despliega los cambios en Vercel para que estén disponibles las nuevas rutas. Tu plan Pro permite ejecutar la revisión de accesos cada hora.

Configurar el webhook de Telegram y el enlace del grupo.
Con las variables anteriores también en tu .env.local, ejecuta localmente:


El script registra el webhook del bot nuevo y genera un enlace de solicitud de ingreso. Añade el valor que imprime como COMMUNITY_TELEGRAM_JOIN_LINK en Vercel y vuelve a desplegar.

Crear el webhook nuevo en Stripe.
En Stripe añade un endpoint independiente:


Selecciona estos eventos: checkout.session.completed, invoice.paid, invoice.payment_failed, customer.subscription.updated, customer.subscription.paused, customer.subscription.resumed y customer.subscription.deleted. Guarda el whsec_... que Stripe muestra como STRIPE_COMMUNITY_WEBHOOK_SECRET en Vercel y vuelve a desplegar. Conserva el endpoint actual del producto de pago puntual.

Probar el flujo.
Entra en /comunidad, completa el checkout, conecta Telegram con el enlace de confirmación y solicita unirte al grupo. Confirma que el bot apruebe el acceso y que el informe diario llegue a tu chat privado. Puedes revisar las ejecuciones de Vercel Cron: el listado corre a las 09:00 UTC y la revisión para expulsar impagos, cada hora.

Nota: los pagos de prueba de Stripe no conceden acceso al grupo. Sirven para revisar el checkout y los webhooks; la prueba completa de acceso requiere Stripe en modo Live. Para el detalle operativo, sigue community_subscription.md.