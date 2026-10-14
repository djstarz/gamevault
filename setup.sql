-- Run once in Supabase SQL Editor. Your existing posts table and RLS policies stay in place.
alter table public.posts add column if not exists storage_path text;
alter table public.posts enable row level security;
