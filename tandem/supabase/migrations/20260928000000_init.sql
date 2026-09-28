-- =============================================================================
-- Tandem — social habit tracker
-- Initial schema: tables, constraints, indexes, Row Level Security, RPCs.
--
-- Conventions
--   * Every table lives in `public` and has RLS enabled.
--   * Calendar days are stored as `date` in the *owner's* local calendar
--     (never derived from a UTC timestamp). Timestamps are `timestamptz`.
--   * Helper functions used inside policies are SECURITY DEFINER with an
--     empty search_path so they cannot be hijacked and do not recurse into RLS.
--   * The `anon` role gets no table access at all. Only a couple of RPCs
--     (invite preview, username availability) are callable before sign-in.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Utility functions
-- -----------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.is_valid_timezone(p_tz text)
returns boolean
language sql
stable
set search_path = ''
as $$
  select exists (select 1 from pg_catalog.pg_timezone_names where name = p_tz);
$$;

-- 10-character invite code from an unambiguous 32-symbol alphabet (~50 bits).
-- Randomness comes from gen_random_uuid() (a CSPRNG); the fixed version and
-- variant bytes of the UUID (6 and 8) are skipped. 256 % 32 = 0, so no bias.
create or replace function public.generate_invite_code()
returns text
language plpgsql
volatile
set search_path = ''
as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := decode(replace(gen_random_uuid()::text, '-', ''), 'hex');
  idx int[] := array[0, 1, 2, 3, 4, 5, 9, 10, 11, 12];
  i int;
  result text := '';
begin
  foreach i in array idx loop
    result := result || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return result;
end;
$$;

-- -----------------------------------------------------------------------------
-- Tables
-- -----------------------------------------------------------------------------

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete cascade,
  username      text unique
                check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name  text not null default ''
                check (char_length(display_name) <= 40),
  avatar_emoji  text check (avatar_emoji is null or char_length(avatar_emoji) between 1 and 16),
  avatar_color  text not null default 'violet'
                check (avatar_color in ('rose','orange','amber','lime','emerald','teal','sky','blue','violet','fuchsia')),
  timezone      text not null default 'UTC'
                check (char_length(timezone) <= 64),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on column public.profiles.timezone is
  'IANA time zone. A completion''s calendar day is always the user''s local day in this zone.';

create table public.groups (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null check (char_length(btrim(name)) between 1 and 50),
  emoji                text not null default '🔥' check (char_length(emoji) between 1 and 16),
  invite_code          text not null unique default public.generate_invite_code()
                       check (invite_code ~ '^[A-Z0-9]{6,16}$'),
  leaderboard_enabled  boolean not null default true,
  created_by           uuid references public.profiles (id) on delete set null,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create table public.group_members (
  group_id   uuid not null references public.groups (id) on delete cascade,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  role       text not null default 'member' check (role in ('owner', 'member')),
  joined_at  timestamptz not null default now(),
  primary key (group_id, user_id)
);
create index group_members_user_idx on public.group_members (user_id);

create table public.habits (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name           text not null check (char_length(btrim(name)) between 1 and 60),
  description    text check (description is null or char_length(description) <= 280),
  emoji          text not null default '✅' check (char_length(emoji) between 1 and 16),
  color          text not null default 'emerald'
                 check (color in ('rose','orange','amber','lime','emerald','teal','sky','blue','violet','fuchsia')),
  start_date     date not null,
  visibility     text not null default 'group' check (visibility in ('group', 'private')),
  reminder_time  time,
  sort_order     integer not null default 0,
  archived_at    timestamptz,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
create index habits_user_idx on public.habits (user_id, sort_order);
comment on column public.habits.visibility is
  '''group'' = visible to members of every group the owner belongs to; ''private'' = owner only.';

-- A habit's schedule is versioned: editing the frequency adds a row effective
-- from that day, so past days keep being judged by the rules that applied then.
create table public.habit_schedules (
  id              uuid primary key default gen_random_uuid(),
  habit_id        uuid not null references public.habits (id) on delete cascade,
  effective_from  date not null,
  kind            text not null check (kind in ('daily', 'weekdays', 'times_per_week', 'interval')),
  weekdays        smallint[],          -- ISO weekdays, 1 = Monday … 7 = Sunday
  times_per_week  smallint check (times_per_week between 1 and 7),
  interval_days   smallint check (interval_days between 2 and 365),
  created_at      timestamptz not null default now(),
  unique (habit_id, effective_from),
  check (kind <> 'weekdays' or (
    weekdays is not null
    and cardinality(weekdays) between 1 and 7
    and weekdays <@ array[1,2,3,4,5,6,7]::smallint[]
  )),
  check (kind <> 'times_per_week' or times_per_week is not null),
  check (kind <> 'interval' or interval_days is not null)
);

create table public.habit_completions (
  id            uuid primary key default gen_random_uuid(),
  habit_id      uuid not null references public.habits (id) on delete cascade,
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  completed_on  date not null,
  note          text check (note is null or char_length(note) <= 280),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- One completion per habit per calendar day. Double taps / retries are no-ops.
  unique (habit_id, completed_on)
);
create index habit_completions_user_created_idx on public.habit_completions (user_id, created_at desc);
create index habit_completions_user_day_idx on public.habit_completions (user_id, completed_on);

create table public.reactions (
  id             uuid primary key default gen_random_uuid(),
  completion_id  uuid not null references public.habit_completions (id) on delete cascade,
  user_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  emoji          text not null check (emoji in ('🔥', '💪', '👏', '👀', '🎉')),
  created_at     timestamptz not null default now(),
  unique (completion_id, user_id, emoji)
);
create index reactions_completion_idx on public.reactions (completion_id);
create index reactions_user_idx on public.reactions (user_id);

create table public.comments (
  id             uuid primary key default gen_random_uuid(),
  completion_id  uuid not null references public.habit_completions (id) on delete cascade,
  user_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body           text not null check (char_length(btrim(body)) between 1 and 280),
  created_at     timestamptz not null default now()
);
create index comments_completion_idx on public.comments (completion_id, created_at);
create index comments_user_idx on public.comments (user_id);

-- Web Push subscriptions (one per device/browser).
create table public.push_subscriptions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  endpoint    text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh      text not null check (char_length(p256dh) <= 200),
  auth        text not null check (char_length(auth) <= 100),
  user_agent  text check (user_agent is null or char_length(user_agent) <= 300),
  created_at  timestamptz not null default now()
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

-- Written only by the reminder dispatcher (service role). Prevents duplicate
-- notifications for the same habit on the same local day.
create table public.reminder_deliveries (
  habit_id  uuid not null references public.habits (id) on delete cascade,
  local_day date not null,
  sent_at   timestamptz not null default now(),
  primary key (habit_id, local_day)
);

-- -----------------------------------------------------------------------------
-- updated_at triggers
-- -----------------------------------------------------------------------------

create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger groups_updated_at before update on public.groups
  for each row execute function public.set_updated_at();
create trigger habits_updated_at before update on public.habits
  for each row execute function public.set_updated_at();
create trigger habit_completions_updated_at before update on public.habit_completions
  for each row execute function public.set_updated_at();

-- -----------------------------------------------------------------------------
-- Integrity triggers
-- -----------------------------------------------------------------------------

create or replace function public.profiles_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not public.is_valid_timezone(new.timezone) then
    raise exception 'invalid_timezone' using errcode = '22023';
  end if;
  new.display_name := btrim(new.display_name);
  return new;
end;
$$;
create trigger profiles_validate before insert or update on public.profiles
  for each row execute function public.profiles_validate();

-- A user's local "today", according to their profile time zone.
create or replace function public.user_today(p_user uuid)
returns date
language sql
stable
security definer
set search_path = ''
as $$
  select (now() at time zone coalesce(
    (select timezone from public.profiles where id = p_user), 'UTC'))::date;
$$;

-- Completions must belong to the habit's owner, fall on/after the start date
-- and never be in the future (1 day of slack for a device that has just
-- crossed midnight before its profile time zone was updated). The habit and
-- day of an existing completion are immutable.
create or replace function public.habit_completions_validate()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  h record;
begin
  if tg_op = 'UPDATE' then
    if new.habit_id <> old.habit_id or new.completed_on <> old.completed_on or new.user_id <> old.user_id then
      raise exception 'completion_immutable' using errcode = '22023';
    end if;
    new.note := nullif(btrim(new.note), '');
    return new;
  end if;

  select user_id, start_date into h from public.habits where id = new.habit_id;
  if not found or h.user_id <> new.user_id then
    raise exception 'habit_not_found' using errcode = '42501';
  end if;
  if new.completed_on < h.start_date then
    raise exception 'before_start_date' using errcode = '22023';
  end if;
  if new.completed_on > public.user_today(new.user_id) + 1 then
    raise exception 'future_date' using errcode = '22023';
  end if;
  new.note := nullif(btrim(new.note), '');
  return new;
end;
$$;
create trigger habit_completions_validate before insert or update on public.habit_completions
  for each row execute function public.habit_completions_validate();

-- Keep groups consistent when a member leaves or is removed:
-- promote the longest-standing member if the owner leaves; delete empty groups.
create or replace function public.group_members_after_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.groups where id = old.group_id) then
    return null; -- group itself is being deleted
  end if;
  if not exists (select 1 from public.group_members where group_id = old.group_id) then
    delete from public.groups where id = old.group_id;
  elsif old.role = 'owner'
        and not exists (select 1 from public.group_members where group_id = old.group_id and role = 'owner') then
    update public.group_members set role = 'owner'
    where (group_id, user_id) = (
      select group_id, user_id from public.group_members
      where group_id = old.group_id order by joined_at, user_id limit 1
    );
  end if;
  return null;
end;
$$;
create trigger group_members_after_delete after delete on public.group_members
  for each row execute function public.group_members_after_delete();

-- -----------------------------------------------------------------------------
-- New user → profile
-- -----------------------------------------------------------------------------

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_username text := lower(btrim(meta ->> 'username'));
  v_display text := left(btrim(coalesce(meta ->> 'display_name', meta ->> 'full_name', meta ->> 'name', '')), 40);
  v_tz text := coalesce(meta ->> 'timezone', 'UTC');
begin
  if v_username is null
     or v_username !~ '^[a-z0-9_]{3,20}$'
     or exists (select 1 from public.profiles where username = v_username) then
    v_username := null; -- chosen during onboarding instead
  end if;
  if not public.is_valid_timezone(v_tz) then
    v_tz := 'UTC';
  end if;
  insert into public.profiles (id, username, display_name, timezone)
  values (new.id, v_username, v_display, v_tz);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- -----------------------------------------------------------------------------
-- Authorization helpers (used by RLS policies)
-- -----------------------------------------------------------------------------

create or replace function public.is_group_member(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group and user_id = (select auth.uid())
  );
$$;

create or replace function public.is_group_owner(p_group uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.group_members
    where group_id = p_group and user_id = (select auth.uid()) and role = 'owner'
  );
$$;

-- True if the caller is p_user or shares at least one group with p_user.
create or replace function public.shares_group_with(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select p_user = (select auth.uid()) or exists (
    select 1
    from public.group_members mine
    join public.group_members theirs on theirs.group_id = mine.group_id
    where mine.user_id = (select auth.uid()) and theirs.user_id = p_user
  );
$$;

create or replace function public.can_view_habit(p_habit uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.habits h
    where h.id = p_habit
      and (
        h.user_id = (select auth.uid())
        or (h.visibility = 'group' and public.shares_group_with(h.user_id))
      )
  );
$$;

create or replace function public.can_view_completion(p_completion uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.habit_completions c
    where c.id = p_completion and public.can_view_habit(c.habit_id)
  );
$$;

create or replace function public.owns_habit(p_habit uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.habits where id = p_habit and user_id = (select auth.uid()));
$$;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.profiles            enable row level security;
alter table public.groups              enable row level security;
alter table public.group_members       enable row level security;
alter table public.habits              enable row level security;
alter table public.habit_schedules     enable row level security;
alter table public.habit_completions   enable row level security;
alter table public.reactions           enable row level security;
alter table public.comments            enable row level security;
alter table public.push_subscriptions  enable row level security;
alter table public.reminder_deliveries enable row level security;

-- profiles: see yourself and people you share a group with; edit only yourself.
create policy profiles_select on public.profiles for select to authenticated
  using (public.shares_group_with(id));
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- groups: members only. Creation/joining goes through RPCs below.
create policy groups_select on public.groups for select to authenticated
  using (public.is_group_member(id));
create policy groups_update on public.groups for update to authenticated
  using (public.is_group_owner(id)) with check (public.is_group_owner(id));
create policy groups_delete on public.groups for delete to authenticated
  using (public.is_group_owner(id));

-- group_members: visible to fellow members; you can leave, owners can remove.
create policy group_members_select on public.group_members for select to authenticated
  using (public.is_group_member(group_id));
create policy group_members_delete on public.group_members for delete to authenticated
  using (user_id = (select auth.uid()) or public.is_group_owner(group_id));

-- habits: owner has full control; group-mates see only 'group' habits.
create policy habits_select on public.habits for select to authenticated
  using (
    user_id = (select auth.uid())
    or (visibility = 'group' and public.shares_group_with(user_id))
  );
create policy habits_insert on public.habits for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy habits_update on public.habits for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy habits_delete on public.habits for delete to authenticated
  using (user_id = (select auth.uid()));

-- habit_schedules follow their habit.
create policy habit_schedules_select on public.habit_schedules for select to authenticated
  using (public.can_view_habit(habit_id));
create policy habit_schedules_insert on public.habit_schedules for insert to authenticated
  with check (public.owns_habit(habit_id));
create policy habit_schedules_update on public.habit_schedules for update to authenticated
  using (public.owns_habit(habit_id)) with check (public.owns_habit(habit_id));
create policy habit_schedules_delete on public.habit_schedules for delete to authenticated
  using (public.owns_habit(habit_id));

-- habit_completions: readable when the habit is; writable only by its owner.
create policy habit_completions_select on public.habit_completions for select to authenticated
  using (user_id = (select auth.uid()) or public.can_view_habit(habit_id));
create policy habit_completions_insert on public.habit_completions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.owns_habit(habit_id));
create policy habit_completions_update on public.habit_completions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy habit_completions_delete on public.habit_completions for delete to authenticated
  using (user_id = (select auth.uid()));

-- reactions / comments: only on completions you are allowed to see.
create policy reactions_select on public.reactions for select to authenticated
  using (public.can_view_completion(completion_id));
create policy reactions_insert on public.reactions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_view_completion(completion_id));
create policy reactions_delete on public.reactions for delete to authenticated
  using (user_id = (select auth.uid()));

create policy comments_select on public.comments for select to authenticated
  using (public.can_view_completion(completion_id));
create policy comments_insert on public.comments for insert to authenticated
  with check (user_id = (select auth.uid()) and public.can_view_completion(completion_id));
create policy comments_delete on public.comments for delete to authenticated
  using (
    user_id = (select auth.uid())
    or exists (
      select 1 from public.habit_completions c
      where c.id = completion_id and c.user_id = (select auth.uid())
    )
  );

-- push_subscriptions: strictly your own.
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_subscriptions_insert on public.push_subscriptions for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

-- reminder_deliveries: no policies → service role only.

-- -----------------------------------------------------------------------------
-- Privileges (least privilege; RLS is the second gate)
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

grant select on public.profiles to authenticated;
grant update (username, display_name, avatar_emoji, avatar_color, timezone) on public.profiles to authenticated;

grant select, delete on public.groups to authenticated;
grant update (name, emoji, leaderboard_enabled) on public.groups to authenticated;

grant select, delete on public.group_members to authenticated;

grant select, insert, delete on public.habits to authenticated;
grant update (name, description, emoji, color, start_date, visibility, reminder_time, sort_order, archived_at)
  on public.habits to authenticated;

grant select, insert, update, delete on public.habit_schedules to authenticated;

grant select, insert, delete on public.habit_completions to authenticated;
grant update (note) on public.habit_completions to authenticated;

grant select, insert, delete on public.reactions to authenticated;
grant select, insert, delete on public.comments to authenticated;
grant select, insert, delete on public.push_subscriptions to authenticated;

grant all on all tables in schema public to service_role;

-- -----------------------------------------------------------------------------
-- RPCs
-- -----------------------------------------------------------------------------

create or replace function public.username_available(p_username text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select lower(btrim(p_username)) ~ '^[a-z0-9_]{3,20}$'
     and not exists (
       select 1 from public.profiles
       where username = lower(btrim(p_username)) and id <> coalesce((select auth.uid()), '00000000-0000-0000-0000-000000000000'::uuid)
     );
$$;

create or replace function public.create_group(p_name text, p_emoji text default '🔥')
returns public.groups
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_group public.groups;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if (select count(*) from public.group_members where user_id = v_uid) >= 20 then
    raise exception 'too_many_groups' using errcode = '22023';
  end if;
  insert into public.groups (name, emoji, created_by)
  values (btrim(p_name), coalesce(nullif(btrim(p_emoji), ''), '🔥'), v_uid)
  returning * into v_group;
  insert into public.group_members (group_id, user_id, role) values (v_group.id, v_uid, 'owner');
  return v_group;
end;
$$;

-- Public preview of an invite, so the join page can say what you are joining.
-- Knowing the code is the capability; nothing else about the group leaks.
create or replace function public.get_invite_preview(p_code text)
returns table (group_id uuid, name text, emoji text, member_count int, is_member boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select g.id, g.name, g.emoji,
         (select count(*)::int from public.group_members m where m.group_id = g.id),
         exists (select 1 from public.group_members m where m.group_id = g.id and m.user_id = (select auth.uid()))
  from public.groups g
  where g.invite_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
$$;

create or replace function public.join_group(p_code text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_group uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  select id into v_group from public.groups
  where invite_code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
  if v_group is null then
    raise exception 'invalid_invite' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.group_members where group_id = v_group and user_id = v_uid) then
    return v_group;
  end if;
  if (select count(*) from public.group_members where group_id = v_group) >= 50 then
    raise exception 'group_full' using errcode = '22023';
  end if;
  if (select count(*) from public.group_members where user_id = v_uid) >= 20 then
    raise exception 'too_many_groups' using errcode = '22023';
  end if;
  insert into public.group_members (group_id, user_id, role) values (v_group, v_uid, 'member');
  return v_group;
end;
$$;

create or replace function public.regenerate_invite_code(p_group uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_code text;
begin
  if not public.is_group_owner(p_group) then
    raise exception 'not_group_owner' using errcode = '42501';
  end if;
  update public.groups set invite_code = public.generate_invite_code()
  where id = p_group returning invite_code into v_code;
  return v_code;
end;
$$;

-- Create or update a habit together with its (versioned) schedule, atomically.
-- Runs as the caller, so RLS still applies to every statement.
create or replace function public.save_habit(
  p_id             uuid,
  p_name           text,
  p_description    text,
  p_emoji          text,
  p_color          text,
  p_start_date     date,
  p_visibility     text,
  p_reminder_time  time,
  p_kind           text,
  p_weekdays       smallint[],
  p_times_per_week smallint,
  p_interval_days  smallint
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid := p_id;
  v_today date;
  v_first date;
  v_current public.habit_schedules;
  v_weekdays smallint[];
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  v_today := public.user_today(v_uid);

  -- Normalise schedule fields so only the ones relevant to `kind` are stored.
  v_weekdays := case when p_kind = 'weekdays'
    then (select array_agg(distinct d order by d) from unnest(p_weekdays) d) end;

  if v_id is null then
    insert into public.habits (user_id, name, description, emoji, color, start_date, visibility, reminder_time, sort_order)
    values (
      v_uid, btrim(p_name), nullif(btrim(p_description), ''), p_emoji, p_color,
      coalesce(p_start_date, v_today), p_visibility, p_reminder_time,
      coalesce((select max(sort_order) + 1 from public.habits where user_id = v_uid), 0)
    )
    returning id into v_id;

    insert into public.habit_schedules (habit_id, effective_from, kind, weekdays, times_per_week, interval_days)
    values (
      v_id, coalesce(p_start_date, v_today), p_kind, v_weekdays,
      case when p_kind = 'times_per_week' then p_times_per_week end,
      case when p_kind = 'interval' then p_interval_days end
    );
    return v_id;
  end if;

  select min(completed_on) into v_first from public.habit_completions where habit_id = v_id;
  if v_first is not null and p_start_date > v_first then
    raise exception 'start_after_first_completion' using errcode = '22023', detail = v_first::text;
  end if;

  update public.habits set
    name = btrim(p_name),
    description = nullif(btrim(p_description), ''),
    emoji = p_emoji,
    color = p_color,
    start_date = p_start_date,
    visibility = p_visibility,
    reminder_time = p_reminder_time
  where id = v_id and user_id = v_uid;
  if not found then
    raise exception 'habit_not_found' using errcode = '42501';
  end if;

  -- Schedule versioning.
  select * into v_current from public.habit_schedules
  where habit_id = v_id and effective_from <= greatest(v_today, p_start_date)
  order by effective_from desc limit 1;

  if v_current.id is null
     or v_current.kind is distinct from p_kind
     or v_current.weekdays is distinct from v_weekdays
     or (p_kind = 'times_per_week' and v_current.times_per_week is distinct from p_times_per_week)
     or (p_kind = 'interval' and v_current.interval_days is distinct from p_interval_days) then
    if p_start_date >= v_today then
      -- Habit has not really started yet: its schedule history is irrelevant.
      delete from public.habit_schedules where habit_id = v_id;
      insert into public.habit_schedules (habit_id, effective_from, kind, weekdays, times_per_week, interval_days)
      values (v_id, p_start_date, p_kind, v_weekdays,
              case when p_kind = 'times_per_week' then p_times_per_week end,
              case when p_kind = 'interval' then p_interval_days end);
    else
      delete from public.habit_schedules where habit_id = v_id and effective_from >= v_today;
      insert into public.habit_schedules (habit_id, effective_from, kind, weekdays, times_per_week, interval_days)
      values (v_id, v_today, p_kind, v_weekdays,
              case when p_kind = 'times_per_week' then p_times_per_week end,
              case when p_kind = 'interval' then p_interval_days end);
    end if;
  end if;

  -- The earliest schedule must cover the (possibly earlier) start date.
  update public.habit_schedules set effective_from = p_start_date
  where id = (select id from public.habit_schedules where habit_id = v_id order by effective_from limit 1)
    and effective_from > p_start_date;

  return v_id;
end;
$$;

create or replace function public.reorder_habits(p_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.habits h set sort_order = o.ord - 1
  from unnest(p_ids) with ordinality as o(id, ord)
  where h.id = o.id and h.user_id = (select auth.uid());
$$;

-- Compact history: one row per visible habit with all completion days as an
-- array. Keeps the payload small and avoids per-row pagination limits.
create or replace function public.habit_history(p_user_ids uuid[])
returns table (habit_id uuid, days date[], note_days date[])
language sql
stable
security invoker
set search_path = ''
as $$
  select c.habit_id,
         array_agg(c.completed_on order by c.completed_on),
         coalesce(array_agg(c.completed_on order by c.completed_on) filter (where c.note is not null), '{}')
  from public.habit_completions c
  where c.user_id = any (p_user_ids)
  group by c.habit_id;
$$;

-- Permanently delete the caller's account and everything they own.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

-- Candidates for reminder notifications (service role only). Returns habits
-- whose reminder time fell within the last p_window_minutes in the owner's
-- local time, that are not completed today and have not been notified today.
create or replace function public.reminder_candidates(p_window_minutes int default 15)
returns table (
  habit_id uuid, user_id uuid, name text, emoji text,
  local_day date, timezone text
)
language sql
stable
security definer
set search_path = ''
as $$
  select h.id, h.user_id, h.name, h.emoji,
         (now() at time zone p.timezone)::date, p.timezone
  from public.habits h
  join public.profiles p on p.id = h.user_id
  where h.reminder_time is not null
    and h.archived_at is null
    and (now() at time zone p.timezone)::date >= h.start_date
    and ((now() at time zone p.timezone)::time - h.reminder_time)
          between interval '0 minutes' and make_interval(mins => p_window_minutes)
    and not exists (
      select 1 from public.habit_completions c
      where c.habit_id = h.id and c.completed_on = (now() at time zone p.timezone)::date
    )
    and not exists (
      select 1 from public.reminder_deliveries d
      where d.habit_id = h.id and d.local_day = (now() at time zone p.timezone)::date
    )
    and exists (select 1 from public.push_subscriptions s where s.user_id = h.user_id);
$$;

-- Function privileges: nothing is executable by default.
revoke execute on all functions in schema public from public, anon, authenticated;

grant execute on function public.username_available(text) to anon, authenticated;
grant execute on function public.get_invite_preview(text) to anon, authenticated;
grant execute on function public.create_group(text, text) to authenticated;
grant execute on function public.join_group(text) to authenticated;
grant execute on function public.regenerate_invite_code(uuid) to authenticated;
grant execute on function public.save_habit(uuid, text, text, text, text, date, text, time, text, smallint[], smallint, smallint) to authenticated;
grant execute on function public.reorder_habits(uuid[]) to authenticated;
grant execute on function public.habit_history(uuid[]) to authenticated;
grant execute on function public.delete_my_account() to authenticated;

-- Helpers referenced from RLS policies / defaults must be callable by the
-- roles those policies apply to.
grant execute on function public.is_group_member(uuid) to authenticated;
grant execute on function public.is_group_owner(uuid) to authenticated;
grant execute on function public.shares_group_with(uuid) to authenticated;
grant execute on function public.can_view_habit(uuid) to authenticated;
grant execute on function public.can_view_completion(uuid) to authenticated;
grant execute on function public.owns_habit(uuid) to authenticated;
grant execute on function public.user_today(uuid) to authenticated;
grant execute on function public.generate_invite_code() to authenticated;
grant execute on function public.is_valid_timezone(text) to authenticated;
grant execute on function public.set_updated_at() to authenticated;

grant execute on all functions in schema public to service_role;

-- Future functions/tables created by later migrations must opt in explicitly.
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
