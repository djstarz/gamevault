-- Run in Supabase SQL Editor. Safe to re-run for these additions.
-- Username login uses a synthetic address and therefore requires Confirm email OFF.
-- Never expose a service_role/secret key in the website.

alter table public.posts add column if not exists storage_path text;
alter table public.posts enable row level security;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  display_name text,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  constraint profiles_username_format check (username ~ '^[A-Za-z0-9_]{3,24}$')
);
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS display_name text;
alter table public.profiles enable row level security;

-- Create a profile automatically for every newly created username account.
create or replace function public.handle_new_gamevault_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, username)
  values (new.id, coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)))
  on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_gamevault_user_created on auth.users;
create trigger on_gamevault_user_created after insert on auth.users
for each row execute procedure public.handle_new_gamevault_user();

-- Profiles can be read by signed-in users; users may not update their own admin flag.
drop policy if exists "Profiles visible to authenticated users" on public.profiles;
create policy "Profiles visible to authenticated users" on public.profiles for select to authenticated using (true);
-- Users can update only their own display name.
DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;

CREATE POLICY "Users can update own profile"
ON public.profiles
FOR UPDATE
TO authenticated
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

REVOKE UPDATE ON TABLE public.profiles FROM authenticated;

GRANT UPDATE (display_name)
ON TABLE public.profiles
TO authenticated;
-- Allow admins to remove any post. Existing owner-delete policies remain valid.
drop policy if exists "Admins can delete any post" on public.posts;
create policy "Admins can delete any post" on public.posts for delete to authenticated
using (exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

-- Storage admin-delete policy for moderation. Existing owner-folder policies remain valid.
drop policy if exists "Admins can delete any GameVault media" on storage.objects;
create policy "Admins can delete any GameVault media" on storage.objects for delete to authenticated
using (bucket_id = 'gamevault-media' and exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin = true));

-- After creating your own account, promote it using the one-time SQL below, replacing YOUR_USERNAME:
-- update public.profiles set is_admin = true where lower(username) = lower('YOUR_USERNAME');

-- GameVault friend online presence
create table if not exists public.gamevault_presence (
  user_id uuid primary key references auth.users(id) on delete cascade,
  last_seen timestamptz not null default now()
);

alter table public.gamevault_presence enable row level security;

drop policy if exists "Presence visible to authenticated users"
  on public.gamevault_presence;

create policy "Presence visible to authenticated users"
  on public.gamevault_presence
  for select to authenticated
  using (true);

drop policy if exists "Users can insert own presence"
  on public.gamevault_presence;

create policy "Users can insert own presence"
  on public.gamevault_presence
  for insert to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can update own presence"
  on public.gamevault_presence;

create policy "Users can update own presence"
  on public.gamevault_presence
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant select, insert, update
  on public.gamevault_presence to authenticated;

revoke all on public.gamevault_presence from anon;
