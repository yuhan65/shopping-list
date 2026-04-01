import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useColorScheme';
import { Spacing, FontSize, FontFamily, BorderRadius } from '@/constants/Spacing';
import { Button, Card, EmptyState, Icon } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useLocalDataStore } from '@/stores/localDataStore';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { supabase } from '@/lib/supabase';
import { mealTitle } from '@/lib/mealTitle';
import { createAIService } from '@/lib/ai';
import { useQueryClient } from '@tanstack/react-query';
import type { Recipe, MealPlan, MealPlanItem, BodyGoal, Ingredient, PantryItem } from '@/types/database';

const DAYS: { key: string; label: string }[] = [
  { key: 'monday', label: 'Monday' },
  { key: 'tuesday', label: 'Tuesday' },
  { key: 'wednesday', label: 'Wednesday' },
  { key: 'thursday', label: 'Thursday' },
  { key: 'friday', label: 'Friday' },
  { key: 'saturday', label: 'Saturday' },
  { key: 'sunday', label: 'Sunday' },
];

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'Breakfast',
  lunch: 'Lunch',
  dinner: 'Dinner',
  snack: 'Snack',
};

export default function MealPlanScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const localInsert = useLocalDataStore((s) => s.insert);
  const localUpdate = useLocalDataStore((s) => s.update);
  const localQuery = useLocalDataStore((s) => s.query);
  const queryClient = useQueryClient();

  const [generating, setGenerating] = useState(false);
  const [generatingList, setGeneratingList] = useState(false);

  const { data: recipes } = useSupabaseQuery<Recipe>(['recipes'], 'recipes', {
    filter: { user_id: user?.id },
  });

  const { data: goals } = useSupabaseQuery<BodyGoal>(['body_goals'], 'body_goals', {
    filter: { user_id: user?.id },
    limit: 1,
  });
  const goal = goals?.[0];

  const { data: plans } = useSupabaseQuery<MealPlan>(['meal_plans'], 'meal_plans', {
    filter: { user_id: user?.id },
    orderBy: { column: 'week_start_date', ascending: false },
    limit: 1,
  });
  const activePlan = plans?.[0];

  const { data: planItems } = useSupabaseQuery<MealPlanItem>(
    ['meal_plan_items', activePlan?.id ?? ''],
    'meal_plan_items',
    {
      select: '*, recipe:recipes(*)',
      filter: { meal_plan_id: activePlan?.id },
      enabled: !!activePlan,
    }
  );

  async function generateMealPlan() {
    if (!recipes || recipes.length === 0) {
      Alert.alert('No Recipes', 'Please add some recipes first before generating a meal plan.');
      return;
    }
    if (!goal) {
      Alert.alert('No Goals', 'Please set your body goals in your profile first.');
      return;
    }

    // Navigate to the animated loading screen
    router.push('/meal-plan/generating' as any);

    setGenerating(true);
    try {
      const ai = createAIService();
      const result = await ai.generateMealPlan({
        recipes: recipes.map((r) => ({
          id: r.id,
          title: r.title,
          calories: r.calories_per_serving,
          protein: r.protein_per_serving,
          carbs: r.carbs_per_serving,
          fat: r.fat_per_serving,
          tags: r.tags || [],
        })),
        dailyCalories: goal.daily_calories,
        proteinG: goal.protein_g,
        carbsG: goal.carbs_g,
        fatG: goal.fat_g,
        dietaryRestrictions: [],
        daysToGenerate: 7,
      });

      if (activePlan) {
        if (isDemoMode) {
          localUpdate('meal_plans', activePlan.id, { status: 'completed' });
        } else {
          await supabase
            .from('meal_plans')
            .update({ status: 'completed' })
            .eq('id', activePlan.id);
        }
      }

      const today = new Date();
      const dayOfWeek = today.getDay();
      const monday = new Date(today);
      monday.setDate(today.getDate() - ((dayOfWeek + 6) % 7));
      const weekStart = monday.toISOString().split('T')[0];

      let newPlanId: string;

      if (isDemoMode) {
        newPlanId = Math.random().toString(36).slice(2) + Date.now().toString(36);
        localInsert('meal_plans', {
          id: newPlanId,
          user_id: user!.id,
          week_start_date: weekStart,
          status: 'active',
        });
      } else {
        const { data: newPlan, error: planError } = await supabase
          .from('meal_plans')
          .insert({
            user_id: user!.id,
            week_start_date: weekStart,
            status: 'active',
          })
          .select()
          .single();
        if (planError) throw planError;
        newPlanId = newPlan.id;
      }

      const items = result.days.flatMap((day) =>
        day.meals.map((meal) => ({
          meal_plan_id: newPlanId,
          recipe_id: meal.recipe_id,
          day_of_week: day.day,
          meal_type: meal.meal_type,
          servings: meal.servings,
        }))
      );

      if (isDemoMode) {
        items.forEach((item) => localInsert('meal_plan_items', item));
      } else {
        const { error: itemsError } = await supabase.from('meal_plan_items').insert(items);
        if (itemsError) throw itemsError;
      }

      queryClient.invalidateQueries({ queryKey: ['meal_plans'] });
      queryClient.invalidateQueries({ queryKey: ['meal_plan_items'] });

      Alert.alert('Success', 'Weekly meal plan generated!');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setGenerating(false);
    }
  }

  async function generateShoppingList() {
    if (!activePlan || !planItems || planItems.length === 0) return;
    setGeneratingList(true);

    try {
      const normalize = (value: string) => value.trim().toLowerCase();

      // Consolidate ingredients across all meals
      const ingredientMap: Record<
        string,
        { name: string; quantity: number; unit: string; category: string; recipeIds: string[] }
      > = {};

      for (const item of planItems) {
        const recipe = item.recipe as unknown as Recipe;
        if (!recipe?.ingredients) continue;

        const ingredients: Ingredient[] = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];

        for (const ing of ingredients) {
          const key = `${normalize(ing.name)}_${normalize(ing.unit)}`;
          if (ingredientMap[key]) {
            ingredientMap[key].quantity += ing.quantity * item.servings;
            if (!ingredientMap[key].recipeIds.includes(item.recipe_id)) {
              ingredientMap[key].recipeIds.push(item.recipe_id);
            }
          } else {
            ingredientMap[key] = {
              name: ing.name.trim(),
              quantity: ing.quantity * item.servings,
              unit: ing.unit,
              category: ing.category || 'other',
              recipeIds: [item.recipe_id],
            };
          }
        }
      }

      // Pantry is the source of truth for what the user already has.
      // Build a pantry quantity map so shopping list becomes a delta.
      let pantryRows: PantryItem[] = [];
      if (isDemoMode) {
        pantryRows = (localQuery('pantry_items', { user_id: user!.id }) as PantryItem[]) ?? [];
      } else {
        const { data, error } = await supabase
          .from('pantry_items')
          .select('id,user_id,name,quantity,unit,expiry_date,created_at,updated_at')
          .eq('user_id', user!.id);
        if (error) throw error;
        pantryRows = data ?? [];
      }

      const pantryQuantityByKey: Record<string, number> = {};
      for (const pantryItem of pantryRows) {
        const key = `${normalize(pantryItem.name)}_${normalize(pantryItem.unit)}`;
        pantryQuantityByKey[key] = (pantryQuantityByKey[key] ?? 0) + Number(pantryItem.quantity || 0);
      }

      const listItems = Object.entries(ingredientMap)
        .map(([key, val]) => {
          const needed = Number(val.quantity || 0);
          const alreadyInPantry = pantryQuantityByKey[key] ?? 0;
          const remaining = Math.ceil(Math.max(0, needed - alreadyInPantry) * 10) / 10;
          return {
            shopping_list_id: '',
            name: val.name.charAt(0).toUpperCase() + val.name.slice(1),
            quantity: remaining,
            unit: val.unit,
            category: val.category,
            is_purchased: false,
            recipe_source_ids: val.recipeIds,
          };
        })
        .filter((item) => item.quantity > 0);

      if (listItems.length === 0) {
        Alert.alert('Nothing to buy', 'Your pantry already covers this plan. No shopping list was created.');
        return;
      }

      let newListId: string;
      if (isDemoMode) {
        newListId = Math.random().toString(36).slice(2) + Date.now().toString(36);
        localInsert('shopping_lists', {
          id: newListId,
          user_id: user!.id,
          meal_plan_id: activePlan.id,
          name: `Shopping List - Week of ${activePlan.week_start_date}`,
          status: 'active',
        });
      } else {
        const { data: newList, error: listError } = await supabase
          .from('shopping_lists')
          .insert({
            user_id: user!.id,
            meal_plan_id: activePlan.id,
            name: `Shopping List - Week of ${activePlan.week_start_date}`,
            status: 'active',
          })
          .select()
          .single();
        if (listError) throw listError;
        newListId = newList.id;
      }

      const itemsWithListId = listItems.map((item) => ({
        ...item,
        shopping_list_id: newListId,
      }));

      if (isDemoMode) {
        itemsWithListId.forEach((item) => localInsert('shopping_list_items', item));
      } else {
        const { error: itemsError } = await supabase.from('shopping_list_items').insert(itemsWithListId);
        if (itemsError) throw itemsError;
      }

      queryClient.invalidateQueries({ queryKey: ['shopping_lists'] });
      queryClient.invalidateQueries({ queryKey: ['shopping_list_items'] });

      Alert.alert('Success', 'Shopping list generated!', [
        { text: 'View List', onPress: () => router.push('/(tabs)/shopping' as any) },
        { text: 'OK' },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setGeneratingList(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Icon name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: colors.text }]}>Meal Plan</Text>
        <TouchableOpacity onPress={generateMealPlan} disabled={generating}>
          {generating ? (
            <ActivityIndicator size="small" color={colors.tint} />
          ) : (
            <Icon name="arrow-path" size={22} color={colors.tint} />
          )}
        </TouchableOpacity>
      </View>

      {activePlan && planItems && planItems.length > 0 ? (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.planHeader}>
            <Text style={[styles.weekLabel, { color: colors.textSecondary }]}>
              Week of {activePlan.week_start_date}
            </Text>
            <Button
              title={generatingList ? 'Generating...' : 'Generate Shopping List'}
              onPress={generateShoppingList}
              loading={generatingList}
              size="sm"
              variant="outline"
            />
          </View>

          {DAYS.map(({ key, label }) => {
            const dayMeals = planItems
              .filter((item) => item.day_of_week === key)
              .sort((a, b) => {
                const order = ['breakfast', 'lunch', 'dinner', 'snack'];
                return order.indexOf(a.meal_type) - order.indexOf(b.meal_type);
              });

            if (dayMeals.length === 0) return null;

            return (
              <View key={key} style={styles.daySection}>
                <Text style={[styles.dayTitle, { color: colors.text }]}>{label}</Text>
                {dayMeals.map((meal) => {
                  const recipe = meal.recipe as unknown as Recipe;
                  return (
                    <TouchableOpacity
                      key={meal.id}
                      onPress={() => router.push(`/recipe/${meal.recipe_id}` as any)}
                    >
                      <Card style={styles.mealCard}>
                        <Text style={[styles.mealType, { color: colors.tint }]}>
                          {MEAL_LABELS[meal.meal_type] || meal.meal_type}
                        </Text>
                        <Text style={[styles.mealTitle, { color: colors.text }]}>
                          {mealTitle(recipe)}
                        </Text>
                        <Text style={[styles.mealMeta, { color: colors.textSecondary }]}>
                          {meal.servings} serving{meal.servings !== 1 ? 's' : ''}
                          {recipe?.calories_per_serving
                            ? ` · ${Math.round(recipe.calories_per_serving * meal.servings)} kcal`
                            : ''}
                        </Text>
                      </Card>
                    </TouchableOpacity>
                  );
                })}
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <View style={styles.emptyContainer}>
          <EmptyState
            title="No meal plan yet"
            description={
              recipes && recipes.length > 0
                ? 'Tap the button below to generate a weekly meal plan based on your recipes and nutrition goals.'
                : 'Add some recipes first, then generate a meal plan.'
            }
            actionLabel={recipes && recipes.length > 0 ? 'Generate Meal Plan' : 'Add Recipes'}
            onAction={
              recipes && recipes.length > 0
                ? generateMealPlan
                : () => router.push('/recipe/add' as any)
            }
          />
          {generating && (
            <View style={styles.generatingOverlay}>
              <ActivityIndicator size="large" color={colors.tint} />
              <Text style={[styles.generatingText, { color: colors.text }]}>
                AI is creating your meal plan...
              </Text>
            </View>
          )}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 50 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  topTitle: { fontSize: FontSize.lg, fontWeight: '600' },
  content: { padding: Spacing.lg, paddingBottom: 100 },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  weekLabel: { fontSize: FontSize.sm, fontWeight: '500' },
  daySection: { marginBottom: Spacing.lg },
  dayTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.serifBold, marginBottom: Spacing.sm },
  mealCard: { marginBottom: Spacing.sm },
  mealType: { fontSize: FontSize.xs, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  mealTitle: { fontSize: FontSize.md, fontWeight: '600', marginTop: 2 },
  mealMeta: { fontSize: FontSize.sm, marginTop: 2 },
  emptyContainer: { flex: 1, justifyContent: 'center' },
  generatingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.md,
  },
  generatingText: { fontSize: FontSize.md, fontWeight: '500' },
});
