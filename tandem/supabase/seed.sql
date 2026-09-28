-- =============================================================================
-- DEMO / SEED DATA — for local development and demos only.
--
-- Creates four demo accounts in one group with ~6 months of history so the
-- grids, streaks and leaderboard have something to show immediately.
--
--   alex@example.com  / tandem-demo-2026   (group owner)
--   mike@example.com  / tandem-demo-2026
--   john@example.com  / tandem-demo-2026
--   chris@example.com / tandem-demo-2026
--
-- Group invite code: TANDEMDEMO
--
-- Safe to re-run: existing demo users are deleted first (cascades to all of
-- their data). Do NOT run this on a production project your friends use
-- unless you want these demo accounts to exist there.
-- =============================================================================

do $$
declare
  v_alex  uuid := '00000000-0000-4000-a000-00000000a1e1';
  v_mike  uuid := '00000000-0000-4000-a000-0000000011ce';
  v_john  uuid := '00000000-0000-4000-a000-000000001044';
  v_chris uuid := '00000000-0000-4000-a000-00000000c415';
  v_group uuid := '00000000-0000-4000-b000-000000000001';
  v_pw    text := extensions.crypt('tandem-demo-2026', extensions.gen_salt('bf'));
  u record;
  h record;
  v_habit uuid;
  v_start date;
  v_today date;
  d date;
  v_sched boolean;
  v_done boolean;
  v_streak int;
  v_note text;
  c record;
  v_notes text[] := array['Felt great', 'Tough one today', 'Personal best!', 'Quick session', 'With Mike', 'Early start ☀️'];
begin
  perform setseed(0.4242);

  delete from auth.users where id in (v_alex, v_mike, v_john, v_chris);

  for u in
    select * from (values
      (v_alex,  'alex@example.com',  'alex',  'Alex',  '🦊', 'orange',  'America/New_York'),
      (v_mike,  'mike@example.com',  'mike',  'Mike',  '🐻', 'sky',     'America/Chicago'),
      (v_john,  'john@example.com',  'john',  'John',  '🐢', 'emerald', 'Europe/London'),
      (v_chris, 'chris@example.com', 'chris', 'Chris', '🦉', 'violet',  'America/Los_Angeles')
    ) as t(id, email, username, display_name, emoji, color, tz)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated',
      u.email, v_pw, now(),
      '{"provider":"email","providers":["email"]}',
      jsonb_build_object('username', u.username, 'display_name', u.display_name, 'timezone', u.tz),
      now() - interval '200 days', now(), '', '', '', ''
    );
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), u.id::text, u.id,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
      'email', now(), now(), now()
    );
    update public.profiles
      set username = u.username, display_name = u.display_name,
          avatar_emoji = u.emoji, avatar_color = u.color, timezone = u.tz
      where id = u.id;
  end loop;

  insert into public.groups (id, name, emoji, invite_code, created_by)
  values (v_group, 'Morning Crew', '☀️', 'TANDEMDEMO', v_alex);
  insert into public.group_members (group_id, user_id, role, joined_at) values
    (v_group, v_alex,  'owner',  now() - interval '190 days'),
    (v_group, v_mike,  'member', now() - interval '185 days'),
    (v_group, v_john,  'member', now() - interval '170 days'),
    (v_group, v_chris, 'member', now() - interval '120 days');

  -- owner, name, emoji, color, visibility, kind, weekdays, times/week, interval,
  -- probability of completing a scheduled day, guaranteed current streak, start offset
  for h in
    select * from (values
      (v_alex,  'Gym',            '🏋️', 'orange',  'group',   'weekdays',       array[1,3,5]::smallint[], null::smallint, null::smallint, 0.85, 14, 180, 'Push / pull / legs rotation'),
      (v_alex,  'Study Spanish',  '📚', 'blue',    'group',   'daily',          null, null, null, 0.80, 8,  180, '20 minutes on Duolingo or a podcast'),
      (v_alex,  'Drink water',    '💧', 'sky',     'group',   'daily',          null, null, null, 0.92, 21, 150, '8 glasses'),
      (v_alex,  'Read',           '📖', 'violet',  'group',   'times_per_week', null, 4::smallint, null, 0.70, 3, 180, null),
      (v_alex,  'Journal',        '📝', 'fuchsia', 'private', 'daily',          null, null, null, 0.60, 2, 90,  'Private — only Alex sees this'),
      (v_mike,  '10K steps',      '👟', 'emerald', 'group',   'daily',          null, null, null, 0.95, 21, 180, null),
      (v_mike,  'Meditate',       '🧘', 'teal',    'group',   'daily',          null, null, null, 0.75, 5, 160, '10 minutes'),
      (v_mike,  'No sugar',       '🍩', 'rose',    'group',   'weekdays',       array[1,2,3,4,5]::smallint[], null, null, 0.70, 4, 120, null),
      (v_john,  'Run',            '🏃', 'lime',    'group',   'times_per_week', null, 3::smallint, null, 0.65, 2, 180, null),
      (v_john,  'Guitar practice','🎸', 'amber',   'group',   'weekdays',       array[2,4,6]::smallint[], null, null, 0.60, 3, 140, null),
      (v_john,  'Bed by 11',      '😴', 'violet',  'group',   'daily',          null, null, null, 0.50, 1, 100, null),
      (v_john,  'Therapy homework','🧠', 'teal',   'private', 'interval',       null, null, 3::smallint, 0.80, 2, 60,  null),
      (v_chris, 'Stretch',        '🤸', 'fuchsia', 'group',   'daily',          null, null, null, 0.85, 9, 110, null),
      (v_chris, 'Cook at home',   '🍳', 'orange',  'group',   'times_per_week', null, 5::smallint, null, 0.80, 4, 110, null),
      (v_chris, 'Water plants',   '🪴', 'emerald', 'group',   'interval',       null, null, 3::smallint, 0.90, 6, 110, null)
    ) as t(owner, name, emoji, color, visibility, kind, weekdays, times_per_week, interval_days, p, streak, start_offset, description)
  loop
    select (now() at time zone timezone)::date into v_today from public.profiles where id = h.owner;
    v_start := v_today - h.start_offset;

    insert into public.habits (user_id, name, description, emoji, color, start_date, visibility, sort_order,
                               reminder_time)
    values (h.owner, h.name, h.description, h.emoji, h.color, v_start, h.visibility,
            (select count(*) from public.habits where user_id = h.owner),
            case when h.name in ('Gym', 'Meditate') then time '07:30' end)
    returning id into v_habit;

    insert into public.habit_schedules (habit_id, effective_from, kind, weekdays, times_per_week, interval_days)
    values (v_habit, v_start, h.kind, h.weekdays, h.times_per_week, h.interval_days);

    -- Walk the calendar backwards so the most recent scheduled days form the
    -- guaranteed "current streak", then fill older days randomly.
    v_streak := 0;
    d := v_today - 1;
    while d >= v_start loop
      v_sched := case h.kind
        when 'daily' then true
        when 'weekdays' then extract(isodow from d)::smallint = any (h.weekdays)
        when 'interval' then (d - v_start) % h.interval_days = 0
        when 'times_per_week' then random() < (h.times_per_week::float / 7.0) + 0.1
      end;
      if v_sched then
        if h.kind = 'times_per_week' then
          v_done := v_streak < h.streak * h.times_per_week or random() < h.p;
        else
          v_done := v_streak < h.streak or random() < h.p;
        end if;
        v_streak := v_streak + 1;
        if v_done then
          v_note := case when h.name in ('Gym', 'Run') and random() < 0.3
                         then v_notes[1 + floor(random() * array_length(v_notes, 1))::int] end;
          insert into public.habit_completions (habit_id, user_id, completed_on, note, created_at)
          values (v_habit, h.owner, d, v_note,
                  (d + time '07:00' + (random() * interval '13 hours')) at time zone
                    (select timezone from public.profiles where id = h.owner));
        end if;
      end if;
      d := d - 1;
    end loop;

    -- Some habits are already done today.
    if random() < 0.55 and (h.kind in ('daily', 'times_per_week')
        or (h.kind = 'weekdays' and extract(isodow from v_today)::smallint = any (h.weekdays))) then
      insert into public.habit_completions (habit_id, user_id, completed_on, note, created_at)
      values (v_habit, h.owner, v_today,
              case when h.name = 'Gym' then 'Leg day — 45 min' end,
              now() - (random() * interval '3 hours'));
    end if;
  end loop;

  -- Friendly reactions and a few comments on the last week of activity.
  for c in
    select hc.id, hc.user_id, hc.completed_on
    from public.habit_completions hc
    join public.habits hb on hb.id = hc.habit_id
    where hb.visibility = 'group'
      and hc.user_id in (v_alex, v_mike, v_john, v_chris)
      and hc.created_at > now() - interval '7 days'
  loop
    if random() < 0.45 then
      insert into public.reactions (completion_id, user_id, emoji, created_at)
      select c.id, m.id, (array['🔥','💪','👏','👀','🎉'])[1 + floor(random() * 5)::int], now() - random() * interval '2 days'
      from unnest(array[v_alex, v_mike, v_john, v_chris]) as m(id)
      where m.id <> c.user_id and random() < 0.5
      on conflict do nothing;
    end if;
    if random() < 0.15 then
      insert into public.comments (completion_id, user_id, body, created_at)
      values (c.id,
              (select m from unnest(array[v_alex, v_mike, v_john, v_chris]) m where m <> c.user_id order by random() limit 1),
              (array['Let''s gooo', 'Nice work!', 'You''re on a roll 🔥', 'Respect.', 'Inspired me to do mine'])[1 + floor(random() * 5)::int],
              now() - random() * interval '1 day');
    end if;
  end loop;
end $$;
