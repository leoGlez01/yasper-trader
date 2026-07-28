export default function LinkTelegramFallbackPage() {
  return (
    <section className="mx-auto max-w-2xl px-6 py-16">
      <h1 className="text-3xl font-bold text-gold-light">¿Perdiste el enlace de confirmación?</h1>
      <p className="mt-4 text-foreground/70">
        El enlace para conectar tu Telegram aparece justo después de pagar, en la página de
        confirmación de tu compra. Si cerraste esa página antes de completar el paso, escríbenos
        indicando el correo con el que pagaste y te lo reenviamos.
      </p>
    </section>
  );
}
