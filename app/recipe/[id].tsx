/**
 * Recipe detail screen — shows full recipe info with photo hero,
 * macro breakdown boxes, ingredients, instructions, and meal-plan actions.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  Image,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/hooks/useColorScheme';
import { MacroColors } from '@/constants/Colors';
import { Spacing, FontSize, FontFamily, BorderRadius } from '@/constants/Spacing';
import { Card, LoadingScreen, TagChip } from '@/components/ui';
import { useSupabaseQuery, useSupabaseDelete } from '@/hooks/useSupabaseQuery';
import { mealTitle } from '@/lib/mealTitle';
import type { Recipe } from '@/types/database';

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const colors = useThemeColors();
  const router = useRouter();

  const { data: recipes, isLoading } = useSupabaseQuery<Recipe>(
    ['recipe', id],
    'recipes',
    { filter: { id } }
  );
  const recipe = recipes?.[0];

  const deleteRecipe = useSupabaseDelete('recipes', [['recipes']]);

  function handleDelete() {
    Alert.alert('Delete Recipe', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          deleteRecipe.mutate(id!, { onSuccess: () => router.back() });
        },
      },
    ]);
  }

  if (isLoading || !recipe) return <LoadingScreen />;

  const difficultyLabel = recipe.difficulty
    ? recipe.difficulty.charAt(0).toUpperCase() + recipe.difficulty.slice(1)
    : null;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Hero photo or plain header */}
      {recipe.image_url ? (
        <View style={styles.heroContainer}>
          <Image source={{ uri: recipe.image_url }} style={styles.heroImage} />
          <TouchableOpacity
            style={[styles.heroBackBtn, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
            onPress={() => router.back()}
          >
            <Ionicons name="arrow-back" size={20} color="#FFF" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.heroDeleteBtn, { backgroundColor: 'rgba(0,0,0,0.4)' }]}
            onPress={handleDelete}
          >
            <Ionicons name="trash-outline" size={18} color="#FFF" />
          </TouchableOpacity>
        </View>
      ) : (
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={styles.backRow}>
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity onPress={handleDelete}>
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
          </TouchableOpacity>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content}>
        {/* Title + description */}
        <Text style={[styles.title, { color: colors.text }]}>{mealTitle(recipe)}</Text>
        {recipe.description && (
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            {recipe.description}
          </Text>
        )}

        {/* Tag chips */}
        {recipe.tags && recipe.tags.length > 0 && (
          <View style={styles.tags}>
            {recipe.tags.map((tag) => (
              <TagChip key={tag} label={tag} selected={false} />
            ))}
          </View>
        )}

        {/* Stat row: Calories, Prep Time, Difficulty */}
        <View style={styles.statRow}>
          {recipe.calories_per_serving != null && (
            <View style={styles.statBox}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>CALORIES</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>
                {recipe.calories_per_serving} kcal
              </Text>
            </View>
          )}
          {recipe.prep_time_minutes != null && (
            <View style={styles.statBox}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>PREP TIME</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>
                {recipe.prep_time_minutes} mins
              </Text>
            </View>
          )}
          {difficultyLabel && (
            <View style={styles.statBox}>
              <Text style={[styles.statLabel, { color: colors.textSecondary }]}>DIFFICULTY</Text>
              <Text style={[styles.statValue, { color: colors.text }]}>{difficultyLabel}</Text>
            </View>
          )}
        </View>

        {/* Macros Breakdown */}
        {(recipe.protein_per_serving != null ||
          recipe.carbs_per_serving != null ||
          recipe.fat_per_serving != null) && (
          <>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>MACROS BREAKDOWN</Text>
            <View style={styles.macroRow}>
              {recipe.protein_per_serving != null && (
                <View style={[styles.macroBox, { borderColor: colors.border }]}>
                  <Text style={[styles.macroLabel, { color: MacroColors.protein }]}>PROTEIN</Text>
                  <Text style={[styles.macroValue, { color: colors.text }]}>
                    {recipe.protein_per_serving}g
                  </Text>
                </View>
              )}
              {recipe.carbs_per_serving != null && (
                <View style={[styles.macroBox, { borderColor: colors.border }]}>
                  <Text style={[styles.macroLabel, { color: MacroColors.carbs }]}>CARBS</Text>
                  <Text style={[styles.macroValue, { color: colors.text }]}>
                    {recipe.carbs_per_serving}g
                  </Text>
                </View>
              )}
              {recipe.fat_per_serving != null && (
                <View style={[styles.macroBox, { borderColor: colors.border }]}>
                  <Text style={[styles.macroLabel, { color: MacroColors.fats }]}>FATS</Text>
                  <Text style={[styles.macroValue, { color: colors.text }]}>
                    {recipe.fat_per_serving}g
                  </Text>
                </View>
              )}
            </View>
          </>
        )}

        {/* Ingredients */}
        <Text style={[styles.sectionTitle, { color: colors.text }]}>INGREDIENTS</Text>
        {recipe.ingredients.map((ing, i) => (
          <View
            key={i}
            style={[
              styles.ingredientRow,
              i < recipe.ingredients.length - 1 && { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
            ]}
          >
            <Text style={[styles.ingredientName, { color: colors.text }]}>{ing.name}</Text>
            <Text style={[styles.ingredientQty, { color: colors.textSecondary }]}>
              {ing.quantity} {ing.unit}
            </Text>
          </View>
        ))}

        {/* Instructions */}
        <Text style={[styles.sectionTitle, { color: colors.text, marginTop: Spacing.lg }]}>
          INSTRUCTIONS
        </Text>
        <Card>
          {recipe.instructions.map((step, i) => (
            <View
              key={i}
              style={[
                styles.stepRow,
                i < recipe.instructions.length - 1 && {
                  borderBottomWidth: StyleSheet.hairlineWidth,
                  borderBottomColor: colors.border,
                },
              ]}
            >
              <View style={[styles.stepNumber, { backgroundColor: colors.tintLight }]}>
                <Text style={[styles.stepNumberText, { color: colors.tint }]}>{i + 1}</Text>
              </View>
              <Text style={[styles.stepText, { color: colors.text }]}>{step}</Text>
            </View>
          ))}
        </Card>

        {/* Action buttons */}
        <View style={styles.actionRow}>
          <TouchableOpacity style={[styles.actionBtn, { borderColor: colors.border }]}>
            <Text style={[styles.actionBtnText, { color: colors.text }]}>RESCHEDULE</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.actionBtnPrimary, { backgroundColor: colors.text }]}>
            <Text style={[styles.actionBtnText, { color: colors.background }]}>SWAP MEAL</Text>
          </TouchableOpacity>
        </View>

        {recipe.source_url != null && recipe.source_url !== '' && (
          <Text style={[styles.sourceUrl, { color: colors.textSecondary }]}>
            Source:{' '}
            {typeof recipe.source_url === 'string' ? recipe.source_url : String(recipe.source_url)}
          </Text>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },

  // Hero image
  heroContainer: { position: 'relative', height: 260 },
  heroImage: { width: '100%', height: '100%', resizeMode: 'cover' },
  heroBackBtn: {
    position: 'absolute',
    top: 50,
    left: Spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroDeleteBtn: {
    position: 'absolute',
    top: 50,
    right: Spacing.md,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Plain header
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingTop: 56,
    paddingBottom: Spacing.sm,
  },
  backRow: { flexDirection: 'row', alignItems: 'center' },

  content: { padding: Spacing.lg, paddingBottom: 100 },

  title: { fontSize: FontSize.xxl, fontFamily: FontFamily.serifBold, marginBottom: Spacing.xs },
  description: {
    fontSize: FontSize.md,
    fontFamily: FontFamily.serifItalic,
    lineHeight: 22,
    marginBottom: Spacing.md,
  },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm, marginBottom: Spacing.md },

  // Stat row
  statRow: { flexDirection: 'row', gap: Spacing.lg, marginBottom: Spacing.lg },
  statBox: {},
  statLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.5, marginBottom: 2 },
  statValue: { fontSize: FontSize.md, fontWeight: '700' },

  // Macros
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
    padding: Spacing.md,
    borderRadius: BorderRadius.sm,
  },
  macroLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.5, marginBottom: 4 },
  macroValue: { fontSize: FontSize.xl, fontWeight: '700' },

  // Ingredients
  ingredientRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm + 2,
  },
  ingredientName: { fontSize: FontSize.md, flex: 1 },
  ingredientQty: { fontSize: FontSize.md },

  // Instructions
  stepRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    paddingVertical: Spacing.sm,
    alignItems: 'flex-start',
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

  // Action buttons
  actionRow: {
    flexDirection: 'row',
    gap: Spacing.md,
    marginTop: Spacing.xl,
  },
  actionBtn: {
    flex: 1,
    borderWidth: 1.5,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
  },
  actionBtnPrimary: {
    flex: 1,
    paddingVertical: Spacing.md,
    alignItems: 'center',
    borderRadius: BorderRadius.sm,
  },
  actionBtnText: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1 },

  sourceUrl: {
    fontSize: FontSize.xs,
    marginTop: Spacing.lg,
    textAlign: 'center',
  },
});
