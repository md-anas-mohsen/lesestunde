-- ============================================================
--  Lesestunde — Initial Schema
--  Run via: supabase db push  (or paste into Supabase SQL editor)
-- ============================================================

-- Enable UUID extension (usually already on by default)
create extension if not exists "pgcrypto";

-- ── Profiles ─────────────────────────────────────────────────
-- One row per authenticated user, linked to auth.users.
create table if not exists public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  email       text,
  display_name text,
  avatar_url  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Auto-create profile on new signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email),
    new.raw_user_meta_data->>'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── API Settings ──────────────────────────────────────────────
-- Stores the user's chosen LLM provider + model.
-- The actual API key is stored encrypted; we use pgcrypto's
-- gen_random_uuid as a simple example — in production consider
-- Supabase Vault for true secret storage.
create table if not exists public.api_settings (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  provider    text not null default 'gemini',   -- gemini | openai | openrouter | local
  base_url    text not null,
  model       text not null,
  -- api_key stored as-is (anon key only has access to own row via RLS).
  -- For production, use Supabase Vault or encrypt before inserting.
  api_key     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id)  -- one settings row per user
);

alter table public.api_settings enable row level security;

create policy "Users can manage their own api_settings"
  on public.api_settings for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ── Vocabulary Words ──────────────────────────────────────────
create table if not exists public.words (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  word        text not null,
  translation text,
  pos         text,           -- part of speech
  example_de  text,
  example_en  text,
  created_at  timestamptz not null default now(),
  unique (user_id, word)      -- no duplicate words per user
);

alter table public.words enable row level security;

create policy "Users can manage their own words"
  on public.words for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists words_user_id_idx on public.words(user_id);

-- ── Generated Texts (corpus) ─────────────────────────────────
create table if not exists public.texts (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  title        text not null,
  body         text not null,
  level        text not null,  -- A1 | A2 | B1 | B2 | C1 | C2
  words_input  text[] not null default '{}',   -- words requested
  words_used   text[] not null default '{}',   -- words the model actually used
  created_at   timestamptz not null default now()
);

alter table public.texts enable row level security;

create policy "Users can manage their own texts"
  on public.texts for all
  using  (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create index if not exists texts_user_id_idx  on public.texts(user_id);
create index if not exists texts_created_idx  on public.texts(user_id, created_at desc);

-- ── updated_at triggers ───────────────────────────────────────
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger set_profiles_updated_at
  before update on public.profiles
  for each row execute procedure public.set_updated_at();

create trigger set_api_settings_updated_at
  before update on public.api_settings
  for each row execute procedure public.set_updated_at();
