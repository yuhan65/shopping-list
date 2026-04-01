/**
 * Provisions tab — combines shopping and pantry into one workflow.
 * This screen shows what to buy and what is already in stock.
 */
import React, { useCallback, useMemo, useState } from 'react';
import { View, Text, StyleSheet, SectionList, TouchableOpacity, Alert, Modal } from 'react-native';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useThemeColors } from '@/hooks/useColorScheme';
import { Spacing, FontSize, FontFamily, BorderRadius } from '@/constants/Spacing';
import { Card, EmptyState, Button, Icon, Input } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useLocalDataStore } from '@/stores/localDataStore';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import { supabase } from '@/lib/supabase';
import { useQueryClient } from '@tanstack/react-query';
import type { ShoppingList, ShoppingListItem, PantryItem } from '@/types/database';

const AISLE_LABELS: Record<string, string> = {
  produce: 'Aisle 1: Produce',
  dairy: 'Aisle 7: Dairy',
  meat: 'Aisle 5: Meat & Poultry',
  seafood: 'Aisle 4: Seafood & Proteins',
  bakery: 'Aisle 2: Bakery',
  frozen: 'Aisle 8: Frozen',
  canned: 'Aisle 3: Canned Goods',
  dry_goods: 'Aisle 6: Dry Goods & Pasta',
  condiments: 'Aisle 9: Condiments & Sauces',
  beverages: 'Aisle 10: Beverages',
  snacks: 'Aisle 11: Snacks',
  other: 'Other',
};

export default function ShoppingScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const localUpdate = useLocalDataStore((s) => s.update);
  const localInsert = useLocalDataStore((s) => s.insert);
  const localQuery = useLocalDataStore((s) => s.query);
  const queryClient = useQueryClient();
  const [showAddOverlay, setShowAddOverlay] = useState(false);
  const [addName, setAddName] = useState('');
  const [addQuantity, setAddQuantity] = useState('1');
  const [addUnit, setAddUnit] = useState('unit');
  const [addExpiryDate, setAddExpiryDate] = useState('');
  const [adding, setAdding] = useState(false);

  // Force-refresh shopping data every time this tab becomes visible,
  // so newly generated shopping lists show up immediately.
  useFocusEffect(
    useCallback(() => {
      queryClient.refetchQueries({ queryKey: ['shopping_lists'] });
      queryClient.refetchQueries({ queryKey: ['shopping_list_items'] });
    }, [queryClient])
  );

  const { data: lists } = useSupabaseQuery<ShoppingList>(
    ['shopping_lists'],
    'shopping_lists',
    {
      filter: { user_id: user?.id, status: 'active' },
      orderBy: { column: 'created_at', ascending: false },
      limit: 1,
      staleTime: 0,
    }
  );
  const activeList = lists?.[0];

  const { data: items } = useSupabaseQuery<ShoppingListItem>(
    ['shopping_list_items', activeList?.id ?? ''],
    'shopping_list_items',
    {
      filter: { shopping_list_id: activeList?.id },
      enabled: !!activeList,
      staleTime: 0,
    }
  );

  const { data: pantryItems } = useSupabaseQuery<PantryItem>(
    ['pantry_items'],
    'pantry_items',
    { filter: { user_id: user?.id } }
  );

  // Group items by aisle category
  const sections = useMemo(() => {
    if (!items) return [];
    const grouped: Record<string, ShoppingListItem[]> = {};
    items.forEach((item) => {
      const cat = item.category || 'other';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    });
    return Object.entries(grouped)
      .sort(([a], [b]) => {
        const aLabel = AISLE_LABELS[a] || a;
        const bLabel = AISLE_LABELS[b] || b;
        return aLabel.localeCompare(bLabel);
      })
      .map(([category, data]) => ({
        title: AISLE_LABELS[category] || category,
        count: data.length,
        data: data.sort((a, b) => Number(a.is_purchased) - Number(b.is_purchased)),
      }));
  }, [items]);

  const purchasedCount = items?.filter((i) => i.is_purchased).length ?? 0;
  const totalCount = items?.length ?? 0;
  const estimatedTotal = items?.reduce((sum, i) => sum + (i.estimated_price ?? 0), 0) ?? 0;
  const itemsLeft = totalCount - purchasedCount;
  const progressPct = totalCount > 0 ? Math.round((purchasedCount / totalCount) * 100) : 0;

  const pantryPreview = useMemo(() => {
    if (!pantryItems) return [];
    return [...pantryItems]
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 8);
  }, [pantryItems]);

  const normalize = (value: string) => value.trim().toLowerCase();

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
      const localRows = (localQuery('pantry_items', { user_id: user!.id }) as PantryItem[]) ?? [];
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

    const existing = pantryItems?.find(
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

  async function togglePurchased(item: ShoppingListItem) {
    const newPurchased = !item.is_purchased;

    try {
      if (isDemoMode) {
        localUpdate('shopping_list_items', item.id, { is_purchased: newPurchased });
      } else {
        await supabase.from('shopping_list_items').update({ is_purchased: newPurchased }).eq('id', item.id);
      }
      queryClient.invalidateQueries({ queryKey: ['shopping_list_items'] });

      // When bought, move quantity into pantry inventory.
      if (newPurchased) {
        await upsertPantryItem({
          name: item.name,
          quantity: Number(item.quantity || 1),
          unit: item.unit || 'unit',
          expiryDate: null,
        });
        queryClient.invalidateQueries({ queryKey: ['pantry_items'] });
      }
    } catch (err: any) {
      Alert.alert('Error', err.message);
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
      setShowAddOverlay(false);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setAdding(false);
    }
  }

  function openAddMenu() {
    Alert.alert('Add to Provisions', 'Choose how you want to add inventory:', [
      { text: 'Quick Add', onPress: () => setShowAddOverlay(true) },
      { text: 'Scan Receipt', onPress: () => router.push('/camera?mode=receipt' as any) },
      { text: 'Scan Product', onPress: () => router.push('/camera?mode=product' as any) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  }

  async function completeList() {
    if (!activeList) return;
    Alert.alert(
      'Complete Shopping',
      'Mark this list as complete? All checked items have been added to your pantry.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            if (isDemoMode) {
              localUpdate('shopping_lists', activeList.id, { status: 'completed' });
            } else {
              await supabase
                .from('shopping_lists')
                .update({ status: 'completed' })
                .eq('id', activeList.id);
            }
            queryClient.invalidateQueries({ queryKey: ['shopping_lists'] });
            queryClient.invalidateQueries({ queryKey: ['shopping_list_items'] });
          },
        },
      ]
    );
  }

  function renderItem({ item }: { item: ShoppingListItem }) {
    return (
      <TouchableOpacity
        style={[styles.itemRow, { borderBottomColor: colors.border }]}
        onPress={() => togglePurchased(item)}
        activeOpacity={0.6}
      >
        <Ionicons
          name={item.is_purchased ? 'checkbox' : 'square-outline'}
          size={20}
          color={item.is_purchased ? colors.success : colors.tabIconDefault}
        />
        <View style={styles.itemInfo}>
          <Text
            style={[
              styles.itemName,
              { color: item.is_purchased ? colors.textSecondary : colors.text },
              item.is_purchased && styles.strikethrough,
            ]}
          >
            {item.name}
          </Text>
          <Text style={[styles.itemQty, { color: colors.textSecondary }]}>
            {item.quantity} {item.unit}
          </Text>
        </View>
        {item.estimated_price != null && item.estimated_price > 0 && (
          <Text style={[styles.itemPrice, { color: colors.textSecondary }]}>
            ${item.estimated_price.toFixed(2)}
          </Text>
        )}
      </TouchableOpacity>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Text style={[styles.headline, { color: colors.text }]}>
            {activeList && totalCount > 0 ? 'Provisions for the week' : 'Provisions'}
          </Text>
          <Text style={[styles.itemCount, { color: colors.textSecondary }]}>
            {pantryItems?.length ?? 0} in stock
            {activeList && totalCount > 0 ? ` · ${itemsLeft} to buy` : ''}
          </Text>
          {activeList && totalCount > 0 && (
            <Text style={[styles.itemCount, { color: colors.textSecondary }]}>
              {purchasedCount} / {totalCount} ITEMS
            </Text>
          )}
        </View>
        <TouchableOpacity
          style={[styles.scanButton, { backgroundColor: colors.surfaceSecondary }]}
          onPress={openAddMenu}
        >
          <Icon name="plus" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      {activeList && totalCount > 0 ? (
        <>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionHeadLabel, { color: colors.textSecondary }]}>NEED TO BUY</Text>
          </View>
          <SectionList
            sections={sections}
            renderItem={renderItem}
            renderSectionHeader={({ section }) => (
              <View style={[styles.sectionHeader, { backgroundColor: colors.background }]}>
                <Text style={[styles.sectionTitle, { color: colors.textSecondary }]}>
                  {section.title}
                </Text>
                <Text style={[styles.sectionCount, { color: colors.textSecondary }]}>
                  {section.count} ITEMS
                </Text>
              </View>
            )}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListFooterComponent={
              <View style={[styles.footer, { borderTopColor: colors.border }]}>
                <View style={styles.inStockHeader}>
                  <Text style={[styles.pantryLabel, { color: colors.textSecondary }]}>IN STOCK</Text>
                  <TouchableOpacity onPress={openAddMenu}>
                    <Text style={[styles.viewAllPantry, { color: colors.tint }]}>Add to Provisions</Text>
                  </TouchableOpacity>
                </View>
                {pantryPreview.length > 0 ? (
                  <View style={styles.pantryList}>
                    {pantryPreview.map((p) => (
                      <View key={p.id} style={[styles.pantryRow, { borderBottomColor: colors.border }]}>
                        <Text style={[styles.pantryName, { color: colors.textSecondary }]}>{p.name}</Text>
                        <Text style={[styles.pantryQty, { color: colors.tabIconDefault }]}>
                          {p.quantity} {p.unit}
                        </Text>
                      </View>
                    ))}
                  </View>
                ) : (
                  <TouchableOpacity
                    style={[styles.addPantryBtn, { borderColor: colors.border }]}
                    onPress={openAddMenu}
                  >
                    <Text style={[styles.addPantryText, { color: colors.text }]}>No pantry items yet — add now</Text>
                  </TouchableOpacity>
                )}

                {/* Cost + status */}
                <View style={styles.footerRow}>
                  <View>
                    <Text style={[styles.footerLabel, { color: colors.textSecondary }]}>
                      ESTIMATED COST
                    </Text>
                    <Text style={[styles.footerValue, { color: colors.text }]}>
                      ${estimatedTotal.toFixed(2)} total
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={[styles.footerLabel, { color: colors.textSecondary }]}>
                      ITEMS LEFT
                    </Text>
                    <Text style={[styles.footerValue, { color: colors.text }]}>
                      {itemsLeft}
                    </Text>
                  </View>
                </View>

                <View style={styles.progressRow}>
                  <View style={[styles.progressTrack, { backgroundColor: colors.surfaceSecondary }]}>
                    <View
                      style={[
                        styles.progressFill,
                        { backgroundColor: colors.success, width: `${progressPct}%` },
                      ]}
                    />
                  </View>
                  <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                    {progressPct}% done
                  </Text>
                </View>

                {/* Camera quantity helper */}
                <TouchableOpacity
                  style={[styles.cameraHelper, { borderColor: colors.border }]}
                  onPress={() => router.push('/camera?mode=receipt' as any)}
                >
                  <Icon name="camera" size={18} color={colors.text} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.cameraHelperTitle, { color: colors.text }]}>
                      Add to pantry with camera
                    </Text>
                    <Text style={[styles.cameraHelperDesc, { color: colors.textSecondary }]}>
                      Scan a receipt or product to update inventory quickly
                    </Text>
                  </View>
                  <Icon name="chevron-right" size={16} color={colors.tabIconDefault} />
                </TouchableOpacity>

                {purchasedCount === totalCount && (
                  <Button title="Complete Shopping" onPress={completeList} style={{ marginTop: Spacing.md }} />
                )}
              </View>
            }
          />
        </>
      ) : (
        <EmptyState
          title="No active shopping list"
          description="Generate a meal plan to create your need-to-buy list. You can still manage pantry inventory from here."
          actionLabel="Generate Meal Plan"
          onAction={() => router.push('/meal-plan' as any)}
        />
      )}

      <Modal visible={showAddOverlay} animationType="slide" transparent={false} onRequestClose={() => setShowAddOverlay(false)}>
        <View style={[styles.addOverlay, { backgroundColor: colors.background }]}>
          <View style={styles.addHeader}>
            <Text style={[styles.addTitle, { color: colors.text }]}>Quick add to Provisions</Text>
            <TouchableOpacity onPress={() => setShowAddOverlay(false)}>
              <Ionicons name="close" size={24} color={colors.text} />
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
              <Input label="Unit" value={addUnit} onChangeText={setAddUnit} placeholder="bottle" containerStyle={{ flex: 1 }} />
            </View>
            <Input
              label="Expiry Date (optional)"
              value={addExpiryDate}
              onChangeText={setAddExpiryDate}
              placeholder="YYYY-MM-DD"
            />
            <Button title="Add to Provisions" onPress={handleQuickAdd} loading={adding} />
            <Button title="Scan Receipt Instead" variant="outline" onPress={() => router.push('/camera?mode=receipt' as any)} />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.md,
  },
  headline: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.serifRegular,
    lineHeight: 34,
    marginBottom: Spacing.xs,
  },
  itemCount: { fontSize: FontSize.xs, fontWeight: '600', letterSpacing: 1 },
  sectionHead: { paddingHorizontal: Spacing.lg, marginBottom: Spacing.xs },
  sectionHeadLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1.5 },
  scanButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },

  listContent: { paddingBottom: 40 },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  sectionTitle: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 1,
  },
  sectionCount: { fontSize: FontSize.xs, letterSpacing: 0.5 },

  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: Spacing.sm + 2,
    paddingHorizontal: Spacing.lg,
    gap: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  itemInfo: { flex: 1 },
  itemName: { fontSize: FontSize.md, fontFamily: FontFamily.serifItalic },
  strikethrough: { textDecorationLine: 'line-through' },
  itemQty: { fontSize: FontSize.sm },
  itemPrice: { fontSize: FontSize.sm, fontWeight: '500' },

  // Footer
  footer: {
    padding: Spacing.lg,
    borderTopWidth: StyleSheet.hairlineWidth,
    gap: Spacing.md,
  },

  // Pantry preview section
  inStockHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.sm,
  },
  pantryLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1 },
  pantryList: { marginBottom: Spacing.sm },
  pantryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: Spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  pantryName: { fontSize: FontSize.sm },
  pantryQty: { fontSize: FontSize.sm },
  viewAllPantry: {
    fontSize: FontSize.xs,
    fontWeight: '600',
    letterSpacing: 0.5,
    paddingTop: Spacing.sm,
  },
  addPantryBtn: {
    borderWidth: 1,
    borderStyle: 'dashed',
    paddingVertical: Spacing.sm,
    alignItems: 'center',
    borderRadius: BorderRadius.md,
    marginBottom: Spacing.sm,
  },
  addPantryText: { fontSize: FontSize.sm, fontWeight: '500' },

  footerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  footerLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1 },
  footerValue: { fontSize: FontSize.lg, fontFamily: FontFamily.serifBold, marginTop: 2 },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  progressTrack: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 3 },
  progressText: { fontSize: FontSize.xs },

  // Camera quantity helper
  cameraHelper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.md,
    padding: Spacing.md,
    borderWidth: 1,
    borderRadius: BorderRadius.md,
  },
  cameraHelperTitle: { fontSize: FontSize.sm, fontWeight: '600' },
  cameraHelperDesc: { fontSize: FontSize.xs, marginTop: 1 },

  // Add overlay
  addOverlay: {
    flex: 1,
    paddingTop: 70,
  },
  addHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  addTitle: { fontSize: FontSize.xxl, fontFamily: FontFamily.serifRegular },
  addForm: { paddingHorizontal: Spacing.lg, gap: Spacing.md },
  addRow: { flexDirection: 'row', gap: Spacing.md },
});
