import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useColorScheme';
import { Spacing, FontSize, BorderRadius } from '@/constants/Spacing';
import { Button, Input, Card, Icon } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useLocalDataStore } from '@/stores/localDataStore';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import type { ExerciseLog } from '@/types/database';

const ACTIVITIES = [
  'Running', 'Walking', 'Cycling', 'Swimming', 'Weight Training',
  'Yoga', 'HIIT', 'Pilates', 'Dancing', 'Sports', 'Other',
];

export default function ExerciseLogScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const localInsert = useLocalDataStore((s) => s.insert);
  const queryClient = useQueryClient();

  const [activityType, setActivityType] = useState('');
  const [duration, setDuration] = useState('');
  const [calories, setCalories] = useState('');
  const [loading, setLoading] = useState(false);

  const { data: recentLogs } = useSupabaseQuery<ExerciseLog>(
    ['exercise_logs'],
    'exercise_logs',
    {
      filter: { user_id: user?.id },
      orderBy: { column: 'date', ascending: false },
      limit: 10,
    }
  );

  async function handleSave() {
    if (!activityType) {
      Alert.alert('Error', 'Please select an activity');
      return;
    }
    const dur = parseInt(duration, 10);
    if (isNaN(dur) || dur <= 0) {
      Alert.alert('Error', 'Please enter a valid duration');
      return;
    }
    setLoading(true);
    try {
      if (isDemoMode) {
        localInsert('exercise_logs', {
          user_id: user!.id,
          date: new Date().toISOString().split('T')[0],
          activity_type: activityType,
          duration_minutes: dur,
          calories_burned: calories ? parseInt(calories, 10) : null,
        });
      } else {
        const { error } = await supabase.from('exercise_logs').insert({
          user_id: user!.id,
          date: new Date().toISOString().split('T')[0],
          activity_type: activityType,
          duration_minutes: dur,
          calories_burned: calories ? parseInt(calories, 10) : null,
        });
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ['exercise_logs'] });
      setActivityType('');
      setDuration('');
      setCalories('');
      Alert.alert('Saved!', 'Exercise logged successfully.');
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Icon name="x-mark" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: colors.text }]}>Exercise Log</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={[styles.label, { color: colors.textSecondary }]}>Activity Type</Text>
        <View style={styles.chipContainer}>
          {ACTIVITIES.map((a) => (
            <TouchableOpacity
              key={a}
              onPress={() => setActivityType(a)}
              style={[
                styles.chip,
                {
                  backgroundColor: activityType === a ? colors.tint : colors.surfaceSecondary,
                  borderColor: activityType === a ? colors.tint : colors.border,
                },
              ]}
            >
              <Text style={{ color: activityType === a ? '#FFF' : colors.text, fontSize: FontSize.sm, fontWeight: '500' }}>
                {a}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        <Input
          label="Duration (minutes)"
          value={duration}
          onChangeText={setDuration}
          placeholder="30"
          keyboardType="numeric"
        />
        <Input
          label="Calories Burned (optional)"
          value={calories}
          onChangeText={setCalories}
          placeholder="Estimated calories"
          keyboardType="numeric"
        />

        <Button title="Log Exercise" onPress={handleSave} loading={loading} />

        {recentLogs && recentLogs.length > 0 && (
          <Card style={styles.historyCard}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Activity</Text>
            {recentLogs.map((log) => (
              <View key={log.id} style={[styles.logRow, { borderBottomColor: colors.border }]}>
                <View>
                  <Text style={[styles.logActivity, { color: colors.text }]}>{log.activity_type}</Text>
                  <Text style={[styles.logDate, { color: colors.textSecondary }]}>{log.date}</Text>
                </View>
                <View style={styles.logRight}>
                  <Text style={[styles.logDuration, { color: colors.text }]}>{log.duration_minutes} min</Text>
                  {log.calories_burned && (
                    <Text style={[styles.logCals, { color: colors.textSecondary }]}>{log.calories_burned} kcal</Text>
                  )}
                </View>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>
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
  content: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 100 },
  label: {
    fontSize: FontSize.sm,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chipContainer: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.sm },
  chip: {
    paddingHorizontal: Spacing.md,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
    borderWidth: 1,
  },
  historyCard: { marginTop: Spacing.md },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '600', marginBottom: Spacing.md },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  logActivity: { fontSize: FontSize.md, fontWeight: '500' },
  logDate: { fontSize: FontSize.xs, marginTop: 2 },
  logRight: { alignItems: 'flex-end' },
  logDuration: { fontSize: FontSize.sm, fontWeight: '600' },
  logCals: { fontSize: FontSize.xs },
});
