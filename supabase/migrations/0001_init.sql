-- Yasper Trader — esquema inicial
-- Todas las tablas se acceden únicamente server-side con la service-role key.
-- No se habilita Supabase Auth ni RLS orientado a clientes: no hay clientes accediendo directo.

create extension if not exists pgcrypto;

-- Una fila por persona real que conocemos.
create table people (
  id                  uuid primary key default gen_random_uuid(),
  email               text,
  telegram_user_id    bigint unique,
  telegram_username   text,
  stripe_customer_id  text,
  created_at          timestamptz not null default now()
);

-- Tokens cortos para el handshake "/start <token>" que vincula el pago con el Telegram del usuario.
-- Un solo producto: no hace falta distinguir "purpose" (curso vs vip), la compra da acceso a ambos.
create table link_tokens (
  token       text primary key,
  person_id   uuid not null references people(id),
  status      text not null default 'pending' check (status in ('pending', 'used')),
  created_at  timestamptz not null default now(),
  used_at     timestamptz
);

-- Compra única: da acceso permanente a ambos grupos de Telegram (Curso y VIP).
-- Sin suscripciones — un solo pago, sin cobros recurrentes.
create table purchases (
  id                          uuid primary key default gen_random_uuid(),
  person_id                   uuid not null references people(id),
  stripe_checkout_session_id  text unique,
  stripe_payment_intent_id    text,
  status                      text not null default 'pending' check (status in ('pending', 'paid', 'refunded')),
  amount_total                integer,
  currency                    text,
  created_at                  timestamptz not null default now(),
  paid_at                     timestamptz
);

-- Cada chat_join_request recibido de Telegram: auditoría, idempotencia y el mecanismo
-- que permite aprobar retroactivamente cuando el pago llega después de la solicitud.
create table telegram_join_requests (
  id                uuid primary key default gen_random_uuid(),
  telegram_user_id  bigint not null,
  telegram_username text,
  chat_id           bigint not null,
  status            text not null default 'pending' check (status in ('pending', 'approved', 'declined')),
  invite_link       text,
  request_date      timestamptz not null,
  resolved_at       timestamptz,
  raw_update        jsonb,
  created_at        timestamptz not null default now()
);

-- Como máximo una solicitud "pending" activa por (usuario, chat) — evita duplicados
-- cuando Telegram reintenta la entrega del mismo chat_join_request.
create unique index one_pending_per_user_chat
  on telegram_join_requests (telegram_user_id, chat_id)
  where status = 'pending';

-- Idempotencia de webhooks de Stripe (Stripe entrega eventos al menos una vez, con reintentos).
create table stripe_webhook_events (
  id           text primary key,
  type         text not null,
  received_at  timestamptz not null default now()
);

create index purchases_person_id_idx on purchases (person_id);
create index telegram_join_requests_telegram_user_id_idx on telegram_join_requests (telegram_user_id);
