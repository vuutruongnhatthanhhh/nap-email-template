-- File attachments on templates. Unlike the template-images bucket (public,
-- referenced by <img src> in the email body), attachments are private —
-- they're fetched by the owner's authenticated client (web/extension) and
-- dropped directly into the Gmail compose window, never referenced by a
-- public URL.

create table if not exists template_attachments (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  template_id uuid not null references templates(id) on delete cascade,
  file_name text not null,
  storage_path text not null,
  content_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists template_attachments_template_idx on template_attachments (template_id);
create index if not exists template_attachments_owner_idx on template_attachments (owner_id);

alter table template_attachments enable row level security;

drop policy if exists "template_attachments_owner_all" on template_attachments;
create policy "template_attachments_owner_all" on template_attachments
  for all
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('template-attachments', 'template-attachments', false)
on conflict (id) do nothing;

drop policy if exists "template_attachments_owner_read" on storage.objects;
create policy "template_attachments_owner_read" on storage.objects
  for select
  using (bucket_id = 'template-attachments' and auth.uid() = owner);

drop policy if exists "template_attachments_owner_insert" on storage.objects;
create policy "template_attachments_owner_insert" on storage.objects
  for insert
  with check (bucket_id = 'template-attachments' and auth.uid() = owner);

drop policy if exists "template_attachments_owner_delete" on storage.objects;
create policy "template_attachments_owner_delete" on storage.objects
  for delete
  using (bucket_id = 'template-attachments' and auth.uid() = owner);
