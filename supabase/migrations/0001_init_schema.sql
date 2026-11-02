-- Run this in the Supabase SQL editor (Project > SQL Editor > New query).
-- Requires Supabase Auth to already be enabled (it is, by default).

create extension if not exists pgcrypto;

create table if not exists templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  subject text not null default '',
  body_html text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recipients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  name text,
  company text,
  template_id uuid references templates(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, email)
);

create index if not exists recipients_owner_idx on recipients (owner_id);
create index if not exists recipients_template_idx on recipients (template_id);
create index if not exists templates_owner_idx on templates (owner_id);

-- Keep updated_at fresh on every row update.
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists templates_set_updated_at on templates;
create trigger templates_set_updated_at
  before update on templates
  for each row execute function set_updated_at();

drop trigger if exists recipients_set_updated_at on recipients;
create trigger recipients_set_updated_at
  before update on recipients
  for each row execute function set_updated_at();

-- Row Level Security: every user only ever sees their own rows.
alter table templates enable row level security;
alter table recipients enable row level security;

drop policy if exists "templates_owner_all" on templates;
create policy "templates_owner_all" on templates
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "recipients_owner_all" on recipients;
create policy "recipients_owner_all" on recipients
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
