/**
 * Recipes tab — your recipe collection. The primary place to tell AI what
 * you want to eat, import recipes via screenshots (TikTok, YouTube, etc.),
 * or create them manually. Now a visible tab (promoted from hidden).
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  TextInput,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useColorScheme';
import { Spacing, FontSize, FontFamily, BorderRadius } from '@/constants/Spacing';
import { Card, EmptyState, Icon } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import type { Recipe } from '@/types/database';

const FILTER_CHIPS = ['All', 'Favorites', 'Quick', 'High Protein', 'Low Carb', 'Plant Based'];

export default function RecipesScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');

  const { data: recipes } = useSupabaseQuery<Recipe>(
    ['recipes'],
    'recipes',
    {
      filter: { user_id: user?.id },
      orderBy: { column: 'created_at', ascending: false },
    }
  );

  const filtered = recipes?.filter((r) => {
    const matchesSearch =
      search.length === 0 ||
      r.title.toLowerCase().includes(search.toLowerCase()) ||
      r.tags?.some((t) => t.toLowerCase().includes(search.toLowerCase()));

    if (!matchesSearch) return false;
    if (activeFilter === 'All') return true;
    if (activeFilter === 'Quick') return (r.prep_time_minutes ?? 60) <= 20;
    if (activeFilter === 'High Protein') return (r.protein_per_serving ?? 0) > 25;
    if (activeFilter === 'Low Carb') return (r.carbs_per_serving ?? 100) < 20;
    if (activeFilter === 'Plant Based') {
      return r.tags?.some((t) => t.toLowerCase().includes('plant') || t.toLowerCase().includes('vegan'));
    }
    return true;
  });

  function renderRecipe({ item }: { item: Recipe }) {
    return (
      <TouchableOpacity
        onPress={() => router.push(`/recipe/${item.id}` as any)}
        activeOpacity={0.7}
      >
        <Card style={styles.recipeCard}>
          <View style={styles.recipeHeader}>
            <View style={styles.recipeInfo}>
              <Text style={[styles.recipeTitle, { color: colors.text }]} numberOfLines={1}>
                {item.title}
              </Text>
              <Text style={[styles.recipeMeta, { color: colors.textSecondary }]}>
                {item.servings} serving{item.servings !== 1 ? 's' : ''}
                {item.calories_per_serving ? ` · ${item.calories_per_serving} kcal` : ''}
                {item.prep_time_minutes ? ` · ${item.prep_time_minutes} min` : ''}
              </Text>
            </View>
          </View>
          {item.tags && item.tags.length > 0 && (
            <View style={styles.tagRow}>
              {item.tags.slice(0, 3).map((tag) => (
                <View key={tag} style={[styles.tag, { backgroundColor: colors.surfaceSecondary }]}>
                  <Text style={[styles.tagText, { color: colors.textSecondary }]}>{tag}</Text>
                </View>
              ))}
            </View>
          )}
        </Card>
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.text }]}>Recipes</Text>
        <TouchableOpacity
          style={[styles.addButton, { backgroundColor: colors.tint }]}
          onPress={() => router.push('/recipe/add' as any)}
        >
          <Icon name="plus" size={24} color={colors.background} />
        </TouchableOpacity>
      </View>

      {/* Search bar */}
      <View style={[styles.searchContainer, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
        <Icon name="magnifying-glass" size={18} color={colors.tabIconDefault} />
        <TextInput
          style={[styles.searchInput, { color: colors.text }]}
          placeholder="Search recipes..."
          placeholderTextColor={colors.tabIconDefault}
          value={search}
          onChangeText={setSearch}
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Icon name="x-circle" size={18} color={colors.tabIconDefault} />
          </TouchableOpacity>
        )}
      </View>

      {/* Filter chips — horizontal ScrollView avoids nested-FlatList height bugs that clip labels */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipList}
      >
        {FILTER_CHIPS.map((chip) => (
          <TouchableOpacity
            key={chip}
            style={[
              styles.chip,
              {
                backgroundColor: activeFilter === chip ? colors.text : colors.surfaceSecondary,
                borderColor: activeFilter === chip ? colors.text : colors.border,
              },
            ]}
            onPress={() => setActiveFilter(chip)}
          >
            <Text
              style={[
                styles.chipText,
                { color: activeFilter === chip ? colors.background : colors.text },
              ]}
            >
              {chip}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* Recipe list */}
      <FlatList
        style={styles.recipeList}
        data={filtered}
        renderItem={renderRecipe}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <EmptyState
            title="No recipes yet"
            description="Add your first recipe to get started."
            actionLabel="Add Recipe"
            onAction={() => router.push('/recipe/add' as any)}
          />
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  title: { fontSize: FontSize.xxl, fontFamily: FontFamily.serifBold },
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Search
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: Spacing.lg,
    marginBottom: Spacing.sm,
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
    gap: Spacing.sm,
  },
  searchInput: { flex: 1, fontSize: FontSize.md },

  // Filter chips
  chipScroll: { flexGrow: 0, flexShrink: 0 },
  chipList: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: 2,
    gap: Spacing.sm,
    marginBottom: Spacing.md,
  },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
    justifyContent: 'center',
  },
  chipText: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    lineHeight: Math.round(FontSize.xs * 1.45),
  },

  recipeList: { flex: 1 },

  // Recipe list
  list: { padding: Spacing.lg, paddingTop: 0, gap: Spacing.sm },
  recipeCard: { marginBottom: 0 },
  recipeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  recipeInfo: { flex: 1, marginRight: Spacing.sm },
  recipeTitle: { fontSize: FontSize.md, fontFamily: FontFamily.serifRegular },
  recipeMeta: { fontSize: FontSize.sm, marginTop: 2 },
  tagRow: { flexDirection: 'row', gap: Spacing.xs, marginTop: Spacing.sm },
  tag: { paddingHorizontal: Spacing.sm, paddingVertical: 2, borderRadius: BorderRadius.full },
  tagText: { fontSize: FontSize.xs },
});
