/**
 * Stock tab — combines shopping and pantry into one workflow.
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
import {
  SHOPPING_CATEGORIES,
  CATEGORY_COLORS,
  LEGACY_CATEGORY_MAP,
  classifyIngredient,
} from '@/lib/shoppingHelpers';
import type { ShoppingList, ShoppingListItem, PantryItem } from '@/types/database';

export default function ShoppingScreen() {
  type AddFlowMode = 'choose' | 'quick';

  const colors = useThemeColors();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const localUpdate = useLocalDataStore((s) => s.update);
  const localInsert = useLocalDataStore((s) => s.insert);
  const localQuery = useLocalDataStore((s) => s.query);
  const queryClient = useQueryClient();
  const [showAddOverlay, setShowAddOverlay] = useState(false);
  const [addFlowMode, setAddFlowMode] = useState<AddFlowMode>('choose');
  const [addName, setAddName] = useState('');
  const [addQuantity, setAddQuantity] = useState('1');
  const [addUnit, setAddUnit] = useState('unit');
  const [addExpiryDate, setAddExpiryDate] = useState('');
  const [adding, setAdding] = useState(false);
  // Tracks which broad-category sections are collapsed (hidden).
  const [collapsedSections, setCollapsedSections] = useState<Record<string, boolean>>({});

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

  // Group items into broad categories so the list isn't too fragmented.
  const sections = useMemo(() => {
    if (!items) return [];
    const known = new Set(SHOPPING_CATEGORIES);
    const grouped: Record<string, ShoppingListItem[]> = {};
    items.forEach((item) => {
      const raw = item.category || 'Other';
      // Try legacy map first, then check if already a known name,
      // and fall back to re-classifying by ingredient name.
      let cat = LEGACY_CATEGORY_MAP[raw] || raw;
      if (!known.has(cat)) cat = classifyIngredient(item.name);
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(item);
    });
    return SHOPPING_CATEGORIES
      .filter((c) => grouped[c]?.length)
      .map((cat) => ({
        title: cat,
        count: grouped[cat].length,
        data: collapsedSections[cat]
          ? []
          : grouped[cat].sort((a, b) => Number(a.is_purchased) - Number(b.is_purchased)),
      }));
  }, [items, collapsedSections]);

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

  function toggleSection(title: string) {
    setCollapsedSections((prev) => ({ ...prev, [title]: !prev[title] }));
  }

  const allCollapsed = sections.length > 0 && sections.every((s) => collapsedSections[s.title]);
  function toggleAll() {
    if (allCollapsed) {
      setCollapsedSections({});
    } else {
      const next: Record<string, boolean> = {};
      sections.forEach((s) => { next[s.title] = true; });
      setCollapsedSections(next);
    }
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
        <View style={styles.headerTopRow}>
          <Text style={[styles.headline, { color: colors.text }]}>
            {activeList && totalCount > 0 ? 'Stock for the week' : 'Stock'}
          </Text>
        </View>
        <View style={styles.headerBottomRow}>
          <View style={styles.headerCounts}>
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
              style={styles.pantryButton}
              onPress={() => router.push('/pantry' as any)}
            >
              <Text style={styles.pantryButtonText}>PANTRY MANAGEMENT</Text>
            </TouchableOpacity>
        </View>
      </View>

      {activeList && totalCount > 0 ? (
        <>
          <View style={styles.sectionHead}>
            <Text style={[styles.sectionHeadLabel, { color: colors.textSecondary }]}>NEED TO BUY</Text>
            <TouchableOpacity
              onPress={toggleAll}
              hitSlop={8}
              style={[styles.collapseAllButton, { borderColor: colors.border, backgroundColor: colors.surfaceSecondary }]}
            >
              <Text style={[styles.collapseAllLabel, { color: colors.text }]}>
                {allCollapsed ? 'Expand All' : 'Collapse All'}
              </Text>
            </TouchableOpacity>
          </View>
          <SectionList
            sections={sections}
            renderItem={renderItem}
            renderSectionHeader={({ section }) => {
              const isCollapsed = !!collapsedSections[section.title];
              const accentColor = CATEGORY_COLORS[section.title] || colors.textSecondary;
              return (
                <TouchableOpacity
                  onPress={() => toggleSection(section.title)}
                  activeOpacity={0.7}
                  style={[styles.sectionHeader, { backgroundColor: colors.background }]}
                >
                  <Text style={[styles.sectionTitle, { color: accentColor }]}>
                    {section.title}
                  </Text>
                  <View style={styles.sectionRight}>
                    <Text style={[styles.sectionCount, { color: colors.textSecondary }]}>
                      {section.count} ITEMS
                    </Text>
                    <Ionicons
                      name={isCollapsed ? 'chevron-forward' : 'chevron-down'}
                      size={16}
                      color={colors.textSecondary}
                    />
                  </View>
                </TouchableOpacity>
              );
            }}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListFooterComponent={
              <View style={[styles.footer, { borderTopColor: colors.border }]}>
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

      <Modal visible={showAddOverlay} animationType="slide" transparent={false} onRequestClose={closeAddOverlay}>
        <View style={[styles.addOverlay, { backgroundColor: colors.background }]}>
          {addFlowMode === 'choose' ? (
            <>
              <View style={styles.addTopBar}>
                <TouchableOpacity onPress={closeAddOverlay}>
                  <Icon name="x-mark" size={28} color={colors.text} />
                </TouchableOpacity>
                <Text style={[styles.topTitle, { color: colors.text }]}>Add to Stock</Text>
                <View style={{ width: 28 }} />
              </View>

              <View style={styles.addModeList}>
                {[
                  {
                    key: 'quick',
                    icon: 'pencil-square' as const,
                    title: 'Quick Add',
                    desc: 'Enter item details manually',
                    onPress: () => setAddFlowMode('quick' as AddFlowMode),
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
                <Button title="Add to Stock" onPress={handleQuickAdd} loading={adding} />
              </View>
            </>
          )}
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 60 },
  header: {
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.md,
    gap: Spacing.xs,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  headerBottomRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.md,
  },
  headerCounts: {
    flex: 1,
    justifyContent: 'center',
  },
  headline: {
    fontSize: FontSize.xxl,
    fontFamily: FontFamily.serifRegular,
    lineHeight: 34,
    marginBottom: Spacing.xs,
  },
  itemCount: { fontSize: FontSize.xs, fontWeight: '600', letterSpacing: 1 },
  sectionHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.xs,
  },
  sectionHeadLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 1.5 },
  collapseAllButton: {
    paddingHorizontal: Spacing.sm,
    paddingVertical: 6,
    borderRadius: BorderRadius.full,
    borderWidth: StyleSheet.hairlineWidth,
  },
  collapseAllLabel: { fontSize: FontSize.xs, fontWeight: '700', letterSpacing: 0.5 },
  scanButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  pantryButton: {
    paddingHorizontal: Spacing.md + 2,
    minHeight: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#1B5E20',
  },
  pantryButtonText: {
    fontSize: FontSize.xs,
    fontWeight: '700',
    letterSpacing: 0.6,
    color: '#111111',
  },

  listContent: { paddingBottom: 40 },

  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm + 2,
    marginTop: Spacing.xs,
  },
  sectionTitle: {
    fontSize: FontSize.sm,
    fontWeight: '700',
    letterSpacing: 0.8,
    textTransform: 'lowercase',
  },
  sectionRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.xs,
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

  // Add overlay
  addOverlay: {
    flex: 1,
    paddingTop: 70,
  },
  addTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    marginBottom: Spacing.lg,
  },
  topTitle: { fontSize: FontSize.lg, fontWeight: '600' },
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
