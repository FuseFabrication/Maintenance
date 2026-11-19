-- Fuse Maintenance Log: run this once in Supabase (SQL Editor > New query > paste > Run).

create table if not exists equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tag text not null default '',
  category text not null default '',
  location text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  equip_id uuid not null references equipment(id) on delete cascade,
  name text not null,
  every int not null check (every > 0),
  unit text not null check (unit in ('day','week','month','year')),
  next_due date not null,
  last_done date,
  last_by text not null default '',
  created_at timestamptz not null default now()
);

-- History keeps the equipment name, so entries survive if equipment is removed.
create table if not exists log (
  id uuid primary key default gen_random_uuid(),
  equip_id uuid references equipment(id) on delete set null,
  equip_name text not null default '',
  equip_tag text not null default '',
  task_id uuid,
  kind text not null check (kind in ('scheduled','repair','other')),
  title text not null,
  notes text not null default '',
  done_by text not null,
  done_date date not null,
  created_at timestamptz not null default now()
);

create table if not exists holidays (
  day date primary key,
  name text not null
);

create index if not exists tasks_equip_idx on tasks(equip_id);
create index if not exists log_created_idx on log(created_at desc);

-- Only signed-in shop users can read or change anything.
alter table equipment enable row level security;
alter table tasks      enable row level security;
alter table log        enable row level security;
alter table holidays   enable row level security;

drop policy if exists "shop users" on equipment;
drop policy if exists "shop users" on tasks;
drop policy if exists "shop users" on log;
drop policy if exists "shop users" on holidays;

create policy "shop users" on equipment for all to authenticated using (true) with check (true);
create policy "shop users" on tasks     for all to authenticated using (true) with check (true);
create policy "shop users" on log       for all to authenticated using (true) with check (true);
create policy "shop users" on holidays  for all to authenticated using (true) with check (true);

-- Live updates between screens.
alter publication supabase_realtime add table equipment, tasks, log, holidays;
