-- Enable UUID generation
create extension if not exists "uuid-ossp";

-- Enums
create type activity_level as enum ('sedentary', 'light', 'moderate', 'active', 'very_active');
create type goal_type as enum ('lose', 'maintain', 'gain');
create type recipe_source as enum ('tiktok', 'youtube', 'xiaohongshu', 'manual', 'ai');
create type meal_type as enum ('breakfast', 'lunch', 'dinner', 'snack');
create type day_of_week as enum ('monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday');
create type meal_plan_status as enum ('draft', 'active', 'completed');
create type shopping_list_status as enum ('active', 'completed');

-- Profiles
create table profiles (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  display_name text,
  height_cm numeric,
  sex text check (sex in ('male', 'female')),
  age_years integer,
  activity_level activity_level default 'moderate',
  dietary_restrictions text[] default '{}',
  household_size integer default 1,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Body logs
create table body_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  weight_kg numeric not null,
  notes text,
  created_at timestamptz default now()
);

-- Body goals
create table body_goals (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null unique,
  goal_type goal_type default 'maintain',
  target_weight_kg numeric,
  target_date date,
  daily_calories integer not null default 2000,
  protein_g integer not null default 150,
  carbs_g integer not null default 200,
  fat_g integer not null default 65,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Recipes
create table recipes (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  title text not null,
  description text,
  source_url text,
  source_type recipe_source default 'manual',
  image_url text,
  ingredients jsonb not null default '[]',
  instructions text[] not null default '{}',
  servings integer default 1,
  prep_time_minutes integer,
  cook_time_minutes integer,
  calories_per_serving numeric,
  protein_per_serving numeric,
  carbs_per_serving numeric,
  fat_per_serving numeric,
  tags text[] default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Meal plans
create table meal_plans (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  week_start_date date not null,
  status meal_plan_status default 'draft',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Meal plan items
create table meal_plan_items (
  id uuid primary key default uuid_generate_v4(),
  meal_plan_id uuid references meal_plans(id) on delete cascade not null,
  recipe_id uuid references recipes(id) on delete cascade not null,
  day_of_week day_of_week not null,
  meal_type meal_type not null,
  servings numeric default 1,
  created_at timestamptz default now()
);

-- Shopping lists
create table shopping_lists (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  meal_plan_id uuid references meal_plans(id) on delete set null,
  name text not null default 'Shopping List',
  status shopping_list_status default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Shopping list items
create table shopping_list_items (
  id uuid primary key default uuid_generate_v4(),
  shopping_list_id uuid references shopping_lists(id) on delete cascade not null,
  name text not null,
  quantity numeric not null default 1,
  unit text not null default 'unit',
  category text not null default 'other',
  is_purchased boolean default false,
  recipe_source_ids uuid[] default '{}',
  notes text,
  created_at timestamptz default now()
);

-- Pantry items
create table pantry_items (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  quantity numeric not null default 1,
  unit text not null default 'unit',
  expiry_date date,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Exercise logs
create table exercise_logs (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  activity_type text not null,
  duration_minutes integer not null,
  calories_burned integer,
  created_at timestamptz default now()
);

-- Indexes
create index idx_profiles_user_id on profiles(user_id);
create index idx_body_logs_user_date on body_logs(user_id, date desc);
create index idx_body_goals_user_id on body_goals(user_id);
create index idx_recipes_user_id on recipes(user_id);
create index idx_meal_plans_user_week on meal_plans(user_id, week_start_date desc);
create index idx_meal_plan_items_plan on meal_plan_items(meal_plan_id);
create index idx_shopping_lists_user on shopping_lists(user_id);
create index idx_shopping_list_items_list on shopping_list_items(shopping_list_id);
create index idx_pantry_items_user on pantry_items(user_id);
create index idx_exercise_logs_user_date on exercise_logs(user_id, date desc);

-- Updated_at trigger function
create or replace function update_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at before update on profiles for each row execute function update_updated_at();
create trigger body_goals_updated_at before update on body_goals for each row execute function update_updated_at();
create trigger recipes_updated_at before update on recipes for each row execute function update_updated_at();
create trigger meal_plans_updated_at before update on meal_plans for each row execute function update_updated_at();
create trigger shopping_lists_updated_at before update on shopping_lists for each row execute function update_updated_at();
create trigger pantry_items_updated_at before update on pantry_items for each row execute function update_updated_at();

-- Row Level Security
alter table profiles enable row level security;
alter table body_logs enable row level security;
alter table body_goals enable row level security;
alter table recipes enable row level security;
alter table meal_plans enable row level security;
alter table meal_plan_items enable row level security;
alter table shopping_lists enable row level security;
alter table shopping_list_items enable row level security;
alter table pantry_items enable row level security;
alter table exercise_logs enable row level security;

-- RLS Policies: users can only access their own data
create policy "Users can view own profile" on profiles for select using (auth.uid() = user_id);
create policy "Users can insert own profile" on profiles for insert with check (auth.uid() = user_id);
create policy "Users can update own profile" on profiles for update using (auth.uid() = user_id);

create policy "Users can view own body logs" on body_logs for select using (auth.uid() = user_id);
create policy "Users can insert own body logs" on body_logs for insert with check (auth.uid() = user_id);
create policy "Users can update own body logs" on body_logs for update using (auth.uid() = user_id);
create policy "Users can delete own body logs" on body_logs for delete using (auth.uid() = user_id);

create policy "Users can view own body goals" on body_goals for select using (auth.uid() = user_id);
create policy "Users can insert own body goals" on body_goals for insert with check (auth.uid() = user_id);
create policy "Users can update own body goals" on body_goals for update using (auth.uid() = user_id);

create policy "Users can view own recipes" on recipes for select using (auth.uid() = user_id);
create policy "Users can insert own recipes" on recipes for insert with check (auth.uid() = user_id);
create policy "Users can update own recipes" on recipes for update using (auth.uid() = user_id);
create policy "Users can delete own recipes" on recipes for delete using (auth.uid() = user_id);

create policy "Users can view own meal plans" on meal_plans for select using (auth.uid() = user_id);
create policy "Users can insert own meal plans" on meal_plans for insert with check (auth.uid() = user_id);
create policy "Users can update own meal plans" on meal_plans for update using (auth.uid() = user_id);
create policy "Users can delete own meal plans" on meal_plans for delete using (auth.uid() = user_id);

create policy "Users can view own meal plan items" on meal_plan_items for select using (
  exists (select 1 from meal_plans where meal_plans.id = meal_plan_items.meal_plan_id and meal_plans.user_id = auth.uid())
);
create policy "Users can insert own meal plan items" on meal_plan_items for insert with check (
  exists (select 1 from meal_plans where meal_plans.id = meal_plan_items.meal_plan_id and meal_plans.user_id = auth.uid())
);
create policy "Users can update own meal plan items" on meal_plan_items for update using (
  exists (select 1 from meal_plans where meal_plans.id = meal_plan_items.meal_plan_id and meal_plans.user_id = auth.uid())
);
create policy "Users can delete own meal plan items" on meal_plan_items for delete using (
  exists (select 1 from meal_plans where meal_plans.id = meal_plan_items.meal_plan_id and meal_plans.user_id = auth.uid())
);

create policy "Users can view own shopping lists" on shopping_lists for select using (auth.uid() = user_id);
create policy "Users can insert own shopping lists" on shopping_lists for insert with check (auth.uid() = user_id);
create policy "Users can update own shopping lists" on shopping_lists for update using (auth.uid() = user_id);
create policy "Users can delete own shopping lists" on shopping_lists for delete using (auth.uid() = user_id);

create policy "Users can view own shopping list items" on shopping_list_items for select using (
  exists (select 1 from shopping_lists where shopping_lists.id = shopping_list_items.shopping_list_id and shopping_lists.user_id = auth.uid())
);
create policy "Users can insert own shopping list items" on shopping_list_items for insert with check (
  exists (select 1 from shopping_lists where shopping_lists.id = shopping_list_items.shopping_list_id and shopping_lists.user_id = auth.uid())
);
create policy "Users can update own shopping list items" on shopping_list_items for update using (
  exists (select 1 from shopping_lists where shopping_lists.id = shopping_list_items.shopping_list_id and shopping_lists.user_id = auth.uid())
);
create policy "Users can delete own shopping list items" on shopping_list_items for delete using (
  exists (select 1 from shopping_lists where shopping_lists.id = shopping_list_items.shopping_list_id and shopping_lists.user_id = auth.uid())
);

create policy "Users can view own pantry items" on pantry_items for select using (auth.uid() = user_id);
create policy "Users can insert own pantry items" on pantry_items for insert with check (auth.uid() = user_id);
create policy "Users can update own pantry items" on pantry_items for update using (auth.uid() = user_id);
create policy "Users can delete own pantry items" on pantry_items for delete using (auth.uid() = user_id);

create policy "Users can view own exercise logs" on exercise_logs for select using (auth.uid() = user_id);
create policy "Users can insert own exercise logs" on exercise_logs for insert with check (auth.uid() = user_id);
create policy "Users can update own exercise logs" on exercise_logs for update using (auth.uid() = user_id);
create policy "Users can delete own exercise logs" on exercise_logs for delete using (auth.uid() = user_id);
