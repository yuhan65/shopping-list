import { Button, Card, Icon } from '@/components/ui';
import { BorderRadius, FontFamily, FontSize, Spacing } from '@/constants/Spacing';
import { useThemeColors } from '@/hooks/useColorScheme';
import { useSupabaseQuery } from '@/hooks/useSupabaseQuery';
import type { AIFoodAnalysis, AIQuantityRecommendation } from '@/lib/ai';
import { createAIService } from '@/lib/ai';
import { supabase } from '@/lib/supabase';
import { useAuthStore } from '@/stores/authStore';
import { useLocalDataStore } from '@/stores/localDataStore';
import type { ShoppingList, ShoppingListItem } from '@/types/database';
import { useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import React, { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

export default function CameraScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const { mode } = useLocalSearchParams<{ mode?: string }>();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const localUpdate = useLocalDataStore((s) => s.update);
  const queryClient = useQueryClient();
  const cameraRef = useRef<CameraView>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [photo, setPhoto] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AIFoodAnalysis | null>(null);
  const [recommendation, setRecommendation] = useState<AIQuantityRecommendation | null>(null);
  const [matchedItem, setMatchedItem] = useState<ShoppingListItem | null>(null);
  const cameraMode = mode || 'product';
  const isReceiptMode = cameraMode === 'receipt';

  const { data: lists } = useSupabaseQuery<ShoppingList>(['shopping_lists'], 'shopping_lists', {
    filter: { user_id: user?.id, status: 'active' },
    limit: 1,
  });
  const activeList = lists?.[0];

  const { data: listItems } = useSupabaseQuery<ShoppingListItem>(
    ['shopping_list_items', activeList?.id ?? ''],
    'shopping_list_items',
    {
      filter: { shopping_list_id: activeList?.id },
      enabled: !!activeList,
    }
  );

  async function takePhoto() {
    if (!cameraRef.current) return;
    const result = await cameraRef.current.takePictureAsync({ base64: true, quality: 0.7 });
    if (result?.base64) {
      setPhoto(`data:image/jpeg;base64,${result.base64}`);
      await analyzePhoto(result.base64);
    }
  }

  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets[0].base64) {
      setPhoto(result.assets[0].uri);
      await analyzePhoto(result.assets[0].base64);
    }
  }

  async function analyzePhoto(base64: string) {
    setAnalyzing(true);
    setAnalysis(null);
    setRecommendation(null);
    setMatchedItem(null);

    try {
      const ai = createAIService();
      const foodAnalysis = await ai.analyzeFoodProduct(base64);
      setAnalysis(foodAnalysis);

      // Try to match with shopping list item
      const unpurchased = listItems?.filter((i) => !i.is_purchased) ?? [];
      const match = unpurchased.find(
        (i) =>
          i.name.toLowerCase().includes(foodAnalysis.product_name.toLowerCase()) ||
          foodAnalysis.product_name.toLowerCase().includes(i.name.toLowerCase())
      );

      if (match) {
        setMatchedItem(match);
        const rec = await ai.recommendQuantity(foodAnalysis, {
          name: match.name,
          quantity: match.quantity,
          unit: match.unit,
        });
        setRecommendation(rec);
      }
    } catch (err: any) {
      Alert.alert('Analysis Error', err.message);
    } finally {
      setAnalyzing(false);
    }
  }

  async function markPurchased() {
    if (!matchedItem) return;
    if (isDemoMode) {
      localUpdate('shopping_list_items', matchedItem.id, { is_purchased: true });
    } else {
      await supabase
        .from('shopping_list_items')
        .update({ is_purchased: true })
        .eq('id', matchedItem.id);
    }
    queryClient.invalidateQueries({ queryKey: ['shopping_list_items'] });
    Alert.alert('Done!', `${matchedItem.name} marked as purchased.`);
    resetCamera();
  }

  function resetCamera() {
    setPhoto(null);
    setAnalysis(null);
    setRecommendation(null);
    setMatchedItem(null);
  }

  if (!permission) return <View />;

  if (!permission.granted) {
    return (
      <View style={[styles.permissionContainer, { backgroundColor: colors.background }]}>
        <Icon name="camera" size={64} color={colors.textSecondary} />
        <Text style={[styles.permissionTitle, { color: colors.text }]}>Camera Access Needed</Text>
        <Text style={[styles.permissionDesc, { color: colors.textSecondary }]}>
          We need camera access to scan food products and help you shop smarter.
        </Text>
        <Button title="Grant Permission" onPress={requestPermission} />
        <Button title="Go Back" onPress={() => router.back()} variant="ghost" />
      </View>
    );
  }

  if (photo) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={resetCamera}>
            <Icon name="arrow-left" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.topTitle, { color: colors.text }]}>
            {isReceiptMode ? 'Receipt Scan' : 'Product Scan'}
          </Text>
          <TouchableOpacity onPress={() => router.back()}>
            <Icon name="x-mark" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={styles.resultContent}>
          <Image source={{ uri: photo }} style={styles.photoPreview} />

          {analyzing && (
            <View style={styles.analyzingContainer}>
              <ActivityIndicator size="large" color={colors.tint} />
              <Text style={[styles.analyzingText, { color: colors.text }]}>
                {isReceiptMode ? 'Analyzing receipt...' : 'Analyzing product...'}
              </Text>
            </View>
          )}

          {analysis && (
            <Card style={styles.analysisCard}>
              <Text style={[styles.productName, { color: colors.text }]}>
                {analysis.product_name}
              </Text>
              {analysis.brand && (
                <Text style={[styles.brand, { color: colors.textSecondary }]}>{analysis.brand}</Text>
              )}
              <Text style={[styles.packageSize, { color: colors.textSecondary }]}>
                {analysis.package_size}
              </Text>

              {analysis.calories_per_serving && (
                <View style={styles.nutritionRow}>
                  <View style={styles.nutrient}>
                    <Text style={[styles.nutrientValue, { color: colors.text }]}>
                      {analysis.calories_per_serving}
                    </Text>
                    <Text style={[styles.nutrientLabel, { color: colors.textSecondary }]}>kcal</Text>
                  </View>
                  {analysis.protein_per_serving != null && (
                    <View style={styles.nutrient}>
                      <Text style={[styles.nutrientValue, { color: '#EF4444' }]}>
                        {analysis.protein_per_serving}g
                      </Text>
                      <Text style={[styles.nutrientLabel, { color: colors.textSecondary }]}>protein</Text>
                    </View>
                  )}
                  {analysis.carbs_per_serving != null && (
                    <View style={styles.nutrient}>
                      <Text style={[styles.nutrientValue, { color: '#3B82F6' }]}>
                        {analysis.carbs_per_serving}g
                      </Text>
                      <Text style={[styles.nutrientLabel, { color: colors.textSecondary }]}>carbs</Text>
                    </View>
                  )}
                  {analysis.fat_per_serving != null && (
                    <View style={styles.nutrient}>
                      <Text style={[styles.nutrientValue, { color: '#F59E0B' }]}>
                        {analysis.fat_per_serving}g
                      </Text>
                      <Text style={[styles.nutrientLabel, { color: colors.textSecondary }]}>fat</Text>
                    </View>
                  )}
                </View>
              )}
            </Card>
          )}

          {recommendation && (
            <Card style={[styles.recCard, { borderColor: colors.tint }]}>
              <View style={styles.recHeader}>
                <Icon name="shopping-cart" size={20} color={colors.tint} />
                <Text style={[styles.recTitle, { color: colors.tint }]}>
                  {isReceiptMode ? 'Detected Item' : 'Recommendation'}
                </Text>
              </View>
              <Text style={[styles.recQuantity, { color: colors.text }]}>
                Buy {recommendation.recommended_quantity} package{recommendation.recommended_quantity !== 1 ? 's' : ''}
              </Text>
              <Text style={[styles.recReasoning, { color: colors.textSecondary }]}>
                {recommendation.reasoning}
              </Text>
              <Button
                title={isReceiptMode ? 'Add to Stock' : 'Mark as Purchased'}
                onPress={markPurchased}
                style={{ marginTop: Spacing.md }}
              />
            </Card>
          )}

          {analysis && !matchedItem && (
            <Card>
              <Text style={[styles.noMatch, { color: colors.textSecondary }]}>
                {isReceiptMode
                  ? "Couldn't match this receipt item to your list. You can still add it manually."
                  : "This product doesn't match any items on your current shopping list."}
              </Text>
            </Card>
          )}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.cameraContainer}>
      <CameraView ref={cameraRef} style={styles.camera} facing="back">
        <View style={styles.cameraOverlay}>
          <View style={styles.cameraTopBar}>
            <TouchableOpacity onPress={() => router.back()}>
              <Icon name="x-mark" size={30} color="#FFF" />
            </TouchableOpacity>
          </View>
          <View style={styles.cameraGuide}>
            <View style={[styles.guideBorder, { borderColor: 'rgba(255,255,255,0.5)' }]} />
            <Text style={styles.guideText}>
              {isReceiptMode ? 'Point at a full receipt' : 'Point at a food product'}
            </Text>
          </View>
          <View style={styles.cameraBottom}>
            <TouchableOpacity onPress={pickImage} style={styles.galleryBtn}>
              <Icon name="photo" size={28} color="#FFF" />
            </TouchableOpacity>
            <TouchableOpacity onPress={takePhoto} style={styles.captureBtn}>
              <View style={styles.captureBtnInner} />
            </TouchableOpacity>
            <View style={{ width: 50 }} />
          </View>
        </View>
      </CameraView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 50 },
  cameraContainer: { flex: 1, backgroundColor: '#000' },
  camera: { flex: 1 },
  cameraOverlay: { flex: 1, justifyContent: 'space-between' },
  cameraTopBar: { paddingTop: 60, paddingHorizontal: Spacing.lg },
  cameraGuide: { alignItems: 'center' },
  guideBorder: {
    width: 260,
    height: 180,
    borderWidth: 2,
    borderRadius: BorderRadius.lg,
    borderStyle: 'dashed',
  },
  guideText: { color: 'rgba(255,255,255,0.7)', marginTop: Spacing.sm, fontSize: FontSize.sm },
  cameraBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.xxl,
    paddingBottom: Spacing.xxl + 20,
  },
  galleryBtn: { width: 50, alignItems: 'center' },
  captureBtn: {
    width: 70,
    height: 70,
    borderRadius: 35,
    borderWidth: 4,
    borderColor: '#FFF',
    padding: 4,
  },
  captureBtnInner: {
    flex: 1,
    borderRadius: 30,
    backgroundColor: '#FFF',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
  },
  topTitle: { fontSize: FontSize.lg, fontWeight: '600' },
  resultContent: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 100 },
  photoPreview: {
    width: '100%',
    height: 200,
    borderRadius: BorderRadius.lg,
    backgroundColor: '#000',
  },
  analyzingContainer: { alignItems: 'center', gap: Spacing.sm, paddingVertical: Spacing.lg },
  analyzingText: { fontSize: FontSize.md, fontWeight: '500' },
  analysisCard: {},
  productName: { fontSize: FontSize.lg, fontFamily: FontFamily.serifBold },
  brand: { fontSize: FontSize.sm, marginTop: 2 },
  packageSize: { fontSize: FontSize.sm, marginTop: 2 },
  nutritionRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: Spacing.md,
    paddingTop: Spacing.md,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#E2E8F0',
  },
  nutrient: { alignItems: 'center' },
  nutrientValue: { fontSize: FontSize.md, fontWeight: '700' },
  nutrientLabel: { fontSize: FontSize.xs, marginTop: 2 },
  recCard: { borderWidth: 2 },
  recHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, marginBottom: Spacing.sm },
  recTitle: { fontSize: FontSize.md, fontWeight: '700' },
  recQuantity: { fontSize: FontSize.xl, fontWeight: '700' },
  recReasoning: { fontSize: FontSize.sm, lineHeight: 20, marginTop: Spacing.xs },
  noMatch: { fontSize: FontSize.sm, textAlign: 'center' },
  permissionContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.xl,
    gap: Spacing.md,
  },
  permissionTitle: { fontSize: FontSize.xl, fontFamily: FontFamily.serifBold },
  permissionDesc: { fontSize: FontSize.sm, textAlign: 'center', lineHeight: 20 },
});
