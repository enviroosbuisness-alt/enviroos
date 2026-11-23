-- EnviroOS — Supabase schema for periodic sensor readings
-- Run this once in Supabase Dashboard > SQL Editor > New Query > Run.
--
-- Design notes:
--   * 2 nodes today (FULL NPK + BASIC), but schema supports N nodes.
--   * One narrow `sensor_readings` time-series table (one row per save).
--     At 15-min intervals: 96 rows/day/node = ~35k rows/year/node. Trivial for Postgres.
--     You do NOT need a dedicated time-series DB (Influx/Timescale) until you hit
--     second-level sampling or >10M rows. Plain Postgres + index is the right call.
--   * `device_config` holds the user-configurable save interval so the ESP32
--     can eventually read it directly (robust path that works even when app is closed).
--   * RLS enabled with permissive anon policies because the ESP32 + browser use
--     the anon key. Tighten later with authenticated users / service_role for writes.

-- 1. Devices registry (one row per ESP32 node)
create table if not exists public.devices (
  device_id text primary key,               -- e.g. '4493A6470968' (uppercase hex)
  node_name text not null default 'Sensor Node',
  node_type text not null default 'full' check (node_type in ('full','basic')),
  crop_id text,                             -- 'bajra','wheat',... mirrors app profile
  created_at timestamptz not null default now()
);

-- 2. Periodic readings (append-only time series)
create table if not exists public.sensor_readings (
  id bigint generated always as identity primary key,
  device_id text not null references public.devices(device_id) on delete cascade,
  recorded_at timestamptz not null default now(),

  -- soil
  moisture double precision,                -- %
  ph double precision,
  n double precision,                       -- mg/kg
  p double precision,
  k double precision,

  -- environment
  temp_c double precision,
  humidity double precision,                -- nullable (no sensor on current nodes)
  pressure_hpa double precision,
  lux double precision,

  -- device health
  wifi_rssi integer,
  uptime_s integer,

  -- meta
  node_name text,
  crop_id text,
  raw_payload jsonb,                        -- original MQTT JSON for debugging
  created_at timestamptz not null default now()
);

-- 3. Per-device config (frontend edits interval here; ESP32 polls it)
create table if not exists public.device_config (
  device_id text primary key references public.devices(device_id) on delete cascade,
  interval_min integer not null default 15 check (interval_min in (0,1,5,10,15,30,60)),
  updated_at timestamptz not null default now()
);

-- Indexes for time-range queries (History charts: WHERE device_id=X ORDER BY recorded_at DESC LIMIT N)
create index if not exists idx_readings_device_time
  on public.sensor_readings (device_id, recorded_at desc);
create index if not exists idx_readings_time
  on public.sensor_readings (recorded_at desc);

-- Seed the two known farm nodes
insert into public.devices (device_id, node_name, node_type, crop_id)
values
  ('4493A6470968', 'Node 1 (NPK)', 'full', 'bajra'),
  ('149853470968', 'Node 2', 'basic', 'wheat')
on conflict (device_id) do nothing;

insert into public.device_config (device_id, interval_min)
values
  ('4493A6470968', 15),
  ('149853470968', 15)
on conflict (device_id) do nothing;

-- Daily rollup view for History screen (avg per day per device)
create or replace view public.daily_readings as
select
  device_id,
  date_trunc('day', recorded_at)::date as day,
  count(*) as samples,
  round(avg(moisture)::numeric, 1) as moisture,
  round(avg(temp_c)::numeric, 1) as temp_c,
  round(avg(lux)::numeric, 0) as lux,
  round(avg(pressure_hpa)::numeric, 1) as pressure_hpa,
  round(avg(n)::numeric, 0) as n,
  round(avg(p)::numeric, 0) as p,
  round(avg(k)::numeric, 0) as k
from public.sensor_readings
group by device_id, date_trunc('day', recorded_at);

-- Row Level Security: allow anon read + insert (browser + ESP32 use anon key)
alter table public.devices enable row level security;
alter table public.sensor_readings enable row level security;
alter table public.device_config enable row level security;

drop policy if exists "anon read devices" on public.devices;
create policy "anon read devices" on public.devices for select to anon using (true);

drop policy if exists "anon read_insert readings" on public.sensor_readings;
create policy "anon read_insert readings" on public.sensor_readings for select to anon using (true);
drop policy if exists "anon insert readings" on public.sensor_readings;
create policy "anon insert readings" on public.sensor_readings for insert to anon with check (true);

drop policy if exists "anon read config" on public.device_config;
create policy "anon read config" on public.device_config for select to anon using (true);
drop policy if exists "anon update config" on public.device_config;
create policy "anon update config" on public.device_config for update to anon using (true) with check (true);
drop policy if exists "anon insert config" on public.device_config;
create policy "anon insert config" on public.device_config for insert to anon with check (true);
