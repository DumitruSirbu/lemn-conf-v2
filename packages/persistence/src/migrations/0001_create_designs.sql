create table if not exists designs (
  id text primary key,
  schema_version integer not null,
  document jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
