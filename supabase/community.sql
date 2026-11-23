-- EnviroOS — Farmer Community (Reddit-style "EnviroChat") schema
-- Run once in Supabase Dashboard > SQL Editor > New Query > Run.
-- Safe to re-run (idempotent).
--
-- Design notes:
--   * No login: farmers pick a nickname. Each phone generates a random
--     `author_id` / `voter_id` (uuid) stored locally. This is NOT secure
--     identity — it only lets one phone vote once per item and recognise
--     its own posts. Move to Supabase Auth (phone OTP) before large rollout.
--   * Client generates the uuid primary keys, so posts/replies written while
--     offline can be replayed later without duplicates
--     (POST ... ?on_conflict=id with Prefer: resolution=ignore-duplicates).
--   * Scores and report counts are only changed through SECURITY DEFINER
--     functions; anon has no UPDATE/DELETE rights on any table.
--   * Anything reported 3+ times disappears from anon SELECT automatically.
--   * Photos are stored inline as compressed JPEG data URLs (<= ~400 KB),
--     which keeps the critical path to one REST endpoint. Move to Supabase
--     Storage if volume grows.

create extension if not exists pgcrypto;

-- 1. Posts
create table if not exists public.community_posts (
  id uuid primary key default gen_random_uuid(),
  author_id text not null,
  author_name text not null check (char_length(author_name) between 1 and 40),
  author_village text check (author_village is null or char_length(author_village) <= 60),
  author_crop text,
  region text,                         -- first 3 digits of pincode, e.g. '342'
  crop_id text,
  topic text not null default 'general'
    check (topic in ('water','pests','fertilizer','mandi','weather','equipment','general')),
  title text not null check (char_length(title) between 3 and 140),
  body text not null default '' check (char_length(body) <= 4000),
  image text check (image is null or char_length(image) <= 450000),
  readings jsonb,
  lang text,
  score integer not null default 0,
  comment_count integer not null default 0,
  report_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists community_posts_created_idx on public.community_posts (created_at desc);
create index if not exists community_posts_topic_idx on public.community_posts (topic, created_at desc);
create index if not exists community_posts_region_idx on public.community_posts (region);

-- 2. Threaded replies
create table if not exists public.community_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.community_posts(id) on delete cascade,
  parent_id uuid references public.community_comments(id) on delete cascade,
  author_id text not null,
  author_name text not null check (char_length(author_name) between 1 and 40),
  author_village text check (author_village is null or char_length(author_village) <= 60),
  author_crop text,
  body text not null check (char_length(body) between 1 and 2000),
  is_agri boolean not null default false,
  score integer not null default 0,
  report_count integer not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists community_comments_post_idx on public.community_comments (post_id, created_at);

-- 3. One vote per phone per item
create table if not exists public.community_votes (
  target_type text not null check (target_type in ('post','comment')),
  target_id uuid not null,
  voter_id text not null,
  value smallint not null check (value in (-1, 0, 1)),
  updated_at timestamptz not null default now(),
  primary key (target_type, target_id, voter_id)
);

-- 4. Keep posts.comment_count in sync
create or replace function public.community_bump_comments()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.community_posts set comment_count = comment_count + 1 where id = NEW.post_id;
  return NEW;
end;
$$;
drop trigger if exists trg_community_bump_comments on public.community_comments;
create trigger trg_community_bump_comments
  after insert on public.community_comments
  for each row execute function public.community_bump_comments();

-- 5. Vote RPC: upsert the phone's vote, recompute and return the score
create or replace function public.community_vote(p_type text, p_id uuid, p_voter text, p_value integer)
returns integer language plpgsql security definer set search_path = public as $$
declare
  v_score integer;
begin
  if p_type not in ('post','comment') or p_value not in (-1, 0, 1) or coalesce(p_voter, '') = '' then
    raise exception 'invalid vote';
  end if;
  insert into public.community_votes (target_type, target_id, voter_id, value, updated_at)
  values (p_type, p_id, p_voter, p_value, now())
  on conflict (target_type, target_id, voter_id)
  do update set value = excluded.value, updated_at = now();

  select coalesce(sum(value), 0) into v_score
  from public.community_votes where target_type = p_type and target_id = p_id;

  if p_type = 'post' then
    update public.community_posts set score = v_score where id = p_id;
  else
    update public.community_comments set score = v_score where id = p_id;
  end if;
  return v_score;
end;
$$;

-- 6. Report RPC
create or replace function public.community_report(p_type text, p_id uuid)
returns void language plpgsql security definer set search_path = public as $$
begin
  if p_type = 'post' then
    update public.community_posts set report_count = report_count + 1 where id = p_id;
  elsif p_type = 'comment' then
    update public.community_comments set report_count = report_count + 1 where id = p_id;
  end if;
end;
$$;

-- 7. Row level security (anon key is used by the app)
alter table public.community_posts enable row level security;
alter table public.community_comments enable row level security;
alter table public.community_votes enable row level security;

drop policy if exists community_posts_read on public.community_posts;
create policy community_posts_read on public.community_posts
  for select to anon, authenticated using (report_count < 3);

drop policy if exists community_posts_insert on public.community_posts;
create policy community_posts_insert on public.community_posts
  for insert to anon, authenticated
  with check (score = 0 and comment_count = 0 and report_count = 0);

drop policy if exists community_comments_read on public.community_comments;
create policy community_comments_read on public.community_comments
  for select to anon, authenticated using (report_count < 3);

drop policy if exists community_comments_insert on public.community_comments;
create policy community_comments_insert on public.community_comments
  for insert to anon, authenticated
  with check (score = 0 and report_count = 0);

-- Votes are only written through community_vote(); no direct table access.

grant execute on function public.community_vote(text, uuid, text, integer) to anon, authenticated;
grant execute on function public.community_report(text, uuid) to anon, authenticated;
