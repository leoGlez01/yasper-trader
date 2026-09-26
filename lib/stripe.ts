import Stripe from "stripe";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
if (!stripeSecretKey) {
  console.warn(
    "Falta STRIPE_SECRET_KEY — el checkout real fallará hasta que la configures en .env.local. " +
      "El resto del sitio sigue funcionando (con fallback de precio) mientras tanto.",
  );
}

// Placeholder para que el SDK no truene al construirse sin la key real; cualquier
// llamada real a la API de Stripe seguirá fallando (de forma controlada) hasta
// que configures STRIPE_SECRET_KEY.
export const stripe = new Stripe(stripeSecretKey || "sk_test_not_configured");

// Criterio único para descartar pagos de prueba. Las sesiones `cs_test_` se crean
// con claves `sk_test_` y nunca mueven dinero, así que no deben:
//   - aparecer en ningún mensaje del bot ni contar en ninguna estadística,
//   - figurar como ingreso cobrado,
//   - dar acceso a los grupos de Telegram de pago.
// Se filtra en el punto de lectura para que ningún consumidor tenga que acordarse.
export function isTestSession(sessionId: string | null | undefined): boolean {
  return sessionId?.startsWith("cs_test_") ?? false;
}
