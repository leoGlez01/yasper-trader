import { randomBytes } from "node:crypto";

// Genera un token corto y opaco para el deep link `t.me/<bot>?start=<token>`.
// El parámetro `start` de Telegram solo acepta [A-Za-z0-9_-] y máx. 64 caracteres;
// base64url usa exactamente ese alfabeto, así que no hace falta ningún escape.
export function generateLinkToken(): string {
  return randomBytes(16).toString("base64url");
}
