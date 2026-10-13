-- Maratón App del Allende: schema, privacy rules and raffles.
-- Row Level Security enforces every privacy choice in the database, so the
-- app cannot show anything a user decided to hide.

create type public.visibility as enum ('public', 'followers', 'private');
create type public.campaign_status as enum ('draft', 'active', 'paused', 'finished');
create type public.follow_status as enum ('pending', 'accepted');
create type public.challenge_category as enum ('distance', 'duration', 'pace', 'weather', 'streak', 'progress');

-- ---------------------------------------------------------------- profiles
create table public.profiles (
  id uuid primary key references auth.users on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_.]{3,30}$'),
  full_name text not null default '',
  avatar_url text,
  bio text not null default '',
  -- who can see the profile's activities, stats and raffle participations
  profile_visibility public.visibility not null default 'public',
  -- default for new runs (each run can still be changed)
  default_run_visibility public.visibility not null default 'public',
  -- hide the first/last 200 m of every route shown to others
  hide_route_endpoints boolean not null default true,
  -- show the "participa en N sorteos" badge to others
  show_raffle_participation boolean not null default true,
  is_admin boolean not null default false,
  gps_consent_at timestamptz,
  created_at timestamptz not null default now()
);

create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  base text := lower(regexp_replace(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)), '[^a-z0-9_.]', '', 'gi'));
  candidate text;
begin
  if length(base) < 3 then base := base || 'runner'; end if;
  candidate := left(base, 24);
  while exists (select 1 from public.profiles where username = candidate) loop
    candidate := left(base, 24) || floor(random() * 10000)::int;
  end loop;
  insert into public.profiles (id, username, full_name)
  values (new.id, candidate, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- ----------------------------------------------------------------- follows
create table public.follows (
  follower_id uuid not null references public.profiles on delete cascade,
  following_id uuid not null references public.profiles on delete cascade,
  status public.follow_status not null default 'pending',
  created_at timestamptz not null default now(),
  primary key (follower_id, following_id),
  check (follower_id <> following_id)
);
create index follows_following_idx on public.follows (following_id, status);

-- Following a public profile is immediate; others need approval.
create or replace function public.follow_auto_accept() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.status := case when (select profile_visibility from public.profiles where id = new.following_id) = 'public'
                     then 'accepted'::public.follow_status else 'pending'::public.follow_status end;
  return new;
end $$;
create trigger follows_auto_accept before insert on public.follows
  for each row execute function public.follow_auto_accept();

-- ------------------------------------------------------- privacy helpers
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.is_follower(viewer uuid, owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.follows
                 where follower_id = viewer and following_id = owner and status = 'accepted')
$$;

create or replace function public.can_view_profile(viewer uuid, owner uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select viewer = owner or exists (
    select 1 from public.profiles p where p.id = owner and (
      p.profile_visibility = 'public'
      or (p.profile_visibility = 'followers' and public.is_follower(viewer, owner))))
$$;

create or replace function public.can_view_run(viewer uuid, owner uuid, vis public.visibility) returns boolean
language sql stable security definer set search_path = public as $$
  select viewer = owner or (
    public.can_view_profile(viewer, owner)
    and (vis = 'public' or (vis = 'followers' and public.is_follower(viewer, owner))))
$$;

-- -------------------------------------------------------------------- runs
create table public.runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  title text not null default '',
  notes text not null default '',
  started_at timestamptz not null,
  ended_at timestamptz not null,
  -- recomputed on the server from the GPS track by `evaluate-run`
  distance_m integer not null check (distance_m >= 0),
  duration_s integer not null check (duration_s >= 0),
  avg_pace_s_per_km integer,
  -- simplified route other people may see (endpoints hidden if the owner chose so)
  route_public jsonb,
  visibility public.visibility not null default 'public',
  weather jsonb,
  verified boolean not null default false,
  evaluated_at timestamptz,
  created_at timestamptz not null default now(),
  check (ended_at >= started_at)
);
create index runs_user_started_idx on public.runs (user_id, started_at desc);
create index runs_started_idx on public.runs (started_at desc);

-- Full GPS track: only its owner (and the server) can read it.
create table public.run_tracks (
  run_id uuid primary key references public.runs on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  points jsonb not null
);

create table public.likes (
  run_id uuid not null references public.runs on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  created_at timestamptz not null default now(),
  primary key (run_id, user_id)
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.runs on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles on delete cascade,
  body text not null check (length(body) between 1 and 1000),
  created_at timestamptz not null default now()
);
create index comments_run_idx on public.comments (run_id, created_at);

-- --------------------------------------------------- raffles & challenges
create table public.raffles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  prize text not null,
  sponsor text not null default 'Sanatorio Allende',
  image_url text,
  status public.campaign_status not null default 'draft',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  draw_at timestamptz,
  winner_user_id uuid references public.profiles on delete set null,
  winning_entry_id uuid,
  drawn_at timestamptz,
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.challenges (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles on delete cascade,
  title text not null,
  description text not null default '',
  category public.challenge_category not null,
  -- see supabase/functions/_shared/challenges.ts for the rule types
  rule jsonb not null check (rule ? 'type'),
  status public.campaign_status not null default 'draft',
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  max_entries_per_user integer check (max_entries_per_user is null or max_entries_per_user > 0),
  created_at timestamptz not null default now(),
  check (ends_at > starts_at)
);
create index challenges_raffle_idx on public.challenges (raffle_id);

-- One row = one participation. Only the server (service role) inserts.
create table public.raffle_entries (
  id uuid primary key default gen_random_uuid(),
  raffle_id uuid not null references public.raffles on delete cascade,
  challenge_id uuid not null references public.challenges on delete cascade,
  run_id uuid not null references public.runs on delete cascade,
  user_id uuid not null references public.profiles on delete cascade,
  reason text not null default '',
  created_at timestamptz not null default now(),
  unique (challenge_id, run_id)
);
create index raffle_entries_user_idx on public.raffle_entries (user_id, raffle_id);
create index raffle_entries_raffle_idx on public.raffle_entries (raffle_id);

-- ------------------------------------------------------------------- RLS
alter table public.profiles enable row level security;
alter table public.follows enable row level security;
alter table public.runs enable row level security;
alter table public.run_tracks enable row level security;
alter table public.likes enable row level security;
alter table public.comments enable row level security;
alter table public.raffles enable row level security;
alter table public.challenges enable row level security;
alter table public.raffle_entries enable row level security;

-- Basic identity (name, username, avatar) is visible to signed-in users so a
-- private profile can still be found and followed; everything else is gated.
create policy "profiles readable" on public.profiles for select to authenticated using (true);
create policy "profiles self update" on public.profiles for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());
revoke update on public.profiles from authenticated, anon;
grant update (username, full_name, avatar_url, bio, profile_visibility, default_run_visibility,
              hide_route_endpoints, show_raffle_participation, gps_consent_at)
  on public.profiles to authenticated;

create policy "follows visible" on public.follows for select to authenticated using (
  follower_id = auth.uid() or following_id = auth.uid()
  or (status = 'accepted' and public.can_view_profile(auth.uid(), following_id)));
create policy "follow someone" on public.follows for insert to authenticated with check (follower_id = auth.uid());
create policy "approve follower" on public.follows for update to authenticated
  using (following_id = auth.uid()) with check (following_id = auth.uid());
revoke update on public.follows from authenticated, anon;
grant update (status) on public.follows to authenticated;
create policy "unfollow or remove follower" on public.follows for delete to authenticated
  using (follower_id = auth.uid() or following_id = auth.uid());

create policy "runs visible per privacy" on public.runs for select to authenticated
  using (public.can_view_run(auth.uid(), user_id, visibility));
create policy "runs insert own" on public.runs for insert to authenticated with check (user_id = auth.uid());
create policy "runs update own" on public.runs for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
revoke update on public.runs from authenticated, anon;
grant update (title, notes, visibility) on public.runs to authenticated;
create policy "runs delete own" on public.runs for delete to authenticated using (user_id = auth.uid());

create policy "tracks owner only" on public.run_tracks for all to authenticated
  using (user_id = auth.uid()) with check (
    user_id = auth.uid() and exists (select 1 from public.runs r where r.id = run_id and r.user_id = auth.uid()));

create policy "likes visible with run" on public.likes for select to authenticated using (
  exists (select 1 from public.runs r where r.id = run_id and public.can_view_run(auth.uid(), r.user_id, r.visibility)));
create policy "like visible runs" on public.likes for insert to authenticated with check (
  user_id = auth.uid()
  and exists (select 1 from public.runs r where r.id = run_id and public.can_view_run(auth.uid(), r.user_id, r.visibility)));
create policy "unlike" on public.likes for delete to authenticated using (user_id = auth.uid());

create policy "comments visible with run" on public.comments for select to authenticated using (
  exists (select 1 from public.runs r where r.id = run_id and public.can_view_run(auth.uid(), r.user_id, r.visibility)));
create policy "comment visible runs" on public.comments for insert to authenticated with check (
  user_id = auth.uid()
  and exists (select 1 from public.runs r where r.id = run_id and public.can_view_run(auth.uid(), r.user_id, r.visibility)));
create policy "delete own comment or on own run" on public.comments for delete to authenticated using (
  user_id = auth.uid() or exists (select 1 from public.runs r where r.id = run_id and r.user_id = auth.uid()));

create policy "raffles visible" on public.raffles for select to authenticated using (status <> 'draft' or public.is_admin());
create policy "raffles admin write" on public.raffles for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "challenges visible" on public.challenges for select to authenticated using (status <> 'draft' or public.is_admin());
create policy "challenges admin write" on public.challenges for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "own entries" on public.raffle_entries for select to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- -------------------------------------------------------- feed & raffles
-- security_invoker: the view runs with the caller's RLS.
create view public.run_feed with (security_invoker = true) as
select r.*,
       p.username, p.full_name, p.avatar_url,
       (select count(*) from public.likes l where l.run_id = r.id)::int as like_count,
       (select count(*) from public.comments c where c.run_id = r.id)::int as comment_count,
       exists (select 1 from public.likes l where l.run_id = r.id and l.user_id = auth.uid()) as liked_by_me
from public.runs r join public.profiles p on p.id = r.user_id;

-- Raffles a user takes part in, with their number of entries.
-- Respects the user's privacy and their "show participations" setting.
create or replace function public.user_raffles(target uuid)
returns table (raffle_id uuid, title text, prize text, sponsor text, status public.campaign_status,
               ends_at timestamptz, entries bigint)
language sql stable security definer set search_path = public as $$
  select ra.id, ra.title, ra.prize, ra.sponsor, ra.status, ra.ends_at, count(e.id)
  from public.raffle_entries e
  join public.raffles ra on ra.id = e.raffle_id
  join public.profiles p on p.id = e.user_id
  where e.user_id = target
    and ra.status <> 'draft'
    and (target = auth.uid() or public.is_admin()
         or (public.can_view_profile(auth.uid(), target) and p.show_raffle_participation))
  group by ra.id
  order by ra.ends_at desc
$$;

-- Number of active raffles each of the given users takes part in (for the feed badge).
create or replace function public.active_raffle_counts(targets uuid[])
returns table (user_id uuid, raffles bigint, entries bigint)
language sql stable security definer set search_path = public as $$
  select e.user_id, count(distinct e.raffle_id), count(*)
  from public.raffle_entries e
  join public.raffles ra on ra.id = e.raffle_id and ra.status = 'active'
  join public.profiles p on p.id = e.user_id
  where e.user_id = any(targets)
    and (e.user_id = auth.uid() or public.is_admin()
         or (public.can_view_profile(auth.uid(), e.user_id) and p.show_raffle_participation))
  group by e.user_id
$$;

-- Entry totals per raffle (for admins and for the raffle screen).
create or replace function public.raffle_stats(target_raffle uuid)
returns table (participants bigint, entries bigint, my_entries bigint)
language sql stable security definer set search_path = public as $$
  select count(distinct user_id), count(*), count(*) filter (where user_id = auth.uid())
  from public.raffle_entries where raffle_id = target_raffle
$$;

-- Weighted draw: every entry is one ticket, so more entries = more chances.
create or replace function public.draw_raffle(target_raffle uuid)
returns table (winner_id uuid, winner_username text, total_entries bigint)
language plpgsql security definer set search_path = public as $$
declare
  ra public.raffles;
  pick public.raffle_entries;
  total bigint;
begin
  if not public.is_admin() then raise exception 'Solo administradores'; end if;
  select * into ra from public.raffles where id = target_raffle for update;
  if ra.id is null then raise exception 'Sorteo inexistente'; end if;
  if ra.winner_user_id is not null then raise exception 'El sorteo ya se realizó'; end if;
  if ra.status <> 'finished' then raise exception 'Finalizá el sorteo antes de sortear'; end if;
  select count(*) into total from public.raffle_entries where raffle_id = target_raffle;
  if total = 0 then raise exception 'No hay participaciones'; end if;
  select * into pick from public.raffle_entries where raffle_id = target_raffle
    order by gen_random_uuid() limit 1;
  update public.raffles set winner_user_id = pick.user_id, winning_entry_id = pick.id, drawn_at = now()
    where id = target_raffle;
  return query select pick.user_id, (select username from public.profiles where id = pick.user_id), total;
end $$;

grant execute on function public.user_raffles(uuid), public.active_raffle_counts(uuid[]),
  public.raffle_stats(uuid), public.draw_raffle(uuid), public.can_view_profile(uuid, uuid),
  public.is_follower(uuid, uuid) to authenticated;
