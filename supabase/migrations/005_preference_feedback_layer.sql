-- Preference feedback loop foundation:
-- 1) richer onboarding preference fields on profiles
-- 2) append-only preference signal log
-- 3) aggregated taste profile snapshot
-- 4) explicit meal feedback records

alter table profiles
  add column if not exists preferred_cuisines text[] default '{}',
  add column if not exists disliked_ingredients text[] default '{}',
  add column if not exists favorite_proteins text[] default '{}',
  add column if not exists cooking_effort text default 'medium' check (cooking_effort in ('low', 'medium', 'high')),
  add column if not exists prep_time_preference_minutes integer default 30,
  add column if not exists weekday_cooking_time text default 'quick',
  add column if not exists spice_tolerance text default 'medium' check (spice_tolerance in ('mild', 'medium', 'hot')),
  add column if not exists repeat_tolerance text default 'medium' check (repeat_tolerance in ('low', 'medium', 'high')),
  add column if not exists budget_sensitivity text default 'medium' check (budget_sensitivity in ('low', 'medium', 'high')),
  add column if not exists equipment_constraints text[] default '{}';

create table if not exists user_preference_signals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null,
  signal_type text not null,
  entity_type text not null,
  entity_key text not null,
  weight real not null default 1,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists user_taste_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  ingredient_scores jsonb not null default '{}'::jsonb,
  cuisine_scores jsonb not null default '{}'::jsonb,
  tag_scores jsonb not null default '{}'::jsonb,
  effort_preference text default 'medium',
  spice_preference text default 'medium',
  variety_preference text default 'medium',
  updated_at timestamptz default now(),
  created_at timestamptz default now()
);

create table if not exists meal_feedback (
  id uuid primary key default gen_random_uuid(),
  meal_plan_item_id uuid references meal_plan_items(id) on delete cascade not null,
  user_id uuid references auth.users(id) on delete cascade not null,
  feedback_type text not null,
  reason text,
  created_at timestamptz default now()
);

create index if not exists idx_user_preference_signals_user_created
  on user_preference_signals(user_id, created_at desc);
create index if not exists idx_user_preference_signals_entity
  on user_preference_signals(user_id, entity_type, entity_key);
create index if not exists idx_user_taste_profiles_user
  on user_taste_profiles(user_id);
create index if not exists idx_meal_feedback_user_created
  on meal_feedback(user_id, created_at desc);

alter table user_preference_signals enable row level security;
alter table user_taste_profiles enable row level security;
alter table meal_feedback enable row level security;

create policy "Users can read own preference signals"
  on user_preference_signals for select using (auth.uid() = user_id);
create policy "Users can insert own preference signals"
  on user_preference_signals for insert with check (auth.uid() = user_id);
create policy "Users can delete own preference signals"
  on user_preference_signals for delete using (auth.uid() = user_id);

create policy "Users can read own taste profiles"
  on user_taste_profiles for select using (auth.uid() = user_id);
create policy "Users can insert own taste profiles"
  on user_taste_profiles for insert with check (auth.uid() = user_id);
create policy "Users can update own taste profiles"
  on user_taste_profiles for update using (auth.uid() = user_id);

create policy "Users can read own meal feedback"
  on meal_feedback for select using (auth.uid() = user_id);
create policy "Users can insert own meal feedback"
  on meal_feedback for insert with check (auth.uid() = user_id);
create policy "Users can delete own meal feedback"
  on meal_feedback for delete using (auth.uid() = user_id);

create trigger user_taste_profiles_updated_at
  before update on user_taste_profiles
  for each row execute function update_updated_at();
