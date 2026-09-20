-- Seguimiento de la unica clase incluida en la compra.
alter table people
  add column if not exists class_completed_at timestamptz,
  add column if not exists class_completed_by bigint;

create index if not exists people_class_completed_idx on people (class_completed_at);