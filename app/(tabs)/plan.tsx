/**
 * Plan tab — weekly meal plan overview with color-coded dots,
 * calorie totals, macro balance, and AI suggestions.
 * This is the "strategic" weekly view of your meal plan.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useColorScheme';
import { Spacing, FontSize, FontFamily, BorderRadius } from '@/constants/Spacing';
import { AccentColors } from '@/constants/Colors';
import { Card, Button, DotLegend } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useRecipePreviewStore } from '@/stores/recipePreviewStore';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { mealTitle } from '@/lib/mealTitle';
import type { MealPlan, MealPlanItem, BodyGoal, Profile, Recipe, PantryItem } from '@/types/database';

const DAYS: { key: string; short: string }[] = [
  { key: 'monday', short: 'MON' },
  { key: 'tuesday', short: 'TUE' },
  { key: 'wednesday', short: 'WED' },
  { key: 'thursday', short: 'THU' },
  { key: 'friday', short: 'FRI' },
  { key: 'saturday', short: 'SAT' },
  { key: 'sunday', short: 'SUN' },
];

const DOT_LEGEND = [
  { color: AccentColors.proteinHigh, label: 'Protein High' },
  { color: AccentColors.lowCarb, label: 'Low Carb' },
  { color: AccentColors.plantBased, label: 'Plant Based' },
  { color: AccentColors.highCal, label: 'High Cal' },
  { color: AccentColors.seafood, label: 'Seafood' },
];

/** Pick a dot color based on the recipe's tags or macro profile */
function dotColorForRecipe(recipe?: Recipe): string {
  if (!recipe) return AccentColors.cream;
  const tags = (recipe.tags || []).map((t) => t.toLowerCase());
  if (tags.some((t) => t.includes('seafood') || t.includes('fish'))) return AccentColors.seafood;
  if (tags.some((t) => t.includes('plant') || t.includes('vegan'))) return AccentColors.plantBased;
  if (tags.some((t) => t.includes('low carb') || t.includes('keto'))) return AccentColors.lowCarb;
  if (recipe.protein_per_serving && recipe.protein_per_serving > 30) return AccentColors.proteinHigh;
  if (recipe.calories_per_serving && recipe.calories_per_serving > 600) return AccentColors.highCal;
  return AccentColors.cream;
}

export default function PlanScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setPreviewDraft = useRecipePreviewStore((s) => s.setDraft);

  const { data: profiles } = useSupabaseQuery<Profile>(['profile'], 'profiles', {
    filter: { user_id: user?.id },
    limit: 1,
  });
  const profile = profiles?.[0];

  const { data: goals } = useSupabaseQuery<BodyGoal>(['body_goals'], 'body_goals', {
    filter: { user_id: user?.id },
    limit: 1,
  });
  const goal = goals?.[0];

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

  const { data: pantryItems } = useSupabaseQuery<PantryItem>(
    ['pantry_items'],
    'pantry_items',
    { filter: { user_id: user?.id } }
  );

  // Weekly stats computed from plan items
  const weeklyStats = useMemo(() => {
    if (!planItems) return null;
    let totalCals = 0;
    let totalProtein = 0;
    let totalCarbs = 0;
    let totalFat = 0;

    const dailyCals: Record<string, number> = {};
    const dailyDots: Record<string, string[]> = {};

    for (const item of planItems) {
      const recipe = item.recipe as unknown as Recipe;
      const cals = (recipe?.calories_per_serving ?? 0) * item.servings;
      totalCals += cals;
      totalProtein += (recipe?.protein_per_serving ?? 0) * item.servings;
      totalCarbs += (recipe?.carbs_per_serving ?? 0) * item.servings;
      totalFat += (recipe?.fat_per_serving ?? 0) * item.servings;

      dailyCals[item.day_of_week] = (dailyCals[item.day_of_week] || 0) + cals;
      if (!dailyDots[item.day_of_week]) dailyDots[item.day_of_week] = [];
      dailyDots[item.day_of_week].push(dotColorForRecipe(recipe));
    }

    // Determine macro balance label
    const targetCals = (goal?.daily_calories ?? 2000) * 7;
    const ratio = totalCals / targetCals;
    const balance = ratio > 1.05 ? 'Over' : ratio < 0.95 ? 'Under' : 'Optimal';

    return { totalCals: Math.round(totalCals), totalProtein, totalCarbs, totalFat, dailyCals, dailyDots, balance };
  }, [planItems, goal]);

  // Upcoming meals: next 3 meals from today onward
  const upcomingMeals = useMemo(() => {
    if (!planItems) return [];
    const todayIndex = (new Date().getDay() + 6) % 7; // 0=Mon
    const mealOrder = ['breakfast', 'lunch', 'dinner', 'snack'];

    return [...planItems]
      .sort((a, b) => {
        const dayA = DAYS.findIndex((d) => d.key === a.day_of_week);
        const dayB = DAYS.findIndex((d) => d.key === b.day_of_week);
        if (dayA !== dayB) return dayA - dayB;
        return mealOrder.indexOf(a.meal_type) - mealOrder.indexOf(b.meal_type);
      })
      .filter((item) => {
        const dayIdx = DAYS.findIndex((d) => d.key === item.day_of_week);
        return dayIdx >= todayIndex;
      })
      .slice(0, 3);
  }, [planItems]);

  // AI suggestion based on pantry expiry
  const aiSuggestion = useMemo(() => {
    if (!pantryItems || pantryItems.length === 0) return null;
    const expiring = pantryItems.find((item) => {
      if (!item.expiry_date) return false;
      const daysLeft = Math.ceil(
        (new Date(item.expiry_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)
      );
      return daysLeft >= 0 && daysLeft <= 3;
    });
    if (expiring) {
      return `You have ${expiring.name.toLowerCase()} expiring soon in your pantry. Shall we schedule a recipe using it this week?`;
    }
    return null;
  }, [pantryItems]);

  // ---- EMPTY STATE (no active plan) ----
  if (!activePlan || !planItems || planItems.length === 0) {
    return (
      <ScrollView
        style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.emptyContent}
      >
        <View style={styles.emptyDots}>
          {[colors.tabIconDefault, colors.tabIconDefault, colors.tabIconDefault].map((c, i) => (
            <View key={i} style={[styles.onboardingDot, { backgroundColor: c }]} />
          ))}
        </View>

        <Text style={[styles.emptyHeadline, { color: colors.text }]}>
          Ready to plan your nourishment
        </Text>
        <Text style={[styles.emptySubhead, { color: colors.textSecondary }]}>
          Your kitchen, optimized.
        </Text>
        <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
          Tell us your location and preferences. Our intelligence will curate a weekly plan balanced for your body and the local season.
        </Text>

        <Button
          title="Generate My First Plan"
          onPress={() => router.push('/meal-plan')}
          size="lg"
          style={styles.ctaButton}
        />

        <View style={styles.statusRow}>
          <View style={styles.statusItem}>
            <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>CURRENT STATUS</Text>
            <Text style={[styles.statusValue, { color: colors.text }]}>Ready to start</Text>
          </View>
          <View style={styles.statusItem}>
            <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>PREFERENCES</Text>
            <Text style={[styles.statusValue, { color: colors.text }]}>
              {profile?.dietary_restrictions?.length ? profile.dietary_restrictions.join(', ') : 'Standard'}
            </Text>
          </View>
        </View>
      </ScrollView>
    );
  }

  // ---- PLAN EXISTS ----
  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Header */}
      <Text style={[styles.headline, { color: colors.text }]}>
        Your week is{'\n'}in balance
      </Text>

      {/* Weekly Overview */}
      {weeklyStats && (
        <>
          <View style={styles.weekHeader}>
            <Text style={[styles.sectionLabel, { color: colors.text }]}>WEEKLY OVERVIEW</Text>
            {activePlan.week_start_date != null && activePlan.week_start_date !== '' && (
              <Text style={[styles.weekDate, { color: colors.textSecondary }]}>
                {String(activePlan.week_start_date)}
              </Text>
            )}
          </View>

          {/* Dot grid */}
          <View style={styles.dotGrid}>
            {DAYS.map(({ key, short }) => {
              const dots = weeklyStats.dailyDots[key] || [];
              const cals = weeklyStats.dailyCals[key] || 0;
              const todayIndex = (new Date().getDay() + 6) % 7;
              const dayIndex = DAYS.findIndex((d) => d.key === key);
              const isToday = dayIndex === todayIndex;

              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.dotColumn,
                    isToday && { backgroundColor: colors.tintLight, borderRadius: BorderRadius.sm },
                  ]}
                  onPress={() => router.push(`/meal-plan/${key}` as any)}
                >
                  <Text style={[styles.dayShort, { color: isToday ? colors.text : colors.textSecondary }]}>
                    {short}
                  </Text>
                  <View style={styles.dotsContainer}>
                    {dots.slice(0, 3).map((color, i) => (
                      <View key={i} style={[styles.mealDot, { backgroundColor: color }]} />
                    ))}
                    {dots.length === 0 && (
                      <View style={[styles.mealDot, { backgroundColor: colors.border }]} />
                    )}
                  </View>
                  <Text style={[styles.dayCals, { color: colors.textSecondary }]}>
                    {Math.round(cals).toLocaleString()}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Weekly totals */}
          <View style={styles.weekTotals}>
            <View>
              <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>WEEKLY TOTAL</Text>
              <Text style={[styles.totalValue, { color: colors.text }]}>
                {weeklyStats.totalCals.toLocaleString()} kcal
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={[styles.totalLabel, { color: colors.textSecondary }]}>MACROS BALANCE</Text>
              <Text style={[styles.totalValue, { color: colors.text }]}>
                {weeklyStats.balance}
              </Text>
            </View>
          </View>

          {/* Regenerate button */}
          <TouchableOpacity
            style={[styles.regenButton, { borderColor: colors.border }]}
            onPress={() => router.push('/meal-plan')}
          >
            <Text style={[styles.regenText, { color: colors.text }]}>REGENERATE WEEKLY PLAN</Text>
          </TouchableOpacity>

          {/* Dot legend */}
          <DotLegend items={DOT_LEGEND} />
        </>
      )}

      {/* Current Week — upcoming meals */}
      <Text style={[styles.sectionLabel, { color: colors.text, marginTop: Spacing.xl }]}>
        CURRENT WEEK
      </Text>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />

      {upcomingMeals.map((item) => {
        const recipe = item.recipe as unknown as Recipe;
        const generated = item.generated_recipe;
        const cals = Math.round(((recipe?.calories_per_serving ?? generated?.calories_per_serving ?? 0) * item.servings));
        const dayLabel = DAYS.find((d) => d.key === item.day_of_week)?.short ?? '';
        const title = recipe?.title || generated?.title || item.generated_title || 'Generated meal';
        return (
          <TouchableOpacity
            key={item.id}
            style={[styles.mealRow, { borderBottomColor: colors.border }]}
            onPress={() => {
              if (item.recipe_id) {
                router.push(`/recipe/${item.recipe_id}` as any);
                return;
              }
              if (generated) {
                setPreviewDraft(
                  {
                    ...generated,
                    description: generated.description ?? '',
                  },
                  'ai'
                );
                router.push('/recipe/preview' as any);
              }
            }}
            disabled={!item.recipe_id && !generated}
          >
            <View style={[styles.mealRowDot, { backgroundColor: dotColorForRecipe(recipe) }]} />
            <View style={styles.mealRowInfo}>
              <Text style={[styles.mealRowTitle, { color: colors.text }]}>
                {item.recipe_id ? mealTitle(recipe) : title}
              </Text>
            </View>
            <View style={styles.mealRowMeta}>
              <Text style={[styles.mealRowDay, { color: colors.textSecondary }]}>{dayLabel}</Text>
              <Text style={[styles.mealRowCals, { color: colors.textSecondary }]}>{cals} kcal</Text>
            </View>
          </TouchableOpacity>
        );
      })}

      {/* AI Suggestion */}
      {aiSuggestion && (
        <Card style={styles.aiCard}>
          <Text style={[styles.aiLabel, { color: colors.textSecondary }]}>AI SUGGESTION</Text>
          <Text style={[styles.aiQuote, { color: colors.text }]}>
            "{aiSuggestion}"
          </Text>
          <View style={styles.aiActions}>
            <TouchableOpacity>
              <Text style={[styles.aiLink, { color: colors.success }]}>APPROVE</Text>
            </TouchableOpacity>
            <TouchableOpacity>
              <Text style={[styles.aiLinkSecondary, { color: colors.text }]}>REGENERATE</Text>
            </TouchableOpacity>
          </View>
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, paddingTop: Spacing.xxl + 20, paddingBottom: 100 },

  // ---- Headline ----
  headline: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.serifRegular,
    lineHeight: 36,
    marginBottom: Spacing.xl,
  },

  // ---- Weekly overview ----
  weekHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.md,
  },
  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
  weekDate: { fontSize: FontSize.xs },
  dotGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.lg,
  },
  dotColumn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    gap: 6,
  },
  dayShort: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
  dotsContainer: { flexDirection: 'column', gap: 4, minHeight: 36, justifyContent: 'center' },
  mealDot: { width: 10, height: 10, borderRadius: 5 },
  dayCals: { fontSize: 10 },

  // ---- Totals ----
  weekTotals: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: Spacing.md,
  },
  totalLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1 },
  totalValue: { fontSize: FontSize.xl, fontFamily: FontFamily.serifBold, marginTop: 2 },

  // ---- Regenerate button ----
  regenButton: {
    borderWidth: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  regenText: { fontSize: FontSize.xs, fontWeight: '600', letterSpacing: 1 },

  // ---- Divider ----
  divider: { height: 1, marginBottom: Spacing.md },

  // ---- Meal rows ----
  mealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  mealRowDot: { width: 12, height: 12, borderRadius: 6 },
  mealRowInfo: { flex: 1 },
  mealRowTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.serifRegular },
  mealRowMeta: { alignItems: 'flex-end' },
  mealRowDay: { fontSize: FontSize.xs, fontWeight: '500' },
  mealRowCals: { fontSize: FontSize.sm },

  // ---- AI Suggestion ----
  aiCard: { marginTop: Spacing.xl },
  aiLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1.5, marginBottom: Spacing.sm },
  aiQuote: { fontSize: FontSize.sm, fontFamily: FontFamily.serifItalic, lineHeight: 20, marginBottom: Spacing.md },
  aiActions: { flexDirection: 'row', gap: Spacing.lg },
  aiLink: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1 },
  aiLinkSecondary: { fontSize: FontSize.xs, fontWeight: '600', letterSpacing: 1 },

  // ---- Empty state ----
  emptyContent: {
    flex: 1,
    padding: Spacing.lg,
    paddingTop: Spacing.xxl + 40,
    justifyContent: 'center',
  },
  emptyDots: {
    flexDirection: 'row',
    gap: Spacing.sm,
    marginBottom: Spacing.xl,
  },
  onboardingDot: { width: 8, height: 8, borderRadius: 4 },
  emptyHeadline: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.serifRegular,
    lineHeight: 36,
    marginBottom: Spacing.md,
  },
  emptySubhead: {
    fontSize: FontSize.lg,
    fontWeight: '600',
    marginBottom: Spacing.sm,
  },
  emptyDesc: {
    fontSize: FontSize.sm,
    lineHeight: 20,
    marginBottom: Spacing.xl,
  },
  ctaButton: { marginBottom: Spacing.xxl },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  statusItem: { gap: 4 },
  statusLabel: { fontSize: FontSize.xs, fontWeight: '600', letterSpacing: 1 },
  statusValue: { fontSize: FontSize.sm },
});
