/**
 * Day detail screen — shows a single day's meals from the active plan.
 * Displays per-meal macro breakdown, daily total, calorie alerts,
 * and AI-suggested meal swaps when the day is over target.
 */
import React, { useMemo } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useColorScheme';
import { Spacing, FontSize, FontFamily, BorderRadius } from '@/constants/Spacing';
import { MacroColors, AccentColors } from '@/constants/Colors';
import { Card, AlertBanner, SwapCard } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { mealTitle } from '@/lib/mealTitle';
import type { MealPlan, MealPlanItem, BodyGoal, Recipe } from '@/types/database';

const DAY_NAMES: Record<string, string> = {
  monday: 'Monday',
  tuesday: 'Tuesday',
  wednesday: 'Wednesday',
  thursday: 'Thursday',
  friday: 'Friday',
  saturday: 'Saturday',
  sunday: 'Sunday',
};

const MEAL_ORDER = ['breakfast', 'lunch', 'dinner', 'snack'];
const MEAL_COLORS: Record<string, string> = {
  breakfast: AccentColors.proteinHigh,
  lunch: AccentColors.seafood,
  dinner: AccentColors.highCal,
  snack: AccentColors.plantBased,
};

export default function DayDetailScreen() {
  const { day } = useLocalSearchParams<{ day: string }>();
  const colors = useThemeColors();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);

  const { data: goals } = useSupabaseQuery<BodyGoal>(['body_goals'], 'body_goals', {
    filter: { user_id: user?.id },
    limit: 1,
  });
  const goal = goals?.[0];

  const { data: plans } = useSupabaseQuery<MealPlan>(['meal_plans'], 'meal_plans', {
    filter: { user_id: user?.id, status: 'active' },
    orderBy: { column: 'week_start_date', ascending: false },
    limit: 1,
  });
  const activePlan = plans?.[0];

  const { data: allItems } = useSupabaseQuery<MealPlanItem>(
    ['meal_plan_items', activePlan?.id ?? ''],
    'meal_plan_items',
    {
      select: '*, recipe:recipes(*)',
      filter: { meal_plan_id: activePlan?.id },
      enabled: !!activePlan,
    }
  );

  const dayMeals = useMemo(() => {
    if (!allItems || !day) return [];
    return allItems
      .filter((item) => item.day_of_week === day)
      .sort((a, b) => MEAL_ORDER.indexOf(a.meal_type) - MEAL_ORDER.indexOf(b.meal_type));
  }, [allItems, day]);

  // Daily totals
  const totals = useMemo(() => {
    let cals = 0, protein = 0, carbs = 0, fat = 0;
    for (const item of dayMeals) {
      const r = item.recipe as unknown as Recipe;
      cals += (r?.calories_per_serving ?? 0) * item.servings;
      protein += (r?.protein_per_serving ?? 0) * item.servings;
      carbs += (r?.carbs_per_serving ?? 0) * item.servings;
      fat += (r?.fat_per_serving ?? 0) * item.servings;
    }
    return { cals: Math.round(cals), protein: Math.round(protein), carbs: Math.round(carbs), fat: Math.round(fat) };
  }, [dayMeals]);

  const targetCals = goal?.daily_calories ?? 2000;
  const overBy = totals.cals > targetCals ? Math.round(((totals.cals - targetCals) / targetCals) * 100) : 0;
  const isOnTrack = overBy === 0 && totals.cals > 0;
  const dayName = DAY_NAMES[day ?? ''] ?? day;

  // Compute date string for the day within the active plan week
  const dateString = useMemo(() => {
    if (!activePlan?.week_start_date || !day) return '';
    const start = new Date(activePlan.week_start_date);
    const dayIndex = Object.keys(DAY_NAMES).indexOf(day);
    if (dayIndex < 0) return '';
    const date = new Date(start);
    date.setDate(start.getDate() + dayIndex);
    return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }, [activePlan, day]);

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
          <Text style={[styles.backText, { color: colors.textSecondary }]}>{'<'} BACK TO WEEK</Text>
        </TouchableOpacity>
        <View style={styles.dayHeader}>
          <View>
            <Text style={[styles.dayName, { color: colors.text }]}>{dayName}</Text>
            {dateString !== '' && (
              <Text style={[styles.dateText, { color: colors.textSecondary }]}>{dateString}</Text>
            )}
          </View>
          <Text style={[styles.dayCals, { color: colors.textSecondary }]}>
            {totals.cals.toLocaleString()} kcal
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Calorie alert */}
        {overBy > 0 && (
          <AlertBanner
            message={`High calorie day detected (${overBy}% above baseline)`}
            variant="danger"
          />
        )}

        {/* Macro breakdown */}
        <Text style={[styles.sectionLabel, { color: colors.text }]}>MACRO BREAKDOWN</Text>
        <View style={styles.macroRow}>
          <View style={styles.macroBox}>
            <Text style={[styles.macroValue, { color: MacroColors.protein }]}>{totals.protein}g</Text>
            <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>PROTEIN</Text>
          </View>
          <View style={styles.macroBox}>
            <Text style={[styles.macroValue, { color: MacroColors.carbs }]}>{totals.carbs}g</Text>
            <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>CARBS</Text>
          </View>
          <View style={styles.macroBox}>
            <Text style={[styles.macroValue, { color: MacroColors.fats }]}>{totals.fat}g</Text>
            <Text style={[styles.macroLabel, { color: colors.textSecondary }]}>FAT</Text>
          </View>
        </View>

        {/* Meal cards */}
        {dayMeals.map((item) => {
          const recipe = item.recipe as unknown as Recipe;
          const cals = Math.round((recipe?.calories_per_serving ?? 0) * item.servings);
          const protein = Math.round((recipe?.protein_per_serving ?? 0) * item.servings);
          const carbsVal = Math.round((recipe?.carbs_per_serving ?? 0) * item.servings);
          const mealColor = MEAL_COLORS[item.meal_type] || colors.text;

          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => router.push(`/recipe/${item.recipe_id}` as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.mealCard, { borderBottomColor: colors.border }]}>
                <View style={styles.mealTypeRow}>
                  <View style={[styles.mealTypeDot, { backgroundColor: mealColor }]} />
                  <Text style={[styles.mealTypeText, { color: mealColor }]}>
                    {item.meal_type.toUpperCase()}
                  </Text>
                  {recipe?.prep_time_minutes && (
                    <Text style={[styles.prepTime, { color: colors.textSecondary }]}>
                      {recipe.prep_time_minutes} min prep
                    </Text>
                  )}
                </View>
                <Text style={[styles.mealTitle, { color: colors.text }]}>
                  {mealTitle(recipe)}
                </Text>
                <View style={styles.mealMacros}>
                  <Text style={[styles.mealMacroText, { color: colors.textSecondary }]}>
                    CALS <Text style={{ fontWeight: '700', color: colors.text }}>{cals}</Text>
                  </Text>
                  <Text style={[styles.mealMacroText, { color: colors.textSecondary }]}>
                    PROTEIN <Text style={{ fontWeight: '700', color: colors.text }}>{protein}g</Text>
                  </Text>
                  <Text style={[styles.mealMacroText, { color: colors.textSecondary }]}>
                    CARBS <Text style={{ fontWeight: '700', color: colors.text }}>{carbsVal}g</Text>
                  </Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}

        {/* Daily total + status */}
        <View style={styles.dailyFooter}>
          <View>
            <Text style={[styles.footerLabel, { color: colors.textSecondary }]}>DAILY TOTAL</Text>
            <Text style={[styles.footerValue, { color: colors.text }]}>
              {totals.cals.toLocaleString()} kcal
            </Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={[styles.footerLabel, { color: colors.textSecondary }]}>STATUS</Text>
            <Text
              style={[
                styles.footerValue,
                { color: isOnTrack ? colors.success : overBy > 0 ? colors.danger : colors.text },
              ]}
            >
              {isOnTrack ? 'On Track' : overBy > 0 ? 'Over' : '--'}
            </Text>
          </View>
        </View>

        {/* AI Optimization Swaps */}
        {overBy > 0 && (
          <>
            <Text style={[styles.sectionLabel, { color: colors.text, marginTop: Spacing.lg }]}>
              AI OPTIMIZATION SWAPS
            </Text>
            <View style={styles.swapsList}>
              <SwapCard
                title="Wild Sea Bass & Asparagus"
                subtitle={`Reduces total day by ${Math.round(overBy * targetCals / 100)} kcal`}
                recommended
              />
              <SwapCard
                title="Quinoa Stuffed Peppers"
                subtitle="Reduces total day by 180 kcal"
              />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 50 },
  header: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.md },
  backRow: { marginBottom: Spacing.sm },
  backText: { fontSize: FontSize.xs, fontWeight: '600', letterSpacing: 1 },
  dayHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  dayName: { fontSize: FontSize.xxxl, fontFamily: FontFamily.serifBold },
  dateText: { fontSize: FontSize.sm, marginTop: 2 },
  dayCals: { fontSize: FontSize.sm, marginTop: 6 },
  content: { padding: Spacing.lg, paddingTop: 0, paddingBottom: 100, gap: Spacing.md },

  sectionLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1.5, marginTop: Spacing.md },

  // Macro breakdown
  macroRow: {
    flexDirection: 'row',
    gap: Spacing.md,
  },
  macroBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.md,
  },
  macroValue: { fontSize: FontSize.xl, fontWeight: '700' },
  macroLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 1, marginTop: 2 },

  // Meal card
  mealCard: {
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 4,
  },
  mealTypeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mealTypeDot: { width: 8, height: 8, borderRadius: 4 },
  mealTypeText: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.5, flex: 1 },
  prepTime: { fontSize: FontSize.xs },
  mealTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.serifRegular, marginTop: 2 },
  mealMacros: { flexDirection: 'row', gap: Spacing.lg, marginTop: 4 },
  mealMacroText: { fontSize: FontSize.xs, letterSpacing: 0.3 },

  // Footer
  dailyFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.lg,
  },
  footerLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1 },
  footerValue: { fontSize: FontSize.lg, fontFamily: FontFamily.serifBold, marginTop: 2 },

  // Swaps
  swapsList: { gap: Spacing.md, marginTop: Spacing.sm },
});
