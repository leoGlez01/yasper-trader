# Yasper Trader — Próximos pasos con el cliente

La web ya está desplegada en Vercel. Lo que falta no es código — es crear las cuentas reales
(Stripe, Telegram, Supabase) y cargar sus credenciales. Esta guía está organizada para usarla
en una llamada/reunión con Yasper: qué necesitas de él, qué decisiones solo él puede tomar, y el
checklist técnico para dejarlo funcionando.

---

## 1. Decisiones que solo Yasper puede tomar

Antes de tocar ninguna cuenta, confirma esto con él — todo lo demás depende de estas respuestas:

- [ ] **Precio del producto** (el pago único que da acceso al curso + grupo VIP).
- [ ] **¿La cuenta de Stripe debe ser de él o tuya?** — Importante: el dinero de los cobros llega
      a la cuenta bancaria vinculada al Stripe que se use. Casi siempre lo correcto es que sea
      **la cuenta de Stripe de Yasper** (la crea él, o te da acceso como colaborador a la suya).
      Si usas tu propia cuenta de Stripe, el dinero te llegaría a ti, no a él.
- [ ] **¿Quién administra los dos grupos de Telegram hoy?** Necesitas que Yasper (o quien sea
      admin actual) añada al bot como administrador — eso no lo puedes hacer tú sin acceso a esos
      grupos.
- [ ] **Confirmar el texto "Grupo VIP incluido — 6 meses gratis"**: hoy es solo texto de marketing,
      el sistema no expulsa a nadie automáticamente después de 6 meses (no hay ningún cobro
      recurrente ni control de vencimiento todavía). Si él espera que el acceso VIP se corte solo
      pasados los 6 meses, eso es una función que **no está construida** — hay que decidir si se
      queda así por ahora (acceso permanente en la práctica) o si se agrega esa lógica más adelante.
- [ ] **Dominio `yaspertrader.com`**: ¿ya lo tiene comprado/gestionable? Se conecta desde Vercel
      (Project Settings → Domains) apuntando el DNS al proyecto.

---

## 2. Lo que necesitas que Yasper haga o te dé

- [ ] Acceso a sus dos grupos de Telegram (Curso y VIP) — o que él mismo añada el bot y le dé el
      permiso de "Invitar usuarios" siguiendo tus instrucciones (ver sección 4).
- [ ] Acceso a su cuenta de Stripe (como colaborador), o que la cree él siguiendo tus instrucciones.
- [ ] El monto del producto.
- [ ] Los datos de su negocio para activar Stripe en modo real (Stripe los pide al activar pagos:
      datos fiscales/bancarios — eso solo lo puede completar él, es su cuenta).
- [ ] Acceso al DNS del dominio (o que él mismo agregue los registros que te dé Vercel).

---

## 3. Lo que puedes hacer tú solo (sin esperar a Yasper)

- [ ] Crear el proyecto de Supabase y correr la migración (`supabase/migrations/0001_init.sql`).
- [ ] Crear el bot en @BotFather (el bot lo creas tú con tu Telegram, no hace falta que sea la
      cuenta de Yasper — solo necesita ser **admin** de los grupos, sin importar quién lo creó).
- [ ] Cargar todas las variables de entorno en Vercel (Project Settings → Environment Variables)
      una vez tengas cada valor.

---

## 4. Checklist técnico

### Supabase

1. [ ] Crear proyecto en [supabase.com](https://supabase.com).
2. [ ] SQL Editor → pegar `supabase/migrations/0001_init.sql` → Run (crea `people`, `link_tokens`,
       `purchases`, `telegram_join_requests`, `stripe_webhook_events`).
3. [ ] Project Settings → API → copiar `Project URL` (`SUPABASE_URL`) y la `service_role` key
       (⚠️ no la `anon`) → `SUPABASE_SERVICE_ROLE_KEY`.

### Telegram

1. [ ] @BotFather → `/newbot` → guardar el token → `TELEGRAM_BOT_TOKEN`.
2. [ ] Guardar el username del bot (sin `@`) → `NEXT_PUBLIC_TELEGRAM_BOT_USERNAME`.
3. [ ] Yasper (o el admin actual) añade el bot como **administrador** en ambos grupos, con
       **únicamente** el permiso "Invitar usuarios por link" (`can_invite_users`).
4. [ ] Obtener el `chat_id` de cada grupo: añade temporalmente
       [@RawDataBot](https://t.me/RawDataBot) al grupo, busca `"chat":{"id": -100...}` en el
       mensaje que envía, y quítalo después.
       → `TELEGRAM_CURSO_CHAT_ID`, `TELEGRAM_VIP_CHAT_ID`.
5. [ ] Definir `TELEGRAM_WEBHOOK_SECRET` (una cadena aleatoria larga — ej. `openssl rand -hex 32`).
6. [ ] Con `NEXT_PUBLIC_SITE_URL` ya apuntando al dominio real (o a la URL de Vercel si el dominio
       propio aún no está conectado) y las variables anteriores cargadas, correr localmente:
       ```bash
       npm run setup:telegram
       ```
       Esto crea el link de "solicitar unirse" de cada grupo y registra el webhook del bot.
7. [ ] Copiar los dos links que imprime la consola →
       `NEXT_PUBLIC_TELEGRAM_CURSO_JOIN_LINK`, `NEXT_PUBLIC_TELEGRAM_VIP_JOIN_LINK`.

### Stripe

1. [ ] En la cuenta de Stripe correcta (ver sección 1): crear un producto de pago único con el
       precio que definió Yasper → copiar el **Price ID** (`price_...`) → `STRIPE_PRICE_ID`.
2. [ ] Developers → API keys → Secret key (modo prueba primero, `sk_test_...`) → `STRIPE_SECRET_KEY`.
3. [ ] Developers → Webhooks → "Add endpoint" → URL: `https://tudominio.com/api/webhooks/stripe`
       → suscribir únicamente a `checkout.session.completed` → copiar el **Signing secret**
       (`whsec_...`) → `STRIPE_WEBHOOK_SECRET`.

### Vercel

1. [ ] Cargar **todas** las variables anteriores en Project Settings → Environment Variables.
2. [ ] `NEXT_PUBLIC_SITE_URL` = la URL final del sitio (dominio propio o el `.vercel.app`).
3. [ ] Conectar el dominio `yaspertrader.com` en Project Settings → Domains (si ya está listo).
4. [ ] Redeploy después de cargar las variables (Vercel no las aplica a builds ya hechos).

---

## 5. Probar juntos antes de anunciar el sitio

Con todo en modo de **prueba** (Stripe test mode):

- [ ] Comprar con una [tarjeta de prueba](https://docs.stripe.com/testing) (`4242 4242 4242 4242`).
- [ ] Confirmar que llega el mensaje del bot con los dos links de Telegram.
- [ ] Solicitar unirse a ambos grupos y confirmar que aprueba automáticamente.
- [ ] Que Yasper revise el copy del sitio (precio, textos, el video) una última vez.
- [ ] Recién ahí: activar Stripe en modo **live** (claves y webhook reales) y hacer una compra
      real de bajo monto para confirmar que también funciona en producción.

---

## Notas

- El bot siempre puede ser reemplazado por aprobación manual desde la app de Telegram — si algo
  falla, Yasper puede aprobar solicitudes a mano mientras se revisa el problema.
- Nada de esto requiere volver a tocar código — es 100% configuración de cuentas y variables de
  entorno.
