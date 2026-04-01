import { create } from 'zustand';
import type { AIRecipeResult } from '@/lib/ai';

/**
 * Temporary in-memory recipe draft store used to pass generated recipes
 * from the add screen into the full preview screen before saving.
 */
interface RecipePreviewState {
  draft: AIRecipeResult | null;
  sourceType: 'image' | 'ai' | null;
  setDraft: (draft: AIRecipeResult, sourceType: 'image' | 'ai') => void;
  clearDraft: () => void;
}

export const useRecipePreviewStore = create<RecipePreviewState>((set) => ({
  draft: null,
  sourceType: null,
  setDraft: (draft, sourceType) => set({ draft, sourceType }),
  clearDraft: () => set({ draft: null, sourceType: null }),
}));
