-- Extend schema for redesign: new profile fields, body goal fields,
-- recipe difficulty, shopping item prices, and hydration tracking.

-- Profile: location and health objectives
alter table profiles add column if not exists location text;
alter table profiles add column if not exists health_objectives text[] default '{}';

-- Body goals: fiber target and hydration target
alter table body_goals add column if not exists fiber_g real;
alter table body_goals add column if not exists hydration_ml real;

-- Recipe difficulty level
create type difficulty_level as enum ('easy', 'medium', 'hard');
alter table recipes add column if not exists difficulty difficulty_level;

-- Shopping list item estimated price
alter table shopping_list_items add column if not exists estimated_price real;

-- Hydration log table
create table if not exists hydration_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null default current_date,
  amount_ml real not null,
  created_at timestamptz default now()
);

alter table hydration_logs enable row level security;

create policy "Users can read own hydration logs"
  on hydration_logs for select using (auth.uid() = user_id);

create policy "Users can insert own hydration logs"
  on hydration_logs for insert with check (auth.uid() = user_id);

create policy "Users can delete own hydration logs"
  on hydration_logs for delete using (auth.uid() = user_id);
