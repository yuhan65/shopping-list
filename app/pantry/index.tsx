/**
 * Pantry management page — focused inventory screen for viewing and adding pantry items.
 */
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, FlatList, Alert, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useThemeColors } from '@/hooks/useColorScheme';
import { Spacing, FontSize, FontFamily, BorderRadius } from '@/constants/Spacing';
import { Card, Button, Icon, Input } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useLocalDataStore } from '@/stores/localDataStore';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';
import type { PantryItem } from '@/types/database';

type AddFlowMode = 'choose' | 'quick';

export default function PantryScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const localInsert = useLocalDataStore((s) => s.insert);
  const localUpdate = useLocalDataStore((s) => s.update);
  const localRemove = useLocalDataStore((s) => s.remove);
  const localQuery = useLocalDataStore((s) => s.query);
  const queryClient = useQueryClient();

  const [showAddOverlay, setShowAddOverlay] = useState(false);
  const [addFlowMode, setAddFlowMode] = useState<AddFlowMode>('choose');
  const [addName, setAddName] = useState('');
  const [addQuantity, setAddQuantity] = useState('1');
  const [addUnit, setAddUnit] = useState('unit');
  const [addExpiryDate, setAddExpiryDate] = useState('');
  const [adding, setAdding] = useState(false);

  const { data: pantryItems } = useSupabaseQuery<PantryItem>(
    ['pantry_items'],
    'pantry_items',
    { filter: { user_id: user?.id }, orderBy: { column: 'name', ascending: true } }
  );

  const sortedItems = useMemo(() => {
    if (!pantryItems) return [];
    return [...pantryItems].sort((a, b) => a.name.localeCompare(b.name));
  }, [pantryItems]);

  const normalize = (value: string) => value.trim().toLowerCase();

  function openAddMenu() {
    setAddFlowMode('choose');
    setShowAddOverlay(true);
  }

  function closeAddOverlay() {
    setShowAddOverlay(false);
    setAddFlowMode('choose');
  }

  function handleScanFromOverlay(mode: 'receipt' | 'product') {
    closeAddOverlay();
    router.push(`/camera?mode=${mode}` as any);
  }

  async function upsertPantryItem(params: {
    name: string;
    quantity: number;
    unit: string;
    expiryDate?: string | null;
  }) {
    const cleanName = params.name.trim();
    const cleanUnit = params.unit.trim() || 'unit';
    const cleanQuantity = Number(params.quantity) || 1;
    const cleanExpiry = params.expiryDate?.trim() || null;

    if (isDemoMode) {
      const localRows = (localQuery('pantry_items', { user_id: user!.id }) as unknown as PantryItem[]) ?? [];
      const existing = localRows.find(
        (p) => normalize(p.name) === normalize(cleanName) && normalize(p.unit) === normalize(cleanUnit)
      );
      if (existing) {
        localUpdate('pantry_items', existing.id, {
          quantity: Number(existing.quantity || 0) + cleanQuantity,
          expiry_date: cleanExpiry ?? existing.expiry_date ?? null,
        });
      } else {
        localInsert('pantry_items', {
          user_id: user!.id,
          name: cleanName,
          quantity: cleanQuantity,
          unit: cleanUnit,
          expiry_date: cleanExpiry,
        });
      }
      return;
    }

    const existing = sortedItems.find(
      (p) => normalize(p.name) === normalize(cleanName) && normalize(p.unit) === normalize(cleanUnit)
    );
    if (existing) {
      const { error } = await supabase
        .from('pantry_items')
        .update({
          quantity: Number(existing.quantity || 0) + cleanQuantity,
          expiry_date: cleanExpiry ?? existing.expiry_date ?? null,
        })
        .eq('id', existing.id);
      if (error) throw error;
    } else {
      const { error } = await supabase.from('pantry_items').insert({
        user_id: user!.id,
        name: cleanName,
        quantity: cleanQuantity,
        unit: cleanUnit,
        expiry_date: cleanExpiry,
      });
      if (error) throw error;
    }
  }

  async function handleQuickAdd() {
    if (!addName.trim()) {
      Alert.alert('Missing item name', 'Please enter an item name first.');
      return;
    }
    setAdding(true);
    try {
      await upsertPantryItem({
        name: addName,
        quantity: parseFloat(addQuantity) || 1,
        unit: addUnit,
        expiryDate: addExpiryDate,
      });
      queryClient.invalidateQueries({ queryKey: ['pantry_items'] });
      setAddName('');
      setAddQuantity('1');
      setAddUnit('unit');
      setAddExpiryDate('');
      closeAddOverlay();
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setAdding(false);
    }
  }

  async function handleDelete(item: PantryItem) {
    Alert.alert('Remove item', `Remove "${item.name}" from pantry?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          if (isDemoMode) {
            localRemove('pantry_items', item.id);
          } else {
            await supabase.from('pantry_items').delete().eq('id', item.id);
          }
          queryClient.invalidateQueries({ queryKey: ['pantry_items'] });
        },
      },
    ]);
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()}>
          <Icon name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: colors.text }]}>Pantry</Text>
        <TouchableOpacity
          style={[styles.plusButton, { backgroundColor: colors.surfaceSecondary }]}
          onPress={openAddMenu}
        >
          <Icon name="plus" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {sortedItems.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>Your pantry is currently a blank slate</Text>
          <Text style={[styles.sectionLabel, { color: colors.text }]}>INVENTORY</Text>
          <View style={[styles.divider, { backgroundColor: colors.border }]} />

          <View style={styles.emptyBody}>
            <View style={[styles.emptyIcon, { borderColor: colors.border }]}>
              <Icon name="cube" size={16} color={colors.tabIconDefault} />
            </View>
            <Text style={[styles.emptySubtitle, { color: colors.text }]}>No ingredients indexed</Text>
            <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>
              Add your staples to help the AI refine your weekly nourishment plan and minimize waste.
            </Text>
          </View>

          <Card style={styles.suggestionCard}>
            <Text style={[styles.suggestionLabel, { color: colors.textSecondary }]}>SUGGESTION</Text>
            <Text style={[styles.suggestionQuote, { color: colors.text }]}>
              I can automatically populate your inventory from a grocery receipt, or we can start with your basics manually.
            </Text>
            <View style={styles.suggestionActions}>
              <TouchableOpacity onPress={() => handleScanFromOverlay('receipt')}>
                <Text style={[styles.scanLink, { color: colors.success }]}>SCAN RECEIPT</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => openAddMenu()}>
                <Text style={[styles.manualLink, { color: colors.text }]}>ADD MANUALLY</Text>
              </TouchableOpacity>
            </View>
          </Card>
        </View>
      ) : (
        <FlatList
          data={sortedItems}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.row, { borderBottomColor: colors.border }]}
              onPress={() => handleDelete(item)}
              activeOpacity={0.7}
            >
              <View style={{ flex: 1 }}>
                <Text style={[styles.rowName, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.rowMeta, { color: colors.textSecondary }]}>
                  {item.expiry_date ? `Expires ${item.expiry_date}` : 'Shelf stable'}
                </Text>
              </View>
              <Text style={[styles.rowQty, { color: colors.textSecondary }]}>
                {item.quantity} {item.unit}
              </Text>
            </TouchableOpacity>
          )}
        />
      )}

      <Modal visible={showAddOverlay} animationType="slide" transparent={false} onRequestClose={closeAddOverlay}>
        <View style={[styles.addOverlay, { backgroundColor: colors.background }]}>
          {addFlowMode === 'choose' ? (
            <>
              <View style={styles.addTopBar}>
                <TouchableOpacity onPress={closeAddOverlay}>
                  <Icon name="x-mark" size={28} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.topTitle, { color: colors.text }]}>Add to Pantry</Text>
                <View style={{ width: 28 }} />
              </View>
              <View style={styles.addModeList}>
                {[
                  {
                    key: 'quick',
                    icon: 'pencil-square' as const,
                    title: 'Quick Add',
                    desc: 'Enter item details manually',
                    onPress: () => setAddFlowMode('quick'),
                  },
                  {
                    key: 'receipt',
                    icon: 'photo' as const,
                    title: 'Scan Receipt',
                    desc: 'Import pantry items from a receipt photo',
                    onPress: () => handleScanFromOverlay('receipt'),
                  },
                  {
                    key: 'product',
                    icon: 'camera' as const,
                    title: 'Scan Product',
                    desc: 'Capture one product and add it quickly',
                    onPress: () => handleScanFromOverlay('product'),
                  },
                ].map((opt) => (
                  <TouchableOpacity key={opt.key} onPress={opt.onPress} activeOpacity={0.7}>
                    <View
                      style={[
                        styles.addModeCard,
                        { borderColor: colors.border, backgroundColor: colors.background },
                      ]}
                    >
                      <Icon name={opt.icon} size={24} color={colors.tint} />
                      <View style={styles.addModeTextContainer}>
                        <Text style={[styles.addModeTitle, { color: colors.text }]}>{opt.title}</Text>
                        <Text style={[styles.addModeDesc, { color: colors.textSecondary }]}>{opt.desc}</Text>
                      </View>
                      <Icon name="chevron-right" size={18} color={colors.textSecondary} />
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          ) : (
            <>
              <View style={styles.addTopBar}>
                <TouchableOpacity onPress={() => setAddFlowMode('choose')}>
                  <Icon name="arrow-left" size={24} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.topTitle, { color: colors.text }]}>Quick Add</Text>
                <TouchableOpacity onPress={closeAddOverlay}>
                  <Icon name="x-mark" size={24} color={colors.text} />
                </TouchableOpacity>
              </View>
              <View style={styles.addForm}>
                <Input label="Item Name" value={addName} onChangeText={setAddName} placeholder="e.g., Olive Oil" />
                <View style={styles.addRow}>
                  <Input
                    label="Quantity"
                    value={addQuantity}
                    onChangeText={setAddQuantity}
                    placeholder="1"
                    keyboardType="numeric"
                    containerStyle={{ flex: 1 }}
                  />
                  <Input
                    label="Unit"
                    value={addUnit}
                    onChangeText={setAddUnit}
                    placeholder="bottle"
                    containerStyle={{ flex: 1 }}
                  />
                </View>
                <Input
                  label="Expiry Date (optional)"
                  value={addExpiryDate}
                  onChangeText={setAddExpiryDate}
                  placeholder="YYYY-MM-DD"
                />
                <Button title="Add to Pantry" onPress={handleQuickAdd} loading={adding} />
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 50 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
  },
  topTitle: { fontSize: FontSize.lg, fontWeight: '600' },
  plusButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyContainer: { paddingHorizontal: Spacing.lg, paddingTop: Spacing.lg },
  emptyTitle: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.serifRegular,
    lineHeight: 36,
    marginBottom: Spacing.lg,
  },
  sectionLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1.4, marginBottom: Spacing.sm },
  divider: { height: StyleSheet.hairlineWidth, marginBottom: Spacing.xl },
  emptyBody: { gap: Spacing.sm, marginBottom: Spacing.lg },
  emptyIcon: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptySubtitle: { fontSize: FontSize.xl, fontFamily: FontFamily.serifBold },
  emptyDesc: { fontSize: FontSize.md, lineHeight: 22 },
  suggestionCard: { marginTop: Spacing.md },
  suggestionLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1.2, marginBottom: Spacing.sm },
  suggestionQuote: { fontSize: FontSize.sm, fontFamily: FontFamily.serifItalic, lineHeight: 20 },
  suggestionActions: { flexDirection: 'row', gap: Spacing.lg, marginTop: Spacing.md },
  scanLink: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1 },
  manualLink: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1 },
  list: { paddingHorizontal: Spacing.lg, paddingBottom: 80 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },
  rowName: { fontSize: FontSize.md, fontWeight: '600' },
  rowMeta: { fontSize: FontSize.xs, marginTop: 2 },
  rowQty: { fontSize: FontSize.sm },

  addOverlay: { flex: 1, paddingTop: 70 },
  addTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  addModeList: { paddingHorizontal: Spacing.lg, gap: Spacing.md },
  addModeCard: {
    borderWidth: 1,
    padding: Spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
  },
  addModeTextContainer: { flex: 1 },
  addModeTitle: { fontSize: FontSize.md, fontWeight: '600' },
  addModeDesc: { fontSize: FontSize.sm, marginTop: 2, lineHeight: 20 },
  addForm: { paddingHorizontal: Spacing.lg, gap: Spacing.md },
  addRow: { flexDirection: 'row', gap: Spacing.md },
});
