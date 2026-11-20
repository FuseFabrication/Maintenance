-- =====================================================================
-- Fuse Fabrication – Maintenance Log
-- Database schema for Supabase (Postgres 15+)
--
-- How to use: Supabase dashboard -> SQL Editor -> New query ->
-- paste this whole file -> Run. Then run seed.sql the same way.
--
-- Safe to run more than once: tables are only created if missing, and
-- functions, views and policies are replaced.
--
-- ISO 9001 notes
--   * Maintenance records (inspections, skips, problems, status changes,
--     maintenance logs, exception reviews, corrections) can be ADDED but
--     never edited or deleted from the app. Mistakes are fixed by adding
--     a correction record, so the original stays on file (clause 7.5.3).
--   * The time and the period a check counts for are set by the
--     database, not the tablet, so records can't be back-dated.
--   * Every checklist has a document ID, revision, effective date and
--     approver. Each inspection stores the exact wording it was answered
--     against, and every saved revision is kept (clause 7.5.2 / 7.5.3).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Remove the first version's tables (equipment, tasks, log).
--    They were empty when this was written. holidays is kept.
-- ---------------------------------------------------------------------
drop table if exists public.log cascade;
drop table if exists public.tasks cascade;
drop table if exists public.equipment cascade;

create table if not exists public.holidays (
  day  date primary key,
  name text not null default ''
);

-- ---------------------------------------------------------------------
-- 1. Settings and date helpers
-- ---------------------------------------------------------------------

-- The shop's local date. All "today" / period math uses this.
create or replace function public.shop_today()
returns date language sql stable as $$
  select (now() at time zone 'America/New_York')::date
$$;

create or replace function public.shop_date(ts timestamptz)
returns date language sql stable as $$
  select (ts at time zone 'America/New_York')::date
$$;

-- Daily checks are due Monday–Friday, except holidays.
create or replace function public.is_workday(d date)
returns boolean language sql stable as $$
  select extract(isodow from d) < 6
     and not exists (select 1 from public.holidays h where h.day = d)
$$;

-- First day of the period a date falls in.
--   daily: that day | weekly: Monday | monthly: 1st | semiannual: Jan 1 / Jul 1 | annual: Jan 1
create or replace function public.period_start(freq text, d date)
returns date language sql immutable as $$
  select case freq
    when 'daily'      then d
    when 'weekly'     then date_trunc('week', d)::date
    when 'monthly'    then date_trunc('month', d)::date
    when 'semiannual' then make_date(extract(year from d)::int,
                                     case when extract(month from d) <= 6 then 1 else 7 end, 1)
    when 'annual'     then date_trunc('year', d)::date
  end
$$;

create or replace function public.period_end(freq text, start_d date)
returns date language sql immutable as $$
  select case freq
    when 'daily'      then start_d
    when 'weekly'     then start_d + 6
    when 'monthly'    then (start_d + interval '1 month' - interval '1 day')::date
    when 'semiannual' then (start_d + interval '6 months' - interval '1 day')::date
    when 'annual'     then (start_d + interval '1 year' - interval '1 day')::date
  end
$$;

-- ---------------------------------------------------------------------
-- 2. Reference tables
-- ---------------------------------------------------------------------
create table if not exists public.departments (
  name text primary key,
  sort int not null default 0
);

-- Names that show on the tablet "Who's doing the maintenance?" screen.
create table if not exists public.people (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(trim(name)) > 0),
  department text references public.departments(name) on update cascade,
  role_label text not null default 'Operator',
  active     boolean not null default true,
  confirmed  boolean not null default true,  -- false = typed in on a tablet, waiting for a supervisor
  created_at timestamptz not null default now()
);

-- One row per Supabase login. role decides what the login can do.
--   tablet     – shop-floor tablets: run checklists, skip, report problems, log work
--   supervisor – also review exceptions, edit machines, checklists and people
--   admin      – also change other logins' roles
create table if not exists public.profiles (
  user_id      uuid primary key references auth.users(id) on delete cascade,
  role         text not null default 'tablet' check (role in ('tablet','supervisor','admin')),
  display_name text not null default '',
  created_at   timestamptz not null default now()
);

create table if not exists public.assets (
  id            text primary key,                 -- Fuse Asset ID, e.g. FUSE-PB-001
  cpa_id        text,
  name          text not null,
  department    text references public.departments(name) on update cascade,  -- owner department
  location      text not null default '',
  manufacturer  text not null default '',
  model         text not null default '',
  serial        text not null default '',
  asset_type    text not null default '',
  parent_id     text references public.assets(id) on update cascade,
  criticality   text not null default 'Medium' check (criticality in ('High','Medium','Low')),
  osha          boolean,
  loto          boolean,
  cert_required boolean,
  in_service    text not null default '',
  status        text not null default 'running' check (status in ('running','limited','down','retired')),
  notes         text not null default '',
  needs_review  boolean not null default false,
  created_at    timestamptz not null default now()
);

-- Other departments that use a machine (cranes, forklifts, compressors...).
create table if not exists public.asset_departments (
  asset_id   text not null references public.assets(id) on update cascade on delete cascade,
  department text not null references public.departments(name) on update cascade on delete cascade,
  primary key (asset_id, department)
);

create table if not exists public.checklists (
  id             uuid primary key default gen_random_uuid(),
  asset_id       text not null references public.assets(id) on update cascade,
  frequency      text not null check (frequency in ('daily','weekly','monthly','semiannual','annual')),
  title          text not null,
  doc_id         text not null default '',
  revision       int  not null default 1,
  effective_date date not null default public.shop_today(),
  approved_by    text not null default '',
  est_minutes    int,
  active         boolean not null default true,
  created_at     timestamptz not null default now()
);

create table if not exists public.checklist_items (
  id           uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists(id) on delete cascade,
  seq          int  not null,
  area         text not null default '',
  prompt       text not null,
  criteria     text not null default ''
);

-- A copy of every saved checklist revision (never changed).
create table if not exists public.checklist_revisions (
  id             uuid primary key default gen_random_uuid(),
  checklist_id   uuid not null references public.checklists(id),
  revision       int  not null,
  title          text not null,
  items          jsonb not null,
  change_note    text not null default '',
  approved_by    text not null default '',
  effective_date date not null,
  user_id        uuid default auth.uid(),
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 3. Records (add-only)
-- ---------------------------------------------------------------------
create table if not exists public.inspections (
  id           uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists(id),
  asset_id     text references public.assets(id) on update cascade,
  frequency    text,
  revision     int,
  period_start date,
  performed_by text not null check (length(trim(performed_by)) > 0),
  performed_at timestamptz not null default now(),
  result       text not null check (result in ('pass','fail')),
  answers      jsonb not null,   -- [{seq, area, prompt, criteria, answer: 'yes'|'no', note}]
  notes        text not null default '',
  user_id      uuid default auth.uid()
);

create table if not exists public.skips (
  id           uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.checklists(id),
  asset_id     text references public.assets(id) on update cascade,
  frequency    text,
  period_start date,
  reason       text not null check (reason in ('machine_down','not_in_use','no_time','missing_parts','other')),
  note         text not null check (length(trim(note)) > 0),
  makeup       text not null default '',
  reported_by  text not null check (length(trim(reported_by)) > 0),
  created_at   timestamptz not null default now(),
  user_id      uuid default auth.uid()
);

create table if not exists public.problems (
  id          uuid primary key default gen_random_uuid(),
  asset_id    text not null references public.assets(id) on update cascade,
  new_status  text not null check (new_status in ('running','limited','down')),
  category    text not null default '',
  description text not null check (length(trim(description)) > 0),
  loto        boolean not null default false,
  reported_by text not null check (length(trim(reported_by)) > 0),
  created_at  timestamptz not null default now(),
  user_id     uuid default auth.uid()
);

create table if not exists public.status_changes (
  id         uuid primary key default gen_random_uuid(),
  asset_id   text not null references public.assets(id) on update cascade,
  old_status text,
  new_status text not null,
  note       text not null default '',
  changed_by text not null,
  created_at timestamptz not null default now(),
  user_id    uuid default auth.uid()
);

create table if not exists public.maintenance_logs (
  id         uuid primary key default gen_random_uuid(),
  asset_id   text not null references public.assets(id) on update cascade,
  kind       text not null check (kind in ('repair','pm','inspection','calibration','other')),
  title      text not null check (length(trim(title)) > 0),
  notes      text not null default '',
  done_by    text not null check (length(trim(done_by)) > 0),
  done_on    date not null default public.shop_today(),
  created_at timestamptz not null default now(),
  user_id    uuid default auth.uid()
);

-- A supervisor's sign-off on an exception (skipped / missed / failed item).
create table if not exists public.exception_reviews (
  id            uuid primary key default gen_random_uuid(),
  exception_key text not null,
  action        text not null check (action in ('acknowledged','made_up','corrective_action')),
  note          text not null check (length(trim(note)) > 0),
  reviewed_by   text not null check (length(trim(reviewed_by)) > 0),
  created_at    timestamptz not null default now(),
  user_id       uuid default auth.uid()
);

-- Corrections to a record. The original is never changed.
create table if not exists public.corrections (
  id           uuid primary key default gen_random_uuid(),
  target_type  text not null check (target_type in ('inspection','skip','problem','maintenance_log','status_change')),
  target_id    uuid not null,
  asset_id     text references public.assets(id) on update cascade,
  reason       text not null check (length(trim(reason)) > 0),
  corrected_by text not null check (length(trim(corrected_by)) > 0),
  created_at   timestamptz not null default now(),
  user_id      uuid default auth.uid()
);

create index if not exists inspections_cl_period on public.inspections (checklist_id, period_start);
create index if not exists inspections_asset on public.inspections (asset_id, performed_at desc);
create index if not exists skips_cl_period on public.skips (checklist_id, period_start);
create index if not exists problems_asset on public.problems (asset_id, created_at desc);
create index if not exists status_changes_asset on public.status_changes (asset_id, created_at desc);
create index if not exists maint_asset on public.maintenance_logs (asset_id, created_at desc);
create index if not exists reviews_key on public.exception_reviews (exception_key, created_at desc);
create index if not exists items_cl on public.checklist_items (checklist_id, seq);

-- ---------------------------------------------------------------------
-- 4. Server-set fields on inspections and skips
--    (time, period, asset, frequency and revision come from the database)
-- ---------------------------------------------------------------------
create or replace function public.fill_check_record()
returns trigger language plpgsql as $$
declare c public.checklists;
begin
  select * into c from public.checklists where id = new.checklist_id;
  if not found then raise exception 'Unknown checklist %', new.checklist_id; end if;
  new.asset_id  := c.asset_id;
  new.frequency := c.frequency;
  if tg_table_name = 'inspections' then
    new.performed_at := now();
    new.revision     := c.revision;
    new.period_start := public.period_start(c.frequency, public.shop_date(new.performed_at));
  else
    new.created_at   := now();
    new.period_start := public.period_start(c.frequency, public.shop_date(new.created_at));
  end if;
  new.user_id := auth.uid();
  return new;
end $$;

drop trigger if exists inspections_fill on public.inspections;
create trigger inspections_fill before insert on public.inspections
  for each row execute function public.fill_check_record();
drop trigger if exists skips_fill on public.skips;
create trigger skips_fill before insert on public.skips
  for each row execute function public.fill_check_record();

-- Times on the other record tables are always the server's.
create or replace function public.stamp_now()
returns trigger language plpgsql as $$
begin
  new.created_at := now();
  new.user_id := auth.uid();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array['problems','status_changes','maintenance_logs','exception_reviews','corrections','checklist_revisions'] loop
    execute format('drop trigger if exists %I_stamp on public.%I', t, t);
    execute format('create trigger %I_stamp before insert on public.%I for each row execute function public.stamp_now()', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------
-- 5. Role helpers and actions
-- ---------------------------------------------------------------------
create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where user_id = auth.uid()
$$;

create or replace function public.is_supervisor()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role in ('supervisor','admin'))
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.profiles where user_id = auth.uid() and role = 'admin')
$$;

-- Change a machine's status and keep a record of it. Any signed-in user.
create or replace function public.set_asset_status(p_asset text, p_status text, p_note text, p_by text)
returns void language plpgsql security definer set search_path = public as $$
declare old text;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if p_status not in ('running','limited','down') and not public.is_supervisor() then
    raise exception 'Only a supervisor can retire a machine';
  end if;
  if coalesce(trim(p_by),'') = '' then raise exception 'Name is required'; end if;
  select status into old from public.assets where id = p_asset for update;
  if not found then raise exception 'Unknown machine %', p_asset; end if;
  if old is distinct from p_status then
    insert into public.status_changes(asset_id, old_status, new_status, note, changed_by)
    values (p_asset, old, p_status, coalesce(p_note,''), p_by);
    update public.assets set status = p_status where id = p_asset;
  end if;
end $$;

-- Report a problem; also sets the machine's status.
create or replace function public.report_problem(p_asset text, p_status text, p_category text,
                                                 p_description text, p_loto boolean, p_by text)
returns uuid language plpgsql security definer set search_path = public as $$
declare pid uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  insert into public.problems(asset_id, new_status, category, description, loto, reported_by)
  values (p_asset, p_status, coalesce(p_category,''), p_description, coalesce(p_loto,false), p_by)
  returning id into pid;
  perform public.set_asset_status(p_asset, p_status, 'Problem reported: ' || left(p_description, 120), p_by);
  return pid;
end $$;

-- ---------------------------------------------------------------------
-- 6. Views
-- ---------------------------------------------------------------------

-- Where each active checklist stands in its current period.
create or replace view public.v_checklist_status with (security_invoker = true) as
with base as (
  select c.*, a.name as asset_name, a.department, a.status as asset_status,
         public.period_start(c.frequency, public.shop_today()) as cur_start
  from public.checklists c
  join public.assets a on a.id = c.asset_id
  where c.active and a.status <> 'retired'
)
select b.id as checklist_id, b.asset_id, b.asset_name, b.department, b.asset_status,
       b.frequency, b.title, b.doc_id, b.revision, b.approved_by, b.effective_date,
       b.cur_start as period_start,
       public.period_end(b.frequency, b.cur_start) as due_by,
       (b.frequency <> 'daily' or public.is_workday(public.shop_today())) as due_this_period,
       i.performed_at as done_at, i.performed_by as done_by, i.result as done_result,
       s.created_at as skipped_at, s.reported_by as skipped_by, s.reason as skip_reason,
       li.performed_at as last_done_at, li.performed_by as last_done_by,
       case
         when i.id is not null then 'done'
         when s.id is not null then 'skipped'
         when b.frequency = 'daily' and not public.is_workday(public.shop_today()) then 'not_due'
         else 'due'
       end as state
from base b
left join lateral (select * from public.inspections x
                   where x.checklist_id = b.id and x.period_start = b.cur_start
                   order by x.performed_at desc limit 1) i on true
left join lateral (select * from public.skips x
                   where x.checklist_id = b.id and x.period_start = b.cur_start
                   order by x.created_at desc limit 1) s on true
left join lateral (select * from public.inspections x
                   where x.checklist_id = b.id
                   order by x.performed_at desc limit 1) li on true;

-- Exceptions from the last 180 days:
--   skipped – someone skipped a check and gave a reason
--   missed  – a period ended with no check and no skip on record
--   failed  – a check was done and at least one item was answered No
-- "machine down" and "not in use" skips close automatically; everything
-- else needs a supervisor's review.
create or replace view public.v_exceptions with (security_invoker = true) as
with win as (select public.shop_today() - 180 as from_d, public.shop_today() as today),
active_cl as (
  select c.*, a.name as asset_name, a.department, a.status as asset_status,
         (select public.shop_date(max(sc.created_at)) from public.status_changes sc
           where sc.asset_id = a.id and sc.new_status = 'down') as down_since
  from public.checklists c join public.assets a on a.id = c.asset_id
  where c.active and a.status <> 'retired'
),
periods as (
  select c.id as checklist_id, p::date as period_start
  from active_cl c, win,
  lateral generate_series(
    public.period_start(c.frequency, greatest(public.shop_date(c.created_at), win.from_d)),
    public.period_start(c.frequency, win.today) - 1,
    case c.frequency when 'daily' then interval '1 day' when 'weekly' then interval '1 week'
      when 'monthly' then interval '1 month' when 'semiannual' then interval '6 months'
      else interval '1 year' end) p
  where p::date >= public.shop_date(c.created_at)
    and (c.frequency <> 'daily' or public.is_workday(p::date))
),
raw as (
  select 'missed:' || c.id || ':' || p.period_start as exception_key,
         'missed'::text as kind, c.asset_id, c.asset_name, c.department, c.id as checklist_id,
         c.title, c.frequency, p.period_start,
         public.period_end(c.frequency, p.period_start)::timestamptz as occurred_at,
         'No check or skip recorded for this period'::text as detail,
         null::text as by_name, false as auto_closed
  from periods p join active_cl c on c.id = p.checklist_id
  where not exists (select 1 from public.inspections i where i.checklist_id = p.checklist_id and i.period_start = p.period_start)
    and not exists (select 1 from public.skips s where s.checklist_id = p.checklist_id and s.period_start = p.period_start)
    and not (c.asset_status = 'down' and c.down_since is not null and p.period_start >= c.down_since)
  union all
  select 'skip:' || s.id, 'skipped', s.asset_id, a.name, a.department, s.checklist_id,
         c.title, s.frequency, s.period_start, s.created_at,
         case s.reason when 'machine_down' then 'Machine down' when 'not_in_use' then 'Not in use'
           when 'no_time' then 'No time / short staffed' when 'missing_parts' then 'Missing parts or tools'
           else 'Other' end || ': ' || s.note
           || case when s.makeup <> '' then ' (make-up: ' || s.makeup || ')' else '' end,
         s.reported_by, s.reason in ('machine_down','not_in_use')
  from public.skips s join public.checklists c on c.id = s.checklist_id join public.assets a on a.id = s.asset_id, win
  where public.shop_date(s.created_at) >= win.from_d
  union all
  select 'fail:' || i.id, 'failed', i.asset_id, a.name, a.department, i.checklist_id,
         c.title, i.frequency, i.period_start, i.performed_at,
         (select string_agg('#' || (x->>'seq') || ' ' || (x->>'prompt')
                 || coalesce(nullif(' – ' || coalesce(x->>'note',''), ' – '), ''), '; ')
            from jsonb_array_elements(i.answers) x where x->>'answer' = 'no'),
         i.performed_by, false
  from public.inspections i join public.checklists c on c.id = i.checklist_id join public.assets a on a.id = i.asset_id, win
  where i.result = 'fail' and public.shop_date(i.performed_at) >= win.from_d
)
select r.*,
       rv.action as review_action, rv.note as review_note, rv.reviewed_by, rv.created_at as reviewed_at,
       case when rv.id is not null then 'reviewed'
            when r.auto_closed then 'auto_closed'
            else 'needs_review' end as review_status
from raw r
left join lateral (select * from public.exception_reviews e
                   where e.exception_key = r.exception_key
                   order by e.created_at desc limit 1) rv on true;

-- ---------------------------------------------------------------------
-- 7. Row-level security
-- ---------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array['holidays','departments','people','profiles','assets','asset_departments',
    'checklists','checklist_items','checklist_revisions','inspections','skips','problems',
    'status_changes','maintenance_logs','exception_reviews','corrections'] loop
    execute format('alter table public.%I enable row level security', t);
    -- remove every existing policy on the table, then add ours
    perform 1;
  end loop;
end $$;

do $$
declare r record;
begin
  for r in select policyname, tablename from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;
end $$;

-- Everyone signed in can read everything (except other people's logins).
do $$
declare t text;
begin
  foreach t in array array['holidays','departments','people','assets','asset_departments',
    'checklists','checklist_items','checklist_revisions','inspections','skips','problems',
    'status_changes','maintenance_logs','exception_reviews','corrections'] loop
    execute format('create policy "read" on public.%I for select to authenticated using (true)', t);
  end loop;
end $$;

-- Supervisors maintain the reference data.
do $$
declare t text;
begin
  foreach t in array array['holidays','departments','assets','asset_departments','checklists','checklist_items'] loop
    execute format('create policy "supervisor insert" on public.%I for insert to authenticated with check (public.is_supervisor())', t);
    execute format('create policy "supervisor update" on public.%I for update to authenticated using (public.is_supervisor()) with check (public.is_supervisor())', t);
    execute format('create policy "supervisor delete" on public.%I for delete to authenticated using (public.is_supervisor())', t);
  end loop;
end $$;

-- People: a tablet can add a name (unconfirmed); supervisors manage the list.
create policy "add name" on public.people for insert to authenticated
  with check (public.is_supervisor() or (confirmed = false and active = true));
create policy "supervisor update" on public.people for update to authenticated
  using (public.is_supervisor()) with check (public.is_supervisor());

-- Logins: see your own; admins see and change everyone's.
create policy "read own" on public.profiles for select to authenticated
  using (user_id = auth.uid() or public.is_supervisor());
create policy "create own" on public.profiles for insert to authenticated
  with check (user_id = auth.uid() and role = 'tablet');
create policy "admin update" on public.profiles for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Records: add-only. No update or delete policies exist for these tables.
create policy "add" on public.inspections      for insert to authenticated with check (true);
create policy "add" on public.skips            for insert to authenticated with check (true);
create policy "add" on public.maintenance_logs for insert to authenticated with check (true);
create policy "supervisor add" on public.exception_reviews   for insert to authenticated with check (public.is_supervisor());
create policy "supervisor add" on public.corrections         for insert to authenticated with check (public.is_supervisor());
create policy "supervisor add" on public.checklist_revisions for insert to authenticated with check (public.is_supervisor());
-- problems and status_changes are written only through report_problem / set_asset_status.

-- ---------------------------------------------------------------------
-- 8. Grants
-- ---------------------------------------------------------------------
revoke all on all tables in schema public from anon;
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select on public.v_checklist_status, public.v_exceptions to authenticated;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated;
