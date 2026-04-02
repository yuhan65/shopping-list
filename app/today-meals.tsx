/**
 * Today's Meals — a focused, colorful view of today's planned meals with
 * feedback actions (Like / Dislike / Swap) and quick save for AI drafts.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useColorScheme';
import { Spacing, FontSize, FontFamily, BorderRadius } from '@/constants/Spacing';
import { Icon } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useRecipePreviewStore } from '@/stores/recipePreviewStore';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { mealTitle } from '@/lib/mealTitle';
import type { MealPlan, MealPlanItem, Recipe } from '@/types/database';

const MEAL_ORDER: ('breakfast' | 'lunch' | 'dinner' | 'snack')[] = [
  'breakfast',
  'lunch',
  'dinner',
  'snack',
];

const MEAL_LABELS: Record<string, string> = {
  breakfast: 'BREAKFAST',
  lunch: 'LUNCH',
  dinner: 'DINNER',
  snack: 'SNACK',
};

const MEAL_DOT_COLORS: Record<string, string> = {
  breakfast: '#2D6A4F',
  lunch: '#C4963A',
  dinner: '#C75146',
  snack: '#8B8455',
};

function getTodayKey(): string {
  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  return days[new Date().getDay()];
}

export default function TodayMealsScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setPreviewDraft = useRecipePreviewStore((s) => s.setDraft);

  const { data: mealPlans } = useSupabaseQuery<MealPlan>(['meal_plans'], 'meal_plans', {
    filter: { user_id: user?.id, status: 'active' },
    orderBy: { column: 'week_start_date', ascending: false },
    limit: 1,
  });
  const activePlan = mealPlans?.[0];

  const { data: planItems } = useSupabaseQuery<MealPlanItem>(
    ['meal_plan_items', activePlan?.id ?? ''],
    'meal_plan_items',
    {
      select: '*, recipe:recipes(*)',
      filter: { meal_plan_id: activePlan?.id },
      enabled: !!activePlan,
    }
  );

  const todayMeals = useMemo(() => {
    if (!planItems) return [];
    const todayKey = getTodayKey();
    return planItems
      .filter((item) => item.day_of_week === todayKey)
      .sort((a, b) => MEAL_ORDER.indexOf(a.meal_type) - MEAL_ORDER.indexOf(b.meal_type));
  }, [planItems]);

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      <TouchableOpacity
        style={styles.backButton}
        onPress={() => router.replace('/(tabs)/plan' as any)}
      >
        <Icon name="arrow-left" size={16} color={colors.text} />
        <Text style={[styles.backButtonText, { color: colors.text }]}>Back</Text>
      </TouchableOpacity>

      <Text style={[styles.title, { color: colors.text }]}>Today&apos;s Meals</Text>

      {todayMeals.length === 0 ? (
        <View style={[styles.emptyCard, { backgroundColor: colors.surfaceSecondary }]}>
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            No meals are planned for today yet. Go back to Plan to regenerate or edit this week.
          </Text>
        </View>
      ) : (
        todayMeals.map((item, index) => {
          const recipe = item.recipe as unknown as Recipe;
          const generated = item.generated_recipe;
          const isAIDraft = !item.recipe_id && !!generated;
          const totalCalories = Math.round(
            (recipe?.calories_per_serving ?? generated?.calories_per_serving ?? 0) * item.servings
          );
          const prepMinutes = recipe?.prep_time_minutes ?? generated?.prep_time_minutes;
          const protein = Math.round(
            (recipe?.protein_per_serving ?? generated?.protein_per_serving ?? 0) * item.servings
          );
          const carbs = Math.round(
            (recipe?.carbs_per_serving ?? generated?.carbs_per_serving ?? 0) * item.servings
          );
          const dotColor = MEAL_DOT_COLORS[item.meal_type] ?? colors.textSecondary;

          return (
            <View key={item.id}>
              {index > 0 && <View style={[styles.separator, { backgroundColor: colors.border }]} />}

              <View style={styles.mealSlot}>
                {/* Meal type label row */}
                <View style={styles.mealHeader}>
                  <View style={styles.mealLabelRow}>
                    <View style={[styles.mealDot, { backgroundColor: dotColor }]} />
                    <Text style={[styles.mealType, { color: dotColor }]}>
                      {MEAL_LABELS[item.meal_type]}
                    </Text>
                    {isAIDraft && (
                      <>
                        <Text style={[styles.mealTypeSep, { color: colors.textSecondary }]}> · </Text>
                        <Text style={[styles.aiDraftBadge, { color: dotColor }]}>AI DRAFT</Text>
                      </>
                    )}
                  </View>
                  {!!prepMinutes && (
                    <Text style={[styles.prepTime, { color: colors.textSecondary }]}>
                      {prepMinutes} min prep
                    </Text>
                  )}
                </View>

                {/* Recipe title — tappable to open recipe */}
                <TouchableOpacity
                  onPress={() => {
                    if (item.recipe_id) {
                      router.push(`/recipe/${item.recipe_id}` as any);
                      return;
                    }
                    if (generated) {
                      setPreviewDraft(
                        { ...generated, description: generated.description ?? '' },
                        'ai'
                      );
                      router.push('/recipe/preview' as any);
                    }
                  }}
                  disabled={!item.recipe_id && !generated}
                >
                  <Text style={[styles.mealTitle, { color: colors.text }]}>
                    {item.recipe_id
                      ? mealTitle(recipe)
                      : generated?.title || item.generated_title || 'Quick meal'}
                  </Text>
                </TouchableOpacity>

                {/* Compact inline macros */}
                <View style={styles.macroRow}>
                  <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>
                    CALS{' '}
                    <Text style={[styles.macroValue, { color: colors.text }]}>{totalCalories}</Text>
                  </Text>
                  <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>
                    PROTEIN{' '}
                    <Text style={[styles.macroValue, { color: colors.text }]}>{protein}g</Text>
                  </Text>
                  <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>
                    CARBS{' '}
                    <Text style={[styles.macroValue, { color: colors.text }]}>{carbs}g</Text>
                  </Text>
                </View>

                {/* Save recipe link for AI drafts */}
                {isAIDraft && (
                  <TouchableOpacity
                    style={styles.saveLink}
                    onPress={() => {
                      if (generated) {
                        setPreviewDraft(
                          { ...generated, description: generated.description ?? '' },
                          'ai'
                        );
                        router.push('/recipe/preview' as any);
                      }
                    }}
                  >
                    <Text style={[styles.saveLinkText, { color: colors.tint }]}>SAVE RECIPE</Text>
                  </TouchableOpacity>
                )}

                {/* Feedback pills */}
                <View style={styles.pillRow}>
                  {['Like', 'Dislike', 'Swap'].map((action) => (
                    <TouchableOpacity
                      key={action}
                      style={[styles.pill, { borderColor: colors.border }]}
                    >
                      <Text style={[styles.pillText, { color: colors.text }]}>{action}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </View>
          );
        })
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: {
    paddingHorizontal: Spacing.lg,
    paddingTop: 56,
    paddingBottom: 100,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    paddingVertical: 2,
    marginBottom: Spacing.md,
  },
  backButtonText: {
    fontSize: FontSize.sm,
    fontWeight: '600',
  },
  title: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.serifRegular,
    lineHeight: 36,
    marginBottom: Spacing.lg,
  },
  separator: {
    height: 1,
    marginVertical: Spacing.lg,
  },
  mealSlot: {
    gap: Spacing.sm,
  },
  mealHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  mealLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mealDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  mealType: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1.6,
  },
  mealTypeSep: {
    fontSize: FontSize.xs,
    fontWeight: '600',
  },
  aiDraftBadge: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
  },
  prepTime: {
    fontSize: FontSize.xs,
    fontStyle: 'italic',
  },
  mealTitle: {
    fontSize: 26,
    fontFamily: FontFamily.serifRegular,
    lineHeight: 34,
  },
  macroRow: {
    flexDirection: 'row',
    gap: Spacing.lg,
  },
  macroLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  macroValue: {
    fontWeight: '800',
  },
  saveLink: {
    alignSelf: 'flex-start',
  },
  saveLinkText: {
    fontSize: FontSize.xs,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  pillRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginTop: Spacing.xs,
  },
  pill: {
    borderWidth: 1,
    borderRadius: BorderRadius.full,
    paddingHorizontal: Spacing.md,
    paddingVertical: 6,
  },
  pillText: {
    fontSize: FontSize.sm,
    fontWeight: '500',
  },
  emptyCard: {
    padding: Spacing.lg,
    borderRadius: BorderRadius.md,
  },
  emptyText: {
    fontSize: FontSize.sm,
    lineHeight: 21,
  },
});
