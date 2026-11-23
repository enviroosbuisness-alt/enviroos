-- EnviroOS — migration: "when was a reading last updated"
-- Run this in Supabase Dashboard > SQL Editor if you already ran schema.sql.
-- (Fresh installs don't need it — schema.sql already includes everything below.)
--
-- Design: `sensor_readings` is append-only (rows are inserted, never edited),
-- so per-row freshness = `recorded_at`/`created_at`. This migration adds:
--   1. `sensor_readings.updated_at` — set on insert, auto-bumped on UPDATE,
--      so future corrections/backfills can never silently lose their timestamp.
--   2. `devices.last_reading_at` — "when was Node X's reading last saved".
--      Maintained by trigger, so one indexed lookup answers it instead of
--      scanning `sensor_readings`. SECURITY DEFINER so anon inserts can
--      maintain it despite having no UPDATE right on `devices`.
--   3. Auto-bump for `device_config.updated_at` (the column existed but
--      nothing maintained it on UPDATE).

-- 1. Per-row last-updated on readings
alter table public.sensor_readings
  add column if not exists updated_at timestamptz not null default now();

-- 2. Per-device last-saved pointer
alter table public.devices
  add column if not exists last_reading_at timestamptz;

-- Generic "bump updated_at on write" trigger function
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  NEW.updated_at = now();
  return NEW;
end;
$$;

drop trigger if exists trg_readings_touch on public.sensor_readings;
create trigger trg_readings_touch
  before insert or update on public.sensor_readings
  for each row execute function public.touch_updated_at();

drop trigger if exists trg_config_touch on public.device_config;
create trigger trg_config_touch
  before insert or update on public.device_config
  for each row execute function public.touch_updated_at();

-- Keep devices.last_reading_at in sync on every saved reading.
-- SECURITY DEFINER: anon role can INSERT readings (RLS) but cannot UPDATE
-- devices, so the trigger must run with the owner's rights.
create or replace function public.touch_device_last_reading()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.devices
    set last_reading_at = NEW.recorded_at
    where device_id = NEW.device_id;
  return NEW;
end;
$$;

drop trigger if exists trg_readings_device_touch on public.sensor_readings;
create trigger trg_readings_device_touch
  after insert on public.sensor_readings
  for each row execute function public.touch_device_last_reading();

-- Backfill devices.last_reading_at from existing rows
update public.devices d
  set last_reading_at = r.max_at
  from (select device_id, max(recorded_at) as max_at
        from public.sensor_readings group by device_id) r
  where d.device_id = r.device_id;

-- Handy index for "last updated per device" lookups
create index if not exists idx_devices_last_reading
  on public.devices (last_reading_at desc nulls last);
