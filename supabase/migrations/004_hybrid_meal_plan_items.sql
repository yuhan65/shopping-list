-- Allow meal plan items to reference either a saved DB recipe
-- or an inline AI-generated recipe payload.

alter table meal_plan_items
  alter column recipe_id drop not null;

alter table meal_plan_items
  add column if not exists source_type text not null default 'db',
  add column if not exists generated_recipe jsonb,
  add column if not exists generated_title text;

alter table meal_plan_items
  drop constraint if exists meal_plan_items_source_check;

alter table meal_plan_items
  add constraint meal_plan_items_source_check check (
    (source_type = 'db' and recipe_id is not null)
    or
    (source_type = 'generated' and generated_recipe is not null)
  );

create index if not exists idx_meal_plan_items_source_type
  on meal_plan_items(source_type);
