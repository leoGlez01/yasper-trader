import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn(
    "Faltan SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY — la base de datos fallará hasta que las " +
      "configures en .env.local. El resto del sitio sigue funcionando mientras tanto.",
  );
}

// Cliente server-only con la service-role key. Nunca importar este módulo
// desde código que se ejecute en el navegador — la service-role key evita
// cualquier RLS y tiene acceso total a la base de datos.
export const supabase = createClient(
  supabaseUrl || "https://placeholder.supabase.co",
  supabaseKey || "placeholder-service-role-key",
  { auth: { persistSession: false } },
);
