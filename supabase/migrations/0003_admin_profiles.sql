-- Admin accounts: public self sign-up is turned off (do that in the
-- dashboard — see README), new accounts can only be created by an admin via
-- the Supabase service_role key. This table tracks who's an admin.

create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

alter table profiles enable row level security;

-- A user can only read their own row — enough to answer "am I admin?" on
-- the client. The full user list / admin-creation flow goes through the
-- server-side /api/admin/users route (service_role key), not direct
-- client queries, so there's no policy here for reading everyone's row.
drop policy if exists "profiles_self_select" on profiles;
create policy "profiles_self_select" on profiles
  for select
  using (id = auth.uid());

-- Every new auth user (whether self-signed-up before this migration, or
-- created later by an admin) gets a profiles row. The hardcoded email
-- becomes admin automatically — this is the bootstrap admin.
create or replace function handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, is_admin)
  values (new.id, new.email = 'vuutruongnhatthanh@gmail.com')
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- Backfill: if that account already exists (it does — it's been used to
-- test this project), promote it to admin right now instead of waiting
-- for a fresh signup that will never happen.
insert into public.profiles (id, is_admin)
select id, true from auth.users where email = 'vuutruongnhatthanh@gmail.com'
on conflict (id) do update set is_admin = true;

-- Backfill: everyone else who already has an account keeps working, just
-- not as admin.
insert into public.profiles (id, is_admin)
select id, false from auth.users
on conflict (id) do nothing;
