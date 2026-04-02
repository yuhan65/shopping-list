/**
 * Food Log screen — logs what was eaten for planned/unplanned meals.
 * Manual mode is intentionally simple: status, what you ate (if deviated), and fullness.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput, Alert } from 'react-native';
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

const FULLNESS_LEVELS = [
  { key: 'not_full', label: 'Not full' },
  { key: 'lightly_full', label: 'Lightly full' },
  { key: 'satisfied', label: 'Satisfied' },
  { key: 'very_full', label: 'Very full' },
];

export default function FoodLogScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const params = useLocalSearchParams<{
    meal_type?: string;
    meal_plan_item_id?: string;
    mode?: 'planned' | 'unplanned';
    manual?: string;
    photo?: string;
  }>();

  const user = useAuthStore((s) => s.user);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const localInsert = useLocalDataStore((s) => s.insert);
  const queryClient = useQueryClient();

  const logMode = params.mode === 'unplanned' ? 'unplanned' : 'planned';
  const isManualEntry = params.manual === '1';
  const isPlannedLog = logMode === 'planned' && !!params.meal_plan_item_id;

  const [mealType, setMealType] = useState<MealType>((params.meal_type as MealType) || 'lunch');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<FoodLogStatus>('on_track');
  const [photoTaken, setPhotoTaken] = useState(params.photo === '1');
  const [fullness, setFullness] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleTakePhoto() {
    setPhotoTaken(true);
    const query = [`mode=food-log`, `meal_type=${mealType}`];
    if (params.meal_plan_item_id) query.push(`meal_plan_item_id=${params.meal_plan_item_id}`);
    router.push((`/camera?${query.join('&')}`) as any);
  }

  async function handleSave() {
    if (isManualEntry && !fullness) {
      Alert.alert('Add fullness', 'Please select how full you are.');
      return;
    }

    if (isManualEntry && status === 'deviated' && !description.trim()) {
      Alert.alert('Add details', 'Please tell us what you ate.');
      return;
    }

    if (!isManualEntry && !description.trim() && !photoTaken) {
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
        description: isManualEntry && status !== 'deviated' ? null : (description.trim() || null),
        status,
        calories: null,
        protein_g: null,
        carbs_g: null,
        fat_g: null,
        ai_notes: fullness ? `fullness:${fullness}` : null,
      };

      if (isDemoMode) {
        localInsert('food_logs', logData);
        if (params.meal_plan_item_id) {
          localInsert('meal_feedback', {
            meal_plan_item_id: params.meal_plan_item_id,
            user_id: user!.id,
            feedback_type: status === 'on_track' ? 'cooked' : status === 'skipped' ? 'skipped' : 'swapped',
            reason: status === 'deviated' ? 'logged as deviated in food log' : null,
          });
        }
        localInsert('user_preference_signals', {
          user_id: user!.id,
          signal_type:
            status === 'on_track' ? 'meal_cooked' : status === 'skipped' ? 'meal_skipped' : 'meal_swapped_out',
          entity_type: isPlannedLog ? 'meal_plan_item' : 'meal_type',
          entity_key: params.meal_plan_item_id || mealType,
          weight: 1,
          metadata: { source: 'food_log', status, meal_type: mealType, mode: logMode, fullness },
        });
      } else {
        const { error } = await supabase.from('food_logs').insert(logData);
        if (error) throw error;
        if (params.meal_plan_item_id) {
          const { error: feedbackError } = await supabase.from('meal_feedback').insert({
            meal_plan_item_id: params.meal_plan_item_id,
            user_id: user!.id,
            feedback_type: status === 'on_track' ? 'cooked' : status === 'skipped' ? 'skipped' : 'swapped',
            reason: status === 'deviated' ? 'logged as deviated in food log' : null,
          });
          if (feedbackError) throw feedbackError;
        }
        const { error: signalError } = await supabase.from('user_preference_signals').insert({
          user_id: user!.id,
          signal_type:
            status === 'on_track' ? 'meal_cooked' : status === 'skipped' ? 'meal_skipped' : 'meal_swapped_out',
          entity_type: isPlannedLog ? 'meal_plan_item' : 'meal_type',
          entity_key: params.meal_plan_item_id || mealType,
          weight: 1,
          metadata: { source: 'food_log', status, meal_type: mealType, mode: logMode, fullness },
        });
        if (signalError) throw signalError;
      }

      queryClient.invalidateQueries({ queryKey: ['food_logs'] });
      queryClient.invalidateQueries({ queryKey: ['meal_feedback'] });
      queryClient.invalidateQueries({ queryKey: ['user_preference_signals'] });
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
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Icon name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: colors.text }]}>
          {isManualEntry ? 'Log Meal Manually' : logMode === 'unplanned' ? 'Log Unplanned Meal' : 'Log Meal'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      {logMode === 'unplanned' && !isManualEntry && (
        <Card style={styles.contextCard}>
          <Text style={[styles.contextText, { color: colors.textSecondary }]}>
            You can log what you actually ate, even if it differs from your plan.
          </Text>
        </Card>
      )}

      {!isManualEntry && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>MEAL TYPE</Text>
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
        </>
      )}

      {!isManualEntry && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>PHOTO</Text>
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
          </TouchableOpacity>
        </>
      )}

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>DID YOU FOLLOW THE PLAN?</Text>
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

      {!isManualEntry && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>DESCRIPTION</Text>
          <TextInput
            style={[
              styles.descInput,
              { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
            ]}
            placeholder="What did you eat?"
            placeholderTextColor={colors.tabIconDefault}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </>
      )}

      {isManualEntry && status === 'deviated' && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>WHAT DID YOU EAT?</Text>
          <TextInput
            style={[
              styles.descInput,
              { color: colors.text, backgroundColor: colors.surfaceSecondary, borderColor: colors.border },
            ]}
            placeholder="What did you eat?"
            placeholderTextColor={colors.tabIconDefault}
            value={description}
            onChangeText={setDescription}
            multiline
            numberOfLines={3}
            textAlignVertical="top"
          />
        </>
      )}

      {isManualEntry && (
        <>
          <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>HOW FULL ARE YOU?</Text>
          <View style={styles.fullnessRow}>
            {FULLNESS_LEVELS.map((level) => (
              <TouchableOpacity
                key={level.key}
                style={[
                  styles.fullnessChip,
                  {
                    backgroundColor: fullness === level.key ? colors.text : colors.surfaceSecondary,
                    borderColor: fullness === level.key ? colors.text : colors.border,
                  },
                ]}
                onPress={() => setFullness(level.key)}
              >
                <Text
                  style={[
                    styles.fullnessText,
                    { color: fullness === level.key ? colors.background : colors.text },
                  ]}
                >
                  {level.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </>
      )}

      {status === 'deviated' && (
        <Card style={[styles.deviationNote, { backgroundColor: colors.warningLight }]}>
          <View style={styles.deviationHeader}>
            <Icon name="sparkles" size={16} color={colors.warning} />
            <Text style={[styles.deviationLabel, { color: colors.warning }]}>AI WILL ADJUST</Text>
          </View>
          <Text style={[styles.deviationText, { color: colors.text }]}>
            After logging, AI will analyze the difference from your plan and adjust your day.
          </Text>
        </Card>
      )}

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
  contextCard: { marginBottom: Spacing.sm },
  contextText: { fontSize: FontSize.sm, lineHeight: 20 },

  sectionLabel: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1.5,
    marginBottom: Spacing.sm,
    marginTop: Spacing.lg,
  },

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

  descInput: {
    borderWidth: 1,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSize.md,
    minHeight: 80,
  },

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

  fullnessRow: {
    flexDirection: 'row',
    gap: Spacing.sm,
    flexWrap: 'wrap',
  },
  fullnessChip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: 8,
    borderWidth: 1,
    borderRadius: BorderRadius.full,
  },
  fullnessText: { fontSize: FontSize.sm, fontWeight: '600' },

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
