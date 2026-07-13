-- ─────────────────────────────────────────────────────────────
--  TxTt — Phase 2 messaging schema
--  Run this in Supabase Studio → SQL Editor
-- ─────────────────────────────────────────────────────────────

-- ── Profiles (one row per registered user) ───────────────────
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  username    text unique,
  full_name   text,
  avatar_url  text,
  phone       text unique,
  created_at  timestamptz default now()
);

-- Auto-create a profile when a user signs up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles (id, full_name, avatar_url, phone)
  values (
    new.id,
    new.raw_user_meta_data->>'full_name',
    new.raw_user_meta_data->>'avatar_url',
    new.phone
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── Conversations ─────────────────────────────────────────────
create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz default now()
);

-- ── Conversation members ──────────────────────────────────────
create table if not exists public.conversation_members (
  conversation_id  uuid references public.conversations (id) on delete cascade,
  user_id          uuid references public.profiles (id) on delete cascade,
  joined_at        timestamptz default now(),
  primary key (conversation_id, user_id)
);

-- ── Messages ──────────────────────────────────────────────────
create table if not exists public.messages (
  id               uuid primary key default gen_random_uuid(),
  conversation_id  uuid references public.conversations (id) on delete cascade,
  sender_id        uuid references public.profiles (id) on delete set null,
  content          text not null,
  created_at       timestamptz default now(),
  read_at          timestamptz
);

-- Index for fast message loading per conversation
create index if not exists messages_conversation_id_idx
  on public.messages (conversation_id, created_at desc);

-- ── Row Level Security ────────────────────────────────────────
alter table public.profiles           enable row level security;
alter table public.conversations      enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages           enable row level security;

-- Profiles: users can read all profiles, only edit their own
create policy "profiles_read"   on public.profiles for select using (true);
create policy "profiles_update" on public.profiles for update using (auth.uid() = id);

-- Conversations: only members can see their conversations
create policy "conversations_read" on public.conversations for select
  using (
    exists (
      select 1 from public.conversation_members
      where conversation_id = id and user_id = auth.uid()
    )
  );

create policy "conversations_insert" on public.conversations for insert
  with check (true);

-- Members: only members can see membership
create policy "members_read" on public.conversation_members for select
  using (user_id = auth.uid());

create policy "members_insert" on public.conversation_members for insert
  with check (user_id = auth.uid());

-- Messages: only conversation members can read/write
create policy "messages_read" on public.messages for select
  using (
    exists (
      select 1 from public.conversation_members
      where conversation_id = messages.conversation_id and user_id = auth.uid()
    )
  );

create policy "messages_insert" on public.messages for insert
  with check (
    sender_id = auth.uid() and
    exists (
      select 1 from public.conversation_members
      where conversation_id = messages.conversation_id and user_id = auth.uid()
    )
  );

-- ── Enable Realtime on messages ───────────────────────────────
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.conversations;
