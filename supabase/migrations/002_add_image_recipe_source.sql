-- Add 'image' as a recipe source type (for importing recipes from photos/screenshots)
alter type recipe_source add value if not exists 'image';
