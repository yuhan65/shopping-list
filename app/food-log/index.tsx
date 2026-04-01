/**
 * Food Log screen — modal for logging what you actually ate.
 * Supports taking a photo (AI analyzes it), selecting a meal type,
 * and recording whether the meal followed the plan or deviated.
 * Opens from the Today tab when you tap "Log Meal" on a slot.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useThemeColors } from '@/hooks/useColorScheme';
import { Spacing, FontSize, FontFamily, BorderRadius } from '@/constants/Spacing';
import { Card, Button, Icon } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useLocalDataStore } from '@/stores/localDataStore';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import type { MealType, FoodLogStatus } from '@/types/database';

const MEAL_TYPES: { key: MealType; label: string }[] = [
  { key: 'breakfast', label: 'Breakfast' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'dinner', label: 'Dinner' },
  { key: 'snack', label: 'Snack' },
];

export default function FoodLogScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const params = useLocalSearchParams<{
    meal_type?: string;
    meal_plan_item_id?: string;
  }>();

  const user = useAuthStore((s) => s.user);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const localInsert = useLocalDataStore((s) => s.insert);
  const queryClient = useQueryClient();

  const [mealType, setMealType] = useState<MealType>(
    (params.meal_type as MealType) || 'lunch'
  );
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<FoodLogStatus>('on_track');
  const [photoTaken, setPhotoTaken] = useState(false);
  const [loading, setLoading] = useState(false);

  // Estimated macros (in a real app, AI would analyze the photo)
  const [calories, setCalories] = useState('');
  const [protein, setProtein] = useState('');
  const [carbs, setCarbs] = useState('');
  const [fat, setFat] = useState('');

  async function handleTakePhoto() {
    // Navigate to camera for food photo, then come back
    setPhotoTaken(true);
    router.push('/camera?mode=food-log' as any);
  }

  async function handleSave() {
    if (!description.trim() && !photoTaken) {
      Alert.alert('Add details', 'Please describe what you ate or take a photo.');
      return;
    }

    setLoading(true);
    try {
      const logData = {
        user_id: user!.id,
        date: new Date().toISOString().split('T')[0],
        meal_type: mealType,
        meal_plan_item_id: params.meal_plan_item_id || null,
        image_url: photoTaken ? 'photo://placeholder' : null,
        actual_recipe_id: null,
        description: description.trim() || null,
        status,
        calories: calories ? parseFloat(calories) : null,
        protein_g: protein ? parseFloat(protein) : null,
        carbs_g: carbs ? parseFloat(carbs) : null,
        fat_g: fat ? parseFloat(fat) : null,
        ai_notes: null,
      };

      if (isDemoMode) {
        localInsert('food_logs', logData);
      } else {
        const { error } = await supabase.from('food_logs').insert(logData);
        if (error) throw error;
      }

      queryClient.invalidateQueries({ queryKey: ['food_logs'] });
      router.back();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.background }]}
      contentContainerStyle={styles.content}
    >
      {/* Top bar */}
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Icon name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: colors.text }]}>Log Meal</Text>
        <View style={{ width: 24 }} />
      </View>

      {/* Meal type selector */}
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
        MEAL TYPE
      </Text>
      <View style={styles.mealTypeRow}>
        {MEAL_TYPES.map((mt) => (
          <TouchableOpacity
            key={mt.key}
            style={[
              styles.mealTypeChip,
              {
                backgroundColor: mealType === mt.key ? colors.text : colors.surfaceSecondary,
                borderColor: mealType === mt.key ? colors.text : colors.border,
              },
            ]}
            onPress={() => setMealType(mt.key)}
          >
            <Text
              style={[
                styles.mealTypeText,
                { color: mealType === mt.key ? colors.background : colors.text },
              ]}
            >
              {mt.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Photo section */}
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
        PHOTO
      </Text>
      <TouchableOpacity
        style={[
          styles.photoArea,
          {
            backgroundColor: colors.surfaceSecondary,
            borderColor: colors.border,
          },
          photoTaken && { borderColor: colors.success },
        ]}
        onPress={handleTakePhoto}
      >
        <Icon
          name={photoTaken ? 'check-circle' : 'camera'}
          size={32}
          color={photoTaken ? colors.success : colors.tabIconDefault}
        />
        <Text style={[styles.photoText, { color: photoTaken ? colors.success : colors.textSecondary }]}>
          {photoTaken ? 'Photo captured' : 'Take a photo of your meal'}
        </Text>
        <Text style={[styles.photoSubtext, { color: colors.tabIconDefault }]}>
          {photoTaken ? 'AI will analyze the nutritional content' : 'AI will estimate calories and macros'}
        </Text>
      </TouchableOpacity>

      {/* Description */}
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
        DESCRIPTION
      </Text>
      <TextInput
        style={[
          styles.descInput,
          { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
        ]}
        placeholder="What did you eat? e.g., Grilled chicken salad with avocado..."
        placeholderTextColor={colors.tabIconDefault}
        value={description}
        onChangeText={setDescription}
        multiline
        numberOfLines={3}
        textAlignVertical="top"
      />

      {/* Status */}
      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>
        DID YOU FOLLOW THE PLAN?
      </Text>
      <View style={styles.statusRow}>
        {[
          { key: 'on_track' as FoodLogStatus, label: 'On Track', color: colors.success },
          { key: 'deviated' as FoodLogStatus, label: 'Deviated', color: colors.warning },
          { key: 'skipped' as FoodLogStatus, label: 'Skipped', color: colors.textSecondary },
        ].map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[
              styles.statusChip,
              {
                backgroundColor: status === s.key ? s.color + '20' : colors.surfaceSecondary,
                borderColor: status === s.key ? s.color : colors.border,
              },
            ]}
            onPress={() => setStatus(s.key)}
          >
            <View style={[styles.statusDot, { backgroundColor: s.color }]} />
            <Text
              style={[
                styles.statusChipText,
                { color: status === s.key ? s.color : colors.text },
              ]}
            >
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Manual macro entry (optional, for when AI is not available) */}
      <TouchableOpacity>
        <Card style={styles.macroCard}>
          <Text style={[styles.macroCardLabel, { color: colors.textSecondary }]}>
            NUTRITION (OPTIONAL)
          </Text>
          <Text style={[styles.macroCardDesc, { color: colors.textSecondary }]}>
            AI estimates from your photo, or enter manually
          </Text>
          <View style={styles.macroInputRow}>
            <View style={styles.macroInputItem}>
              <Text style={[styles.macroInputLabel, { color: colors.textSecondary }]}>KCAL</Text>
              <TextInput
                style={[styles.macroInput, { color: colors.text, borderColor: colors.border }]}
                value={calories}
                onChangeText={setCalories}
                keyboardType="numeric"
                placeholder="—"
                placeholderTextColor={colors.tabIconDefault}
              />
            </View>
            <View style={styles.macroInputItem}>
              <Text style={[styles.macroInputLabel, { color: colors.textSecondary }]}>PROTEIN</Text>
              <TextInput
                style={[styles.macroInput, { color: colors.text, borderColor: colors.border }]}
                value={protein}
                onChangeText={setProtein}
                keyboardType="numeric"
                placeholder="—"
                placeholderTextColor={colors.tabIconDefault}
              />
            </View>
            <View style={styles.macroInputItem}>
              <Text style={[styles.macroInputLabel, { color: colors.textSecondary }]}>CARBS</Text>
              <TextInput
                style={[styles.macroInput, { color: colors.text, borderColor: colors.border }]}
                value={carbs}
                onChangeText={setCarbs}
                keyboardType="numeric"
                placeholder="—"
                placeholderTextColor={colors.tabIconDefault}
              />
            </View>
            <View style={styles.macroInputItem}>
              <Text style={[styles.macroInputLabel, { color: colors.textSecondary }]}>FAT</Text>
              <TextInput
                style={[styles.macroInput, { color: colors.text, borderColor: colors.border }]}
                value={fat}
                onChangeText={setFat}
                keyboardType="numeric"
                placeholder="—"
                placeholderTextColor={colors.tabIconDefault}
              />
            </View>
          </View>
        </Card>
      </TouchableOpacity>

      {/* Deviation note */}
      {status === 'deviated' && (
        <Card style={[styles.deviationNote, { backgroundColor: colors.warningLight }]}>
          <View style={styles.deviationHeader}>
            <Icon name="sparkles" size={16} color={colors.warning} />
            <Text style={[styles.deviationLabel, { color: colors.warning }]}>
              AI WILL ADJUST
            </Text>
          </View>
          <Text style={[styles.deviationText, { color: colors.text }]}>
            After logging, AI will analyze the difference from your plan and suggest adjustments to your remaining meals for the day.
          </Text>
        </Card>
      )}

      {/* Save button */}
      <Button
        title="Save Food Log"
        onPress={handleSave}
        loading={loading}
        size="lg"
        style={styles.saveButton}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: Spacing.lg, paddingTop: 50, paddingBottom: 100 },

  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: Spacing.lg,
  },
  topTitle: { fontSize: FontSize.lg, fontWeight: '600' },

  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
  },

  // Meal type
  mealTypeRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  mealTypeChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  mealTypeText: { fontSize: FontSize.sm, fontWeight: '600' },

  // Photo
  photoArea: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Spacing.xl,
    borderRadius: BorderRadius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
    gap: Spacing.sm,
  },
  photoText: { fontSize: FontSize.md, fontWeight: '600' },
  photoSubtext: { fontSize: FontSize.xs },

  // Description
  descInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSize.md,
    minHeight: 80,
  },

  // Status
  statusRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  statusChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: BorderRadius.md,
    borderWidth: 1,
  },
  statusDot: { width: 8, height: 8, borderRadius: 4 },
  statusChipText: { fontSize: FontSize.xs, fontWeight: '600' },

  // Macro input
  macroCard: { marginTop: Spacing.lg },
  macroCardLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: 2,
  },
  macroCardDesc: { fontSize: FontSize.xs, marginBottom: Spacing.md },
  macroInputRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
  },
  macroInputItem: { flex: 1, gap: 4 },
  macroInputLabel: { fontSize: 9, fontWeight: '700', letterSpacing: 0.5, textAlign: 'center' },
  macroInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.sm,
    paddingVertical: 6,
    textAlign: 'center',
    fontSize: FontSize.md,
    fontWeight: '600',
  },

  // Deviation note
  deviationNote: { marginTop: Spacing.md },
  deviationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: Spacing.sm,
  },
  deviationLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1 },
  deviationText: {
    fontSize: FontSize.sm,
    fontFamily: FontFamily.serifItalic,
    lineHeight: 20,
  },

  saveButton: { marginTop: Spacing.xl },
});
