/**
 * Full preview screen for AI/image-generated recipes before saving.
 * Lets users review the complete recipe, then reject or save.
 */
import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useRecipePreviewStore } from '@/stores/recipePreviewStore';
import { useAuthStore } from '@/stores/authStore';
import { useLocalDataStore } from '@/stores/localDataStore';
import { supabase } from '@/lib/supabase';
import { MacroColors } from '@/constants/Colors';
import { BorderRadius, FontFamily, FontSize, Spacing } from '@/constants/Spacing';
import { Button, Card, Icon, TagChip } from '@/components/ui';

export default function RecipePreviewScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const localInsert = useLocalDataStore((s) => s.insert);
  const draft = useRecipePreviewStore((s) => s.draft);
  const sourceType = useRecipePreviewStore((s) => s.sourceType);
  const clearDraft = useRecipePreviewStore((s) => s.clearDraft);
  const [saving, setSaving] = useState(false);

  const validSourceType = useMemo(() => sourceType ?? 'ai', [sourceType]);

  if (!draft) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: colors.background }]}>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          No preview available.
        </Text>
        <Button title="Back" onPress={() => router.back()} />
      </View>
    );
  }

  async function handleSaveRecipe() {
    if (!user) return;
    setSaving(true);

    const row = {
      user_id: user.id,
      title: draft.title,
      description: draft.description,
      source_url: null,
      source_type: validSourceType,
      ingredients: draft.ingredients,
      instructions: draft.instructions,
      servings: draft.servings,
      prep_time_minutes: draft.prep_time_minutes,
      cook_time_minutes: draft.cook_time_minutes,
      calories_per_serving: draft.calories_per_serving,
      protein_per_serving: draft.protein_per_serving,
      carbs_per_serving: draft.carbs_per_serving,
      fat_per_serving: draft.fat_per_serving,
      tags: draft.tags,
    };

    try {
      if (isDemoMode) {
        localInsert('recipes', row);
      } else {
        const { error } = await supabase.from('recipes').insert(row);
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ['recipes'] });
      clearDraft();
      Alert.alert('Saved', `"${draft.title}" has been added to your recipes.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not save recipe.');
    } finally {
      setSaving(false);
    }
  }

  function handleReject() {
    clearDraft();
    router.back();
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Icon name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: colors.text }]}>Preview Recipe</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: colors.text }]}>{draft.title}</Text>
        {!!draft.description && (
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {draft.description}
          </Text>
        )}

        {draft.tags.length > 0 && (
          <View style={styles.tags}>
            {draft.tags.map((tag) => (
              <TagChip key={tag} label={tag} selected={false} />
            ))}
          </View>
        )}

        <View style={styles.statRow}>
          {draft.calories_per_serving != null && (
            <View style={styles.statBox}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>CALORIES</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>
                {draft.calories_per_serving} kcal
              </Text>
            </View>
          )}
          {draft.prep_time_minutes != null && (
            <View style={styles.statBox}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>PREP TIME</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>
                {draft.prep_time_minutes} mins
              </Text>
            </View>
          )}
        </View>

        {(draft.protein_per_serving != null ||
          draft.carbs_per_serving != null ||
          draft.fat_per_serving != null) && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>MACROS BREAKDOWN</Text>
            <View style={styles.macroRow}>
              {draft.protein_per_serving != null && (
                <Card style={[styles.macroBox, { borderColor: colors.border }]}>
                  <Text style={[styles.macroLabel, { color: MacroColors.protein }]}>PROTEIN</Text>
                  <Text style={[styles.macroValue, { color: colors.text }]}>
                    {draft.protein_per_serving}g
                  </Text>
                </Card>
              )}
              {draft.carbs_per_serving != null && (
                <Card style={[styles.macroBox, { borderColor: colors.border }]}>
                  <Text style={[styles.macroLabel, { color: MacroColors.carbs }]}>CARBS</Text>
                  <Text style={[styles.macroValue, { color: colors.text }]}>
                    {draft.carbs_per_serving}g
                  </Text>
                </Card>
              )}
              {draft.fat_per_serving != null && (
                <Card style={[styles.macroBox, { borderColor: colors.border }]}>
                  <Text style={[styles.macroLabel, { color: MacroColors.fats }]}>FATS</Text>
                  <Text style={[styles.macroValue, { color: colors.text }]}>
                    {draft.fat_per_serving}g
                  </Text>
                </Card>
              )}
            </View>
          </>
        )}

        <Text style={[styles.sectionTitle, { color: colors.text }]}>INGREDIENTS</Text>
        {draft.ingredients.map((ingredient, index) => (
          <View
            key={`${ingredient.name}-${index}`}
            style={[
              styles.ingredientRow,
              index < draft.ingredients.length - 1 && {
                borderBottomWidth: StyleSheet.hairlineWidth,
                borderBottomColor: colors.border,
              },
            ]}
          >
            <Text style={[styles.ingredientName, { color: colors.text }]}>{ingredient.name}</Text>
            <Text style={[styles.ingredientQty, { color: colors.textSecondary }]}>
              {ingredient.quantity} {ingredient.unit}
            </Text>
          </View>
        ))}

        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: Spacing.lg }]}>
          INSTRUCTIONS
        </Text>
        <Card>
          {draft.instructions.map((step, index) => (
            <View
              key={`${step}-${index}`}
              style={[
                styles.stepRow,
                index < draft.instructions.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <View style={[styles.stepNumber, { backgroundColor: colors.tintLight }]}>
                <Text style={[styles.stepNumberText, { color: colors.tint }]}>{index + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: colors.text }]}>{step}</Text>
            </View>
          ))}
        </Card>
      </ScrollView>

      <View style={[styles.actionBar, { borderTopColor: colors.border, backgroundColor: colors.background }]}>
        <Button title="Reject" onPress={handleReject} variant="outline" />
        <Button title="Save New Recipe" onPress={handleSaveRecipe} loading={saving} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: 56,
    paddingBottom: Spacing.sm,
  },
  topTitle: { fontSize: FontSize.lg, fontWeight: '600' },
  content: { padding: Spacing.lg, paddingBottom: 140 },
  title: { fontSize: FontSize.xxl, fontFamily: FontFamily.serifBold, marginBottom: Spacing.xs },
  description: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.serifItalic,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },
  statRow: { flexDirection: 'row', gap: Spacing.lg, marginBottom: Spacing.lg },
  statBox: {},
  statLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 },
  statValue: { fontSize: FontSize.md, fontWeight: '700' },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
  },
  macroRow: { flexDirection: 'row', gap: Spacing.md, marginBottom: Spacing.lg },
  macroBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    padding: Spacing.md,
  },
  macroLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  macroValue: { fontSize: FontSize.xl, fontWeight: '700' },
  ingredientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm + 2,
  },
  ingredientName: { fontSize: FontSize.md, flex: 1 },
  ingredientQty: { fontSize: FontSize.md },
  stepRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    alignItems: 'flex-start',
    paddingVertical: Spacing.sm,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNumberText: { fontSize: FontSize.sm, fontWeight: '700' },
  stepText: { flex: 1, fontSize: FontSize.md, lineHeight: 22 },
  actionBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.lg,
    paddingTop: Spacing.md,
    paddingBottom: Spacing.xl,
    gap: Spacing.sm,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.lg,
    gap: Spacing.md,
  },
  emptyText: { fontSize: FontSize.md, textAlign: 'center' },
});
