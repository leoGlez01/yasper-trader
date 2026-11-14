-- Suscripción y bot separados para el nuevo producto mensual de Telegram.
create table community_subscriptions (
  id                          uuid primary key default gen_random_uuid(),
  person_id                   uuid not null references people(id),
  stripe_subscription_id      text not null unique,
  stripe_checkout_session_id  text unique,
  stripe_customer_id          text,
  stripe_price_id             text not null,
  status                      text not null,
  livemode                    boolean not null default false,
  current_period_end          timestamptz,
  last_payment_failed_at      timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

create index community_subscriptions_person_id_idx on community_subscriptions (person_id);
create index community_subscriptions_status_idx on community_subscriptions (status, last_payment_failed_at);

create table community_link_tokens (
  token                       text primary key,
  person_id                   uuid not null references people(id),
  stripe_checkout_session_id  text unique,
  telegram_user_id            bigint,
  status                      text not null default 'pending' check (status in ('pending', 'used')),
  created_at                  timestamptz not null default now(),
  used_at                     timestamptz
);

create table community_join_requests (
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

create unique index community_one_pending_per_user_chat
  on community_join_requests (telegram_user_id, chat_id)
  where status = 'pending';
create index community_join_requests_telegram_user_id_idx on community_join_requests (telegram_user_id);

create table community_memberships (
  id                uuid primary key default gen_random_uuid(),
  person_id         uuid references people(id),
  telegram_user_id  bigint not null,
  telegram_username text,
  chat_id           bigint not null,
  status            text not null check (status in ('pending', 'member', 'left')),
  joined_at         timestamptz,
  removed_at        timestamptz,
  updated_at        timestamptz not null default now(),
  unique (telegram_user_id, chat_id)
);

create index community_memberships_person_id_idx on community_memberships (person_id, status);

create table community_stripe_webhook_events (
  id           text primary key,
  type         text not null,
  received_at  timestamptz not null default now()
);
