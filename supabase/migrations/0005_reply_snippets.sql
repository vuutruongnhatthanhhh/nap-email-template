-- Quick-reply snippets: short canned-response text inserted into Gmail's
-- inline reply box (replying within a thread), separate from `templates`
-- (which are full new emails with subject + per-recipient personalization).

create table if not exists reply_snippets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  content_html text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reply_snippets_owner_idx on reply_snippets (owner_id);

drop trigger if exists reply_snippets_set_updated_at on reply_snippets;
create trigger reply_snippets_set_updated_at
  before update on reply_snippets
  for each row execute function set_updated_at();

alter table reply_snippets enable row level security;

drop policy if exists "reply_snippets_owner_all" on reply_snippets;
create policy "reply_snippets_owner_all" on reply_snippets
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
