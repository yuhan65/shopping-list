-- Measurement preference on profiles:
-- stores whether UI should render metric or imperial units.
alter table profiles
  add column if not exists measurement_system text
  default 'imperial'
  check (measurement_system in ('metric', 'imperial'));
