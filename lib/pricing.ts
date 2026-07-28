import { stripe } from "./stripe";

// Lee el precio directamente de Stripe en vez de hardcodearlo en el sitio,
// para que nunca queden desincronizados. Si el Price aún no está configurado
// (ej. en desarrollo local antes de crear los productos en Stripe), devuelve
// null y la página muestra un texto de respaldo.
export async function formatPrice(priceId: string | undefined): Promise<string | null> {
  if (!priceId) return null;
  try {
    const price = await stripe.prices.retrieve(priceId);
    if (price.unit_amount == null) return null;
    const amount = new Intl.NumberFormat("es", {
      style: "currency",
      currency: price.currency,
      minimumFractionDigits: price.unit_amount % 100 === 0 ? 0 : 2,
    }).format(price.unit_amount / 100);
    return price.recurring ? `${amount}/mes` : amount;
  } catch (error) {
    console.error("No se pudo obtener el precio de Stripe", error);
    return null;
  }
}
