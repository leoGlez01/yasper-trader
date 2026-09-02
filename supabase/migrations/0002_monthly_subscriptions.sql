-- Campos para controlar renovaciones mensuales y fallos de cobro.
alter table purchases
  add column if not exists stripe_subscription_id text unique,
  add column if not exists subscription_status text,
  add column if not exists next_payment_at timestamptz,
  add column if not exists last_payment_failed_at timestamptz;

alter table purchases drop constraint if exists purchases_status_check;
alter table purchases add constraint purchases_status_check
  check (status in ('pending', 'paid', 'past_due', 'canceled', 'refunded'));

create index if not exists purchases_next_payment_at_idx on purchases (next_payment_at);