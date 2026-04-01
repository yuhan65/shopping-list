import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { useThemeColors } from '@/hooks/useColorScheme';
import { Spacing, FontSize, FontFamily, BorderRadius } from '@/constants/Spacing';
import { Button, Input, Card, Icon } from '@/components/ui';
import type { IconName } from '@/components/ui';
import { useAuthStore } from '@/stores/authStore';
import { useLocalDataStore } from '@/stores/localDataStore';
import { useRecipePreviewStore } from '@/stores/recipePreviewStore';
import { supabase } from '@/lib/supabase';
import { createAIService } from '@/lib/ai';
import type { AIRecipeResult } from '@/lib/ai';
import { useQueryClient } from '@tanstack/react-query';

type Mode = 'choose' | 'photo' | 'manual' | 'ai';

export default function AddRecipeScreen() {
  const colors = useThemeColors();
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const isDemoMode = useAuthStore((s) => s.isDemoMode);
  const localInsert = useLocalDataStore((s) => s.insert);
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<Mode>('choose');
  const [loading, setLoading] = useState(false);

  // Photo import mode
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [photoResult, setPhotoResult] = useState<AIRecipeResult | null>(null);

  // AI chat mode
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResult, setAiResult] = useState<AIRecipeResult | null>(null);
  const setDraft = useRecipePreviewStore((s) => s.setDraft);

  // Manual mode
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [servings, setServings] = useState('1');
  const [ingredientText, setIngredientText] = useState('');
  const [instructionText, setInstructionText] = useState('');

  async function pickImage(useCamera: boolean) {
    if (useCamera) {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Please allow camera access to take photos.');
        return;
      }
    }

    const pickerFn = useCamera
      ? ImagePicker.launchCameraAsync
      : ImagePicker.launchImageLibraryAsync;

    const result = await pickerFn({
      mediaTypes: ['images'],
      quality: 0.8,
      base64: true,
    });

    if (!result.canceled && result.assets[0]) {
      setSelectedImage(result.assets[0].uri);
      setPhotoResult(null);
      handlePhotoImport(result.assets[0].base64!);
    }
  }

  async function handlePhotoImport(base64: string) {
    setLoading(true);
    try {
      const ai = createAIService();
      const result = await ai.parseRecipeFromImage(base64);
      setPhotoResult(result);
    } catch (err: any) {
      Alert.alert('Import Error', err.message || 'Could not read a recipe from this image. Try a clearer screenshot.');
    } finally {
      setLoading(false);
    }
  }

  async function handleSavePhotoResult() {
    if (!photoResult) return;
    setLoading(true);
    try {
      await saveRecipe(photoResult, 'image', null);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleAiGenerate() {
    if (!aiPrompt.trim()) {
      Alert.alert('Error', 'Please describe what you want to eat');
      return;
    }
    setLoading(true);
    try {
      const ai = createAIService();
      const result = await ai.parseRecipeFromDescription(aiPrompt);
      setAiResult(result);
    } catch (err: any) {
      Alert.alert('AI Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSaveAiResult() {
    if (!aiResult) return;
    setLoading(true);
    try {
      await saveRecipe(aiResult, 'ai', null);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleManualSave() {
    if (!title.trim()) {
      Alert.alert('Error', 'Please enter a recipe title');
      return;
    }
    setLoading(true);
    try {
      const ingredients = ingredientText
        .split('\n')
        .filter(Boolean)
        .map((line) => {
          const parts = line.trim().split(/\s+/);
          const qty = parseFloat(parts[0]) || 1;
          const unit = parts.length > 2 ? parts[1] : 'unit';
          const name = parts.length > 2 ? parts.slice(2).join(' ') : parts.slice(1).join(' ') || parts[0];
          return { name, quantity: qty, unit, category: 'other' };
        });

      const instructions = instructionText.split('\n').filter(Boolean);

      const recipe: AIRecipeResult = {
        title: title.trim(),
        description: description.trim(),
        ingredients,
        instructions,
        servings: parseInt(servings, 10) || 1,
        prep_time_minutes: null,
        cook_time_minutes: null,
        calories_per_serving: null,
        protein_per_serving: null,
        carbs_per_serving: null,
        fat_per_serving: null,
        tags: [],
      };

      await saveRecipe(recipe, 'manual', null);
    } catch (err: any) {
      Alert.alert('Error', err.message);
    } finally {
      setLoading(false);
    }
  }

  async function saveRecipe(
    recipe: AIRecipeResult,
    sourceType: 'image' | 'manual' | 'ai',
    sourceUrl: string | null
  ) {
    const row = {
      user_id: user!.id,
      title: recipe.title,
      description: recipe.description,
      source_url: sourceUrl,
      source_type: sourceType,
      ingredients: recipe.ingredients,
      instructions: recipe.instructions,
      servings: recipe.servings,
      prep_time_minutes: recipe.prep_time_minutes,
      cook_time_minutes: recipe.cook_time_minutes,
      calories_per_serving: recipe.calories_per_serving,
      protein_per_serving: recipe.protein_per_serving,
      carbs_per_serving: recipe.carbs_per_serving,
      fat_per_serving: recipe.fat_per_serving,
      tags: recipe.tags,
    };
    if (isDemoMode) {
      localInsert('recipes', row);
    } else {
      const { error } = await supabase.from('recipes').insert(row);
      if (error) throw error;
    }
    queryClient.invalidateQueries({ queryKey: ['recipes'] });
    Alert.alert('Success', `"${recipe.title}" saved!`, [
      { text: 'OK', onPress: () => router.back() },
    ]);
  }

  if (mode === 'choose') {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.topBar}>
          <TouchableOpacity onPress={() => router.back()}>
            <Icon name="x-mark" size={28} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.topTitle, { color: colors.text }]}>Add Recipe</Text>
          <View style={{ width: 28 }} />
        </View>
        <View style={styles.modeList}>
          {[
            { mode: 'photo' as Mode, icon: 'photo' as IconName, title: 'Import from Photo', desc: 'Screenshot a recipe from any app or take a photo' },
            { mode: 'ai' as Mode, icon: 'sparkles' as IconName, title: 'Create with AI', desc: 'Describe what you want and AI creates a recipe' },
            { mode: 'manual' as Mode, icon: 'pencil-square' as IconName, title: 'Manual Entry', desc: 'Enter the recipe details yourself' },
          ].map((opt) => (
            <TouchableOpacity
              key={opt.mode}
              onPress={() => setMode(opt.mode)}
              activeOpacity={0.7}
            >
              <Card style={styles.modeCard}>
                <Icon name={opt.icon} size={28} color={colors.tint} />
                <View style={styles.modeTextContainer}>
                  <Text style={[styles.modeTitle, { color: colors.text }]}>{opt.title}</Text>
                  <Text style={[styles.modeDesc, { color: colors.textSecondary }]}>{opt.desc}</Text>
                </View>
                <Icon name="chevron-right" size={20} color={colors.textSecondary} />
              </Card>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => setMode('choose')}>
          <Icon name="arrow-left" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={[styles.topTitle, { color: colors.text }]}>
          {mode === 'photo' ? 'Import from Photo' : mode === 'ai' ? 'AI Recipe' : 'Manual Entry'}
        </Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
        {mode === 'photo' && (
          <>
            {!photoResult ? (
              <>
                {selectedImage ? (
                  <View style={styles.imagePreviewContainer}>
                    <Image source={{ uri: selectedImage }} style={styles.imagePreview} />
                    {loading && (
                      <View style={styles.imageOverlay}>
                        <Text style={styles.imageOverlayText}>Reading recipe...</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={[styles.imagePlaceholder, { backgroundColor: colors.surfaceSecondary, borderColor: colors.border }]}>
                    <Icon name="photo" size={48} color={colors.textSecondary} />
                    <Text style={[styles.imagePlaceholderText, { color: colors.textSecondary }]}>
                      Pick a screenshot or take a photo of a recipe
                    </Text>
                  </View>
                )}
                <View style={styles.photoButtons}>
                  <Button
                    title="Choose Photo"
                    onPress={() => pickImage(false)}
                    variant="outline"
                    style={{ flex: 1 }}
                    loading={loading}
                  />
                  <Button
                    title="Take Photo"
                    onPress={() => pickImage(true)}
                    variant="outline"
                    style={{ flex: 1 }}
                    loading={loading}
                  />
                </View>
              </>
            ) : (
              <>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    setDraft(photoResult, 'image');
                    router.push('/recipe/preview' as any);
                  }}
                >
                  <Card>
                    <Text style={[styles.previewTitle, { color: colors.text }]}>{photoResult.title}</Text>
                    <Text style={[styles.previewDesc, { color: colors.textSecondary }]}>
                      {photoResult.description}
                    </Text>
                    <Text style={[styles.previewMeta, { color: colors.tint }]}>
                      {photoResult.servings} servings · {photoResult.calories_per_serving} kcal/serving
                    </Text>
                    <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>
                      {photoResult.ingredients.length} ingredients · {photoResult.instructions.length} steps
                    </Text>
                    <Text style={[styles.tapHint, { color: colors.textSecondary }]}>
                      Tap to view full recipe
                    </Text>
                  </Card>
                </TouchableOpacity>
                <View style={styles.previewActions}>
                  <Button
                    title="Try Another"
                    onPress={() => {
                      setPhotoResult(null);
                      setSelectedImage(null);
                    }}
                    variant="outline"
                  />
                  <Button
                    title="Save Recipe"
                    onPress={handleSavePhotoResult}
                    loading={loading}
                  />
                </View>
              </>
            )}
          </>
        )}

        {mode === 'ai' && (
          <>
            {!aiResult ? (
              <>
                <Input
                  label="What do you want to eat?"
                  value={aiPrompt}
                  onChangeText={setAiPrompt}
                  placeholder="e.g., Something spicy with chicken, healthy, under 500 calories"
                  multiline
                  numberOfLines={3}
                  style={{ minHeight: 80, textAlignVertical: 'top' }}
                />
                <Button title="Generate Recipe" onPress={handleAiGenerate} loading={loading} />
              </>
            ) : (
              <>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    setDraft(aiResult, 'ai');
                    router.push('/recipe/preview' as any);
                  }}
                >
                  <Card>
                    <Text style={[styles.previewTitle, { color: colors.text }]}>{aiResult.title}</Text>
                    <Text style={[styles.previewDesc, { color: colors.textSecondary }]}>
                      {aiResult.description}
                    </Text>
                    <Text style={[styles.previewMeta, { color: colors.tint }]}>
                      {aiResult.servings} servings · {aiResult.calories_per_serving} kcal/serving
                    </Text>
                    <Text style={[styles.previewLabel, { color: colors.textSecondary }]}>
                      {aiResult.ingredients.length} ingredients · {aiResult.instructions.length} steps
                    </Text>
                    <Text style={[styles.tapHint, { color: colors.textSecondary }]}>
                      Tap to view full recipe
                    </Text>
                  </Card>
                </TouchableOpacity>
                <View style={styles.previewActions}>
                  <Button
                    title="Regenerate"
                    onPress={() => {
                      setAiResult(null);
                    }}
                    variant="outline"
                  />
                  <Button
                    title="Save Recipe"
                    onPress={handleSaveAiResult}
                    loading={loading}
                  />
                </View>
              </>
            )}
          </>
        )}

        {mode === 'manual' && (
          <>
            <Input label="Recipe Title" value={title} onChangeText={setTitle} placeholder="My Recipe" />
            <Input label="Description" value={description} onChangeText={setDescription} placeholder="Optional description" multiline numberOfLines={2} style={{ minHeight: 60, textAlignVertical: 'top' }} />
            <Input label="Servings" value={servings} onChangeText={setServings} placeholder="1" keyboardType="numeric" />
            <View>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                Ingredients (one per line: "quantity unit name")
              </Text>
              <TextInput
                style={[styles.textArea, { backgroundColor: colors.surfaceSecondary, color: colors.text, borderColor: colors.border }]}
                value={ingredientText}
                onChangeText={setIngredientText}
                placeholder={"200 g chicken breast\n1 tbsp olive oil\n2 cloves garlic"}
                placeholderTextColor={colors.tabIconDefault}
                multiline
                numberOfLines={5}
              />
            </View>
            <View>
              <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>
                Instructions (one step per line)
              </Text>
              <TextInput
                style={[styles.textArea, { backgroundColor: colors.surfaceSecondary, color: colors.text, borderColor: colors.border }]}
                value={instructionText}
                onChangeText={setInstructionText}
                placeholder={"Heat oil in a pan\nAdd chicken and cook 5 min\nAdd garlic and stir"}
                placeholderTextColor={colors.tabIconDefault}
                multiline
                numberOfLines={5}
              />
            </View>
            <Button title="Save Recipe" onPress={handleManualSave} loading={loading} />
          </>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
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
  modeList: { padding: Spacing.lg, gap: Spacing.md },
  modeCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.md },
  modeTextContainer: { flex: 1 },
  modeTitle: { fontSize: FontSize.md, fontWeight: '600' },
  modeDesc: { fontSize: FontSize.sm, marginTop: 2 },
  formContent: { padding: Spacing.lg, gap: Spacing.md, paddingBottom: 100 },
  fieldLabel: {
    fontSize: FontSize.sm,
    fontWeight: '500',
    marginLeft: Spacing.xs,
    marginBottom: Spacing.xs,
  },
  textArea: {
    borderWidth: 1.5,
    borderRadius: BorderRadius.md,
    padding: Spacing.md,
    fontSize: FontSize.md,
    minHeight: 120,
    textAlignVertical: 'top',
  },
  imagePlaceholder: {
    height: 200,
    borderRadius: BorderRadius.md,
    borderWidth: 1.5,
    borderStyle: 'dashed',
    justifyContent: 'center',
    alignItems: 'center',
    gap: Spacing.sm,
  },
  imagePlaceholderText: { fontSize: FontSize.sm, textAlign: 'center', paddingHorizontal: Spacing.xl },
  imagePreviewContainer: { position: 'relative', borderRadius: BorderRadius.md, overflow: 'hidden' },
  imagePreview: { width: '100%', height: 250, borderRadius: BorderRadius.md },
  imageOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  imageOverlayText: { color: '#fff', fontSize: FontSize.md, fontWeight: '600' },
  photoButtons: { flexDirection: 'row', gap: Spacing.md },
  previewTitle: { fontSize: FontSize.lg, fontFamily: FontFamily.serifBold },
  previewDesc: { fontSize: FontSize.sm, marginTop: Spacing.xs, lineHeight: 20 },
  previewMeta: { fontSize: FontSize.sm, fontWeight: '600', marginTop: Spacing.sm },
  previewLabel: { fontSize: FontSize.xs, marginTop: Spacing.xs },
  tapHint: { fontSize: FontSize.xs, marginTop: Spacing.sm, fontWeight: '500' },
  previewActions: { flexDirection: 'column', gap: Spacing.md },
});
