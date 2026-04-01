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
import type { BodyLog } from '@/types/database';

export default function AddBodyLogScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const localInsert = useLocalDataStore((s) => s.insert);
  const queryClient = useQueryClient();

  const [weight, setWeight] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  const { data: recentLogs } = useSupabaseQuery<BodyLog>(
    ['body_logs'],
    'body_logs',
    {
      filter: { user_id: user?.id },
      orderBy: { column: 'date', ascending: false },
      limit: 14,
    }
  );

  async function handleSave() {
    const w = parseFloat(weight);
    if (isNaN(w) || w <= 0) {
      Alert.alert('Error', 'Please enter a valid weight');
      return;
    }
    setLoading(true);
    try {
      if (isDemoMode) {
        localInsert('body_logs', {
          user_id: user!.id,
          date: new Date().toISOString().split('T')[0],
          weight_kg: w,
          notes: notes.trim() || null,
        });
      } else {
        const { error } = await supabase.from('body_logs').insert({
          user_id: user!.id,
          date: new Date().toISOString().split('T')[0],
          weight_kg: w,
          notes: notes.trim() || null,
        });
        if (error) throw error;
      }
      queryClient.invalidateQueries({ queryKey: ['body_logs'] });
      Alert.alert('Saved!', `Weight ${w} kg logged.`, [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  const weightValues = recentLogs?.map((l) => l.weight_kg) ?? [];
  const minWeight = weightValues.length ? Math.min(...weightValues) : 0;
  const maxWeight = weightValues.length ? Math.max(...weightValues) : 0;
  const range = maxWeight - minWeight || 1;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Icon name="x-mark" size={28} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: colors.text }]}>Log Weight</Text>
        <View style={{ width: 28 }} />
      </View>

      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Input
          label="Weight (kg)"
          value={weight}
          onChangeText={setWeight}
          placeholder={recentLogs?.[0] ? String(recentLogs[0].weight_kg) : '70.0'}
          keyboardType="decimal-pad"
        />
        <Input
          label="Notes (optional)"
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g., After morning workout"
        />
        <Button title="Save" onPress={handleSave} loading={loading} />

        {recentLogs && recentLogs.length > 0 && (
          <Card style={styles.historyCard}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Weights</Text>

            <View style={styles.miniChart}>
              {recentLogs
                .slice()
                .reverse()
                .map((log, i) => {
                  const height = ((log.weight_kg - minWeight) / range) * 60 + 20;
                  return (
                    <View key={log.id} style={styles.chartBarContainer}>
                      <View
                        style={[
                          styles.chartBar,
                          {
                            height,
                            backgroundColor: i === recentLogs.length - 1 ? colors.tint : colors.tintLight,
                          },
                        ]}
                      />
                      <Text style={[styles.chartLabel, { color: colors.textSecondary }]}>
                        {log.date.slice(5)}
                      </Text>
                    </View>
                  );
                })}
            </View>

            {recentLogs.map((log) => (
              <View key={log.id} style={[styles.logRow, { borderBottomColor: colors.border }]}>
                <Text style={[styles.logDate, { color: colors.textSecondary }]}>{log.date}</Text>
                <Text style={[styles.logWeight, { color: colors.text }]}>{log.weight_kg} kg</Text>
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
  historyCard: { marginTop: Spacing.md },
  sectionTitle: { fontSize: FontSize.md, fontWeight: '600', marginBottom: Spacing.md },
  miniChart: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    height: 100,
    gap: 4,
    marginBottom: Spacing.md,
    paddingBottom: Spacing.md,
  },
  chartBarContainer: { flex: 1, alignItems: 'center' },
  chartBar: { width: '80%', borderRadius: 4, minHeight: 8 },
  chartLabel: { fontSize: 8, marginTop: 4 },
  logRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  logDate: { fontSize: FontSize.sm },
  logWeight: { fontSize: FontSize.sm, fontWeight: '600' },
});
